import { afterEach, describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen, MealPlace, Recipe } from '../types'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { recipeById, setCustomRecipes } from '../data/recipeRegistry'
import { recipeStats } from './nutrition'
import {
  ATTENDANCE_TEMPLATES,
  attendanceSummary,
  containersOn,
  containersPerWeek,
  copyDayToWorkdays,
  isFed,
  isTakeaway,
  mealKey,
  mealPlaceOf,
  nextPlace,
  placeCounts,
  takeawayEaters,
} from './attendance'
import { buildWeekMenu, portionOf, replacementOptions, totalPortions, defaultRepeats} from './menu'
import { defaultOils } from './oil'

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

function household(patch: Partial<Household> = {}): Household {
  return {
    eaters: [eater()],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen,
    budgetPerWeek: 0,
    drinks: [],
    oils: defaultOils(),
    repeats: defaultRepeats(),
    weekStart: '2026-01-05',
    ...patch,
  }
}

const MEALS = ['breakfast', 'lunch', 'dinner'] as const

describe('три места приёма пищи', () => {
  it('по умолчанию человек ест дома', () => {
    const e = eater()
    expect(mealPlaceOf(e, 3, 'lunch')).toBe('home')
    expect(isFed(e, 3, 'lunch')).toBe(true)
    expect(isTakeaway(e, 3, 'lunch')).toBe(false)
  })

  it('«с собой» — это не «не дома»: еду всё равно готовим', () => {
    // ровно та ошибка, ради которой третье состояние и появилось: обед в
    // контейнере либо не покупался вовсе, либо считался лишней порцией дома
    const e = eater({ mealPlaces: { [mealKey(1, 'lunch')]: 'takeaway' } })
    expect(isFed(e, 1, 'lunch')).toBe(true)
    expect(isTakeaway(e, 1, 'lunch')).toBe(true)
  })

  it('«не дома» снимает и порцию, и покупку', () => {
    const e = eater({ mealPlaces: { [mealKey(1, 'lunch')]: 'away' } })
    expect(isFed(e, 1, 'lunch')).toBe(false)
  })

  it('клик по клетке проходит все три состояния и возвращается', () => {
    expect(nextPlace('home')).toBe('takeaway')
    expect(nextPlace('takeaway')).toBe('away')
    expect(nextPlace('away')).toBe('home')
  })
})

describe('готовые расклады', () => {
  it('рабочая неделя — пять обедов с собой, остальное дома', () => {
    const places = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
    const e = eater({ mealPlaces: places })
    expect(placeCounts(e, [...MEALS])).toEqual({ home: 16, takeaway: 5, away: 0 })
    expect(mealPlaceOf(e, 5, 'lunch')).toBe('home')
  })

  it('обеды в офисе — те же пять клеток, но еду не готовим', () => {
    const places = ATTENDANCE_TEMPLATES.find((t) => t.id === 'office')!.build([...MEALS])
    expect(placeCounts(eater({ mealPlaces: places }), [...MEALS])).toEqual({
      home: 16,
      takeaway: 0,
      away: 5,
    })
  })

  it('все дома — пустая матрица, а не 21 запись «дома»', () => {
    const places = ATTENDANCE_TEMPLATES.find((t) => t.id === 'home')!.build([...MEALS])
    expect(Object.keys(places)).toHaveLength(0)
  })

  it('командировка не забирает выходные', () => {
    const places = ATTENDANCE_TEMPLATES.find((t) => t.id === 'trip')!.build([...MEALS])
    const e = eater({ mealPlaces: places })
    expect(placeCounts(e, [...MEALS])).toEqual({ home: 6, takeaway: 0, away: 15 })
    expect(mealPlaceOf(e, 6, 'dinner')).toBe('home')
  })

  it('шаблон заменяет прежний расклад, а не смешивается с ним', () => {
    const before = { [mealKey(2, 'dinner')]: 'away' as const }
    const places = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
    expect(places[mealKey(2, 'dinner')]).toBeUndefined()
    expect(before[mealKey(2, 'dinner')]).toBe('away')
  })
})

describe('копирование дня на будни', () => {
  it('переносит и «с собой», и «не дома»', () => {
    const places = {
      [mealKey(1, 'lunch')]: 'takeaway' as const,
      [mealKey(1, 'dinner')]: 'away' as const,
    }
    const next = copyDayToWorkdays(places, [...MEALS], 1)
    for (const day of [0, 1, 2, 3, 4]) {
      expect(next[mealKey(day, 'lunch')]).toBe('takeaway')
      expect(next[mealKey(day, 'dinner')]).toBe('away')
    }
    expect(next[mealKey(5, 'lunch')]).toBeUndefined()
  })

  it('копирование дома стирает прежние отметки будней', () => {
    const places = { [mealKey(3, 'lunch')]: 'away' as const }
    const next = copyDayToWorkdays(places, [...MEALS], 1)
    expect(next[mealKey(3, 'lunch')]).toBeUndefined()
  })
})

describe('контейнеры', () => {
  it('считаются по приёмам, а не по людям', () => {
    const h = household({
      eaters: [
        eater({ id: 'j', mealPlaces: { [mealKey(0, 'lunch')]: 'takeaway' } }),
        eater({
          id: 'k',
          mealPlaces: {
            [mealKey(0, 'lunch')]: 'takeaway',
            [mealKey(0, 'dinner')]: 'takeaway',
          },
        }),
      ],
    })
    expect(containersOn(h, 0)).toBe(3)
    expect(containersOn(h, 1)).toBe(0)
    expect(containersPerWeek(h)).toBe(3)
    expect(takeawayEaters(h, 0, 'lunch')).toHaveLength(2)
  })

  it('предупреждает, когда контейнеров на кухне меньше, чем обедов с собой', () => {
    const places = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
    const h = household({
      eaters: [eater({ mealPlaces: places }), eater({ id: 'k', mealPlaces: places })],
      kitchen: { ...kitchen, containers: 1 },
    })
    const { warnings } = buildWeekMenu(h, 11)
    expect(warnings.some((w) => /контейнер/.test(w))).toBe(true)
  })
})

describe('меню считается с местами', () => {
  it('обед с собой остаётся полноценной порцией', () => {
    const places = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
    const h = household({ eaters: [eater({ id: 'k', mealPlaces: places })] })
    const { menu } = buildWeekMenu(h, 13)
    const lunches = menu.entries.filter((e) => e.slot === 'lunch' && e.day < 5)
    expect(lunches.length).toBeGreaterThan(0)
    for (const entry of lunches) expect(portionOf(entry, 'k')).toBeGreaterThan(0)
  })

  it('офисный обед закупку уменьшает, а обед с собой — нет', () => {
    const workweek = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
    const office = ATTENDANCE_TEMPLATES.find((t) => t.id === 'office')!.build([...MEALS])
    // мера — калории, а не сумма долей: доля зависит и от того, какое блюдо
    // выпало, поэтому как «сколько еды» она врёт
    const total = (places: Record<string, 'home' | 'takeaway' | 'away'>) =>
      buildWeekMenu(household({ eaters: [eater({ mealPlaces: places })] }), 17).menu.entries.reduce(
        (sum, e) => sum + recipeStats(recipeById(e.recipeId)!).kcal * totalPortions(e),
        0,
      )
    const home = total({})
    // с собой блюда другие (в контейнер идёт только то, что доедет), поэтому
    // и порции слегка другие — но еда никуда не исчезает
    expect(total(workweek)).toBeGreaterThan(home * 0.97)
    // а пять офисных обедов — это пять приёмов пищи, которых нет: примерно
    // треть недельного объёма для одного человека
    expect(total(office)).toBeLessThan(home * 0.85)
  })

  /**
   * Правило про «доедет ли блюдо» проверяем на своём рецепте, а не на базе:
   * во встроенной базе обеденных блюд со сроком в один день практически нет,
   * и такая проверка проходила бы и без самого правила. Это уже случалось:
   * первая версия теста была зелёной с выключенным штрафом.
   */
  describe('блюдо должно доехать', () => {
    afterEach(() => setCustomRecipes([]))

    const travels = (id: string, title: string, fridgeDays: number): Recipe => ({
      id,
      title,
      emoji: '🥗',
      slots: ['lunch'],
      items: [
        { ingredientId: 'chicken_fillet', qty: 120 },
        { ingredientId: 'rice', qty: 70 },
        { ingredientId: 'carrot', qty: 60 },
      ],
      steps: [
        {
          text: 'Отварить и смешать',
          minutes: 20,
          station: 'stove',
          handsOn: true,
          activeMinutes: 20,
          unattended: false,
          source: 'derived',
        },
      ],
      tags: [],
      freezable: false,
      fridgeDays,
      custom: true,
    })

    /** Из скольких будних обедов выбрано блюдо, которое не переносит дорогу. */
    function freshLunches(places: Record<string, MealPlace>): number {
      const h = household({ eaters: [eater({ mealPlaces: places, bannedRecipes: RECIPES.map((r) => r.id) })] })
      let count = 0
      for (let seed = 0; seed < 20; seed++) {
        for (const entry of buildWeekMenu(h, seed).menu.entries) {
          if (entry.slot !== 'lunch' || entry.day > 4) continue
          if ((RECIPE_BY_ID[entry.recipeId] ?? recipeById(entry.recipeId))?.fridgeDays === 1) count++
        }
      }
      return count
    }

    it('дома такое блюдо на обед попадает, а в контейнер — нет', () => {
      setCustomRecipes([travels('fresh-lunch', 'Салат, который не доедет', 1), travels('keeps-lunch', 'Тёплый рис с курицей', 3)])
      const workweek = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
      const atHome = freshLunches({})
      const takeaway = freshLunches(workweek)
      expect(atHome).toBeGreaterThan(0)
      expect(takeaway).toBe(0)
    })

    it('и в замене не предлагается первым', () => {
      // замену человек выбирает руками, но порядок подсказок — наш
      setCustomRecipes([
        travels('fresh-lunch', 'Салат, который не доедет', 1),
        travels('keeps-lunch', 'Тёплый рис с курицей', 3),
        travels('keeps-lunch-2', 'Гречка с курицей', 4),
      ])
      const workweek = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
      const h = household({
        eaters: [eater({ mealPlaces: workweek, bannedRecipes: RECIPES.map((r) => r.id) })],
      })
      const { menu } = buildWeekMenu(h, 3)
      const lunch = menu.entries.find((e) => e.slot === 'lunch' && e.day < 5)!
      const options = replacementOptions(menu, h, lunch.id)
      expect(options.length).toBeGreaterThan(0)
      expect(options.some((o) => o.recipe.id === 'fresh-lunch')).toBe(false)
    })

    it('но если выбора нет, блюдо ставится и об этом предупреждают', () => {
      setCustomRecipes([travels('fresh-lunch', 'Салат, который не доедет', 1)])
      const workweek = ATTENDANCE_TEMPLATES.find((t) => t.id === 'workweek')!.build([...MEALS])
      const h = household({
        eaters: [eater({ mealPlaces: workweek, bannedRecipes: RECIPES.map((r) => r.id) })],
      })
      const { menu, warnings } = buildWeekMenu(h, 3)
      expect(menu.entries.some((e) => e.slot === 'lunch')).toBe(true)
      expect(warnings.some((w) => /переносит дорогу/.test(w))).toBe(true)
    })
  })
})

describe('сводка по человеку', () => {
  it('человек, который ест дома, читает про себя одну строку', () => {
    expect(attendanceSummary(eater(), [...MEALS])).toBe('ест дома всю неделю')
  })

  it('и видит оба числа, когда они есть', () => {
    const places = {
      [mealKey(0, 'lunch')]: 'takeaway' as const,
      [mealKey(4, 'dinner')]: 'away' as const,
    }
    expect(attendanceSummary(eater({ mealPlaces: places }), [...MEALS])).toBe(
      '1 приём с собой, 1 приём вне дома',
    )
  })
})
