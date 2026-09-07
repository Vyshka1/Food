import { INGREDIENT_BY_ID } from '../data/ingredients'
import { allRecipes, recipeById } from '../data/recipeRegistry'
import type {
  Allergen,
  Eater,
  EaterPortion,
  Household,
  MealSlot,
  MenuEntry,
  MenuGoal,
  Norms,
  FreezerItem,
  Recipe,
  RepeatRules,
  Storage,
  WeekMenu,
} from '../types'
import type { RecipeStats } from './nutrition'
import { dailyNorm, recipeStats, slotShares, sumNorms } from './nutrition'
import { mulberry32 } from './random'
import { plural } from './format'
import { drinkNorms, drinksOvershoot, foodNorm } from './drinks'
import { containersOn, fedEaters, isFed, slotLabel, takeawayEaters } from './attendance'

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
/**
 * Винительный падеж: «на среду», «на пятницу». Именительный в таких фразах
 * даёт «на пятница» — ошибку, которую видно сразу, но только на экране.
 */
export const WEEKDAYS_ACC = [
  'понедельник',
  'вторник',
  'среду',
  'четверг',
  'пятницу',
  'субботу',
  'воскресенье',
]

export const WEEKDAYS_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

export interface CookingSegment {
  cookDay: number
  days: number[]
  /** День готовки не выбран пользователем, добавлен автоматически. */
  implicit?: boolean
}

/** Разбивает неделю на отрезки: каждый день готовки кормит дни до следующей готовки. */
export function cookingSegments(cookingDays: number[]): CookingSegment[] {
  const days = [...new Set(cookingDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (days.length === 0) return [{ cookDay: 0, days: [0, 1, 2, 3, 4, 5, 6], implicit: true }]

  const segments: CookingSegment[] = []
  if (days[0] > 0) {
    // до первого дня готовки тоже нужно чем-то питаться
    segments.push({
      cookDay: 0,
      days: Array.from({ length: days[0] }, (_, i) => i),
      implicit: true,
    })
  }
  days.forEach((cookDay, i) => {
    const end = i + 1 < days.length ? days[i + 1] - 1 : 6
    segments.push({
      cookDay,
      days: Array.from({ length: end - cookDay + 1 }, (_, k) => cookDay + k),
    })
  })
  return segments
}

export function householdNorms(household: Household): Norms {
  return sumNorms(household.eaters.map(dailyNorm))
}

// Кто где ест — в lib/attendance: там же три состояния и готовые расклады.
export {
  containersOn,
  containersPerWeek,
  fedEaters,
  isFed,
  isTakeaway,
  mealKey,
  mealPlaceOf,
  takeawayEaters,
} from './attendance'

/**
 * Личная норма на день с поправкой на еду вне дома: если Кирилл обедает в
 * офисе, дома он должен добрать только завтрак и ужин. Иначе «65% нормы»
 * выглядит как промах приложения, хотя это офисный обед.
 */
export function dayNorms(household: Household, day: number, eaterId?: string): Norms {
  const shares = slotShares(household.meals)
  const eaters = eaterId ? household.eaters.filter((e) => e.id === eaterId) : household.eaters
  const parts = eaters.map((eater) => {
    // норма еды — это норма минус привычные напитки: капучино уже выпит
    const full = foodNorm(eater, household, day)
    const share = household.meals
      .filter((slot) => isFed(eater, day, slot))
      .reduce((sum, slot) => sum + (shares[slot] ?? 0), 0)
    return {
      kcal: Math.round(full.kcal * share),
      protein: Math.round(full.protein * share),
      fat: Math.round(full.fat * share),
      carbs: Math.round(full.carbs * share),
      // клетчатка делится вместе с приёмами пищи так же, как калории
      fiber: Math.round(full.fiber * share),
    }
  })
  return sumNorms(parts)
}

/**
 * Сколько нужно самому большому едоку за этим столом.
 *
 * Доля порции ограничена сверху (2,5 порции — это уже не порция, а кастрюля),
 * и лёгкое блюдо при этом ограничении просто не докармливает: Кирилл получал
 * 2,5 порции ухи вместо нужных 2,7 и оставался на 12% ниже нормы. Значит,
 * такое блюдо в этот приём и не надо ставить.
 */
export function topEaterTarget(household: Household, slot: MealSlot, day: number): number {
  const present = fedEaters(household, day, slot)
  if (present.length === 0) return 0
  const share = slotShares(household.meals)[slot] ?? 0.3
  return Math.max(...present.map((e) => foodNorm(e, household, day).kcal * share))
}

/** Дневная норма на среднего едока за столом — сумма его приёмов дома. */
export function dayTargetOn(household: Household, day: number): number {
  return household.meals.reduce((sum, slot) => sum + slotTargetOn(household, slot, day), 0)
}

/**
 * Насколько ужин может отличаться от своей доли, добирая день. Вдвое больше
 * обычного — это ещё ужин; втрое — уже не ужин, а способ закрыть отчёт.
 */
function clampTarget(remaining: number, slotTarget: number): number {
  return Math.min(slotTarget * 1.8, Math.max(slotTarget * 0.5, remaining))
}

/** Целевая калорийность одного приёма пищи в среднем на едока. */
export function slotTargets(household: Household): Record<string, number> {
  const shares = slotShares(household.meals)
  const eaters = household.eaters.length || 1
  const perEater = householdNorms(household).kcal / eaters
  return Object.fromEntries(household.meals.map((m) => [m, Math.round(perEater * shares[m])]))
}

/**
 * Целевая калорийность блюда на конкретный день: считаем по тем, кто за
 * столом. Если дома один Кирилл, готовим под его норму, а не под среднее
 * по семье.
 */
export function slotTargetOn(household: Household, slot: MealSlot, day: number): number {
  const present = fedEaters(household, day, slot)
  if (present.length === 0) return 0
  const share = slotShares(household.meals)[slot] ?? 0.3
  const sum = present.reduce((acc, e) => acc + foodNorm(e, household, day).kcal * share, 0)
  return Math.round(sum / present.length)
}

function recipeAllergens(recipe: Recipe): Set<Allergen> {
  const set = new Set<Allergen>()
  for (const item of recipe.items) {
    for (const a of INGREDIENT_BY_ID[item.ingredientId]?.allergens ?? []) set.add(a)
  }
  return set
}

/** Сколько «не люблю» задевает рецепт для конкретного едока. */
export function dislikeHits(recipe: Recipe, eater: Eater): string[] {
  const hits = new Set<string>()
  for (const dislike of eater.dislikes) {
    const key = dislike.toLowerCase().trim()
    if (!key) continue
    if (recipe.tags.includes(key)) hits.add(dislike)
    for (const item of recipe.items) {
      const ing = INGREDIENT_BY_ID[item.ingredientId]
      if (!ing) continue
      if (ing.tags.includes(key) || ing.name.toLowerCase().includes(key)) hits.add(dislike)
    }
    if (recipe.title.toLowerCase().includes(key)) hits.add(dislike)
  }
  return [...hits]
}

/** Содержит ли рецепт продукт, попадающий под свой аллерген (по названию/тегу). */
function hasCustomAllergen(recipe: Recipe, custom: string[]): boolean {
  for (const raw of custom) {
    const key = raw.toLowerCase().trim()
    if (!key) continue
    for (const item of recipe.items) {
      const ing = INGREDIENT_BY_ID[item.ingredientId]
      if (!ing) continue
      if (ing.name.toLowerCase().includes(key) || ing.tags.includes(key)) return true
    }
    if (recipe.title.toLowerCase().includes(key)) return true
  }
  return false
}

/** Аллергии исключаем строго; кухня без духовки/блендера тоже режет рецепты. */
export function isRecipeAllowed(recipe: Recipe, household: Household): boolean {
  const allergies = new Set<Allergen>(household.eaters.flatMap((e) => e.allergies))
  for (const a of recipeAllergens(recipe)) if (allergies.has(a)) return false
  const custom = household.eaters.flatMap((e) => e.customAllergens)
  if (hasCustomAllergen(recipe, custom)) return false
  if (household.eaters.some((e) => e.bannedRecipes.includes(recipe.id))) return false
  // приборы: духовку может заменить аэрогриль, блендер — комбайн
  if (recipe.needs?.includes('oven') && household.kitchen.ovens < 1 && !household.kitchen.hasAirfryer)
    return false
  if (recipe.needs?.includes('blender') && !household.kitchen.hasBlender && !household.kitchen.hasProcessor)
    return false
  return true
}

export function portionScale(recipe: Recipe, targetKcal: number): number {
  const perServing = recipeStats(recipe).kcal || 1
  return Math.min(1.75, Math.max(0.6, Math.round((targetKcal / perServing) * 20) / 20))
}

/**
 * Сколько порций рецепта нужно каждому едоку: готовим одно блюдо, но Юлии с
 * нормой 1316 ккал и Кириллу с 2802 достаются разные объёмы. Это и есть
 * семейный расчёт — без него «общее меню на разные нормы» не работает.
 */
export function portionsFor(
  recipe: Recipe,
  household: Household,
  slot: MealSlot,
  day: number,
): EaterPortion[] {
  const shares = slotShares(household.meals)
  const perServing = recipeStats(recipe).kcal || 1
  return household.eaters.map((eater) => {
    // ест не дома — порции нет, значит и в закупку она не попадёт
    if (!isFed(eater, day, slot)) return { eaterId: eater.id, factor: 0 }
    const target = foodNorm(eater, household, day).kcal * (shares[slot] ?? 0.3)
    const raw = target / perServing
    return {
      eaterId: eater.id,
      factor: Math.min(MAX_PORTION_FACTOR, Math.max(MIN_PORTION_FACTOR, Math.round(raw * 20) / 20)),
    }
  })
}

/**
 * Границы личной доли. Больше двух с половиной порций — это уже не порция,
 * а кастрюля; меньше четырёх десятых — не еда, а проба.
 */
export const MAX_PORTION_FACTOR = 2.5
const MIN_PORTION_FACTOR = 0.4

/** Сколько порций готовим всего — сумма личных долей. */
export function totalPortions(entry: MenuEntry): number {
  return entry.portions.reduce((sum, p) => sum + p.factor, 0)
}

/** Доля конкретного едока; для неизвестного id — 0. */
export function portionOf(entry: MenuEntry, eaterId: string): number {
  return entry.portions.find((p) => p.eaterId === eaterId)?.factor ?? 0
}

interface DayAcc {
  kcal: number
  fat: number
  protein: number
  carbs: number
  fiber: number
}

interface PickState {
  usedCount: Map<string, number>
  lastDay: Map<string, number>
  /** Что уже набрано в этот день предыдущими приёмами пищи. */
  day: Map<number, DayAcc>
  /**
   * Сколько каждого продукта уже требует собранная часть меню. Нужно, чтобы
   * считать излишек упаковок: продукты продаются пачками, и пятая часть
   * купленного оказывалась лишней просто потому, что каждый рецепт
   * подбирался сам по себе.
   */
  ingredientNeed: Map<string, number>
}

/**
 * Во сколько рублей обойдётся излишек упаковок, если поставить это блюдо.
 *
 * Отрицательное значение — блюдо доедает то, что и так придётся купить: если
 * пачка креветок 400 г, а меню требует 170, второе блюдо с креветками
 * достаётся почти даром. Положительное — блюдо вскрывает новую пачку ради
 * малой доли, и остаток ляжет мёртвым грузом.
 *
 * Считаем в рублях, а не в граммах: 200 г лишних креветок и 200 г лишней
 * капусты — очень разные потери.
 */
function packWasteCost(recipe: Recipe, scale: number, state: PickState): number {
  let cost = 0
  for (const item of recipe.items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing || ing.staple) continue
    const pack = ing.pack ?? 0
    // весовой продукт без фасовки: берём сколько нужно, излишка не возникает
    if (pack <= 0) continue

    const need = item.qty * scale
    const before = state.ingredientNeed.get(item.ingredientId) ?? 0
    const rublesPerUnit = ing.unit === 'pcs' ? ing.price : ing.price / 1000
    const surplusBefore = before > 0 ? Math.ceil(before / pack) * pack - before : 0
    const surplusAfter = Math.ceil((before + need) / pack) * pack - (before + need)
    cost += (surplusAfter - surplusBefore) * rublesPerUnit
  }
  return cost
}

/** Запоминаем, сколько продуктов уже требует собранная часть меню. */
function addIngredients(state: PickState, recipe: Recipe, scale: number): void {
  for (const item of recipe.items) {
    const current = state.ingredientNeed.get(item.ingredientId) ?? 0
    state.ingredientNeed.set(item.ingredientId, current + item.qty * scale)
  }
}

function accOf(state: PickState, day: number): DayAcc {
  return state.day.get(day) ?? { kcal: 0, fat: 0, protein: 0, carbs: 0, fiber: 0 }
}

function addToDay(state: PickState, day: number, recipe: Recipe, scale: number): void {
  const stats = recipeStats(recipe)
  const acc = accOf(state, day)
  state.day.set(day, {
    kcal: acc.kcal + stats.kcal * scale,
    fat: acc.fat + stats.fat * scale,
    protein: acc.protein + stats.protein * scale,
    carbs: acc.carbs + stats.carbs * scale,
    fiber: acc.fiber + stats.fiber * scale,
  })
}

interface MacroShares {
  protein: number
  fat: number
  carbs: number
}

/** Доли белков/жиров/углеводов в калорийности. */
function macroShares(n: Norms): MacroShares {
  const total = n.protein * 4 + n.fat * 9 + n.carbs * 4 || 1
  return {
    protein: (n.protein * 4) / total,
    fat: (n.fat * 9) / total,
    carbs: (n.carbs * 4) / total,
  }
}

/**
 * Во что цель пересборки оценивает блюдо.
 *
 * Веса подобраны так, чтобы цель было видно, но норма оставалась главной:
 * «дешевле» — это про выбор среди подходящего, а не про пустую тарелку.
 * Замер на восьми неделях (цена недели / руки у плиты / худшее отклонение
 * дня от нормы):
 *
 *   обычно      2803 ₽   205 мин   2.2%
 *   дешевле     2041 ₽   236 мин   —
 *   быстрее     3115 ₽   173 мин   1.7%
 *
 * Видно и обратную сторону: быстрые блюда дороже, дешёвые — дольше. Это
 * честный размен, и человек выбирает его сам.
 */
function goalCost(
  recipe: Recipe,
  stats: RecipeStats,
  scale: number,
  options: BuildOptions | undefined,
): number {
  switch (options?.goal) {
    case 'cheaper':
      return stats.price * scale * 1.2
    case 'faster':
      return recipe.steps.reduce((sum, s) => sum + (s.handsOn ? s.minutes : s.minutes * 0.2), 0) * 10
    case 'stock': {
      const home = new Set(options.atHome ?? [])
      if (home.size === 0) return 0
      const own = recipe.items.filter((i) => home.has(i.ingredientId)).length
      const missing = recipe.items.length - own
      return missing * 12 - own * 20
    }
    case 'variety':
      return 0
    default:
      return 0
  }
}

function scoreRecipe(
  recipe: Recipe,
  opts: {
    household: Household
    targetKcal: number
    targetMacros: MacroShares
    day: number
    state: PickState
    jitter: number
    /** Сколько нужно самому большому едоку за столом. */
    topTarget?: number
    /** Чего человек хочет от этой пересборки. */
    options?: BuildOptions
  },
): number {
  const { household, targetKcal, targetMacros, day, state, jitter } = opts
  const stats = recipeStats(recipe)
  const scale = portionScale(recipe, targetKcal)
  let score = 0

  // попадание в норму по калориям
  const achieved = stats.kcal * scale
  score += Math.abs(achieved - targetKcal) / 6
  // недобор хуже перебора: голодное меню не работает
  score += Math.max(0, (targetKcal - achieved) / targetKcal) * 200
  // за сильно скорректированный масштаб — штраф: лучше рецепт «в размер»
  score += Math.abs(1 - scale) * 25

  // баланс БЖУ считаем по всему дню: одно жирное блюдо компенсируем следующими
  const acc = accOf(state, day)
  const projectedKcal = acc.kcal + achieved
  const fatBudget = (projectedKcal * targetMacros.fat) / 9
  const proteinBudget = (projectedKcal * targetMacros.protein) / 4
  const carbBudget = (projectedKcal * targetMacros.carbs) / 4
  const projFat = acc.fat + stats.fat * scale
  const projProtein = acc.protein + stats.protein * scale
  const projCarbs = acc.carbs + stats.carbs * scale
  // перебор жира дороже всего: именно он тянет день в сторону от нормы
  score += Math.max(0, projFat - fatBudget) * 8
  score += Math.max(0, fatBudget - projFat) * 2
  score += Math.max(0, proteinBudget - projProtein) * 4
  score += Math.max(0, projProtein - proteinBudget) * 2.5
  // углеводы раньше не отслеживались вовсе — отсюда провалы до 75% нормы
  score += Math.max(0, carbBudget - projCarbs) * 4
  score += Math.max(0, projCarbs - carbBudget) * 1.5

  // Клетчатка. Рацион может попадать в калории и БЖУ и при этом состоять из
  // творога, фарша и круп — клетчатка ровно то, чем нормальное питание от
  // такого отличается. Штрафуем только недобор: перебор клетчатки бытовым
  // меню недостижим.
  const fiberBudget = (projectedKcal * FIBER_PER_1000) / 1000
  score += Math.max(0, fiberBudget - (acc.fiber + stats.fiber * scale)) * FIBER_WEIGHT

  // Небольшой вклад излишка упаковок в общий счёт. Основная экономия делается
  // не здесь, а на выборе среди почти равных вариантов (см. buildWeekMenu):
  // большой вес в общем счёте начинает перевешивать норму человека.
  score += packWasteCost(recipe, scale, state) * PACK_WASTE_WEIGHT

  // и немного — по самому блюду, чтобы не собирать день из крайностей
  const shares = macroShares(stats)
  score +=
    (Math.abs(shares.protein - targetMacros.protein) +
      Math.abs(shares.fat - targetMacros.fat) +
      Math.abs(shares.carbs - targetMacros.carbs)) *
    20

  // свои рецепты предпочитаем встроенным, но не любой ценой:
  // бонус не перебивает ни аллергии (жёсткий фильтр), ни сильный промах по калориям
  if (recipe.custom) score -= CUSTOM_RECIPE_BONUS

  // «не люблю» — мягкий, но очень заметный штраф
  for (const eater of household.eaters) score += dislikeHits(recipe, eater).length * 60

  // Оценки блюд. Веса намеренно несимметричны и подобраны замером на 40
  // неделях — появлений блюда при нейтральной оценке / при «не нравится»:
  //
  //   вес «не нравится»          35        60        90
  //   овсяная запеканка       61→53     61→41     61→14
  //   гречневые оладьи        42→16      42→6      42→0
  //   курица с брокколи       60→41     60→27      60→8
  //
  // Тридцати пяти мало на блюдах, которые подбор и так выбирает часто;
  // девяносто превращают оценку в скрытие — оладьи исчезают совсем. Шестьдесят
  // сокращает вдвое-втрое, оставляя блюдо в подборе: «нравится» поднимает,
  // «не нравится» опускает, «больше не показывать» убирает — три варианта
  // дают три разных результата, а не два.
  const rating = ratingScore(recipe, household)
  score -= Math.max(0, rating) * 90
  score += Math.max(0, -rating) * 60

  // блюдо, которое не докормит самого большого едока даже в максимальной доле
  const top = opts.topTarget ?? 0
  if (top > 0) {
    const reachable = stats.kcal * MAX_PORTION_FACTOR
    score += Math.max(0, top - reachable) * 1.5
  }

  // Цель пересборки. Это не отдельный алгоритм, а сдвиг весов: «дешевле» не
  // должно ломать норму, оно должно среди подходящих блюд поднимать дешёвые.
  score += goalCost(recipe, stats, scale, opts.options)

  // разнообразие; при цели «разнообразнее» повтор стоит втрое дороже
  const repeatWeight = opts.options?.goal === 'variety' ? 135 : 45
  score += (state.usedCount.get(recipe.id) ?? 0) * repeatWeight
  const last = state.lastDay.get(recipe.id)
  if (last !== undefined) score += Math.max(0, 4 - (day - last)) * 20

  // бюджет
  if (household.budgetPerWeek > 0) {
    const mealsPerWeek = household.meals.length * 7 * household.eaters.length
    const budgetPerServing = household.budgetPerWeek / Math.max(1, mealsPerWeek)
    score += Math.max(0, stats.price * scale - budgetPerServing) * 0.6
  }

  return score + jitter * 30
}

/**
 * Суммарная оценка блюда семьёй: +1 за каждое «нравится», −1 за «не
 * нравится». Если Юлии блюдо нравится, а Кириллу нет, оно возвращается к
 * нейтральному — и это честно: спор о блюде приложение не решает.
 */
export function ratingScore(recipe: Recipe, household: Household): number {
  return household.eaters.reduce((sum, e) => sum + (e.ratings?.[recipe.id] ?? 0), 0)
}

function storageFor(recipe: Recipe, ageDays: number, hasFreezer: boolean): Storage | null {
  if (ageDays <= 0) return 'fresh'
  if (ageDays <= recipe.fridgeDays) return 'fridge'
  if (recipe.freezable && hasFreezer) return 'freezer'
  return null
}

export interface MenuBuildResult {
  menu: WeekMenu
  warnings: string[]
}

/** Максимум дней подряд с одним и тем же блюдом в одном приёме пищи. */
const MAX_RUN = 2

/**
 * Правила повторов по умолчанию.
 *
 * Числа взяты из того, как еда живёт: суп и завтрак повторяются спокойно,
 * ужин — хуже, перекус вообще один и тот же каждый день у большинства людей.
 */
export function defaultRepeats(): RepeatRules {
  return {
    maxPerWeek: { breakfast: 3, lunch: 2, dinner: 2, snack: 7 },
    backToBack: true,
    gapDays: 1,
  }
}

export function repeatsOf(household: Household): RepeatRules {
  return household.repeats ?? defaultRepeats()
}

/**
 * «Что вы готовы есть чаще» — это и есть «нравится». Отдельный список тех же
 * блюд человек вёл бы дважды, а расходились бы они на второй неделе.
 */
function likedBonus(recipe: Recipe, household: Household): number {
  return ratingScore(recipe, household) > 0 ? 1 : 0
}

/** Можно ли поставить блюдо в этот день, не нарушив правила повторов. */
function repeatAllowed(
  recipe: Recipe,
  slot: MealSlot,
  day: number,
  state: PickState,
  rules: RepeatRules,
  bonus: number,
): boolean {
  const limit = rules.maxPerWeek[slot] ?? 0
  const used = state.usedCount.get(recipe.id) ?? 0
  // «нравится» — это и есть ответ на вопрос «что вы готовы есть чаще»
  if (limit > 0 && used >= limit + bonus) return false
  const last = state.lastDay.get(recipe.id)
  if (last === undefined) return true
  const gap = day - last
  if (!rules.backToBack && gap <= 1) return false
  return gap >= (rules.backToBack ? 1 : Math.max(1, rules.gapDays))
}

/** Насколько кандидат может уступать лучшему, чтобы всё ещё попасть в жеребьёвку. */
const NEAR_SCORE_MARGIN = 50

/**
 * Блюдо, которое едут есть в контейнере, должно продержаться хотя бы до
 * обеда. Порог в днях холодильника — самый близкий признак: у смузи-боула и
 * тоста с авокадо он равен одному дню, и это ровно те блюда, которые в сумке
 * портятся.
 *
 * Это фильтр, а не штраф. Штрафом это и было сначала — и разнообразие его
 * перевешивало: раз в неделю в контейнер всё равно попадал салат, который к
 * полудню развалится. Выбор «повторить блюдо или взять несъедобное» решается
 * в пользу повтора.
 */
const TAKEAWAY_MIN_FRIDGE_DAYS = 2

/**
 * Норма клетчатки на тысячу килокалорий и вес её недобора в счёте.
 *
 * Вес подобран замером на 280 днях (дней ниже нормы / худший день, при норме
 * 26 г):
 *
 *   вес       0     2     6    12    20
 *   дней     50    46    33    16     8
 *   худший   11    13    20    20    24
 *
 * Двенадцать — там, где кривая ещё падает вдвое, а разнообразие не страдает
 * (27 разных блюд за 40 недель против 24 при шестёрке). Двадцать даёт ещё
 * немного, но начинает подтягивать одни и те же бобовые.
 */
const FIBER_PER_1000 = 14
const FIBER_WEIGHT = 12

/** Доедет ли блюдо до обеда в контейнере. */
function travels(recipe: Recipe): boolean {
  return recipe.fridgeDays >= TAKEAWAY_MIN_FRIDGE_DAYS
}

/** Свои рецепты добавляют не просто так — при прочих равных они идут первыми. */
const CUSTOM_RECIPE_BONUS = 100

/**
 * Во сколько баллов обходится рубль излишка упаковок в общем счёте.
 * Подобран замером на 120 неделях, то есть 1680 человеко-днях:
 *
 *   вариант            остатков  излишек  блюд  цена     КБЖУ   худшее личное
 *   ничего              20.7      22.9%   12.4  8411 ₽   3.37%    4.79%
 *   только тай-брейк    18.7      20.9%   11.9  8105 ₽   3.00%    1.76%
 *   тай-брейк + 0.1     15.3      18.8%   11.2  7821 ₽   3.25%    4.96%
 *   тай-брейк + 0.15    14.1      17.8%   10.9  7708 ₽   3.14%   12.60%
 *
 * Между 0.1 и 0.15 обрыв: экономия начинает перевешивать норму, и один день
 * из 1680 уходит больше чем на 12% от личной нормы. Обещание «каждому по его
 * норме» дороже одного процента излишка, поэтому 0.1.
 */
const PACK_WASTE_WEIGHT = 0.1

/**
 * Пересобирает меню. `keep` — блюда, которые человек оставил: они занимают
 * свои клетки, а остальное подбирается вокруг них, включая баланс БЖУ.
 */
export interface BuildOptions {
  /** Чего человек хочет от этой пересборки. */
  goal?: MenuGoal
  /** Что уже лежит дома — для цели «из запасов». */
  atHome?: string[]
  /**
   * Что лежит в морозилке с прошлых недель. Меню обязано это учитывать:
   * заготовка, которую никто не планирует съесть, — это выброшенные деньги.
   * Замер на двенадцати неделях: без этого в морозилке скапливалось 4750 ₽ и
   * ещё 3630 ₽ пропадало по сроку.
   */
  freezer?: FreezerItem[]
  /** Сегодняшняя дата, ISO. Нужна, чтобы не планировать просроченное. */
  today?: string
}

/** Сколько дней осталось контейнеру к тому дню, когда его собираются съесть. */
function freezerDaysLeft(item: FreezerItem, today: string, day: number): number {
  const cooked = new Date(item.cookedAt)
  const eat = new Date(today)
  eat.setDate(eat.getDate() + day)
  const age = Math.round((eat.getTime() - cooked.getTime()) / 86400000)
  return item.keepDays - age
}

export function buildWeekMenu(
  household: Household,
  seed: number,
  keep: MenuEntry[] = [],
  options: BuildOptions = {},
): MenuBuildResult {
  const rnd = mulberry32(seed)
  const warnings: string[] = []
  const repeats = repeatsOf(household)
  let repeatsRelaxed = false
  const segments = cookingSegments(household.cookingDays)
  const targetMacros = macroShares(householdNorms(household))
  const entries: MenuEntry[] = []
  const state: PickState = {
    usedCount: new Map(),
    lastDay: new Map(),
    day: new Map(),
    ingredientNeed: new Map(),
  }

  // закреплённые блюда ставим первыми: они попадают в дневной баланс, и
  // подбор остального идёт уже с оглядкой на них
  const pinnedAt = new Map<string, MenuEntry>()
  for (const entry of keep) {
    const recipe = recipeById(entry.recipeId)
    if (!recipe) continue
    const segment = segments.find((s) => s.days.includes(entry.day))
    if (!segment) continue
    const storage = storageFor(recipe, entry.day - segment.cookDay, household.kitchen.hasFreezer)
    const fixed: MenuEntry = {
      ...entry,
      cookDay: segment.cookDay,
      storage: storage ?? 'fresh',
      portions: portionsFor(recipe, household, entry.slot, entry.day),
      pinned: true,
    }
    pinnedAt.set(`${entry.slot}:${entry.day}`, fixed)
    entries.push(fixed)
    state.usedCount.set(recipe.id, (state.usedCount.get(recipe.id) ?? 0) + 1)
    state.lastDay.set(recipe.id, entry.day)
    const pinnedScale = portionScale(recipe, slotTargetOn(household, entry.slot, entry.day))
    addToDay(state, entry.day, recipe, pinnedScale)
    addIngredients(state, recipe, pinnedScale)
    if (!storage) {
      warnings.push(
        `${WEEKDAYS_FULL[entry.day]}: «${recipe.title}» оставлено вручную, но столько не хранится — приготовьте в этот день.`,
      )
    }
  }

  /*
   * Достаём из морозилки то, что там уже лежит.
   *
   * Порядок — по сроку: первым в меню попадает то, что раньше испортится.
   * Это и есть главный смысл: заготовка, о которой никто не вспомнил, через
   * месяц становится мусором, и на двенадцати неделях таких набиралось на
   * 3630 ₽.
   *
   * Такая запись не готовится и не покупается — её нужно только достать
   * накануне, поэтому она ставится до общего подбора и занимает клетку так же,
   * как закреплённое блюдо.
   */
  /*
   * Контейнеры одного блюда складываем вместе.
   *
   * По отдельности они почти всегда бесполезны: в контейнере полторы порции, а
   * на семейный обед нужно две с лишним. Пока лоты жили порознь, морозилка
   * росла при формально работающем правиле — заготовки были, но ни одна не
   * набирала на приём пищи.
   */
  const freezerStock = new Map<string, { portions: number; left: number }>()
  for (const item of options.freezer ?? []) {
    const existing = freezerStock.get(item.recipeId)
    const portions = item.containers * item.portionsEach
    const left = freezerDaysLeft(item, options.today ?? household.weekStart, 0)
    if (existing) {
      existing.portions += portions
      existing.left = Math.min(existing.left, left)
    } else {
      freezerStock.set(item.recipeId, { portions, left })
    }
  }
  // первым в меню попадает то, что раньше испортится: заготовка, о которой
  // никто не вспомнил, через месяц становится мусором
  const freezerOrder = [...freezerStock.entries()].sort((a, b) => a[1].left - b[1].left)

  for (const slot of household.meals) {
    for (let day = 0; day < 7; day++) {
      if (pinnedAt.has(`${slot}:${day}`)) continue
      const present = fedEaters(household, day, slot)
      if (present.length === 0) continue
      const takeaway = takeawayEaters(household, day, slot).length > 0

      for (const [recipeId, stock] of freezerOrder) {
        if (stock.portions <= 0.2) continue
        const recipe = recipeById(recipeId)
        if (!recipe || !recipe.slots.includes(slot)) continue
        if (!isRecipeAllowed(recipe, household)) continue
        // не доедет в контейнер — не ставим, ровно как и свежеприготовленное
        if (takeaway && !travels(recipe)) continue
        // испортится до того дня, когда его собирались съесть
        if (stock.left - day < 0) continue
        if (!repeatAllowed(recipe, slot, day, state, repeats, likedBonus(recipe, household))) {
          continue
        }
        // порций должно хватить на всех, кто за столом: половину обеда из
        // морозилки не достают
        const portions = portionsFor(recipe, household, slot, day)
        const need = portions.reduce((sum, p) => sum + p.factor, 0)
        if (stock.portions + 0.2 < need) continue

        const entry: MenuEntry = {
          id: `${slot}-${day}-${recipe.id}-freezer`,
          recipeId: recipe.id,
          slot,
          day,
          cookDay: day,
          portions,
          storage: 'freezer',
          fromFreezer: true,
        }
        pinnedAt.set(`${slot}:${day}`, entry)
        entries.push(entry)
        stock.portions -= need
        state.usedCount.set(recipe.id, (state.usedCount.get(recipe.id) ?? 0) + 1)
        state.lastDay.set(recipe.id, day)
        addToDay(state, day, recipe, portionScale(recipe, slotTargetOn(household, slot, day)))
        break
      }
    }
  }

  const implicit = segments.find((s) => s.implicit && household.cookingDays.length > 0)
  if (implicit) {
    warnings.push(
      `${WEEKDAYS_FULL[0]} не отмечен днём готовки — добавили короткую готовку, чтобы закрыть начало недели.`,
    )
  }

  const pool = allRecipes().filter((r) => isRecipeAllowed(r, household))

  for (const slot of household.meals) {
    // приёмы перебираются в порядке household.meals, поэтому «последний» —
    // это тот, на котором уже известны остальные блюда дня
    const isLastSlot = slot === household.meals[household.meals.length - 1]
    const slotPool = pool.filter((r) => r.slots.includes(slot))
    if (slotPool.length === 0) {
      warnings.push(`Для приёма «${slot}» не осталось подходящих рецептов — ослабьте ограничения.`)
      continue
    }
    for (const segment of segments) {
      let cursor = 0
      let guard = 0
      while (cursor < segment.days.length && guard++ < 50) {
        const day = segment.days[cursor]
        // клетка занята закреплённым блюдом — идём дальше
        if (pinnedAt.has(`${slot}:${day}`)) {
          cursor++
          continue
        }
        // этот приём пищи вся семья ест не дома — готовить нечего
        if (fedEaters(household, day, slot).length === 0) {
          cursor++
          continue
        }
        const target = slotTargetOn(household, slot, day) || 500
        // Последний приём пищи закрывает день: если завтрак и обед вышли
        // легче обычного, ужин должен добрать разницу, а не снова целиться в
        // свою долю. Без этого один день из 840 уходил на 12% ниже нормы —
        // при том, что каждый приём в отдельности был «в размер».
        const target2 = isLastSlot
          ? clampTarget(dayTargetOn(household, day) - accOf(state, day).kcal, target)
          : target
        // Кто-то берёт этот приём пищи с собой — значит, блюдо должно доехать.
        // Это не вопрос предпочтения, а вопрос того, что человек откроет в
        // обед: штрафа мало, разнообразие его перевешивало и раз в неделю
        // ставило в контейнер салат, который к полудню развалится.
        const takeaway = takeawayEaters(household, day, slot).length
        const travelPool = takeaway > 0 ? slotPool.filter(travels) : slotPool
        // Правила повторов: сколько раз блюдо может выпасть за неделю и можно
        // ли есть его два дня подряд. Это жёсткое правило, а не штраф: «не
        // хочу одно и то же два дня» — не пожелание, которое можно перевесить
        // удачной калорийностью.
        const allowedPool = travelPool.filter((r) =>
          repeatAllowed(r, slot, day, state, repeats, likedBonus(r, household)),
        )
        // выбора не осталось — блюдо всё равно нужно поставить, но об этом
        // предупредим: пустая тарелка хуже повтора
        const dayPool =
          allowedPool.length > 0 ? allowedPool : travelPool.length > 0 ? travelPool : slotPool
        if (allowedPool.length === 0) repeatsRelaxed = true
        const ranked = dayPool
          .map((recipe) => ({
            recipe,
            score: scoreRecipe(recipe, {
              household,
              targetKcal: target2,
              targetMacros,
              day,
              state,
              jitter: rnd(),
              topTarget: topEaterTarget(household, slot, day),
              options,
            }),
          }))
          .sort((a, b) => a.score - b.score)

        // Среди почти одинаковых по качеству вариантов выбор случайный: иначе
        // каждую неделю выпадают одни и те же «лучшие» блюда. Но случайность
        // смещена к блюдам, которые доедают уже купленные упаковки.
        //
        // Экономия делается именно здесь, а не в общем счёте, и это
        // принципиально: в общем счёте она начинала перевешивать норму, и один
        // день из 1680 уходил больше чем на 12% от личной нормы. Внутри
        // «почти равных» вариантов ухудшать питание нечем — они уже равны.
        const near = ranked
          .filter((c) => c.score <= ranked[0].score + NEAR_SCORE_MARGIN)
          .map((c) => ({
            recipe: c.recipe,
            // «не люблю лук» сильнее любой экономии: лук — самый общий продукт
            // в базе, и без этого ключа экономия начинала подтягивать наверх
            // именно те блюда, от которых человек отказался
            dislikes: household.eaters.reduce(
              (sum, e) => sum + dislikeHits(c.recipe, e).length,
              0,
            ),
            waste: packWasteCost(c.recipe, portionScale(c.recipe, target2), state),
          }))
          .sort((a, b) => a.dislikes - b.dislikes || a.waste - b.waste)
        // rnd² смещает выбор к началу списка, не убирая разнообразия совсем
        const best = near[Math.floor(rnd() ** 2 * near.length)].recipe
        const scale = portionScale(best, target2)
        let produced = 0
        // одно и то же два дня подряд — это и есть партия на два дня; если
        // человек так не хочет, серия сокращается до одного дня, и готовить
        // придётся чаще
        // серия не может съесть больше, чем блюду разрешено за неделю
        const limit = repeats.maxPerWeek[slot] ?? 0
        const left =
          limit > 0
            ? limit + likedBonus(best, household) - (state.usedCount.get(best.id) ?? 0)
            : MAX_RUN
        const runLimit = Math.max(1, Math.min(repeats.backToBack ? MAX_RUN : 1, left))
        for (let k = 0; k < runLimit && cursor + k < segment.days.length; k++) {
          const eatDay = segment.days[cursor + k]
          if (pinnedAt.has(`${slot}:${eatDay}`)) break
          if (fedEaters(household, eatDay, slot).length === 0) break
          // блюдо готовится на несколько дней — но в контейнер поедет только
          // то, что дорогу переносит
          if (takeawayEaters(household, eatDay, slot).length > 0 && !travels(best)) break
          const storage = storageFor(best, eatDay - segment.cookDay, household.kitchen.hasFreezer)
          if (!storage) break
          entries.push({
            id: `${slot}-${eatDay}-${best.id}`,
            recipeId: best.id,
            slot,
            day: eatDay,
            cookDay: segment.cookDay,
            portions: portionsFor(best, household, slot, eatDay),
            storage,
          })
          produced++
        }
        if (produced === 0) {
          // блюдо не доживает до этого дня — берём следующее по рангу, готовое дольше
          const fallback = ranked.find(
            (c) =>
              storageFor(c.recipe, day - segment.cookDay, household.kitchen.hasFreezer) !== null,
          )
          if (!fallback) {
            warnings.push(
              `${WEEKDAYS_FULL[day]}: нет блюда, которое доживёт до этого дня. Добавьте день готовки или морозилку.`,
            )
            cursor++
            continue
          }
          const fbScale = portionScale(fallback.recipe, target)
          entries.push({
            id: `${slot}-${day}-${fallback.recipe.id}`,
            recipeId: fallback.recipe.id,
            slot,
            day,
            cookDay: segment.cookDay,
            portions: portionsFor(fallback.recipe, household, slot, day),
            storage: storageFor(
              fallback.recipe,
              day - segment.cookDay,
              household.kitchen.hasFreezer,
            )!,
          })
          state.usedCount.set(
            fallback.recipe.id,
            (state.usedCount.get(fallback.recipe.id) ?? 0) + 1,
          )
          state.lastDay.set(fallback.recipe.id, day)
          addToDay(state, day, fallback.recipe, fbScale)
          addIngredients(state, fallback.recipe, fbScale)
          cursor++
          continue
        }
        // считаем приёмы пищи, а не готовки: «блюдо появляется дважды» для
        // человека — это две тарелки, а не два захода к плите
        state.usedCount.set(best.id, (state.usedCount.get(best.id) ?? 0) + produced)
        state.lastDay.set(best.id, segment.days[cursor + produced - 1])
        for (let k = 0; k < produced; k++) {
          addToDay(state, segment.days[cursor + k], best, scale)
          addIngredients(state, best, scale)
        }
        cursor += produced
      }
    }
  }

  entries.sort(
    (a, b) =>
      a.day - b.day || household.meals.indexOf(a.slot) - household.meals.indexOf(b.slot),
  )

  if (repeatsRelaxed) {
    warnings.push(
      'Правила повторов пришлось ослабить: подходящих блюд на неделю не хватило. Разрешите блюду появляться чаще или добавьте свои рецепты.',
    )
  }

  // Напитки съедают часть нормы — и если почти всю, ужимать обед бессмысленно:
  // норма еды упирается в нижнюю границу, и об этом нужно сказать вслух.
  for (const eater of household.eaters) {
    for (let day = 0; day < 7; day++) {
      if (!drinksOvershoot(eater, household, day)) continue
      warnings.push(
        `${WEEKDAYS_FULL[day]}: напитки ${eater.name} — это ${drinkNorms(household, eater.id, day).kcal} ккал, больше трети дневной нормы. Меню собрано на остаток.`,
      )
      break
    }
  }

  // Контейнеры: их число ограничено, и «собрать три обеда с собой» при двух
  // контейнерах — не план, а сюрприз утром вторника.
  for (let day = 0; day < 7; day++) {
    const need = containersOn(household, day)
    if (need > household.kitchen.containers) {
      warnings.push(
        `${WEEKDAYS_FULL[day]}: с собой нужно ${need} ${plural(need, ['контейнер', 'контейнера', 'контейнеров'])}, а на кухне их ${household.kitchen.containers}.`,
      )
    }
  }

  // И отдельно — блюда, которые до обеда в сумке не доедут. Штраф в подборе
  // мягкий: если выбора нет, блюдо всё равно встанет в меню, и тогда об этом
  // нужно сказать, а не промолчать.
  for (const entry of entries) {
    const takeaway = takeawayEaters(household, entry.day, entry.slot)
    if (takeaway.length === 0) continue
    const recipe = recipeById(entry.recipeId)
    if (!recipe || recipe.fridgeDays >= TAKEAWAY_MIN_FRIDGE_DAYS) continue
    warnings.push(
      `${WEEKDAYS_FULL[entry.day]}: «${recipe.title}» плохо переносит дорогу — на ${slotLabel(entry.slot)} с собой лучше взять что-то другое.`,
    )
  }

  return { menu: { weekStart: household.weekStart, seed, entries }, warnings }
}

/**
 * Почему блюдо не подошло. Причина не просто фильтрует список — она меняет
 * ранжирование: «дорого» поднимает дешёвые варианты, «нет ингредиентов» —
 * те, что собраны из уже закупаемых продуктов.
 */
export type ReplaceReason =
  | 'dislike'
  | 'too_long'
  | 'expensive'
  | 'no_ingredients'
  | 'simpler'
  | 'recent'

export const REPLACE_REASONS: { id: ReplaceReason; label: string; hint: string }[] = [
  { id: 'dislike', label: 'Не нравится', hint: 'уберём похожее по составу' },
  { id: 'too_long', label: 'Слишком долго', hint: 'покажем то, что быстрее' },
  { id: 'expensive', label: 'Дорого', hint: 'поднимем дешёвые варианты' },
  { id: 'no_ingredients', label: 'Нет ингредиентов', hint: 'соберём из того, что уже в закупке' },
  { id: 'simpler', label: 'Хочется проще', hint: 'меньше шагов и продуктов' },
  { id: 'recent', label: 'Уже недавно ели', hint: 'что давно не было на столе' },
]

/** Что меняется относительно текущего блюда — чтобы выбор был осознанным. */
export interface ReplacementOption {
  recipe: Recipe
  scale: number
  kcal: number
  price: number
  minutes: number
  handsOnMinutes: number
  storage: Storage
  /** Разница с заменяемым блюдом: ккал, ₽, минуты. */
  deltaKcal: number
  deltaPrice: number
  deltaMinutes: number
  /** Доля продуктов, которые и так покупаются на эту неделю, 0..1. */
  reuseShare: number
}

function totalMinutes(recipe: Recipe): number {
  return recipe.steps.reduce((sum, step) => sum + step.minutes, 0)
}

function handsOnMinutes(recipe: Recipe): number {
  return recipe.steps.reduce((sum, step) => sum + (step.handsOn ? step.minutes : 0), 0)
}

/** Сколько раз каждый продукт уже встречается в неделе — мера приедания. */
function ingredientUsage(menu: WeekMenu, skipEntryId: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of menu.entries) {
    if (entry.id === skipEntryId) continue
    for (const item of recipeById(entry.recipeId)?.items ?? []) {
      if (INGREDIENT_BY_ID[item.ingredientId]?.staple) continue
      counts.set(item.ingredientId, (counts.get(item.ingredientId) ?? 0) + 1)
    }
  }
  return counts
}

/** Продукты, которые уже нужны на эту неделю без учёта заменяемого блюда. */
function weekIngredients(menu: WeekMenu, skipEntryId: string): Set<string> {
  const set = new Set<string>()
  for (const entry of menu.entries) {
    if (entry.id === skipEntryId) continue
    for (const item of recipeById(entry.recipeId)?.items ?? []) set.add(item.ingredientId)
  }
  return set
}

/** Доля продуктов рецепта, которые и так в списке покупок. */
function reuseShareOf(recipe: Recipe, pool: Set<string>): number {
  const items = recipe.items.filter((i) => !INGREDIENT_BY_ID[i.ingredientId]?.staple)
  if (items.length === 0) return 1
  return items.filter((i) => pool.has(i.ingredientId)).length / items.length
}

/** Насколько рецепт похож на отвергнутый: общие теги и общие основные продукты. */
function similarity(candidate: Recipe, rejected: Recipe): number {
  const tags = new Set(rejected.tags)
  const shared = candidate.tags.filter((t) => tags.has(t)).length
  const items = new Set(
    rejected.items.filter((i) => !INGREDIENT_BY_ID[i.ingredientId]?.staple).map((i) => i.ingredientId),
  )
  const sharedItems = candidate.items.filter((i) => items.has(i.ingredientId)).length
  return shared + sharedItems
}

/** Ранжированные кандидаты на замену блюда: лучший по подбору — первым. */
export function replacementOptions(
  menu: WeekMenu,
  household: Household,
  entryId: string,
  reason?: ReplaceReason,
  limit = 20,
): ReplacementOption[] {
  const entry = menu.entries.find((e) => e.id === entryId)
  if (!entry) return []
  const current = recipeById(entry.recipeId)
  const target = slotTargetOn(household, entry.slot, entry.day) || 500
  const usedToday = new Set(
    menu.entries.filter((e) => e.day === entry.day && e.id !== entryId).map((e) => e.recipeId),
  )
  const state: PickState = {
    usedCount: new Map(),
    lastDay: new Map(),
    day: new Map(),
    ingredientNeed: new Map(),
  }
  for (const e of menu.entries) {
    if (e.id === entryId) continue
    state.usedCount.set(e.recipeId, (state.usedCount.get(e.recipeId) ?? 0) + 1)
    state.lastDay.set(e.recipeId, e.day)
  }
  const pool = weekIngredients(menu, entryId)
  const usage = ingredientUsage(menu, entryId)
  const curStats = current ? recipeStats(current) : null
  const curScale = current ? portionScale(current, target) : 1
  const curMinutes = current ? totalMinutes(current) : 0
  const curHandsOn = current ? handsOnMinutes(current) : 0
  // тот же фильтр, что и при сборке меню: в контейнер предлагаем только то,
  // что доедет — иначе замена подсовывает салат на офисный обед
  const mustTravel = takeawayEaters(household, entry.day, entry.slot).length > 0

  return allRecipes()
    .filter(
      (r) =>
        r.slots.includes(entry.slot) &&
        isRecipeAllowed(r, household) &&
        r.id !== entry.recipeId &&
        (!mustTravel || travels(r)) &&
        !usedToday.has(r.id) &&
        storageFor(r, entry.day - entry.cookDay, household.kitchen.hasFreezer) !== null,
    )
    .map((recipe) => {
      const scale = portionScale(recipe, target)
      const stats = recipeStats(recipe)
      const minutes = totalMinutes(recipe)
      const handsOn = handsOnMinutes(recipe)
      const reuse = reuseShareOf(recipe, pool)
      // база сохраняет то, ради чего меню и собиралось: калории, БЖУ, бюджет
      let score = scoreRecipe(recipe, {
        household,
        targetKcal: target,
        targetMacros: macroShares(householdNorms(household)),
        day: entry.day,
        state,
        jitter: 0,
        topTarget: topEaterTarget(household, entry.slot, entry.day),
      })
      // общие продукты с остальной неделей — всегда в плюс: замена не должна
      // добавлять полполки продуктов ради одного ужина
      score -= reuse * 120
      // и план готовки не должен раздуться от одной замены
      score += Math.max(0, handsOn - curHandsOn) * 1.5

      switch (reason) {
        case 'dislike':
          // похожее по составу и тегам на отвергнутое — мимо
          if (current) score += similarity(recipe, current) * 110
          break
        case 'too_long':
          score += Math.max(0, minutes - curMinutes) * 6
          score += minutes * 1.2
          break
        case 'expensive':
          score += Math.max(0, stats.price * scale - (curStats?.price ?? 0) * curScale) * 4
          score += stats.price * scale * 1.5
          break
        case 'no_ingredients':
          score -= reuse * 260
          break
        case 'simpler':
          score += recipe.steps.length * 30 + recipe.items.length * 35 + minutes * 0.8
          break
        case 'recent': {
          // приелось — значит нужны другие продукты, а не другое название.
          // общий бонус за переиспользование здесь снимаем: он тянет ровно туда,
          // откуда человек хочет уйти
          score += reuse * 120
          const items = recipe.items.filter((i) => !INGREDIENT_BY_ID[i.ingredientId]?.staple)
          const repeats = items.reduce((sum, i) => sum + (usage.get(i.ingredientId) ?? 0), 0)
          score += (repeats / Math.max(1, items.length)) * 90
          score += (state.usedCount.get(recipe.id) ?? 0) * 200
          break
        }
        default:
          break
      }

      return {
        option: {
          recipe,
          scale,
          kcal: Math.round(stats.kcal * scale),
          price: Math.round(stats.price * scale),
          minutes,
          handsOnMinutes: handsOn,
          storage: storageFor(recipe, entry.day - entry.cookDay, household.kitchen.hasFreezer)!,
          deltaKcal: Math.round(stats.kcal * scale - (curStats?.kcal ?? 0) * curScale),
          deltaPrice: Math.round(stats.price * scale - (curStats?.price ?? 0) * curScale),
          deltaMinutes: minutes - curMinutes,
          reuseShare: reuse,
        },
        score,
      }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.option)
}

/** Ставит на место блюда конкретный рецепт, выбранный человеком. */
export function replaceEntryWith(
  menu: WeekMenu,
  household: Household,
  entryId: string,
  recipeId: string,
): WeekMenu {
  const entry = menu.entries.find((e) => e.id === entryId)
  const recipe = allRecipes().find((r) => r.id === recipeId)
  if (!entry || !recipe) return menu
  const storage = storageFor(recipe, entry.day - entry.cookDay, household.kitchen.hasFreezer)
  if (!storage) return menu
  const replaced: MenuEntry = {
    ...entry,
    id: `${entry.slot}-${entry.day}-${recipe.id}`,
    recipeId: recipe.id,
    portions: portionsFor(recipe, household, entry.slot, entry.day),
    storage,
  }
  return { ...menu, entries: menu.entries.map((e) => (e.id === entryId ? replaced : e)) }
}

export interface DayTotals extends Norms {
  price: number
}

/**
 * Итоги дня. Без eaterId — по всей семье, с eaterId — личная тарелка одного
 * человека: те же блюда, но его доля. Блюда, отмеченные пропущенными, не
 * считаются: иначе шапка говорила бы «пропущено 1», а кольцо показывало бы
 * полную норму.
 */
export function dayTotals(menu: WeekMenu, day: number, eaterId?: string): DayTotals {
  const acc: DayTotals = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, price: 0 }
  for (const entry of menu.entries) {
    if (entry.day !== day) continue
    // пропущенное блюдо в тарелку не попало — считать его в норму дня нечестно
    if (entry.status === 'skipped') continue
    const recipe = recipeById(entry.recipeId)
    if (!recipe) continue
    const s = recipeStats(recipe)
    const factor = eaterId ? portionOf(entry, eaterId) : totalPortions(entry)
    acc.kcal += s.kcal * factor
    acc.protein += s.protein * factor
    acc.fat += s.fat * factor
    acc.carbs += s.carbs * factor
    acc.fiber += s.fiber * factor
    acc.price += s.price * factor
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein),
    fat: Math.round(acc.fat),
    carbs: Math.round(acc.carbs),
    fiber: Math.round(acc.fiber),
    price: Math.round(acc.price),
  }
}

export interface CookTask {
  key: string
  recipeId: string
  cookDay: number
  /** Суммарно порций за одну готовку — уже с учётом личных долей. */
  portions: number
  eatDays: number[]
  freezerPortions: number
}

/** Группирует меню в задачи готовки: одно блюдо — одна готовка на все дни, которые оно закрывает. */
export function cookTasks(menu: WeekMenu): CookTask[] {
  const map = new Map<string, CookTask>()
  for (const entry of menu.entries) {
    // заготовку из морозилки не готовят и не покупают — её достают
    if (entry.fromFreezer) continue
    const key = `${entry.recipeId}|${entry.cookDay}`
    const task = map.get(key)
    const portions = totalPortions(entry)
    if (task) {
      task.portions += portions
      task.eatDays.push(entry.day)
      if (entry.storage === 'freezer') task.freezerPortions += portions
    } else {
      map.set(key, {
        key,
        recipeId: entry.recipeId,
        cookDay: entry.cookDay,
        portions,
        eatDays: [entry.day],
        freezerPortions: entry.storage === 'freezer' ? portions : 0,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.cookDay - b.cookDay)
}
