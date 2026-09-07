import { describe, expect, it } from 'vitest'
import type { Eater, Household } from '../types'
import { RECIPE_BY_ID } from '../data/recipes'
import { dailyNorm, recipeStats, slotShares } from './nutrition'
import { buildWeekMenu, dayTotals, householdNorms, slotTargets, totalPortions } from './menu'
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
  mealPlaces: {},
  ratings: {},
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
    kitchen: {
      burners: 4,
      ovens: 1,
      hasAirfryer: false,
      hasMulticooker: false,
      hasBlender: true,
      hasProcessor: false,
      hasMicrowave: true,
      hasDishwasher: false,
      containers: 10,
      hasFreezer: true,
    },
    budgetPerWeek: 0,
    drinks: [],
    weekStart: '2026-09-07',
  }

  it('калорийность дня держится в коридоре ±25% от нормы', () => {
    const { menu } = buildWeekMenu(household, 42)
    const norm = dailyNorm(base).kcal
    for (let day = 0; day < 7; day++) {
      const kcal = menu.entries
        .filter((e) => e.day === day)
        .reduce((s, e) => s + recipeStats(RECIPE_BY_ID[e.recipeId]).kcal * totalPortions(e), 0)
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
        scale: totalPortions(e),
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
    kitchen: {
      burners: 4,
      ovens: 1,
      hasAirfryer: false,
      hasMulticooker: false,
      hasBlender: true,
      hasProcessor: false,
      hasMicrowave: true,
      hasDishwasher: false,
      containers: 10,
      hasFreezer: true,
    },
    budgetPerWeek: 0,
    drinks: [],
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

describe('баланс БЖУ по дню', () => {
  const kirill: Eater = {
    ...base,
    id: 'e2',
    name: 'Кирилл',
    sex: 'male',
    age: 35,
    heightCm: 182,
    weightKg: 84,
    activity: 'medium',
    goal: 'keep',
  }
  const family: Household = {
    eaters: [base, kirill],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: {
      burners: 4,
      ovens: 1,
      hasAirfryer: false,
      hasMulticooker: false,
      hasBlender: true,
      hasProcessor: false,
      hasMicrowave: true,
      hasDishwasher: false,
      containers: 10,
      hasFreezer: true,
    },
    budgetPerWeek: 0,
    drinks: [],
    weekStart: '2026-09-07',
  }

  it('даёт каждому едоку его порцию, а не среднюю по семье', () => {
    const { menu } = buildWeekMenu(family, 42)
    const normYulia = dailyNorm(base).kcal
    const normKirill = dailyNorm(kirill).kcal

    for (const entry of menu.entries) {
      const yulia = entry.portions.find((p) => p.eaterId === base.id)!.factor
      const kir = entry.portions.find((p) => p.eaterId === kirill.id)!.factor
      // Кириллу нужно вдвое больше калорий — и порция у него больше
      expect(kir).toBeGreaterThan(yulia)
    }

    for (let day = 0; day < 7; day++) {
      const forYulia = dayTotals(menu, day, base.id)
      const forKirill = dayTotals(menu, day, kirill.id)
      expect(Math.abs(forYulia.kcal / normYulia - 1)).toBeLessThan(0.12)
      expect(Math.abs(forKirill.kcal / normKirill - 1)).toBeLessThan(0.12)
      // и сумма личных тарелок сходится с общей
      const family = dayTotals(menu, day)
      expect(forYulia.kcal + forKirill.kcal).toBeCloseTo(family.kcal, -1)
    }
  })

  it('держит не только калории, но и белки, жиры и углеводы', () => {
    const norms = householdNorms(family)
    const deviations: number[] = []
    for (const seed of [1, 42, 777]) {
      const { menu } = buildWeekMenu(family, seed)
      for (let day = 0; day < 7; day++) {
        const t = dayTotals(menu, day)
        for (const [fact, norm] of [
          [t.kcal, norms.kcal],
          [t.protein, norms.protein],
          [t.fat, norms.fat],
          [t.carbs, norms.carbs],
        ]) {
          deviations.push(Math.abs((fact / norm) * 100 - 100))
        }
      }
    }
    const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length
    // до появления штрафов по БЖУ среднее отклонение было около 14%, худшее — 77%
    expect(mean).toBeLessThan(8)
    expect(Math.max(...deviations)).toBeLessThan(30)
  })
})
