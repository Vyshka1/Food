import { afterEach, describe, expect, it } from 'vitest'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { setCustomRecipes } from '../data/recipeRegistry'
import type { Eater, Household, Recipe } from '../types'
import {
  buildWeekMenu,
  cookTasks,
  cookingSegments,
  dislikeHits,
  isRecipeAllowed,
  replaceEntryWith,
  replacementOptions,
} from './menu'

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
    ...patch,
  }
}

function household(patch: Partial<Household> = {}): Household {
  return {
    eaters: [eater()],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, hasOven: true, hasBlender: true, containers: 10, hasFreezer: true },
    budgetPerWeek: 0,
    weekStart: '2026-09-07',
    ...patch,
  }
}

describe('cookingSegments', () => {
  it('покрывает всю неделю без пересечений', () => {
    const segments = cookingSegments([2, 6])
    expect(segments.flatMap((s) => s.days)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('добавляет готовку в начале недели, если первый день готовки не понедельник', () => {
    const segments = cookingSegments([3])
    expect(segments[0]).toMatchObject({ cookDay: 0, implicit: true })
    expect(segments[1].cookDay).toBe(3)
  })

  it('без выбранных дней готовит один раз на всю неделю', () => {
    expect(cookingSegments([])).toEqual([
      { cookDay: 0, days: [0, 1, 2, 3, 4, 5, 6], implicit: true },
    ])
  })
})

describe('buildWeekMenu', () => {
  it('закрывает каждый приём пищи в каждом дне недели', () => {
    const h = household()
    const { menu } = buildWeekMenu(h, 42)
    for (let day = 0; day < 7; day++) {
      for (const slot of h.meals) {
        expect(menu.entries.filter((e) => e.day === day && e.slot === slot)).toHaveLength(1)
      }
    }
  })

  it('разные seed дают заметно разные меню', () => {
    const h = household()
    const a = new Set(buildWeekMenu(h, 1).menu.entries.map((e) => e.recipeId))
    const b = new Set(buildWeekMenu(h, 2).menu.entries.map((e) => e.recipeId))
    const union = new Set([...a, ...b])
    // вторая неделя приносит хотя бы несколько блюд, которых не было в первой
    expect(union.size).toBeGreaterThan(a.size + 2)
  })

  it('детерминирован по seed', () => {
    const h = household()
    expect(buildWeekMenu(h, 7).menu.entries).toEqual(buildWeekMenu(h, 7).menu.entries)
  })

  it('никогда не ест блюдо раньше дня готовки', () => {
    const { menu } = buildWeekMenu(household(), 3)
    for (const entry of menu.entries) expect(entry.day).toBeGreaterThanOrEqual(entry.cookDay)
  })

  it('строго исключает аллергены всех едоков', () => {
    const h = household({
      eaters: [eater({ allergies: ['lactose'] }), eater({ id: 'e2', allergies: ['gluten'] })],
    })
    const { menu } = buildWeekMenu(h, 11)
    for (const entry of menu.entries) {
      const recipe = RECIPE_BY_ID[entry.recipeId]
      for (const item of recipe.items) {
        const allergens = INGREDIENT_BY_ID[item.ingredientId].allergens
        expect(allergens).not.toContain('lactose')
        expect(allergens).not.toContain('gluten')
      }
    }
  })

  it('уважает свой аллерген, заданный текстом', () => {
    const h = household({ eaters: [eater({ customAllergens: ['Картофель'] })] })
    const { menu } = buildWeekMenu(h, 5)
    for (const entry of menu.entries) {
      const recipe = RECIPE_BY_ID[entry.recipeId]
      expect(recipe.items.map((i) => i.ingredientId)).not.toContain('potato')
    }
  })

  it('не ставит блюдо позже его срока хранения, если оно не морозится', () => {
    const { menu } = buildWeekMenu(household({ cookingDays: [0] }), 21)
    for (const entry of menu.entries) {
      const recipe = RECIPE_BY_ID[entry.recipeId]
      const age = entry.day - entry.cookDay
      if (age > recipe.fridgeDays) {
        expect(recipe.freezable).toBe(true)
        expect(entry.storage).toBe('freezer')
      }
    }
  })

  it('без морозилки не выдаёт замороженных порций', () => {
    const h = household({
      cookingDays: [0, 4],
      kitchen: { burners: 2, hasOven: true, hasBlender: false, containers: 6, hasFreezer: false },
    })
    const { menu } = buildWeekMenu(h, 9)
    expect(menu.entries.some((e) => e.storage === 'freezer')).toBe(false)
  })

  it('избегает нелюбимых продуктов, когда есть альтернатива', () => {
    const h = household({ eaters: [eater({ dislikes: ['mushrooms', 'onion'] })] })
    const { menu } = buildWeekMenu(h, 13)
    const withDislikes = menu.entries.filter(
      (e) => dislikeHits(RECIPE_BY_ID[e.recipeId], h.eaters[0]).length > 0,
    )
    expect(withDislikes.length).toBeLessThanOrEqual(menu.entries.length * 0.2)
  })

  it('не предлагает духовые блюда, если духовки нет', () => {
    const h = household({
      kitchen: { burners: 2, hasOven: false, hasBlender: false, containers: 4, hasFreezer: true },
    })
    const { menu } = buildWeekMenu(h, 4)
    for (const entry of menu.entries) {
      expect(RECIPE_BY_ID[entry.recipeId].needs ?? []).not.toContain('oven')
    }
    expect(isRecipeAllowed(RECIPE_BY_ID['cod_potato_oven'], h)).toBe(false)
  })

  it('одно блюдо готовится один раз на все дни, которые закрывает', () => {
    const { menu } = buildWeekMenu(household(), 77)
    const tasks = cookTasks(menu)
    for (const task of tasks) {
      const entries = menu.entries.filter(
        (e) => e.recipeId === task.recipeId && e.cookDay === task.cookDay,
      )
      expect(task.servings).toBe(entries.reduce((s, e) => s + e.servings, 0))
      expect(task.eatDays.sort()).toEqual(entries.map((e) => e.day).sort())
    }
  })
})

describe('свои рецепты', () => {
  afterEach(() => setCustomRecipes([]))

  const own = (patch: Partial<Recipe> = {}): Recipe => ({
    id: 'custom-test',
    title: 'Бабушкин суп',
    emoji: '🍲',
    slots: ['breakfast', 'lunch', 'dinner', 'snack'],
    items: [
      { ingredientId: 'potato', qty: 150 },
      { ingredientId: 'chicken_fillet', qty: 120 },
      { ingredientId: 'carrot', qty: 50 },
    ],
    steps: [
      { text: 'Нарезать', minutes: 8, station: 'prep', handsOn: true },
      { text: 'Варить', minutes: 25, station: 'stove', handsOn: false },
    ],
    tags: [],
    freezable: true,
    fridgeDays: 4,
    custom: true,
    ...patch,
  })

  it('участвуют в подборе наравне со встроенными', () => {
    const h = household({ eaters: [eater({ bannedRecipes: RECIPES.map((r) => r.id) })] })
    setCustomRecipes([own()])
    const { menu } = buildWeekMenu(h, 1)
    expect(menu.entries.length).toBeGreaterThan(0)
    expect(menu.entries.every((e) => e.recipeId === 'custom-test')).toBe(true)
  })

  it('подчиняются аллергиям так же строго', () => {
    const withMilk = own({ items: [{ ingredientId: 'milk', qty: 200 }] })
    const h = household({
      eaters: [eater({ allergies: ['lactose'], bannedRecipes: RECIPES.map((r) => r.id) })],
    })
    setCustomRecipes([withMilk])
    expect(isRecipeAllowed(withMilk, h)).toBe(false)
    const { menu } = buildWeekMenu(h, 1)
    expect(menu.entries.some((e) => e.recipeId === 'custom-test')).toBe(false)
  })

  it('уходят из подбора после удаления', () => {
    const h = household({ eaters: [eater({ bannedRecipes: RECIPES.map((r) => r.id) })] })
    setCustomRecipes([own()])
    expect(buildWeekMenu(h, 1).menu.entries.length).toBeGreaterThan(0)
    setCustomRecipes([])
    expect(buildWeekMenu(h, 1).menu.entries.length).toBe(0)
  })
})

describe('выбор блюда на замену', () => {
  const h = household()
  const { menu } = buildWeekMenu(h, 42)
  const entry = menu.entries[0]

  it('предлагает варианты, подходящие приёму пищи, и не предлагает текущее блюдо', () => {
    const options = replacementOptions(menu, h, entry.id)
    expect(options.length).toBeGreaterThan(3)
    for (const o of options) {
      expect(o.recipe.slots).toContain(entry.slot)
      expect(o.recipe.id).not.toBe(entry.recipeId)
      expect(o.kcal).toBeGreaterThan(0)
    }
  })

  it('не предлагает то, что уже стоит в этот день', () => {
    const sameDay = new Set(
      menu.entries.filter((e) => e.day === entry.day && e.id !== entry.id).map((e) => e.recipeId),
    )
    for (const o of replacementOptions(menu, h, entry.id)) {
      expect(sameDay.has(o.recipe.id)).toBe(false)
    }
  })

  it('уважает аллергии', () => {
    const strict = household({ eaters: [eater({ allergies: ['lactose', 'gluten'] })] })
    const built = buildWeekMenu(strict, 3).menu
    for (const o of replacementOptions(built, strict, built.entries[0].id)) {
      expect(isRecipeAllowed(o.recipe, strict)).toBe(true)
    }
  })

  it('ставит выбранное блюдо и не трогает остальные дни', () => {
    const pick = replacementOptions(menu, h, entry.id)[0]
    const updated = replaceEntryWith(menu, h, entry.id, pick.recipe.id)
    const replaced = updated.entries.find((e) => e.day === entry.day && e.slot === entry.slot)
    expect(replaced?.recipeId).toBe(pick.recipe.id)
    expect(replaced?.scale).toBe(pick.scale)
    expect(updated.entries.length).toBe(menu.entries.length)
    const untouched = updated.entries.filter((e) => e.id !== replaced?.id)
    expect(untouched).toEqual(menu.entries.filter((e) => e.id !== entry.id))
  })

  it('игнорирует рецепт, который не доживёт до этого дня', () => {
    const frozenSunday = menu.entries.find((e) => e.day - e.cookDay >= 2)
    if (!frozenSunday) return
    const options = replacementOptions(menu, h, frozenSunday.id)
    for (const o of options) {
      const age = frozenSunday.day - frozenSunday.cookDay
      if (age > o.recipe.fridgeDays) expect(o.recipe.freezable).toBe(true)
    }
  })
})
