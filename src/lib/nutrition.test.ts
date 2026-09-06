import { describe, expect, it } from 'vitest'
import type { Eater, Household } from '../types'
import { RECIPE_BY_ID } from '../data/recipes'
import { dailyNorm, recipeStats, slotShares } from './nutrition'
import { buildWeekMenu, slotTargets } from './menu'
import { buildShoppingList } from './shopping'

const base: Eater = {
  id: 'e1',
  name: 'Юлия',
  sex: 'female',
  age: 32,
  heightCm: 168,
  weightKg: 62,
  activity: 'light',
  goal: 'lose',
  allergies: [],
  customAllergens: [],
  dislikes: [],
  bannedRecipes: [],
}

describe('dailyNorm', () => {
  it('БЖУ сходятся с калорийностью', () => {
    const n = dailyNorm(base)
    const fromMacros = n.protein * 4 + n.fat * 9 + n.carbs * 4
    expect(Math.abs(fromMacros - n.kcal)).toBeLessThanOrEqual(n.kcal * 0.03)
  })

  it('дефицит меньше поддержания, профицит больше', () => {
    const lose = dailyNorm({ ...base, goal: 'lose' }).kcal
    const keep = dailyNorm({ ...base, goal: 'keep' }).kcal
    const gain = dailyNorm({ ...base, goal: 'gain' }).kcal
    expect(lose).toBeLessThan(keep)
    expect(gain).toBeGreaterThan(keep)
  })

  it('белок не превышает 35% калорийности', () => {
    const n = dailyNorm({ ...base, weightKg: 120, goal: 'lose' })
    expect(n.protein * 4).toBeLessThanOrEqual(n.kcal * 0.36)
  })
})

describe('slotShares', () => {
  it('нормируется на выбранные приёмы пищи', () => {
    const shares = slotShares(['breakfast', 'dinner'])
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  })
})

describe('меню и норма', () => {
  const household: Household = {
    eaters: [base],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, hasOven: true, hasBlender: true, containers: 10, hasFreezer: true },
    budgetPerWeek: 0,
    weekStart: '2026-09-07',
  }

  it('калорийность дня держится в коридоре ±25% от нормы', () => {
    const { menu } = buildWeekMenu(household, 42)
    const norm = dailyNorm(base).kcal
    for (let day = 0; day < 7; day++) {
      const kcal = menu.entries
        .filter((e) => e.day === day)
        .reduce((s, e) => s + recipeStats(RECIPE_BY_ID[e.recipeId]).kcal * e.scale, 0)
      expect(kcal).toBeGreaterThan(norm * 0.88)
      expect(kcal).toBeLessThan(norm * 1.12)
    }
  })

  it('держит баланс БЖУ близко к норме', () => {
    const { menu } = buildWeekMenu(household, 42)
    const norm = dailyNorm(base)
    const normFatShare = (norm.fat * 9) / norm.kcal
    for (let day = 0; day < 7; day++) {
      const entries = menu.entries.filter((e) => e.day === day)
      const stats = entries.map((e) => ({
        s: recipeStats(RECIPE_BY_ID[e.recipeId]),
        scale: e.scale,
      }))
      const kcal = stats.reduce((s, x) => s + x.s.kcal * x.scale, 0)
      const fat = stats.reduce((s, x) => s + x.s.fat * x.scale, 0)
      const protein = stats.reduce((s, x) => s + x.s.protein * x.scale, 0)
      expect((fat * 9) / kcal).toBeLessThan(normFatShare + 0.18)
      expect((protein * 4) / kcal).toBeGreaterThan(0.15)
    }
  })

  it('цели по приёмам пищи в сумме дают дневную норму', () => {
    const targets = slotTargets(household)
    const sum = Object.values(targets).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - dailyNorm(base).kcal)).toBeLessThanOrEqual(3)
  })
})

describe('buildShoppingList', () => {
  const household: Household = {
    eaters: [base, { ...base, id: 'e2', name: 'Взрослый', sex: 'male', weightKg: 82 }],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, hasOven: true, hasBlender: true, containers: 10, hasFreezer: true },
    budgetPerWeek: 0,
    weekStart: '2026-09-07',
  }

  it('покупаем не меньше, чем нужно по рецептам, и кратно фасовке', () => {
    const { menu } = buildWeekMenu(household, 42)
    const { lines, total } = buildShoppingList(menu)
    expect(lines.length).toBeGreaterThan(5)
    for (const line of lines) {
      expect(line.buy).toBeGreaterThanOrEqual(line.needed)
      if (line.packs) expect(line.buy).toBe(line.packs.count * line.packs.size)
    }
    expect(total).toBeGreaterThan(0)
  })

  it('в списке есть только продукты из меню', () => {
    const { menu } = buildWeekMenu(household, 42)
    const used = new Set(
      menu.entries.flatMap((e) => RECIPE_BY_ID[e.recipeId].items.map((i) => i.ingredientId)),
    )
    for (const line of buildShoppingList(menu).lines) expect(used.has(line.ingredientId)).toBe(true)
  })
})
