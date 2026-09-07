import { INGREDIENT_BY_ID } from '../data/ingredients'
import { allRecipes, recipeById } from '../data/recipeRegistry'
import type {
  Allergen,
  Eater,
  EaterPortion,
  Household,
  MealSlot,
  MenuEntry,
  Norms,
  Recipe,
  Storage,
  WeekMenu,
} from '../types'
import { dailyNorm, recipeStats, slotShares, sumNorms } from './nutrition'
import { mulberry32 } from './random'

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
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

/** Ключ приёма пищи вне дома: день недели плюс приём. */
export function awayKey(day: number, slot: MealSlot): string {
  return `${day}:${slot}`
}

/** Ест ли человек этот приём пищи дома. */
export function eatsAtHome(eater: Eater, day: number, slot: MealSlot): boolean {
  return !eater.awayMeals?.includes(awayKey(day, slot))
}

/** Кто из семьи за столом в этот приём пищи. */
export function eatersAtHome(household: Household, day: number, slot: MealSlot): Eater[] {
  return household.eaters.filter((e) => eatsAtHome(e, day, slot))
}

/**
 * Личная норма на день с поправкой на еду вне дома: если Кирилл обедает в
 * офисе, дома он должен добрать только завтрак и ужин. Иначе «65% нормы»
 * выглядит как промах приложения, хотя это офисный обед.
 */
export function dayNorms(household: Household, day: number, eaterId?: string): Norms {
  const shares = slotShares(household.meals)
  const eaters = eaterId ? household.eaters.filter((e) => e.id === eaterId) : household.eaters
  const parts = eaters.map((eater) => {
    const full = dailyNorm(eater)
    const share = household.meals
      .filter((slot) => eatsAtHome(eater, day, slot))
      .reduce((sum, slot) => sum + (shares[slot] ?? 0), 0)
    return {
      kcal: Math.round(full.kcal * share),
      protein: Math.round(full.protein * share),
      fat: Math.round(full.fat * share),
      carbs: Math.round(full.carbs * share),
    }
  })
  return sumNorms(parts)
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
  const present = eatersAtHome(household, day, slot)
  if (present.length === 0) return 0
  const share = slotShares(household.meals)[slot] ?? 0.3
  const sum = present.reduce((acc, e) => acc + dailyNorm(e).kcal * share, 0)
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
    if (!eatsAtHome(eater, day, slot)) return { eaterId: eater.id, factor: 0 }
    const target = dailyNorm(eater).kcal * (shares[slot] ?? 0.3)
    const raw = target / perServing
    return {
      eaterId: eater.id,
      factor: Math.min(2.5, Math.max(0.4, Math.round(raw * 20) / 20)),
    }
  })
}

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
  return state.day.get(day) ?? { kcal: 0, fat: 0, protein: 0, carbs: 0 }
}

function addToDay(state: PickState, day: number, recipe: Recipe, scale: number): void {
  const stats = recipeStats(recipe)
  const acc = accOf(state, day)
  state.day.set(day, {
    kcal: acc.kcal + stats.kcal * scale,
    fat: acc.fat + stats.fat * scale,
    protein: acc.protein + stats.protein * scale,
    carbs: acc.carbs + stats.carbs * scale,
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

function scoreRecipe(
  recipe: Recipe,
  opts: {
    household: Household
    targetKcal: number
    targetMacros: MacroShares
    day: number
    state: PickState
    jitter: number
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

  // оценки блюд. Веса намеренно несимметричны и подобраны замером: «нравится»
  // поднимает блюдо с 7 появлений на 40 недель до 60, «не нравится» опускает
  // до 2 — то есть делает редким, но не вычёркивает. Вычёркивает «больше не
  // показывать», и три варианта оценки должны давать три разных результата,
  // а не два
  const rating = ratingScore(recipe, household)
  score -= Math.max(0, rating) * 90
  score += Math.max(0, -rating) * 8

  // разнообразие
  score += (state.usedCount.get(recipe.id) ?? 0) * 45
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

/** Насколько кандидат может уступать лучшему, чтобы всё ещё попасть в жеребьёвку. */
const NEAR_SCORE_MARGIN = 50

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
export function buildWeekMenu(
  household: Household,
  seed: number,
  keep: MenuEntry[] = [],
): MenuBuildResult {
  const rnd = mulberry32(seed)
  const warnings: string[] = []
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

  const implicit = segments.find((s) => s.implicit && household.cookingDays.length > 0)
  if (implicit) {
    warnings.push(
      `${WEEKDAYS_FULL[0]} не отмечен днём готовки — добавили короткую готовку, чтобы закрыть начало недели.`,
    )
  }

  const pool = allRecipes().filter((r) => isRecipeAllowed(r, household))

  for (const slot of household.meals) {
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
        if (eatersAtHome(household, day, slot).length === 0) {
          cursor++
          continue
        }
        const target = slotTargetOn(household, slot, day) || 500
        const ranked = slotPool
          .map((recipe) => ({
            recipe,
            score: scoreRecipe(recipe, {
              household,
              targetKcal: target,
              targetMacros,
              day,
              state,
              jitter: rnd(),
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
            waste: packWasteCost(c.recipe, portionScale(c.recipe, target), state),
          }))
          .sort((a, b) => a.dislikes - b.dislikes || a.waste - b.waste)
        // rnd² смещает выбор к началу списка, не убирая разнообразия совсем
        const best = near[Math.floor(rnd() ** 2 * near.length)].recipe
        const scale = portionScale(best, target)
        let produced = 0
        for (let k = 0; k < MAX_RUN && cursor + k < segment.days.length; k++) {
          const eatDay = segment.days[cursor + k]
          if (pinnedAt.has(`${slot}:${eatDay}`)) break
          if (eatersAtHome(household, eatDay, slot).length === 0) break
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
        state.usedCount.set(best.id, (state.usedCount.get(best.id) ?? 0) + 1)
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

  return allRecipes()
    .filter(
      (r) =>
        r.slots.includes(entry.slot) &&
        isRecipeAllowed(r, household) &&
        r.id !== entry.recipeId &&
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
  const acc: DayTotals = { kcal: 0, protein: 0, fat: 0, carbs: 0, price: 0 }
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
    acc.price += s.price * factor
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein),
    fat: Math.round(acc.fat),
    carbs: Math.round(acc.carbs),
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
