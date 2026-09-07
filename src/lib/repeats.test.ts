import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen, RepeatRules } from '../types'
import { RECIPE_BY_ID } from '../data/recipes'
import { buildWeekMenu, defaultRepeats } from './menu'
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

function eater(patch: Partial<Eater> = {}): Eater {
  return {
    id: patch.id ?? 'e1',
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
    mealPlaces: {},
    ratings: {},
    ...patch,
  }
}

function household(repeats: RepeatRules, patch: Partial<Household> = {}): Household {
  return {
    eaters: [eater()],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen,
    budgetPerWeek: 0,
    drinks: [],
    oils: defaultOils(),
    repeats,
    extras: [],
    weekStart: '2026-01-05',
    ...patch,
  }
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i)

/** Сколько раз одно и то же блюдо выпадает за неделю — по приёмам пищи. */
function maxAppearances(h: Household, slot: string): number {
  let worst = 0
  for (const seed of SEEDS) {
    const counts = new Map<string, number>()
    for (const entry of buildWeekMenu(h, seed).menu.entries) {
      if (entry.slot !== slot) continue
      counts.set(entry.recipeId, (counts.get(entry.recipeId) ?? 0) + 1)
    }
    worst = Math.max(worst, ...counts.values())
  }
  return worst
}

describe('сколько раз блюдо может появиться', () => {
  it('предел по приёму пищи соблюдается', () => {
    const h = household({ ...defaultRepeats(), maxPerWeek: { breakfast: 1, lunch: 1, dinner: 1, snack: 1 } })
    expect(maxAppearances(h, 'dinner')).toBe(1)
    expect(maxAppearances(h, 'breakfast')).toBe(1)
  })

  it('и он разный у разных приёмов', () => {
    const h = household({
      ...defaultRepeats(),
      maxPerWeek: { breakfast: 4, lunch: 1, dinner: 1, snack: 7 },
    })
    expect(maxAppearances(h, 'lunch')).toBe(1)
    expect(maxAppearances(h, 'breakfast')).toBeGreaterThan(1)
  })

  it('«нравится» разрешает блюду выпадать на раз чаще', () => {
    // отдельного списка «что готов есть чаще» нет намеренно: человек вёл бы
    // его дважды, а расходились бы списки на второй неделе
    const rules = { ...defaultRepeats(), maxPerWeek: { breakfast: 1, lunch: 1, dinner: 1, snack: 1 } }
    const liked = household(rules, {
      eaters: [eater({ ratings: { oat_apple_bake: 1 } })],
    })
    let best = 0
    for (const seed of SEEDS) {
      const n = buildWeekMenu(liked, seed).menu.entries.filter(
        (e) => e.recipeId === 'oat_apple_bake',
      ).length
      best = Math.max(best, n)
    }
    expect(best).toBe(2)
  })
})

describe('два дня подряд', () => {
  it('по умолчанию блюдо из партии живёт два дня', () => {
    const h = household(defaultRepeats())
    let runs = 0
    for (const seed of SEEDS) {
      const entries = buildWeekMenu(h, seed).menu.entries
      for (const entry of entries) {
        if (entries.some((o) => o.slot === entry.slot && o.recipeId === entry.recipeId && o.day === entry.day + 1)) {
          runs++
        }
      }
    }
    expect(runs).toBeGreaterThan(0)
  })

  it('а с запретом — не встречается ни разу', () => {
    const h = household({ ...defaultRepeats(), backToBack: false, gapDays: 2 })
    for (const seed of SEEDS) {
      const entries = buildWeekMenu(h, seed).menu.entries
      for (const entry of entries) {
        const next = entries.find(
          (o) => o.slot === entry.slot && o.recipeId === entry.recipeId && o.day === entry.day + 1,
        )
        expect(next, `${RECIPE_BY_ID[entry.recipeId]?.title} на ${entry.day} и ${entry.day + 1}`).toBeUndefined()
      }
    }
  })

  it('запрет повторов подряд заставляет готовить чаще, а не голодать', () => {
    const relaxed = household(defaultRepeats())
    const strict = household({ ...defaultRepeats(), backToBack: false, gapDays: 2 })
    const meals = (h: Household) => buildWeekMenu(h, 3).menu.entries.length
    expect(meals(strict)).toBe(meals(relaxed))
  })
})

describe('когда правила невыполнимы', () => {
  it('меню всё равно собирается, но об этом предупреждают', () => {
    // блюд на неделю не хватает: пустая тарелка хуже повтора
    const h = household({ ...defaultRepeats(), maxPerWeek: { breakfast: 1, lunch: 1, dinner: 1, snack: 1 } }, {
      eaters: [eater({ bannedRecipes: Object.keys(RECIPE_BY_ID).slice(6) })],
    })
    const { menu, warnings } = buildWeekMenu(h, 1)
    expect(menu.entries.length).toBeGreaterThan(0)
    expect(warnings.some((w) => /повтор/i.test(w))).toBe(true)
  })
})
