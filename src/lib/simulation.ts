import type { FreezerItem, Household, Pantry } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import { buildWeekMenu, cookTasks, dayNorms, dayTotals } from './menu'
import { buildCookingPlans } from './cookingPlan'
import { buildShoppingList } from './shopping'
import { cookedGrams as cookedGramsOf } from './nutrition'
import { planWeek } from './weekPlan'
import type { BatchPreference } from './batch'
import { CONTAINER_GRAMS, emptyPantry, freezerRoomGrams } from './pantry'
import { freezerDaysOf } from './freezing'
import { purchaseInfo } from './purchase'

/**
 * Жизнь одной кладовой на несколько месяцев.
 *
 * Замер по десяти независимым неделям почти ничего не говорит: каждая неделя
 * начиналась с пустого дома и заново покупала крупу, масло и упаковки, ни разу
 * не воспользовавшись остатками предыдущей. Так можно сравнить два способа
 * считать чек, но нельзя понять, сколько стоит питание.
 *
 * Здесь недели идут подряд: покупки пополняют кладовую, готовка её тратит,
 * излишки остаются, продукты портятся по срокам, а следующая неделя сначала
 * доедает то, что уже дома.
 *
 * Считается только то, что происходит в приложении на самом деле. В частности,
 * подбор меню не знает про морозилку: если готовка оставляет там контейнеры,
 * они лежат, и это видно в отчёте, а не спрятано за оптимистичным допущением.
 */

/** Партия лежит в кладовой с датой покупки: от неё считается срок. */
interface Lot {
  ingredientId: string
  qty: number
  boughtWeek: number
}

interface FrozenLot {
  recipeId: string
  grams: number
  value: number
  cookedWeek: number
  keepDays: number
  /** Контейнеры и порции в них — в этом виде морозилку видит подбор меню. */
  containers: number
  portionsEach: number
}

export interface WeekReport {
  week: number
  /** Сколько отдать на кассе. */
  checkout: number
  /** Стоимость продуктов, которые ушли в еду этой недели. */
  used: number
  /** Стоимость запасов на начало и на конец недели. */
  stockStart: number
  stockEnd: number
  /** Стоимость морозилки на конец недели. */
  freezerEnd: number
  /** Сколько еды в ней лежит, г — чтобы видеть, полна ли она. */
  freezerGramsEnd: number
  /** Выброшено по сроку годности, ₽. */
  wasted: number
  /** Отдельно: испортились продукты и пропала готовая еда в морозилке. */
  wastedRaw: number
  wastedFrozen: number
  /** Что выброшено: «название|₽». */
  wastedItems: string[]
  /** Что взяли из морозилки вместо готовки. */
  takenFromFreezer: string[]
  /** Сколько готовой еды достали из морозилки на стол, г. */
  thawedGrams: number
  /** Сколько заготовок пропало по сроку, г. */
  wastedFrozenGrams: number
  cookedGrams: number
  eatenGrams: number
  frozenGrams: number
  /** Не влезло в морозилку: приготовлено, но девать некуда. */
  overflowGrams: number
  /** Хвосты, которые доели добавкой, г. */
  tailGrams: number
  /** Сколько ушло на тарелки ровно по меню, г. */
  servedGrams: number
  /** Сколько раз в неделю человек встаёт к плите и сколько это часов руками. */
  cookSessions: number
  handsOnMinutes: number
  /** Сколько приёмов пищи закрыто заготовками. */
  freezerMeals: number
  /** Худшее отклонение дня от нормы едока: цена стратегии в питании. */
  worstDeviation: number
  /** Белок и клетчатка в долях от нормы — чем стратегия платит за дешевизну. */
  proteinShare: number
  fiberShare: number
  /** Сколько приёмов пищи с мясом или рыбой и сколько разных блюд. */
  meatMeals: number
  dishes: string[]
}

function unitPrice(ingredientId: string): number {
  const ing = INGREDIENT_BY_ID[ingredientId]
  if (!ing) return 0
  return ing.unit === 'pcs' ? ing.price : ing.price / 1000
}

function lotsValue(lots: Lot[]): number {
  return lots.reduce((sum, lot) => sum + lot.qty * unitPrice(lot.ingredientId), 0)
}

/**
 * Стратегия недели — то, ради чего этот замер и делается.
 *
 *   balanced — как сейчас: партия по цене ошибки, меню видит морозилку;
 *   save     — минимальная партия, подбор дешёвых блюд, опора на запасы;
 *   stockUp  — максимальная партия из тех, что есть куда деть.
 *
 * Ни одна из них не отменяет правил: партия по-прежнему не может быть меньше
 * кастрюли или больше формы, а меню — оставить кого-то без ужина.
 *
 * Замер после общей морозилки (12 недель × 12 прогонов, семья из двоих),
 * в неделю. Рычагов у стратегии два, и меряются они по отдельности: подбор
 * блюд (goal) и размер партии (batch).
 *
 *                        касса  выброш  готовим  по меню  хвосты  из мороз  белок
 *   сбалансированно        7987     681    23.70    22.38    0.68       0.4   1.03
 *   экономия: только меню  5954     573    22.63    21.26    0.91       0.1   0.96
 *   экономия: только партия 8517    641    25.18    22.78    1.98       0.3   1.03
 *   экономия целиком       6165     504    23.75    21.39    1.92       0.2   0.96
 *   впрок (только партия)  8668     663    25.90    22.35    2.49       0.7   1.03
 *
 * Читается это так. Экономия работает — но целиком за счёт подбора блюд, а не
 * размера партии: партийный рычаг сам по себе дороже сбалансированного на 530
 * ₽/нед. «Поменьше готовить» на деле означает «никогда не недобрать»: цена
 * ошибки допускает недобор в сорок граммов, а `min` обязан закрыть потребность
 * и потому округляет вверх — и варит больше, а не меньше.
 *
 * Платит экономия не деньгами: белок 96% нормы вместо 103%, мясных приёмов
 * 7.4 вместо 8.3, разных блюд за двенадцать недель 20 вместо 22, худшее
 * отклонение дня 3.4% вместо 2.4%, и на столе по меню на 1.1 кг меньше — семья
 * добирает это хвостами.
 *
 * «Впрок» покупает 0.3 лишних приёма пищи из морозилки в неделю за 681 ₽ и
 * 2.5 кг еды, которую доедают сверх нормы. Это не запас, это переедание.
 */
export type Strategy = 'balanced' | 'save' | 'stockUp'

export interface SimulationOptions {
  weeks: number
  strategy?: Strategy
  /** Только для разбора: включить рычаги стратегии по отдельности. */
  only?: 'batch' | 'goal'
  /**
   * Сдвиг зерна подбора. Траектории расходятся: разные запасы дают разные меню,
   * и разброс между прогонами сопоставим с эффектом стратегии. Сравнивать их
   * можно только усреднив по нескольким повторностям с одинаковым сдвигом.
   */
  seedOffset?: number
  /** Каждая неделя с пустой кладовой — так считали раньше. */
  independent?: boolean
  /** Готовить и покупать партией. false — ровно по потребности меню. */
  batch?: boolean
  /**
   * Сделать вид, что подбор меню не знает про морозилку. Так приложение вело
   * себя раньше; вариант оставлен, чтобы видеть цену этого пробела.
   */
  blindToFreezer?: boolean
}

export interface SimulationResult {
  weeks: WeekReport[]
  /** Сколько отдано в магазине за всё время. */
  totalCheckout: number
  /** Сколько продуктов реально съедено, ₽. */
  totalUsed: number
  totalWasted: number
  /** Что осталось дома на конец: кладовая и морозилка. */
  stockEnd: number
  freezerEnd: number
  /** Что выбрасывалось чаще всего, ₽ по видам. */
  wasteByKind: { raw: number; frozen: number }
  topWaste: [string, number][]
}

/** Дата понедельника нужной недели — от неё считаются сроки. */
function weekDate(start: Date, week: number): string {
  const d = new Date(start)
  d.setDate(d.getDate() + week * 7)
  return d.toISOString().slice(0, 10)
}

export function simulate(household: Household, options: SimulationOptions): SimulationResult {
  const weeks: WeekReport[] = []
  let lots: Lot[] = []
  let frozen: FrozenLot[] = []
  const always = new Set(emptyPantry().always)

  const start = new Date(household.weekStart)
  for (let week = 0; week < options.weeks; week++) {
    const today = new Date(start)
    today.setDate(today.getDate() + week * 7)
    const todayIso = today.toISOString().slice(0, 10)
    if (options.independent) {
      lots = []
      frozen = []
    }
    const stockStart = lotsValue(lots)

    // кладовая в том виде, в каком её видит приложение
    const pantry: Pantry = {
      always: [...always],
      stock: lots.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty, addedAt: '' })),
      freezer: [],
    }

    const strategy = options.strategy ?? 'balanced'
    const wantsBatch = options.only !== 'goal'
    const wantsGoal = options.only !== 'batch'
    const prefer: BatchPreference = !wantsBatch
      ? 'cost'
      : strategy === 'save'
        ? 'min'
        : strategy === 'stockUp'
          ? 'max'
          : 'cost'
    // морозилка в том виде, в каком её видит подбор меню
    const freezerView: FreezerItem[] = frozen.map((lot, i) => ({
      id: `f${i}`,
      recipeId: lot.recipeId,
      containers: lot.containers,
      portionsEach: lot.portionsEach,
      cookedAt: weekDate(start, lot.cookedWeek),
      keepDays: lot.keepDays,
    }))

    const { menu } = buildWeekMenu(household, week + 1 + (options.seedOffset ?? 0) * 100, [], {
      freezer: options.blindToFreezer ? [] : freezerView,
      today: todayIso,
      // «меньше потратить» опирается на то, что уже дома, и выбирает дешёвое
      goal: wantsGoal && strategy === 'save' ? 'cheaper' : 'balanced',
      atHome: lots.map((l) => l.ingredientId),
    })

    // то, что достали из морозилки, оттуда и исчезает
    const takenFromFreezer: string[] = []
    let thawedGrams = 0
    for (const entry of menu.entries) {
      if (!entry.fromFreezer) continue
      const recipe = recipeById(entry.recipeId)
      if (!recipe) continue
      let left = cookedGramsOf(recipe, entry.portions.reduce((s, p) => s + p.factor, 0))
      takenFromFreezer.push(recipe.title)
      for (const lot of frozen) {
        if (lot.recipeId !== recipe.id || left <= 0) continue
        const take = Math.min(lot.grams, left)
        const share = take / Math.max(1, lot.grams)
        lot.value -= lot.value * share
        lot.containers = Math.max(0, Math.ceil((lot.grams - take) / CONTAINER_GRAMS))
        lot.grams -= take
        left -= take
        thawedGrams += take
      }
      frozen = frozen.filter((f) => f.grams > 1)
    }

    const cooked = menu

    /*
     * Кладовая должна знать про морозилку: иначе закупка считает партии по
     * пустой полке, а готовка — по настоящей, и они расходятся. Место
     * свободное считаем ровно так же, как его считает приложение, — по
     * контейнерам: другого способа у него нет, и модель не должна знать
     * больше, чем знает кухня.
     */
    pantry.freezer = frozen.map((lot, i) => ({
      id: `p${i}`,
      recipeId: lot.recipeId,
      containers: lot.containers,
      portionsEach: lot.portionsEach,
      cookedAt: weekDate(start, lot.cookedWeek),
      keepDays: lot.keepDays,
    }))
    const freeRoom = freezerRoomGrams(household.kitchen, pantry)

    /*
     * План недели считается один раз и служит всему: по нему закупаются, по
     * нему же готовят и списывают. Симуляция ценна ровно настолько, насколько
     * она повторяет приложение, — поэтому своего расчёта у неё быть не должно.
     */
    const plan = planWeek(cooked, household, { pantry, prefer })
    const list = buildShoppingList(cooked, household, pantry, prefer)

    // 1. покупка: то, что не закрыто запасом, приезжает домой целыми упаковками
    let checkout = 0
    for (const line of list.lines) {
      if (line.staple || line.buy <= 0) continue
      checkout += line.price
      lots.push({ ingredientId: line.ingredientId, qty: line.buy, boughtWeek: week })
    }

    // 2. готовка: списываем из кладовой то, что ушло в еду
    const consumption = plan.demand
    let used = 0
    for (const [id, qty] of consumption) {
      if (always.has(id) || INGREDIENT_BY_ID[id]?.staple) continue
      let left = qty
      // сначала то, что лежит дольше: иначе портится именно старое
      lots.sort((a, b) => a.boughtWeek - b.boughtWeek)
      for (const lot of lots) {
        if (left <= 0) break
        if (lot.ingredientId !== id) continue
        const take = Math.min(lot.qty, left)
        lot.qty -= take
        left -= take
        used += take * unitPrice(id)
      }
      // если чего-то не хватило, значит закупка недосчитала — это тоже расход
      if (left > 0.001) used += left * unitPrice(id)
    }
    lots = lots.filter((l) => l.qty > 0.001)

    // 3. что приготовили сверх потребности — уходит в морозилку
    let cookedGrams = 0
    let eatenGrams = 0
    let frozenGrams = 0
    let tailGrams = 0
    let servedGrams = 0
    let wastedOverflow = 0
    let overflowGrams = 0
    for (const cooking of plan.tasks) {
      const recipe = cooking.recipe
      const demand = cooking.neededGrams
      const servings = cooking.servings
      const yieldGrams = cooking.cookedGrams
      cookedGrams += yieldGrams
      /*
       * Куда что делось, берём из того же плана партий, по которому и
       * закупались: тарелки, морозилка, хвост на доесть и то, чему места не
       * нашлось. Считать это здесь заново значило бы мерить одно, а готовить
       * другое — и «не влезло» набегало ровно из этого расхождения.
       */
      const keeps = recipe.freezable && household.kitchen.hasFreezer
      const roomLeft = Math.max(0, freeRoom - frozenGrams)
      const canFreeze = keeps ? Math.min(cooking.placement.freezeGrams, roomLeft) : 0
      // хвост в порцию семья доедает — это добавка, а не потеря
      const eatenHere = Math.min(yieldGrams, demand) + cooking.placement.tailGrams
      servedGrams += Math.min(yieldGrams, demand)
      eatenGrams += eatenHere
      tailGrams += cooking.placement.tailGrams
      const nowhere = Math.max(0, yieldGrams - eatenHere - canFreeze)
      if (nowhere > 0) {
        // не влезло: считаем это потерей, а не бесплатной едой
        overflowGrams += nowhere
        wastedOverflow += (nowhere / Math.max(1, yieldGrams)) *
          recipe.items.reduce((sum, i) => sum + i.qty * servings * unitPrice(i.ingredientId), 0)
      }
      if (canFreeze > 0) {
        frozenGrams += canFreeze
        const dishValue = recipe.items.reduce(
          (sum, i) => sum + i.qty * servings * unitPrice(i.ingredientId),
          0,
        )
        // неполный контейнер занимает место целиком — считаем вверх
        const containers = Math.max(1, Math.ceil(canFreeze / CONTAINER_GRAMS))
        frozen.push({
          recipeId: recipe.id,
          grams: canFreeze,
          value: (dishValue * canFreeze) / Math.max(1, yieldGrams),
          cookedWeek: week,
          keepDays: freezerDaysOf(recipe, 'cooked'),
          containers,
          portionsEach: canFreeze / containers / Math.max(1, cookedGramsOf(recipe, 1)),
        })
      }
    }

    // 4. сроки: вскрытая упаковка живёт столько, сколько живёт
    let wasted = wastedOverflow
    let wastedRaw = 0
    let wastedFrozen = wastedOverflow
    const wastedItems: string[] = []
    if (wastedOverflow > 0) wastedItems.push(`не влезло в морозилку|${Math.round(wastedOverflow)}`)
    const keep: Lot[] = []
    for (const lot of lots) {
      const ing = INGREDIENT_BY_ID[lot.ingredientId]
      const days = ing ? purchaseInfo(ing).openedFridgeDays : 7
      const age = (week - lot.boughtWeek + 1) * 7
      if (age > days) {
        const value = lot.qty * unitPrice(lot.ingredientId)
        wasted += value
        wastedRaw += value
        wastedItems.push(`${ing?.name ?? lot.ingredientId}|${Math.round(value)}`)
      } else {
        keep.push(lot)
      }
    }
    lots = keep

    const keepFrozen: FrozenLot[] = []
    let wastedFrozenGrams = 0
    for (const lot of frozen) {
      if ((week - lot.cookedWeek + 1) * 7 > lot.keepDays) {
        wasted += lot.value
        wastedFrozen += lot.value
        wastedFrozenGrams += lot.grams
        wastedItems.push(`${recipeById(lot.recipeId)?.title ?? lot.recipeId} (морозилка)|${Math.round(lot.value)}`)
      } else {
        keepFrozen.push(lot)
      }
    }
    frozen = keepFrozen

    // цена стратегии не только в деньгах: сколько раз вставать к плите и
    // насколько меню попадает в норму
    const cookingPlans = buildCookingPlans(cooked, household, 1, pantry)
    let worstDeviation = 0
    let protein = 0
    let proteinNorm = 0
    let fiber = 0
    let fiberNorm = 0
    for (let day = 0; day < 7; day++) {
      for (const eater of household.eaters) {
        const norms = dayNorms(household, day, eater.id)
        if (norms.kcal <= 0) continue
        const fact = dayTotals(cooked, day, eater.id)
        worstDeviation = Math.max(worstDeviation, Math.abs(fact.kcal / norms.kcal - 1))
        protein += fact.protein
        proteinNorm += norms.protein
        fiber += fact.fiber
        fiberNorm += norms.fiber
      }
    }
    const meatMeals = cooked.entries.filter((e) => {
      const recipe = recipeById(e.recipeId)
      return recipe?.items.some((i) => {
        const category = INGREDIENT_BY_ID[i.ingredientId]?.category
        return category === 'meat' || category === 'fish'
      })
    }).length

    weeks.push({
      week: week + 1,
      checkout: Math.round(checkout),
      used: Math.round(used),
      stockStart: Math.round(stockStart),
      stockEnd: Math.round(lotsValue(lots)),
      freezerEnd: Math.round(frozen.reduce((s, f) => s + f.value, 0)),
      freezerGramsEnd: Math.round(frozen.reduce((s, f) => s + f.grams, 0)),
      wasted: Math.round(wasted),
      wastedRaw: Math.round(wastedRaw),
      wastedFrozen: Math.round(wastedFrozen),
      wastedItems,
      takenFromFreezer,
      thawedGrams: Math.round(thawedGrams),
      wastedFrozenGrams: Math.round(wastedFrozenGrams),
      cookedGrams: Math.round(cookedGrams),
      eatenGrams: Math.round(eatenGrams),
      frozenGrams: Math.round(frozenGrams),
      overflowGrams: Math.round(overflowGrams),
      tailGrams: Math.round(tailGrams),
      servedGrams: Math.round(servedGrams),
      cookSessions: cookTasks(cooked).length,
      handsOnMinutes: cookingPlans.reduce((sum, p) => sum + p.handsOnMinutes, 0),
      freezerMeals: cooked.entries.filter((e) => e.fromFreezer).length,
      worstDeviation,
      proteinShare: proteinNorm > 0 ? protein / proteinNorm : 0,
      fiberShare: fiberNorm > 0 ? fiber / fiberNorm : 0,
      meatMeals,
      dishes: [...new Set(cooked.entries.map((e) => e.recipeId))],
    })
  }

  const byName = new Map<string, number>()
  for (const w of weeks) {
    for (const item of w.wastedItems) {
      const [name, value] = item.split('|')
      byName.set(name, (byName.get(name) ?? 0) + Number(value))
    }
  }

  return {
    weeks,
    totalCheckout: weeks.reduce((s, w) => s + w.checkout, 0),
    totalUsed: weeks.reduce((s, w) => s + w.used, 0),
    totalWasted: weeks.reduce((s, w) => s + w.wasted, 0),
    stockEnd: weeks[weeks.length - 1]?.stockEnd ?? 0,
    freezerEnd: weeks[weeks.length - 1]?.freezerEnd ?? 0,
    wasteByKind: {
      raw: weeks.reduce((s, w) => s + w.wastedRaw, 0),
      frozen: weeks.reduce((s, w) => s + w.wastedFrozen, 0),
    },
    topWaste: [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  }
}
