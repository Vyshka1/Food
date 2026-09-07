import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen } from '../types'
import { INGREDIENTS, INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPES } from '../data/recipes'
import { buildWeekMenu, dayTotals, defaultRepeats} from './menu'
import { dailyNorm, fiberNorm, recipeStats } from './nutrition'
import { defaultOils } from './oil'

const kitchen: Kitchen = {
  burners: 4,
  ovens: 1,
  hasAirfryer: false,
  hasMulticooker: false,
  hasBlender: true,
  hasProcessor: false,
  hasMicrowave: true,
  hasDishwasher: false,
  containers: 8,
  hasFreezer: true,
}

const eater: Eater = {
  id: 'e1',
  name: 'Юлия',
  sex: 'female',
  age: 32,
  heightCm: 168,
  weightKg: 62,
  activity: 'light',
  goal: 'keep',
  allergies: [],
  customAllergens: [],
  dislikes: [],
  bannedRecipes: [],
  mealPlaces: {},
  ratings: {},
}

const household: Household = {
  eaters: [eater],
  cookingDays: [2, 6],
  meals: ['breakfast', 'lunch', 'dinner'],
  kitchen,
  budgetPerWeek: 0,
  drinks: [],
  oils: defaultOils(),
  repeats: defaultRepeats(),
  weekStart: '2026-01-05',
}

describe('клетчатка есть у всех продуктов', () => {
  it('и это осознанное число, а не пропуск', () => {
    for (const ing of INGREDIENTS) {
      expect(typeof ing.fiber, ing.name).toBe('number')
      expect(ing.fiber, ing.name).toBeGreaterThanOrEqual(0)
      expect(ing.fiber, ing.name).toBeLessThanOrEqual(60)
    }
  })

  it('у мяса, рыбы и масла её нет', () => {
    for (const id of ['beef', 'chicken_fillet', 'cod', 'egg', 'olive_oil', 'butter']) {
      expect(INGREDIENT_BY_ID[id].fiber, id).toBe(0)
    }
  })

  it('а у бобовых и отрубей — много', () => {
    expect(INGREDIENT_BY_ID['lentils'].fiber).toBeGreaterThan(20)
    expect(INGREDIENT_BY_ID['chia'].fiber).toBeGreaterThan(20)
    expect(INGREDIENT_BY_ID['oats'].fiber).toBeGreaterThan(5)
  })
})

describe('норма и счёт', () => {
  it('норма растёт вместе с калорийностью, но не падает ниже двадцати', () => {
    expect(fiberNorm(2000)).toBe(28)
    expect(fiberNorm(1000)).toBe(20)
    expect(dailyNorm(eater).fiber).toBeGreaterThan(20)
  })

  it('в блюде клетчатка считается, а не остаётся нулём', () => {
    const withBeans = RECIPES.find((r) => r.items.some((i) => i.ingredientId === 'lentils'))!
    expect(recipeStats(withBeans).fiber).toBeGreaterThan(5)
  })

  it('день показывает и факт, и норму', () => {
    const { menu } = buildWeekMenu(household, 7)
    const totals = dayTotals(menu, 2, 'e1')
    expect(totals.fiber).toBeGreaterThan(0)
  })
})

describe('подбор держит клетчатку', () => {
  it('дней ниже нормы немного, и провалов нет', () => {
    // замер на 280 днях: без учёта клетчатки таких дней было 50 и худший
    // день давал 11 г при норме 26
    const norm = dailyNorm(eater).fiber
    const values: number[] = []
    for (let seed = 0; seed < 40; seed++) {
      const { menu } = buildWeekMenu(household, seed)
      for (let day = 0; day < 7; day++) values.push(dayTotals(menu, day, 'e1').fiber)
    }
    const below = values.filter((v) => v < norm).length
    expect(below).toBeLessThan(values.length * 0.12)
    expect(Math.min(...values)).toBeGreaterThan(norm * 0.6)
  })
})
