import { describe, expect, it } from 'vitest'
import { RECIPE_BY_ID } from '../data/recipes'
import type { Eater, Household } from '../types'
import { buildWeekMenu, totalPortions } from './menu'
import { buildShoppingList } from './shopping'
import { recipeStats } from './nutrition'
import { cookBatch } from './servings'

function eater(patch: Partial<Eater> = {}): Eater {
  return {
    id: 'j', name: 'Юлия', sex: 'female', age: 32, heightCm: 168, weightKg: 62,
    activity: 'light', goal: 'keep', allergies: [], customAllergens: [], dislikes: [],
    bannedRecipes: [], awayMeals: [], ratings: {},
    ...patch,
  }
}

const household: Household = {
  eaters: [eater()],
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

const menu = buildWeekMenu(household, 4).menu
/** Блюдо, которое одна готовка закрывает на несколько дней — там и была ошибка. */
const multiDay = menu.entries.find((entry) => {
  const same = menu.entries.filter(
    (x) => x.recipeId === entry.recipeId && x.cookDay === entry.cookDay,
  )
  return same.length > 1
})!

describe('одна готовка — один масштаб', () => {
  it('в меню действительно есть готовка на несколько дней', () => {
    expect(multiDay).toBeDefined()
    const batch = cookBatch(menu, RECIPE_BY_ID[multiDay.recipeId], multiDay, household.eaters)
    expect(batch.entries.length).toBeGreaterThan(1)
  })

  it('масштаб партии больше одного дня, а не равен ему', () => {
    // ровно эта разница и разъезжалась: шапка считала по всей готовке, а
    // продукты и КБЖУ — по одному дню
    const batch = cookBatch(menu, RECIPE_BY_ID[multiDay.recipeId], multiDay, household.eaters)
    expect(batch.totalFactor).toBeGreaterThan(totalPortions(multiDay))
  })

  it('продукты партии совпадают с тем, что попало в список покупок', () => {
    const recipe = RECIPE_BY_ID[multiDay.recipeId]
    const batch = cookBatch(menu, recipe, multiDay, household.eaters)
    const list = buildShoppingList(menu)

    // берём продукт, который встречается только в этом рецепте
    const others = menu.entries
      .filter((e) => e.recipeId !== recipe.id)
      .flatMap((e) => RECIPE_BY_ID[e.recipeId]?.items.map((i) => i.ingredientId) ?? [])
    const unique = recipe.items.find((i) => !others.includes(i.ingredientId))
    if (!unique) return

    const line = list.lines.find((l) => l.ingredientId === unique.ingredientId)!
    const needForBatch = unique.qty * batch.totalFactor
    // список округляет вверх до фасовки, поэтому сверяем «не меньше»
    expect(line.needed).toBeGreaterThanOrEqual(Math.floor(needForBatch))
    expect(line.needed).toBeLessThan(needForBatch * 1.6)
  })

  it('сумма тарелок сходится с общим выходом', () => {
    const recipe = RECIPE_BY_ID[multiDay.recipeId]
    const batch = cookBatch(menu, recipe, multiDay, household.eaters)
    const served = batch.rows.reduce((sum, r) => sum + r.grams, 0)
    // округление веса каждой тарелки до 5 г допускает небольшое расхождение
    expect(Math.abs(served - batch.totalGrams)).toBeLessThanOrEqual(5 * batch.rows.length)
  })

  it('КБЖУ партии кратно КБЖУ одной доли', () => {
    const recipe = RECIPE_BY_ID[multiDay.recipeId]
    const batch = cookBatch(menu, recipe, multiDay, household.eaters)
    const stats = recipeStats(recipe)
    expect(Math.round(stats.protein * batch.totalFactor)).toBeGreaterThan(
      Math.round(stats.protein * totalPortions(multiDay)),
    )
  })
})

describe('кухонные величины вместо коэффициентов', () => {
  it('контейнер — это один приём пищи одного человека', () => {
    const twoPeople: Household = {
      ...household,
      eaters: [eater(), eater({ id: 'k', name: 'Кирилл', sex: 'male', weightKg: 84 })],
    }
    const pairMenu = buildWeekMenu(twoPeople, 4).menu
    const entry = pairMenu.entries.find((e) => {
      const same = pairMenu.entries.filter(
        (x) => x.recipeId === e.recipeId && x.cookDay === e.cookDay,
      )
      return same.length > 1
    })!
    const batch = cookBatch(pairMenu, RECIPE_BY_ID[entry.recipeId], entry, twoPeople.eaters)
    expect(batch.containers).toBe(batch.entries.length * 2)
    expect(batch.rows.every((r) => r.grams > 0)).toBe(true)
  })

  it('тот, кто ест не дома, контейнер не получает', () => {
    const away: Household = {
      ...household,
      eaters: [
        eater(),
        eater({ id: 'k', name: 'Кирилл', awayMeals: ['0:lunch', '1:lunch', '2:lunch',
          '3:lunch', '4:lunch', '5:lunch', '6:lunch'] }),
      ],
    }
    const awayMenu = buildWeekMenu(away, 4).menu
    const lunch = awayMenu.entries.find((e) => e.slot === 'lunch')!
    const batch = cookBatch(awayMenu, RECIPE_BY_ID[lunch.recipeId], lunch, away.eaters)
    expect(batch.rows.some((r) => r.eaterId === 'k')).toBe(false)
    expect(batch.containers).toBe(batch.entries.length)
  })
})
