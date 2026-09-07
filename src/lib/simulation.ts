import type { FreezerItem, Household, Pantry, Recipe, WeekMenu } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import { buildWeekMenu, cookTasks } from './menu'
import { buildShoppingList } from './shopping'
import { portionWeight } from './nutrition'
import { planBatch } from './batch'
import { drinkShopping } from './drinks'
import { extraShopping } from './extras'
import { CONTAINER_GRAMS, emptyPantry } from './pantry'
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
  /** Выброшено по сроку годности, ₽. */
  wasted: number
  /** Отдельно: испортились продукты и пропала готовая еда в морозилке. */
  wastedRaw: number
  wastedFrozen: number
  /** Что выброшено: «название|₽». */
  wastedItems: string[]
  /** Что взяли из морозилки вместо готовки. */
  takenFromFreezer: string[]
  cookedGrams: number
  eatenGrams: number
  frozenGrams: number
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
 * Сколько долей рецепта реально готовится.
 *
 * Важно, чтобы этот же ответ использовался и в закупке: если покупать по
 * потребности, а готовить партией, разница берётся из воздуха, и «дешёвый»
 * вариант оказывается дешёвым только на бумаге.
 */
function servingsOf(
  recipe: Recipe,
  demandPortions: number,
  household: Household,
  batch: boolean,
): number {
  if (!batch) return demandPortions
  const plan = planBatch(recipe, {
    neededGrams: portionWeight(recipe, demandPortions),
    hasFreezer: household.kitchen.hasFreezer,
    freezerRoomGrams: household.kitchen.containers * 400,
  })
  return plan ? plan.chosen.servings : demandPortions
}

/** Что уходит в еду за неделю: продукты блюд, напитков и дополнений. */
function weekConsumption(
  menu: WeekMenu,
  household: Household,
  batch: boolean,
): Map<string, number> {
  const used = new Map<string, number>()
  const add = (id: string, qty: number) => used.set(id, (used.get(id) ?? 0) + qty)
  for (const task of cookTasks(menu)) {
    const recipe = recipeById(task.recipeId)
    if (!recipe) continue
    const servings = servingsOf(recipe, task.portions, household, batch)
    for (const item of recipe.items) add(item.ingredientId, item.qty * servings)
  }
  for (const source of [drinkShopping(household), extraShopping(household)]) {
    for (const [id, qty] of source) add(id, qty)
  }
  return used
}

export interface SimulationOptions {
  weeks: number
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

    const batch = options.batch !== false

    // морозилка в том виде, в каком её видит подбор меню
    const freezerView: FreezerItem[] = frozen.map((lot, i) => ({
      id: `f${i}`,
      recipeId: lot.recipeId,
      containers: lot.containers,
      portionsEach: lot.portionsEach,
      cookedAt: weekDate(start, lot.cookedWeek),
      keepDays: lot.keepDays,
    }))

    const { menu } = buildWeekMenu(household, week + 1, [], {
      freezer: options.blindToFreezer ? [] : freezerView,
      today: todayIso,
    })

    // то, что достали из морозилки, оттуда и исчезает
    const takenFromFreezer: string[] = []
    for (const entry of menu.entries) {
      if (!entry.fromFreezer) continue
      const recipe = recipeById(entry.recipeId)
      if (!recipe) continue
      let left = portionWeight(recipe, entry.portions.reduce((s, p) => s + p.factor, 0))
      takenFromFreezer.push(recipe.title)
      for (const lot of frozen) {
        if (lot.recipeId !== recipe.id || left <= 0) continue
        const take = Math.min(lot.grams, left)
        const share = take / Math.max(1, lot.grams)
        lot.value -= lot.value * share
        lot.containers = Math.max(0, lot.containers - Math.round(lot.containers * share))
        lot.grams -= take
        left -= take
      }
      frozen = frozen.filter((f) => f.grams > 1)
    }

    const cooked = menu
    const list = buildShoppingList(cooked, batch ? household : undefined, pantry)

    // 1. покупка: то, что не закрыто запасом, приезжает домой целыми упаковками
    let checkout = 0
    for (const line of list.lines) {
      if (line.staple || line.buy <= 0) continue
      checkout += line.price
      lots.push({ ingredientId: line.ingredientId, qty: line.buy, boughtWeek: week })
    }

    // 2. готовка: списываем из кладовой то, что ушло в еду
    const consumption = weekConsumption(cooked, household, batch)
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
    for (const task of cookTasks(cooked)) {
      const recipe = recipeById(task.recipeId)
      if (!recipe) continue
      const demand = portionWeight(recipe, task.portions)
      const servings = servingsOf(recipe, task.portions, household, batch)
      const plan = batch
        ? planBatch(recipe, {
            neededGrams: demand,
            hasFreezer: household.kitchen.hasFreezer,
            freezerRoomGrams: household.kitchen.containers * 400,
          })
        : null
      const yieldGrams = plan ? plan.chosen.yieldGrams : demand
      const surplus = Math.max(0, yieldGrams - demand)
      cookedGrams += yieldGrams
      eatenGrams += Math.min(yieldGrams, demand)
      if (surplus > 0 && recipe.freezable && household.kitchen.hasFreezer) {
        frozenGrams += surplus
        const dishValue = recipe.items.reduce(
          (sum, i) => sum + i.qty * servings * unitPrice(i.ingredientId),
          0,
        )
        const containers = Math.max(1, Math.round(surplus / CONTAINER_GRAMS))
        frozen.push({
          recipeId: recipe.id,
          grams: surplus,
          value: (dishValue * surplus) / Math.max(1, yieldGrams),
          cookedWeek: week,
          keepDays: freezerDaysOf(recipe, 'cooked'),
          containers,
          portionsEach: surplus / containers / Math.max(1, portionWeight(recipe, 1)),
        })
      }
    }

    // 4. сроки: вскрытая упаковка живёт столько, сколько живёт
    let wasted = 0
    let wastedRaw = 0
    let wastedFrozen = 0
    const wastedItems: string[] = []
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
    for (const lot of frozen) {
      if ((week - lot.cookedWeek + 1) * 7 > lot.keepDays) {
        wasted += lot.value
        wastedFrozen += lot.value
        wastedItems.push(`${recipeById(lot.recipeId)?.title ?? lot.recipeId} (морозилка)|${Math.round(lot.value)}`)
      } else {
        keepFrozen.push(lot)
      }
    }
    frozen = keepFrozen

    weeks.push({
      week: week + 1,
      checkout: Math.round(checkout),
      used: Math.round(used),
      stockStart: Math.round(stockStart),
      stockEnd: Math.round(lotsValue(lots)),
      freezerEnd: Math.round(frozen.reduce((s, f) => s + f.value, 0)),
      wasted: Math.round(wasted),
      wastedRaw: Math.round(wastedRaw),
      wastedFrozen: Math.round(wastedFrozen),
      wastedItems,
      takenFromFreezer,
      cookedGrams: Math.round(cookedGrams),
      eatenGrams: Math.round(eatenGrams),
      frozenGrams: Math.round(frozenGrams),
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
