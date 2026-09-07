import { describe, expect, it } from 'vitest'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import type { Eater, Household } from '../types'
import { RECIPE_BY_ID } from '../data/recipes'
import { buildWeekMenu, dayTotals, dislikeHits } from './menu'
import { dailyNorm } from './nutrition'
import { buildShoppingList } from './shopping'

const julia: Eater = {
  id: 'e1', name: 'Юлия', sex: 'female', age: 32, heightCm: 168, weightKg: 62,
  activity: 'light', goal: 'lose', allergies: [], customAllergens: [], dislikes: [],
  bannedRecipes: [], mealPlaces: {}, ratings: {},
}
const kirill: Eater = { ...julia, id: 'e2', name: 'Кирилл', sex: 'male', age: 35,
  heightCm: 182, weightKg: 84, activity: 'medium' }

const household: Household = {
  eaters: [julia, kirill],
  cookingDays: [2, 6],
  meals: ['breakfast', 'lunch', 'dinner'],
  kitchen: {
    burners: 4, ovens: 1, hasAirfryer: false, hasMulticooker: false, hasBlender: true,
    hasProcessor: false, hasMicrowave: true, hasDishwasher: false, containers: 10,
    hasFreezer: true,
  },
  budgetPerWeek: 0,
  weekStart: '2026-09-07',
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1)

/** Излишек упаковок: сколько купленного веса меню не использует. */
function surplusShare(): number {
  let surplus = 0
  let bought = 0
  for (const seed of SEEDS) {
    const menu = buildWeekMenu(household, seed).menu
    for (const line of buildShoppingList(menu).lines) {
      if (line.staple || INGREDIENT_BY_ID[line.ingredientId]?.unit === 'pcs') continue
      surplus += line.buy - line.needed
      bought += line.buy
    }
  }
  return surplus / bought
}

describe('излишек упаковок', () => {
  it('меньше пятой части купленного', () => {
    // до оптимизации было 22.9%: каждый рецепт подбирался сам по себе, и
    // пачка вскрывалась ради ста граммов
    expect(surplusShare()).toBeLessThan(0.2)
  })

  it('меню всё ещё разнообразно', () => {
    // экономия не должна схлопнуть неделю к трём блюдам: при слишком большом
    // весе меню сваливалось к восьми блюдам вместо двенадцати
    const counts = SEEDS.map(
      (seed) => new Set(buildWeekMenu(household, seed).menu.entries.map((e) => e.recipeId)).size,
    )
    const average = counts.reduce((s, c) => s + c, 0) / counts.length
    expect(average).toBeGreaterThan(10)
  })

  it('норма человека важнее экономии', () => {
    // главный предохранитель: при весе 0.15 и выше один день из 1680 уходил
    // больше чем на 12% от личной нормы — ради процента излишка это дорого
    let worst = 0
    for (const seed of SEEDS) {
      const menu = buildWeekMenu(household, seed).menu
      for (let day = 0; day < 7; day++) {
        for (const eater of household.eaters) {
          const deviation = Math.abs(
            dayTotals(menu, day, eater.id).kcal / dailyNorm(eater).kcal - 1,
          )
          worst = Math.max(worst, deviation)
        }
      }
    }
    expect(worst).toBeLessThan(0.1)
  })

  it('«не люблю» сильнее экономии', () => {
    // лук — самый общий продукт в базе, и без явного приоритета экономия
    // подтягивала наверх именно те блюда, от которых человек отказался
    const picky: Household = {
      ...household,
      eaters: [{ ...julia, dislikes: ['onion', 'mushrooms'] }],
    }
    let hits = 0
    let total = 0
    for (const seed of SEEDS.slice(0, 20)) {
      const menu = buildWeekMenu(picky, seed).menu
      for (const entry of menu.entries) {
        const recipe = RECIPE_BY_ID[entry.recipeId]
        total += 1
        if (dislikeHits(recipe, picky.eaters[0]).length > 0) hits += 1
      }
    }
    expect(total).toBeGreaterThan(300)
    expect(hits / total).toBeLessThan(0.2)
  })
})
