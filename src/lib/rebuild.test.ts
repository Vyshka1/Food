import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen, MenuEntry } from '../types'
import { buildWeekMenu, defaultRepeats } from './menu'
import { recipeById } from '../data/recipeRegistry'
import { recipeStats } from './nutrition'
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
  extras: [],
  weekStart: '2026-01-05',
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

/** Средняя цена недели при данной цели. */
function weekPrice(goal: Parameters<typeof buildWeekMenu>[3] extends undefined ? never : NonNullable<Parameters<typeof buildWeekMenu>[3]>['goal']): number {
  let sum = 0
  for (const seed of SEEDS) {
    const { menu } = buildWeekMenu(household, seed, [], { goal })
    for (const entry of menu.entries) {
      const recipe = recipeById(entry.recipeId)!
      sum += recipeStats(recipe).price * entry.portions.reduce((s, p) => s + p.factor, 0)
    }
  }
  return sum / SEEDS.length
}

/** Сколько минут у плиты — по всем блюдам недели. */
function weekMinutes(goal: 'balanced' | 'faster'): number {
  let sum = 0
  for (const seed of SEEDS) {
    const { menu } = buildWeekMenu(household, seed, [], { goal })
    const cooked = new Set<string>()
    for (const entry of menu.entries) {
      const key = `${entry.recipeId}:${entry.cookDay}`
      if (cooked.has(key)) continue
      cooked.add(key)
      const recipe = recipeById(entry.recipeId)!
      sum += recipe.steps.reduce((s, step) => s + (step.handsOn ? step.minutes : 0), 0)
    }
  }
  return sum / SEEDS.length
}

describe('цель пересборки видна в результате', () => {
  it('«дешевле» действительно дешевле', () => {
    const plain = weekPrice('balanced')
    const cheap = weekPrice('cheaper')
    expect(cheap).toBeLessThan(plain * 0.9)
  })

  it('«быстрее» действительно быстрее', () => {
    const plain = weekMinutes('balanced')
    const fast = weekMinutes('faster')
    expect(fast).toBeLessThan(plain * 0.9)
  })

  it('«разнообразнее» даёт больше разных блюд', () => {
    /*
     * Восьми недель для этого мало: цель добавляет примерно одно блюдо на
     * восемь недель, и на короткой выборке разница тонет в округлении — тест
     * ловил не эффект, а шум, и падал от любой правки в подборе. На шестидесяти
     * неделях эффект виден устойчиво: 12.87 против 13.00 у одного едока.
     */
    const seeds = Array.from({ length: 60 }, (_, i) => i + 1)
    const kinds = (goal: 'balanced' | 'variety') => {
      let sum = 0
      for (const seed of seeds) {
        const { menu } = buildWeekMenu(household, seed, [], { goal })
        sum += new Set(menu.entries.map((e) => e.recipeId)).size
      }
      return sum / seeds.length
    }
    expect(kinds('variety')).toBeGreaterThan(kinds('balanced'))
  })

  it('«из запасов» поднимает блюда из того, что уже дома', () => {
    const atHome = ['rice', 'egg', 'chicken_fillet', 'carrot', 'onion', 'potato', 'oats', 'milk']
    const used = (goal: 'balanced' | 'stock') => {
      let own = 0
      let all = 0
      for (const seed of SEEDS) {
        const { menu } = buildWeekMenu(household, seed, [], { goal, atHome })
        for (const entry of menu.entries) {
          for (const item of recipeById(entry.recipeId)!.items) {
            all++
            if (atHome.includes(item.ingredientId)) own++
          }
        }
      }
      return own / all
    }
    expect(used('stock')).toBeGreaterThan(used('balanced') * 1.15)
  })

  it('но норма при этом не ломается', () => {
    // цель — про выбор среди подходящего, а не про пустую тарелку
    for (const goal of ['cheaper', 'faster', 'stock', 'variety'] as const) {
      const { menu } = buildWeekMenu(household, 3, [], { goal, atHome: ['rice'] })
      expect(menu.entries.length, goal).toBeGreaterThan(15)
    }
  })
})

describe('частичная пересборка', () => {
  /** То, что не просили менять, на время сборки считается закреплённым. */
  function rebuildDay(menu: { entries: MenuEntry[] }, day: number, seed: number) {
    const keep = menu.entries.filter((e) => e.day !== day).map((e) => ({ ...e, pinned: true }))
    return buildWeekMenu(household, seed, keep).menu
  }

  it('меняет только один день', () => {
    const first = buildWeekMenu(household, 1).menu
    const second = rebuildDay(first, 3, 999)
    for (let day = 0; day < 7; day++) {
      const before = first.entries.filter((e) => e.day === day).map((e) => e.recipeId)
      const after = second.entries.filter((e) => e.day === day).map((e) => e.recipeId)
      if (day === 3) continue
      expect(after, `день ${day}`).toEqual(before)
    }
  })

  it('и хотя бы что-то в нём действительно меняет', () => {
    const first = buildWeekMenu(household, 1).menu
    let changed = false
    for (const seed of [10, 11, 12, 13]) {
      const second = rebuildDay(first, 3, seed)
      const before = first.entries.filter((e) => e.day === 3).map((e) => e.recipeId)
      const after = second.entries.filter((e) => e.day === 3).map((e) => e.recipeId)
      if (JSON.stringify(before) !== JSON.stringify(after)) changed = true
    }
    expect(changed).toBe(true)
  })
})
