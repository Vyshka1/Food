import { describe, expect, it } from 'vitest'
import { RECIPE_BY_ID } from '../data/recipes'
import type { Eater, Household } from '../types'
import { buildWeekMenu } from './menu'
import { buildCookingPlans, scaledMinutes } from './cookingPlan'

function household(patch: Partial<Household> = {}): Household {
  const eater: Eater = {
    id: 'e1',
    name: 'Тест',
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
    awayMeals: [],
    ratings: {},
  }
  return {
    eaters: [eater],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, hasOven: true, hasBlender: true, containers: 12, hasFreezer: true },
    budgetPerWeek: 0,
    weekStart: '2026-09-07',
    ...patch,
  }
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

describe('scaledMinutes', () => {
  it('растягивает ручные шаги на количество порций', () => {
    const step = { text: '', minutes: 10, station: 'prep' as const, handsOn: true }
    expect(scaledMinutes(step, 1)).toBe(10)
    expect(scaledMinutes(step, 4)).toBe(19)
  })

  it('не растягивает ручную работу больше чем вдвое', () => {
    const step = { text: '', minutes: 10, station: 'prep' as const, handsOn: true }
    expect(scaledMinutes(step, 12)).toBe(20)
  })

  it('не трогает пассивное время', () => {
    const step = { text: '', minutes: 25, station: 'stove' as const, handsOn: false }
    expect(scaledMinutes(step, 4)).toBe(25)
  })
})

describe('buildCookingPlans', () => {
  const h = household()
  const { menu } = buildWeekMenu(h, 42)
  const plans = buildCookingPlans(menu, h)

  it('строит по плану на каждый день готовки', () => {
    expect(plans.map((p) => p.cookDay)).toEqual([0, 2, 6])
  })

  it('сохраняет порядок шагов внутри блюда', () => {
    for (const plan of plans) {
      const byRecipe = new Map<string, typeof plan.steps>()
      for (const step of plan.steps) {
        const arr = byRecipe.get(step.recipeId) ?? []
        arr.push(step)
        byRecipe.set(step.recipeId, arr)
      }
      for (const [recipeId, steps] of byRecipe) {
        const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex)
        expect(ordered).toEqual(steps.slice().sort((a, b) => a.start - b.start || a.stepIndex - b.stepIndex))
        for (let i = 1; i < ordered.length; i++) {
          expect(ordered[i].start).toBeGreaterThanOrEqual(ordered[i - 1].end)
        }
        expect(steps.length).toBe(RECIPE_BY_ID[recipeId].steps.length)
      }
    }
  })

  it('не заставляет повара делать два дела одновременно', () => {
    for (const plan of plans) {
      const hands = plan.steps.filter((s) => s.handsOn)
      for (let i = 0; i < hands.length; i++) {
        for (let j = i + 1; j < hands.length; j++) {
          expect(overlaps(hands[i], hands[j])).toBe(false)
        }
      }
    }
  })

  it('не превышает число конфорок и одну духовку', () => {
    const small = household({
      kitchen: { burners: 2, hasOven: true, hasBlender: true, containers: 12, hasFreezer: true },
    })
    const smallPlans = buildCookingPlans(buildWeekMenu(small, 42).menu, small)
    for (const plan of smallPlans) {
      const points = [...new Set(plan.steps.map((s) => s.start))]
      for (const t of points) {
        const active = plan.steps.filter((s) => s.start <= t && t < s.end)
        expect(active.filter((s) => s.station === 'stove').length).toBeLessThanOrEqual(2)
        expect(active.filter((s) => s.station === 'oven').length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('экономит время за счёт параллельной готовки', () => {
    for (const plan of plans) {
      const sequential = plan.steps.reduce((s, step) => s + (step.end - step.start), 0)
      expect(plan.makespan).toBeLessThan(sequential)
      expect(plan.handsOnMinutes).toBeLessThanOrEqual(plan.makespan)
    }
  })

  it('раскладывает по морозилке порции, которые едят позже срока хранения', () => {
    const frozenEntries = menu.entries.filter((e) => e.storage === 'freezer')
    const planned = plans.flatMap((p) => p.freeze)
    for (const entry of frozenEntries) {
      expect(planned.some((f) => f.recipeId === entry.recipeId)).toBe(true)
    }
  })
})
