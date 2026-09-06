import type { Activity, Eater, Goal, MealSlot, Norms, Recipe } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'

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
  lose: 'Снизить вес',
  keep: 'Поддерживать',
  gain: 'Набрать массу',
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
  return { kcal, protein, fat, carbs }
}

export function sumNorms(list: Norms[]): Norms {
  return list.reduce<Norms>(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
      carbs: acc.carbs + n.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
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

/** Примерный вес порции в граммах: штучное считаем по среднему весу штуки. */
export function portionWeight(recipe: Recipe, factor: number): number {
  let grams = 0
  for (const item of recipe.items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing) continue
    const perServing = ing.unit === 'pcs' ? item.qty * (ing.pieceGrams ?? 0) : item.qty
    grams += perServing * factor
  }
  return Math.round(grams / 5) * 5
}

const statsCache = new Map<string, RecipeStats>()

/** Ккал, БЖУ и цена одной порции рецепта. */
export function recipeStats(recipe: Recipe): RecipeStats {
  const cached = recipe.custom ? undefined : statsCache.get(recipe.id)
  if (cached) return cached
  let kcal = 0
  let protein = 0
  let fat = 0
  let carbs = 0
  let price = 0
  for (const item of recipe.items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing) continue
    const factor = ing.unit === 'pcs' ? item.qty : item.qty / 100
    kcal += ing.kcal * factor
    protein += ing.protein * factor
    fat += ing.fat * factor
    carbs += ing.carbs * factor
    price += ing.unit === 'pcs' ? ing.price * item.qty : (ing.price * item.qty) / 1000
  }
  const stats: RecipeStats = {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    price: Math.round(price),
  }
  if (!recipe.custom) statsCache.set(recipe.id, stats)
  return stats
}
