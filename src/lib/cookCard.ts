import type {
  Eater,
  Household,
  Ingredient,
  MenuEntry,
  Norms,
  Pantry,
  Recipe,
  Unit,
  WeekMenu,
} from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import { portionOf, totalPortions } from './menu'
import { cookedGrams, recipeStats } from './nutrition'
import { FREEZE_MIN_GRAMS } from './batch'
import { planWeek } from './weekPlan'
import type { TaskPlan } from './weekPlan'
import { packPlan, purchaseInfo } from './purchase'
import { householdGrams } from './measures'
import { fryMinutes, loads as loadCount, pieceCookingOf, useTwoPans } from './pieces'
import { FRY_STEP } from './batch'
import { scaledMinutes } from './cookingPlan'

/**
 * Всё, что показывает карточка блюда, — одним расчётом.
 *
 * Раньше карточка считала продукты и КБЖУ от потребности по меню, а строкой
 * ниже писала «приготовим 1,6 кг». Два числа про одну готовку, и оба верные
 * по-своему: человек по такой карточке готовит одно, а покупает другое.
 *
 * Здесь всё считается от того, что реально ставится на плиту: продукты, КБЖУ,
 * цена и раскладка по людям. Что не разошлось по тарелкам — уходит в
 * морозилку, и сумма сходится: выход = распределено + заморожено + остаток.
 */

/** Ниже этого веса остаток проще досыпать в блюдо, чем куда-то девать. */
const ABSORB_MAX_G = 30
/** …или если это меньше двадцатой части упаковки. */
const ABSORB_MAX_SHARE = 0.05

export interface CardRow {
  day: number
  eaterId: string
  eaterName: string
  /** Изделий — только у блюд, где изделия проверены. */
  pieces?: number
  grams: number
  kcal: number
  /** Сколько ккал нужно этому человеку в этот приём пищи. */
  targetKcal: number
}

export interface CardItem {
  ingredientId: string
  name: string
  unit: Unit
  /** Сколько идёт в блюдо. */
  qty: number
  /** Сколько из этого добавлено, чтобы не оставлять хвост упаковки. */
  absorbed: number
}

/**
 * Куда девается остаток упаковки.
 *
 * Списка «уйдёт в другое блюдо» здесь намеренно нет. Потребность других блюд
 * недели уже учтена в закупке: пачка покупается сразу на всё. Значит остаток —
 * это ровно то, что никому не нужно, и писать «пойдёт в запеканку» было бы
 * успокоительной неправдой.
 */
export type LeftoverPlacement = { kind: 'freeze' } | { kind: 'absorbed' } | null

export interface CardLeftover {
  ingredientId: string
  name: string
  unit: Unit
  /** Сколько куплено с учётом фасовки. */
  bought: number
  /** Сколько было дома и покупать не пришлось. */
  fromStock: number
  usedHere: number
  usedElsewhere: number
  /** Сколько останется на самом деле. */
  left: number
  /** Куда пристроен остаток. null — никуда, и это честнее, чем выдумать. */
  placed: LeftoverPlacement
  days: number
}

export interface CardAlternative {
  scale: number
  pieces?: number
  grams: number
  /** Чем этот вариант хуже или лучше выбранного. */
  note: string
}

export interface CookCard {
  recipe: Recipe
  entries: MenuEntry[]
  /** Сколько готового блюда нужно по меню, г. */
  neededGrams: number
  /** Сколько приготовим, г. */
  cookGrams: number
  /** Сколько изделий приготовим. Только для проверенных вручную блюд. */
  cookPieces?: number
  /** Вес одного изделия, г. */
  pieceGrams?: number
  /** Внутренний множитель закладки. Наружу не показывается. */
  scale: number
  /** Сколько долей рецепта ставим на плиту. */
  servings: number
  rows: CardRow[]
  /**
   * Сколько приёмов пищи закрывает эта готовка. Считаем именно приёмы, а не
   * тарелки: обед на двоих — это один приём, а не «едим дважды».
   */
  meals: number
  freezeGrams: number
  freezePieces?: number
  /** Хвост в порцию: не заготовка, но и не потеря — доедается за пару дней. */
  eatSoonGrams: number
  /** Ни в тарелки, ни в морозилку, ни на доесть. */
  unplacedGrams: number
  items: CardItem[]
  /** КБЖУ и клетчатка всей готовки. */
  stats: Norms
  /** Стоимость продуктов, которые ушли в блюдо. */
  usedPrice: number
  /** Сколько придётся отдать в магазине с учётом упаковок. */
  purchasePrice: number
  leftovers: CardLeftover[]
  reason: string
  alternatives: CardAlternative[]
  /** Готовка целиком, как её посчитал план недели. */
  plan: TaskPlan | null
  /** Как это жарится: сколько заходов и сколько это минут. */
  loads?: { count: number; perLoad: number; minutes: number; twoPans: boolean }
  /**
   * Время каждого шага для этой готовки и общее время.
   *
   * Из рецепта его брать нельзя: рецепт написан на одну долю, а жарим мы
   * тридцать оладий заходами по десять. Карточка, которая обещает 28 минут на
   * часовую готовку, врёт ровно там, где человек это заметит.
   */
  stepMinutes: number[]
  cookMinutes: number
  /**
   * Партия упёрлась в разумный максимум: больше за раз не делают, и на всю
   * потребность одной готовки не хватит.
   */
  limitedByPractical: boolean
}

/** Сколько изделий выходит из выбранной партии. Только у проверенных блюд. */
function piecesOf(plan: TaskPlan | null): number | undefined {
  if (!plan || plan.batch.source !== 'verified' || !plan.batch.yieldPieces) return undefined
  return Math.max(1, Math.round(plan.batch.yieldPieces * plan.chosen.scale))
}

/**
 * Целые изделия по людям.
 *
 * Десять голубцов нельзя разложить как 545 + 545 + 210 г: голубец не режут
 * пополам. Раздаём по наибольшему остатку — сначала каждому целую часть его
 * доли, потом по одному тем, у кого дробная часть больше.
 */
export function splitPieces(needs: number[], total: number): number[] {
  const sum = needs.reduce((s, n) => s + n, 0)
  if (sum <= 0 || total <= 0) return needs.map(() => 0)
  const exact = needs.map((n) => (n / sum) * total)
  const base = exact.map((x) => Math.floor(x))
  let left = total - base.reduce((s, n) => s + n, 0)
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (left <= 0) break
    base[i]++
    left--
  }
  return base
}

/** Что ещё на неделе тратит этот продукт — кроме этой готовки. */
function usedElsewhere(menu: WeekMenu, ingredientId: string, skip: Set<string>): number {
  let qty = 0
  for (const entry of menu.entries) {
    if (skip.has(entry.id)) continue
    const item = recipeById(entry.recipeId)?.items.find((i) => i.ingredientId === ingredientId)
    if (item) qty += item.qty * totalPortions(entry)
  }
  return qty
}

/**
 * Мелкий хвост упаковки: его проще досыпать в блюдо, чем куда-то девать.
 *
 * У штучного порог свой и жёсткий: остаток меньше штуки — это не остаток, а
 * дробь. Полторы луковицы не бывает: вторую кладут целиком, и именно её надо
 * считать и в КБЖУ, и в цене, иначе состав карточки расходится с её же
 * калориями.
 */
function absorbable(ing: Ingredient, leftover: number, packSize: number): boolean {
  if (leftover <= 0) return false
  if (ing.unit === 'pcs') return leftover < 1
  if (ing.staple) return false
  const limit = Math.max(ABSORB_MAX_G, packSize * ABSORB_MAX_SHARE)
  return leftover <= limit
}

export function cookCard(
  menu: WeekMenu,
  household: Household,
  entry: MenuEntry,
  pantry?: Pantry,
): CookCard | null {
  const recipe = recipeById(entry.recipeId)
  if (!recipe) return null
  const eaters: Eater[] = household.eaters

  const entries = menu.entries
    .filter((e) => e.recipeId === entry.recipeId && e.cookDay === entry.cookDay)
    .sort((a, b) => a.day - b.day)

  const demandFactor = entries.reduce((sum, e) => sum + totalPortions(e), 0)

  /*
   * Карточка ничего не считает сама: всё берётся из плана недели — того же,
   * по которому закупаются продукты и строится расписание. Считать здесь
   * заново значит завести второй ответ на тот же вопрос, а расходиться они
   * начинают ровно в тот день, когда один из них поправят.
   */
  const plan = planWeek(menu, household, { pantry }).byKey.get(`${entry.recipeId}|${entry.cookDay}`) ?? null
  const neededGrams = plan ? plan.neededGrams : cookedGrams(recipe, demandFactor)
  const servings = plan ? plan.servings : demandFactor
  const cookGrams = plan ? plan.cookedGrams : neededGrams
  const cookPieces = piecesOf(plan)
  const pieceGrams = cookPieces ? Math.round(cookGrams / cookPieces) : undefined

  const perServing = recipeStats(recipe)
  const cookKcal = Math.round(perServing.kcal * servings)

  // раскладка: сколько нужно каждому в каждый приём пищи
  const needs: { day: number; eater: Eater; kcal: number }[] = []
  for (const item of entries) {
    for (const eater of eaters) {
      const factor = portionOf(item, eater.id)
      if (factor <= 0) continue
      needs.push({ day: item.day, eater, kcal: perServing.kcal * factor })
    }
  }

  const rows: CardRow[] = []
  let placedGrams = 0
  let placedPieces = 0
  if (cookPieces && pieceGrams) {
    // штучное раздаём целыми изделиями: половину голубца никто не положит
    const forPlates = Math.min(
      cookPieces,
      Math.round(needs.reduce((s, n) => s + n.kcal, 0) / (cookKcal / cookPieces)),
    )
    // каждому хотя бы по одному изделию, но не больше, чем приготовили
    const toPlates = Math.min(cookPieces, Math.max(needs.length, forPlates))
    const split = splitPieces(
      needs.map((n) => n.kcal),
      toPlates,
    )
    const kcalPerPiece = cookKcal / cookPieces
    needs.forEach((need, i) => {
      const pieces = split[i]
      rows.push({
        day: need.day,
        eaterId: need.eater.id,
        eaterName: need.eater.name,
        pieces,
        grams: Math.round(pieces * pieceGrams),
        kcal: Math.round(pieces * kcalPerPiece),
        targetKcal: Math.round(need.kcal),
      })
      placedPieces += pieces
      placedGrams += Math.round(pieces * pieceGrams)
    })
  } else {
    /*
     * Делим по калориям, но раскладываем ровно столько, сколько нужно по
     * меню. Пока доля считалась от всей готовки, тарелки выходили на десятую
     * часть легче потребности: выверенный выход партии и расчётный вес порции
     * — это два разных числа. Карточка обещала «нужно 995 г», раздавала 874 и
     * объявляла оставшиеся сто граммов непристроенными.
     */
    const toPlates = Math.min(cookGrams, neededGrams)
    const needKcal = needs.reduce((sum, n) => sum + n.kcal, 0)
    for (const need of needs) {
      const grams = Math.round((need.kcal / Math.max(1, needKcal)) * toPlates)
      rows.push({
        day: need.day,
        eaterId: need.eater.id,
        eaterName: need.eater.name,
        grams,
        kcal: Math.round(need.kcal),
        targetKcal: Math.round(need.kcal),
      })
      placedGrams += grams
    }
  }

  /*
   * Куда денется то, что не легло на тарелки, берём из того же плана партии,
   * по которому считалась закупка. Пока карточка решала это сама, она обещала
   * убрать в морозилку и то, что туда не влезет, и то, что для контейнера
   * слишком мало.
   */
  const restGrams = Math.max(0, cookGrams - placedGrams)
  const canFreeze = recipe.freezable && household.kitchen.hasFreezer
  const freezeGrams = canFreeze ? Math.min(restGrams, plan?.placement.freezeGrams ?? restGrams) : 0
  const eatSoonGrams = Math.min(restGrams - freezeGrams, FREEZE_MIN_GRAMS)
  const freezePieces =
    cookPieces && freezeGrams > 0
      ? Math.max(0, Math.round((freezeGrams / Math.max(1, cookGrams)) * cookPieces))
      : undefined
  const unplacedGrams = restGrams - freezeGrams - eatSoonGrams

  // продукты и остатки упаковок
  const skip = new Set(entries.map((e) => e.id))
  const items: CardItem[] = []
  const leftovers: CardLeftover[] = []
  let usedPrice = 0
  let purchasePrice = 0

  for (const item of recipe.items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing) continue
    const exactHere = item.qty * servings
    const exactOther = usedElsewhere(menu, item.ingredientId, skip)
    const totalNeed = exactHere + exactOther
    const stock = pantry?.stock.find((s) => s.ingredientId === item.ingredientId)?.qty ?? 0
    const toBuy = Math.max(0, totalNeed - stock)
    // имя нарочно не plan: выше в функции уже есть план партии, и путать их
    // на ровном месте не стоит
    const pack = ing.staple ? null : packPlan(ing, toBuy)
    const bought = pack?.buy ?? 0
    const available = bought + stock
    const rawLeft = Math.max(0, available - totalNeed)

    /*
     * Сколько продукта уходит именно в это блюдо.
     *
     * Штучное считается целыми: пятый банан открывают здесь, даже если в
     * блюдо идёт его половина, — иначе состав карточки («5 шт») расходится с
     * её же разбором упаковки («4 шт сюда»). Весовое округляем вверх только
     * на мелкий хвост: двадцать граммов муки некуда девать, а в тесте они
     * растворятся.
     */
    const absorbed =
      ing.unit === 'pcs'
        ? Math.ceil(exactHere - 1e-9) - exactHere
        : absorbable(ing, rawLeft, pack?.packSize || bought)
          ? rawLeft
          : 0
    const qty = exactHere + absorbed

    items.push({ ingredientId: ing.id, name: ing.name, unit: ing.unit, qty, absorbed })
    usedPrice += ing.unit === 'pcs' ? ing.price * qty : (ing.price * qty) / 1000
    purchasePrice += ing.unit === 'pcs' ? ing.price * bought : (ing.price * bought) / 1000

    if (ing.staple || available <= 0) continue
    // Три числа считаем так, чтобы они сходились с покупкой ровно, а не
    // приблизительно: сколько ушло сюда, сколько осталось, остальное — в
    // другие блюда недели. Округляем один раз и сводим остаток к разности,
    // иначе на каждой строке набегает лишний грамм.
    const boughtR = Math.round(bought)
    const stockR = Math.round(stock)
    const availableR = boughtR + stockR
    // показываем ровно то же число, что и в составе блюда: два округления
    // одного количества человек читает как ошибку — и он прав
    const usedHere = Math.min(availableR, householdGrams(ing, qty))
    const left = Math.min(
      availableR - usedHere,
      Math.max(0, Math.round(available - qty - exactOther)),
    )
    const other = availableR - usedHere - left
    if (left <= 0 && absorbed <= 0) continue
    const info = purchaseInfo(ing)
    leftovers.push({
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit,
      bought: boughtR,
      fromStock: stockR,
      usedHere,
      usedElsewhere: other,
      left,
      // Пристроенным остаток считается только тогда, когда для него есть
      // конкретное действие. «Куда-нибудь денется» — это не план.
      placed: left <= 0 ? { kind: 'absorbed' } : info.rawFreezable ? { kind: 'freeze' } : null,
      days: info.openedFridgeDays,
    })
  }

  // КБЖУ считаем по тем же продуктам, что и показываем: иначе калории в
  // карточке не сходятся с её же составом
  const stats: Norms = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
  for (const item of items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing) continue
    const factor = ing.unit === 'pcs' ? item.qty : item.qty / 100
    stats.kcal += ing.kcal * factor
    stats.protein += ing.protein * factor
    stats.fat += ing.fat * factor
    stats.carbs += ing.carbs * factor
    stats.fiber += ing.fiber * factor
  }
  stats.kcal = Math.round(stats.kcal)
  stats.protein = Math.round(stats.protein)
  stats.fat = Math.round(stats.fat)
  stats.carbs = Math.round(stats.carbs)
  stats.fiber = Math.round(stats.fiber * 10) / 10

  // Альтернативы человек читает как «а если приготовить больше или меньше».
  // Значит и говорить надо результатом: сколько выйдет и что с этим будет, —
  // а не множителем закладки, который снаружи ничего не значит.
  const alternatives: CardAlternative[] = (plan?.alternatives ?? []).map((option) => {
    const pieces =
      plan && plan.batch.source === 'verified' && plan.batch.yieldPieces
        ? Math.max(1, Math.round(plan.batch.yieldPieces * option.scale))
        : undefined
    const notes: string[] = []
    if (option.shortfallGrams > 0) notes.push(`не хватит ${option.shortfallGrams} г`)
    else if (option.freezeGrams > 0) notes.push(`${option.freezeGrams} г в морозилку`)
    if (option.unplacedGrams > 0) notes.push(`${option.unplacedGrams} г некуда`)
    if (option.anchorLeftover > 40) notes.push(`${option.anchorLeftover} г сырого остатка`)
    return {
      scale: option.scale,
      pieces,
      grams: option.yieldGrams,
      note: notes.join(' · '),
    }
  })

  const cooking = pieceCookingOf(recipe)
  const twoPans = cookPieces && cooking ? useTwoPans(cookPieces, cooking, household.kitchen) : false
  const pans = twoPans ? 2 : 1

  const stepMinutes = recipe.steps.map((step) => {
    if (cooking && cookPieces && FRY_STEP.test(step.text)) {
      return fryMinutes(cookPieces, cooking, pans)
    }
    return scaledMinutes(step, servings)
  })

  return {
    recipe,
    entries,
    neededGrams,
    cookGrams,
    cookPieces,
    pieceGrams,
    scale: plan?.chosen.scale ?? 1,
    servings,
    rows,
    meals: entries.length,
    freezeGrams,
    eatSoonGrams,
    freezePieces,
    unplacedGrams,
    items,
    stats,
    usedPrice: Math.round(usedPrice),
    purchasePrice: Math.round(purchasePrice),
    leftovers,
    reason: plan ? plan.batch.reason : 'fresh',
    alternatives,
    plan,
    stepMinutes,
    cookMinutes: stepMinutes.reduce((sum, m) => sum + m, 0),
    loads:
      cookPieces && cooking
        ? {
            count: loadCount(cookPieces, cooking, pans),
            perLoad: cooking.perLoad * pans,
            minutes: fryMinutes(cookPieces, cooking, pans),
            twoPans,
          }
        : undefined,
    // упёрлись в разумный максимум — значит одной готовкой неделю не закрыть,
    // и сказать об этом надо прямо, а не оставить человека без ужина
    limitedByPractical: Boolean(
      cooking && cookPieces && cookPieces >= cooking.max && cookGrams < neededGrams * 0.95,
    ),
  }
}

/** «1,3 кг» или «780 г» — вес так, как его произносят. */
export function weightLabel(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1).replace('.', ',')} кг` : `${grams} г`
}

/** «Приготовим 10 голубцов · примерно 1,3 кг» — то, что человек увидит. */
export function cookAmountLabel(card: CookCard, pieceName?: [string, string, string]): string {
  const grams = weightLabel(card.cookGrams)
  if (card.cookPieces && pieceName) {
    const mod100 = card.cookPieces % 100
    const mod10 = card.cookPieces % 10
    const word =
      mod100 > 10 && mod100 < 20
        ? pieceName[2]
        : mod10 > 1 && mod10 < 5
          ? pieceName[1]
          : mod10 === 1
            ? pieceName[0]
            : pieceName[2]
    return `${card.cookPieces} ${word} · примерно ${grams}`
  }
  return `примерно ${grams}`
}
