import { describe, expect, it } from 'vitest'
import type { Kitchen, PieceCooking } from '../types'
import { RECIPES } from '../data/recipes'
import { convenientCount, fryMinutes, loadLabel, loads, sizeOptions, useTwoPans } from './pieces'
import { planBatch, optionPieces } from './batch'
import { buildCookingPlans } from './cookingPlan'
import { buildWeekMenu, defaultRepeats } from './menu'
import { defaultOils } from './oil'
import type { Eater, Household } from '../types'

const pan: PieceCooking = { perLoad: 5, loadMinutes: 4, sizes: [12, 16, 20, 24, 30], max: 30 }

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

function eater(id: string, patch: Partial<Eater> = {}): Eater {
  return {
    id,
    name: id,
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
    ...patch,
  }
}

const household: Household = {
  eaters: [eater('e1'), eater('e2', { sex: 'male', weightKg: 84, heightCm: 182, age: 35 })],
  cookingDays: [2, 6],
  meals: ['breakfast', 'lunch', 'dinner'],
  kitchen,
  budgetPerWeek: 0,
  drinks: [],
  oils: defaultOils(),
  repeats: defaultRepeats(),
  extras: [],
  weekStart: '2026-01-05',
}

describe('заходы, а не коэффициент', () => {
  it('тридцать оладий — это шесть заходов, а не двойное время рецепта', () => {
    expect(loads(30, pan)).toBe(6)
    expect(fryMinutes(30, pan)).toBe(24)
    // прежняя поправка упиралась в двойное время базового шага — 24 минуты
    // против 12; для тридцати штук это была неправда в другую сторону
    expect(fryMinutes(12, pan)).toBe(12)
  })

  it('неполный заход всё равно заход', () => {
    expect(loads(11, pan)).toBe(3)
    expect(loads(1, pan)).toBe(1)
  })

  it('вторая сковорода включается там, где начинает помогать', () => {
    expect(useTwoPans(12, pan, kitchen)).toBe(false)
    expect(useTwoPans(30, pan, kitchen)).toBe(true)
    expect(useTwoPans(30, pan, { ...kitchen, burners: 1 })).toBe(false)
    expect(fryMinutes(30, pan, 2)).toBe(12)
  })

  it('подпись говорит человеку то же самое', () => {
    expect(loadLabel(20, pan)).toBe('4 захода по 5 шт · 16 мин')
    expect(loadLabel(30, pan, 2)).toBe('3 захода на двух сковородах по 10 шт · 12 мин')
  })
})

describe('удобные количества', () => {
  it('берётся ближайшее сверху, а не точное число', () => {
    expect(convenientCount(13, pan)).toBe(16)
    expect(convenientCount(12, pan)).toBe(12)
    expect(convenientCount(1, pan)).toBe(12)
  })

  it('и не больше разумного максимума', () => {
    expect(convenientCount(50, pan)).toBe(30)
    expect(sizeOptions(pan).every((s) => s <= pan.max)).toBe(true)
  })
})

describe('база размечена', () => {
  it('у каждого блюда с числом изделий есть вместимость и время захода', () => {
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch || batch.source !== 'verified' || !batch.yieldPieces) continue
      expect(batch.piece, recipe.title).toBeDefined()
      expect(batch.piece!.perLoad, recipe.title).toBeGreaterThan(0)
      expect(batch.piece!.loadMinutes, recipe.title).toBeGreaterThan(0)
      expect(batch.piece!.sizes.length, recipe.title).toBeGreaterThan(0)
    }
  })

  it('партия никогда не выходит за разумный максимум', () => {
    // «33 оладьи» — арифметически честно и по-кухонному невозможно
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch?.piece || !batch.yieldPieces) continue
      for (const needed of [500, 1000, 2000, 4000, 8000]) {
        const plan = planBatch(recipe, {
          neededGrams: needed,
          hasFreezer: true,
          freezerRoomGrams: 3200,
        })!
        const pieces = optionPieces(plan.batch, plan.chosen.scale)!
        expect(pieces, `${recipe.title} на ${needed} г`).toBeLessThanOrEqual(batch.piece.max)
        expect(batch.piece.sizes, `${recipe.title} на ${needed} г`).toContain(pieces)
      }
    }
  })
})

describe('план готовки считает жарку заходами', () => {
  it('время штучного блюда растёт с числом изделий', () => {
    const small = buildCookingPlans(buildWeekMenu(household, 5).menu, household)
    const big = buildCookingPlans(
      buildWeekMenu({ ...household, eaters: [...household.eaters, eater('e3'), eater('e4')] }, 5)
        .menu,
      { ...household, eaters: [...household.eaters, eater('e3'), eater('e4')] },
    )
    const fryMinutesOf = (plans: ReturnType<typeof buildCookingPlans>) =>
      plans
        .flatMap((p) => p.steps)
        .filter((s) => /жарить|обжарить/i.test(s.text))
        .reduce((sum, s) => sum + (s.end - s.start), 0)
    expect(fryMinutesOf(big)).toBeGreaterThanOrEqual(fryMinutesOf(small))
  })
})
