import type { Activity, Eater, Goal, MealSlot, Norms, Recipe } from '../types'
import { INGREDIENT_BY_ID, ingredientGrams } from '../data/ingredients'

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  low: 1.2,
  light: 1.375,
  medium: 1.55,
  high: 1.725,
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  low: 'Сидячий образ жизни',
  light: 'Лёгкая активность, 1–2 тренировки',
  medium: '3–4 тренировки в неделю',
  high: 'Каждый день двигаюсь много',
}

export const GOAL_FACTOR: Record<Goal, number> = { lose: 0.85, keep: 1, gain: 1.1 }

export const GOAL_LABEL: Record<Goal, string> = {
  lose: 'Снижение веса',
  keep: 'Поддержание веса',
  gain: 'Набор массы',
}

/** Mifflin–St Jeor. Для детей до 18 — возрастные ориентиры ВОЗ, поэтому приблизительно. */
export function basalRate(e: Eater): number {
  if (e.age < 18) {
    const table = e.sex === 'male' ? [1200, 1500, 1800, 2200, 2500] : [1100, 1400, 1700, 2000, 2200]
    const bucket = e.age <= 3 ? 0 : e.age <= 6 ? 1 : e.age <= 10 ? 2 : e.age <= 14 ? 3 : 4
    return table[bucket] / 1.4 // приводим к «базовому обмену», активность добавим ниже
  }
  const base = 10 * e.weightKg + 6.25 * e.heightCm - 5 * e.age
  return e.sex === 'male' ? base + 5 : base - 161
}

export function dailyNorm(e: Eater): Norms {
  const kcal = Math.round(basalRate(e) * ACTIVITY_FACTOR[e.activity] * GOAL_FACTOR[e.goal])
  const weight = e.weightKg || 60
  const proteinPerKg = e.age < 18 ? 1.3 : e.goal === 'lose' ? 1.8 : 1.6
  let protein = Math.round(proteinPerKg * weight)
  // белок не должен съедать больше 35% калорий
  protein = Math.min(protein, Math.round((kcal * 0.35) / 4))
  const fat = Math.max(Math.round(0.8 * weight), Math.round((kcal * 0.25) / 9))
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carbs, fiber: fiberNorm(kcal) }
}

/**
 * Норма клетчатки: 14 г на каждую тысячу килокалорий — обычная рекомендация,
 * которая заодно масштабируется вместе с нормой человека. Взрослому меньше
 * двадцати граммов не ставим: ниже этого рацион уже не работает как надо.
 */
export function fiberNorm(kcal: number): number {
  return Math.max(20, Math.round((kcal * 14) / 1000))
}

export function sumNorms(list: Norms[]): Norms {
  return list.reduce<Norms>(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
      carbs: acc.carbs + n.carbs,
      fiber: acc.fiber + n.fiber,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
  )
}

const SLOT_SHARE: Record<MealSlot, number> = {
  breakfast: 0.27,
  lunch: 0.35,
  dinner: 0.28,
  snack: 0.1,
}

/** Доли калорийности по приёмам пищи, нормированные на выбранные приёмы. */
export function slotShares(meals: MealSlot[]): Record<string, number> {
  const total = meals.reduce((s, m) => s + SLOT_SHARE[m], 0) || 1
  return Object.fromEntries(meals.map((m) => [m, SLOT_SHARE[m] / total]))
}

export interface RecipeStats extends Norms {
  /** ₽ за порцию. */
  price: number
}

/**
 * Два веса одной доли рецепта: сырьё и то, что выйдет из него на тарелке.
 *
 * Их и путали. Состав рецепта задан в сыром весе, а партия — в готовом, и
 * `place()` сравнивал одно с другим напрямую: потребность оказывалась завышена
 * примерно на восьмую часть, и система честно доготавливала лишнее. Поэтому
 * теперь два имени и ни одного безымянного «грамма».
 */

/** Сырьё на одну долю рецепта, г. Без округления — это промежуточная величина. */
export function rawGramsPerServing(recipe: Recipe): number {
  let grams = 0
  for (const item of recipe.items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing) continue
    grams += ingredientGrams(ing, item.qty)
  }
  return grams
}

/** Сколько сырья нужно на такую долю рецепта, г. */
export function rawGrams(recipe: Recipe, factor: number): number {
  return Math.round((rawGramsPerServing(recipe) * factor) / 5) * 5
}

/**
 * Насколько блюдо теряет в весе при готовке, если о нём ничего не известно.
 *
 * Это предположение, а не факт: мясо теряет воду, крупа её набирает, а суп
 * зависит от того, сколько налили. Поэтому число помечено `derived` и уступает
 * любому выверенному выходу. Совпадение с выверенными данными неплохое —
 * по 32 проверенным вручную блюдам отношение выхода к сырью 0.883, — но это
 * среднее по больнице, и опираться на него надо ровно там, где других данных
 * нет.
 */
export const COOK_LOSS = 0.12

export interface CookedYield {
  /** Вес готового блюда из одной доли рецепта, г. */
  grams: number
  /** Откуда взят: выверен вручную или получен из общего предположения. */
  source: 'verified' | 'derived'
}

/**
 * Выход готового блюда с одной доли рецепта.
 *
 * Порядок источников: сначала выверенный вручную выход партии, и только если
 * его нет — общее предположение о потере веса. Третьей ступенью сюда же
 * встраивается заданная у рецепта модель выхода, когда такие данные появятся:
 * менять придётся только эту функцию.
 */
export function cookedYieldPerServing(recipe: Recipe): CookedYield {
  const batch = recipe.batch
  if (batch && batch.source === 'verified' && batch.baseScale > 0) {
    return { grams: batch.yieldGrams / batch.baseScale, source: 'verified' }
  }
  return { grams: rawGramsPerServing(recipe) * (1 - COOK_LOSS), source: 'derived' }
}

/**
 * Сколько готового блюда даёт такая доля рецепта, г.
 *
 * Это и есть потребность: то, что кладут на тарелки, убирают в морозилку и
 * показывают как вес порции.
 */
export function cookedGrams(recipe: Recipe, factor: number): number {
  return Math.round((cookedYieldPerServing(recipe).grams * factor) / 5) * 5
}

/**
 * Кэш по самому объекту рецепта, а не по его id.
 *
 * По id он и был — и это ловушка: рецепт с подставленным маслом имеет тот же
 * id, но другой состав, и карточка получала калории от прежнего масла. С
 * WeakMap такое невозможно по устройству: другой состав — другой объект —
 * другой счёт, а сбрасывать кэш руками не нужно вовсе.
 */
const statsCache = new WeakMap<Recipe, RecipeStats>()

/** Ккал, БЖУ и цена одной порции рецепта. */
/**
 * КБЖУ и цена произвольного состава.
 *
 * Единственное место, где продукты складываются в питание. Раньше этот цикл
 * был написан четырежды — в рецептах, в карточке блюда, в напитках и в
 * дополнениях, — и каждый раз чуть иначе: где-то округляли клетчатку, где-то
 * нет, где-то считали цену. Расходились они не сразу, а при первой же правке
 * одного из четырёх.
 */
export function statsOf(items: { ingredientId: string; qty: number }[]): RecipeStats {
  let kcal = 0
  let protein = 0
  let fat = 0
  let carbs = 0
  let fiber = 0
  let price = 0
  for (const item of items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing) continue
    // питательность задана на 100 г или на штуку — приводим количество к этой мере
    const factor = ing.unit === 'pcs' ? item.qty : item.qty / 100
    kcal += ing.kcal * factor
    protein += ing.protein * factor
    fat += ing.fat * factor
    carbs += ing.carbs * factor
    fiber += ing.fiber * factor
    price += ing.unit === 'pcs' ? ing.price * item.qty : (ing.price * item.qty) / 1000
  }
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    fiber: Math.round(fiber * 10) / 10,
    price: Math.round(price),
  }
}

/** Ккал, БЖУ и цена одной доли рецепта — то есть его состава как написано. */
export function recipeStats(recipe: Recipe): RecipeStats {
  const cached = statsCache.get(recipe)
  if (cached) return cached
  const stats = statsOf(recipe.items)
  statsCache.set(recipe, stats)
  return stats
}
