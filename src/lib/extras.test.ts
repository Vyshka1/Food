import { describe, expect, it } from 'vitest'
import type { DailyExtra, Eater, Household, Kitchen, MealPlace, MealSlot } from '../types'
import { buildWeekMenu, dayNorms, defaultRepeats } from './menu'
import { buildShoppingList } from './shopping'
import { dailyNorm, recipeStats } from './nutrition'
import { recipeById } from '../data/recipeRegistry'
import { defaultOils } from './oil'
import { mealKey } from './attendance'
import {
  EXTRA_KINDS,
  extraApplies,
  extraIngredients,
  extraNorms,
  extraShopping,
  extraStats,
  extraSummary,
  extrasAt,
} from './extras'

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

function extra(patch: Partial<DailyExtra> = {}): DailyExtra {
  return {
    id: 'x1',
    eaterId: 'e1',
    kind: 'veg_plate',
    amount: 200,
    slot: 'lunch',
    days: [0, 1, 2, 3, 4, 5, 6],
    ...patch,
  }
}

function household(extras: DailyExtra[] = []): Household {
  return {
    eaters: [eater],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen,
    budgetPerWeek: 0,
    drinks: [],
    oils: defaultOils(),
    repeats: defaultRepeats(),
    extras,
    weekStart: '2026-01-05',
  }
}

describe('дополнение — это продукты, а не абстракция', () => {
  it('овощная тарелка на 200 г — это три овоща по весу', () => {
    const items = extraIngredients(extra())
    expect(items.reduce((s, i) => s + i.qty, 0)).toBeCloseTo(200, 5)
    expect(items.map((i) => i.ingredientId).sort()).toEqual(['bell_pepper', 'cucumber', 'tomato'])
  })

  it('и у неё есть калории и клетчатка', () => {
    const stats = extraStats(extra())
    expect(stats.kcal).toBeGreaterThan(20)
    expect(stats.kcal).toBeLessThan(120)
    expect(stats.fiber).toBeGreaterThan(1.5)
  })

  it('штучное меряется штуками, а не граммами', () => {
    const kinds = EXTRA_KINDS.filter((k) => k.unit === 'pcs').map((k) => k.id)
    expect(kinds).toContain('fruit')
    const fruit = extraStats(extra({ kind: 'fruit', amount: 1 }))
    expect(fruit.kcal).toBeGreaterThan(80)
    expect(fruit.kcal).toBeLessThan(120)
  })
})

describe('дополнения меняют расчёт', () => {
  it('норма еды уменьшается: тарелка овощей уже съедена', () => {
    const plain = dayNorms(household(), 0, 'e1')
    const withVeg = dayNorms(household([extra()]), 0, 'e1')
    expect(withVeg.kcal).toBeLessThan(plain.kcal)
    expect(plain.kcal - withVeg.kcal).toBeGreaterThan(20)
  })

  it('но норма клетчатки уменьшается ровно на то, что дополнения дают', () => {
    const plain = dayNorms(household(), 0, 'e1')
    const withVeg = dayNorms(household([extra()]), 0, 'e1')
    const given = extraStats(extra()).fiber
    expect(plain.fiber - withVeg.fiber).toBeGreaterThan(given * 0.5)
  })

  it('меню становится легче ровно потому, что рядом стоит тарелка', () => {
    const kcal = (h: Household) =>
      buildWeekMenu(h, 5).menu.entries.reduce(
        (sum, e) =>
          sum + recipeStats(recipeById(e.recipeId)!).kcal * e.portions.reduce((s, p) => s + p.factor, 0),
        0,
      )
    expect(kcal(household([extra()]))).toBeLessThan(kcal(household()))
  })

  it('в день без дополнения норма остаётся полной', () => {
    const h = household([extra({ days: [0, 1, 2, 3, 4] })])
    expect(dayNorms(h, 5, 'e1').kcal).toBe(dayNorms(household(), 5, 'e1').kcal)
  })
})

describe('дополнения попадают в закупку', () => {
  it('семь тарелок овощей — это больше килограмма', () => {
    const need = extraShopping(household([extra()]))
    const total = [...need.values()].reduce((s, q) => s + q, 0)
    expect(total).toBeCloseTo(200 * 7, 5)
  })

  it('и список покупок их видит', () => {
    const h = household([extra()])
    const { menu } = buildWeekMenu(h, 3)
    const cucumberOf = (list: { lines: { ingredientId: string; buy: number }[] }) =>
      list.lines.find((l) => l.ingredientId === 'cucumber')?.buy ?? 0
    expect(cucumberOf(buildShoppingList(menu, h))).toBeGreaterThan(
      cucumberOf(buildShoppingList(menu)),
    )
  })
})

describe('подпись человеческая', () => {
  it('«к обеду», а не «к обед»', () => {
    expect(extraSummary(extra())).toBe('Овощная тарелка, 200 г, к обеду')
    expect(extraSummary(extra({ slot: 'dinner' }))).toContain('к ужину')
    expect(extraSummary(extra({ kind: 'fruit', amount: 1, slot: 'snack' }))).toBe(
      'Фрукт, 1 шт, к перекусу',
    )
  })
})

describe('на экране дня', () => {
  it('дополнение привязано к своему приёму пищи', () => {
    const h = household([extra({ slot: 'dinner' })])
    expect(extrasAt(h, 0, 'dinner')).toHaveLength(1)
    expect(extrasAt(h, 0, 'lunch')).toHaveLength(0)
  })

  it('и не появляется в день, который человек не выбрал', () => {
    const h = household([extra({ days: [0] })])
    expect(extrasAt(h, 0, 'lunch')).toHaveLength(1)
    expect(extrasAt(h, 3, 'lunch')).toHaveLength(0)
  })
})

describe('норма не уходит в ноль', () => {
  it('огромное дополнение не ужимает еду ниже 60% нормы', () => {
    const huge = household([extra({ amount: 500 }), extra({ id: 'x2', kind: 'nuts', amount: 200 })])
    const food = dayNorms(huge, 0, 'e1')
    expect(food.kcal).toBeGreaterThan(dailyNorm(eater).kcal * 0.55)
  })
})

/*
 * Дополнения не спрашивали, дома ли человек. Кирилл обедает не дома по будням,
 * а овощная тарелка к обеду ставилась всё равно — и не только на экране: она
 * шла в его дневную норму и в список покупок. Мы считали калории съеденными и
 * покупали огурцы на обед, которого не было.
 */
describe('дополнение ставится только тому, кто за столом', () => {
  const away = (days: number[], slot: MealSlot = 'lunch') => {
    const places: Record<string, MealPlace> = {}
    for (const d of days) places[mealKey(d, slot)] = 'away'
    return places
  }

  const family = (places: Record<string, MealPlace>): Household => {
    const h = household([extra({ eaterId: 'e2', days: [] })])
    return {
      ...h,
      eaters: [eater, { ...eater, id: 'e2', name: 'Кирилл', mealPlaces: places }],
    }
  }

  it('не дома — дополнения нет', () => {
    const household = family(away([0, 1, 2, 3, 4]))
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => extrasAt(household, d, 'lunch').length > 0)
    // было семь дней из семи, хотя человек за столом только в выходные
    expect(days).toEqual([5, 6])
  })

  it('«с собой» — это дома: еда наша, человек её просто уносит', () => {
    const places: Record<string, MealPlace> = { [mealKey(0, 'lunch')]: 'takeaway' }
    const household = family(places)
    expect(extrasAt(household, 0, 'lunch')).toHaveLength(1)
  })

  it('и в норму дня оно тоже не попадает', () => {
    // это была не косметика: калории считались съеденными
    const household = family(away([0]))
    expect(extraNorms(household, 'e2', 0).kcal).toBe(0)
    expect(extraNorms(household, 'e2', 6).kcal).toBeGreaterThan(0)
  })

  it('и в закупку: огурцы на обед, которого не было', () => {
    const home = family({})
    const partly = family(away([0, 1, 2, 3, 4]))
    const sum = (h: Household) => [...extraShopping(h).values()].reduce((a, b) => a + b, 0)
    expect(sum(partly)).toBeCloseTo((sum(home) * 2) / 7, 5)
  })

  it('дополнение без хозяина на стол не попадает', () => {
    // след удалённого едока: раньше он молча продолжал есть и покупать
    const orphan = household([extra({ id: 'x9', eaterId: 'нет-такого', days: [] })])
    expect(extraApplies(orphan, orphan.extras[0], 0)).toBe(false)
    expect(extrasAt(orphan, 0, 'lunch')).toHaveLength(0)
  })
})
