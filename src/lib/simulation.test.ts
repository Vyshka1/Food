import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen } from '../types'
import { defaultRepeats } from './menu'
import { defaultOils } from './oil'
import { simulate } from './simulation'

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

describe('симуляция сходится сама с собой', () => {
  const result = simulate(household, { weeks: 6 })

  it('деньги не появляются и не исчезают', () => {
    // касса + запас на начало = ушло в готовку + испортилось + запас на конец
    for (const w of result.weeks) {
      const left = w.checkout + w.stockStart
      const right = w.used + w.wastedRaw + w.stockEnd
      expect(Math.abs(left - right), `неделя ${w.week}: ${left} против ${right}`).toBeLessThanOrEqual(
        Math.max(5, left * 0.02),
      )
    }
  })

  it('еда тоже: приготовили = съели + заморозили', () => {
    for (const w of result.weeks) {
      expect(Math.abs(w.cookedGrams - w.eatenGrams - w.frozenGrams)).toBeLessThanOrEqual(
        Math.max(50, w.cookedGrams * 0.02),
      )
    }
  })

  it('кладовая переходит между неделями, а не обнуляется', () => {
    for (let i = 1; i < result.weeks.length; i++) {
      expect(result.weeks[i].stockStart).toBe(result.weeks[i - 1].stockEnd)
    }
  })

  it('а в режиме независимых недель — обнуляется', () => {
    // так считался прежний замер, и это отдельный, гораздо более грубый вопрос
    const separate = simulate(household, { weeks: 4, independent: true })
    for (const w of separate.weeks) expect(w.stockStart).toBe(0)
  })

  it('запасы дома делают следующие недели дешевле', () => {
    const first = result.weeks[0].checkout
    const later = result.weeks.slice(3).reduce((s, w) => s + w.checkout, 0) / 3
    expect(later).toBeLessThan(first)
  })

  it('без переноса кладовой чек выше', () => {
    const carry = simulate(household, { weeks: 6 })
    const separate = simulate(household, { weeks: 6, independent: true })
    expect(carry.totalCheckout).toBeLessThan(separate.totalCheckout)
  })
})
