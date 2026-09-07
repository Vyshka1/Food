import { afterEach, describe, expect, it } from 'vitest'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { setCustomRecipes } from '../data/recipeRegistry'
import { withDerivedDetail } from './stepDetail'
import type { Eater, Household, Kitchen, Recipe } from '../types'
import {
  awayKey,
  buildWeekMenu,
  cookTasks,
  cookingSegments,
  dayNorms,
  dayTotals,
  dislikeHits,
  eatersAtHome,
  isRecipeAllowed,
  portionOf,
  replaceEntryWith,
  ratingScore,
  replacementOptions,
  slotTargetOn,
  totalPortions,
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
    awayMeals: [],
    ratings: {},
    ...patch,
  }
}

function kitchen(patch: Partial<Kitchen> = {}): Kitchen {
  return {
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
    ...patch,
  }
}

function household(patch: Partial<Household> = {}): Household {
  return {
    eaters: [eater()],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: kitchen(),
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
      kitchen: kitchen({ burners: 2, hasBlender: false, containers: 6, hasFreezer: false }),
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
      kitchen: kitchen({ burners: 2, ovens: 0, hasBlender: false, containers: 4 }),
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
      expect(task.portions).toBeCloseTo(entries.reduce((s, e) => s + totalPortions(e), 0), 5)
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
      withDerivedDetail({
        text: 'Нарезать',
        minutes: 8,
        station: 'prep',
        handsOn: true,
        activeMinutes: 8,
        unattended: false,
        source: 'derived',
      }),
      withDerivedDetail({
        text: 'Варить',
        minutes: 25,
        station: 'stove',
        handsOn: false,
        activeMinutes: 0,
        unattended: false,
        source: 'derived',
      }),
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
    expect(totalPortions(replaced!)).toBeGreaterThan(0)
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

describe('еда вне дома', () => {
  const kirill = eater({ id: 'k', name: 'Кирилл', sex: 'male', weightKg: 84, heightCm: 182 })
  const julia = eater({ id: 'j', name: 'Юлия' })

  it('не даёт порцию тому, кто ест не дома', () => {
    const h = household({
      eaters: [julia, { ...kirill, awayMeals: [awayKey(0, 'lunch'), awayKey(1, 'lunch')] }],
    })
    const { menu } = buildWeekMenu(h, 7)
    const lunches = menu.entries.filter((e) => e.slot === 'lunch')
    expect(lunches.length).toBeGreaterThan(2)
    for (const entry of lunches) {
      const away = entry.day === 0 || entry.day === 1
      expect(portionOf(entry, 'k')).toBe(away ? 0 : portionOf(entry, 'k'))
      if (away) expect(portionOf(entry, 'k')).toBe(0)
      else expect(portionOf(entry, 'k')).toBeGreaterThan(0)
      // Юлия ест дома всегда — её порция на месте в любом случае
      expect(portionOf(entry, 'j')).toBeGreaterThan(0)
    }
  })

  it('уменьшает закупку, когда человек обедает не дома', () => {
    const home = household({ eaters: [julia, kirill] })
    const away = household({
      eaters: [
        julia,
        { ...kirill, awayMeals: [0, 1, 2, 3, 4].map((d) => awayKey(d, 'lunch')) },
      ],
    })
    const total = (h: Household) =>
      buildWeekMenu(h, 21).menu.entries.reduce((sum, e) => sum + totalPortions(e), 0)
    expect(total(away)).toBeLessThan(total(home))
  })

  it('не планирует приём пищи, если дома никого', () => {
    const h = household({
      eaters: [
        { ...julia, awayMeals: [awayKey(3, 'dinner')] },
        { ...kirill, awayMeals: [awayKey(3, 'dinner')] },
      ],
    })
    const { menu } = buildWeekMenu(h, 5)
    expect(menu.entries.filter((e) => e.day === 3 && e.slot === 'dinner')).toHaveLength(0)
    expect(eatersAtHome(h, 3, 'dinner')).toHaveLength(0)
  })

  it('снижает норму дня ровно на долю пропущенного приёма', () => {
    const h = household({ eaters: [{ ...kirill, awayMeals: [awayKey(2, 'lunch')] }] })
    const full = dayNorms(h, 1, 'k')
    const partial = dayNorms(h, 2, 'k')
    expect(partial.kcal).toBeLessThan(full.kcal)
    // обед — примерно треть дня, так что дома остаётся около двух третей нормы
    expect(partial.kcal / full.kcal).toBeGreaterThan(0.55)
    expect(partial.kcal / full.kcal).toBeLessThan(0.75)
  })
})

describe('закрепление блюда', () => {
  it('оставляет закреплённое блюдо на месте при пересборке', () => {
    const h = household()
    const first = buildWeekMenu(h, 1).menu
    const pinned = { ...first.entries[3], pinned: true }
    const second = buildWeekMenu(h, 999, [pinned]).menu
    const same = second.entries.find((e) => e.day === pinned.day && e.slot === pinned.slot)
    expect(same?.recipeId).toBe(pinned.recipeId)
    expect(same?.pinned).toBe(true)
  })

  it('пересобирает всё остальное', () => {
    const h = household()
    const first = buildWeekMenu(h, 1).menu
    const pinned = { ...first.entries[0], pinned: true }
    const second = buildWeekMenu(h, 424242, [pinned]).menu
    const changed = second.entries.filter((e) => {
      const before = first.entries.find((x) => x.day === e.day && x.slot === e.slot)
      return before && before.recipeId !== e.recipeId
    })
    expect(changed.length).toBeGreaterThan(0)
  })

  it('не ставит закреплённое блюдо дважды', () => {
    const h = household()
    const first = buildWeekMenu(h, 3).menu
    const pinned = { ...first.entries[2], pinned: true }
    const second = buildWeekMenu(h, 88, [pinned]).menu
    const cell = second.entries.filter((e) => e.day === pinned.day && e.slot === pinned.slot)
    expect(cell).toHaveLength(1)
  })

  it('пересчитывает день готовки, если дни готовки изменились', () => {
    const first = buildWeekMenu(household({ cookingDays: [0] }), 11).menu
    const pinned = { ...first.entries.find((e) => e.day === 5)!, pinned: true }
    const second = buildWeekMenu(household({ cookingDays: [0, 4] }), 11, [pinned]).menu
    const same = second.entries.find((e) => e.day === 5 && e.slot === pinned.slot)
    expect(same?.cookDay).toBe(4)
  })
})

describe('умная замена', () => {
  const h = household()
  const menu = buildWeekMenu(h, 4).menu
  const entry = menu.entries.find((e) => e.slot === 'dinner')!

  it('«дорого» поднимает варианты дешевле текущего', () => {
    const plain = replacementOptions(menu, h, entry.id, undefined, 5)
    const cheap = replacementOptions(menu, h, entry.id, 'expensive', 5)
    const avg = (list: typeof plain) => list.reduce((s, o) => s + o.price, 0) / list.length
    expect(avg(cheap)).toBeLessThan(avg(plain))
  })

  it('«слишком долго» поднимает варианты быстрее текущего', () => {
    const plain = replacementOptions(menu, h, entry.id, undefined, 5)
    const quick = replacementOptions(menu, h, entry.id, 'too_long', 5)
    const avg = (list: typeof plain) => list.reduce((s, o) => s + o.minutes, 0) / list.length
    expect(avg(quick)).toBeLessThan(avg(plain))
  })

  it('«нет ингредиентов» поднимает блюда из уже закупаемых продуктов', () => {
    const plain = replacementOptions(menu, h, entry.id, undefined, 5)
    const reuse = replacementOptions(menu, h, entry.id, 'no_ingredients', 5)
    const avg = (list: typeof plain) => list.reduce((s, o) => s + o.reuseShare, 0) / list.length
    expect(avg(reuse)).toBeGreaterThanOrEqual(avg(plain))
  })

  it('«хочется проще» поднимает блюда с меньшим числом шагов', () => {
    const plain = replacementOptions(menu, h, entry.id, undefined, 5)
    const simple = replacementOptions(menu, h, entry.id, 'simpler', 5)
    const avg = (list: typeof plain, f: (o: (typeof plain)[0]) => number) =>
      list.reduce((s, o) => s + f(o), 0) / list.length
    expect(avg(simple, (o) => o.recipe.steps.length)).toBeLessThan(
      avg(plain, (o) => o.recipe.steps.length),
    )
    expect(avg(simple, (o) => o.recipe.items.length)).toBeLessThanOrEqual(
      avg(plain, (o) => o.recipe.items.length),
    )
  })

  it('«не нравится» уводит от похожего по составу', () => {
    const plain = replacementOptions(menu, h, entry.id, undefined, 5)
    const other = replacementOptions(menu, h, entry.id, 'dislike', 5)
    const current = RECIPE_BY_ID[entry.recipeId]
    const shared = (list: typeof plain) => {
      const items = new Set(current.items.map((i) => i.ingredientId))
      return (
        list.reduce(
          (s, o) => s + o.recipe.items.filter((i) => items.has(i.ingredientId)).length,
          0,
        ) / list.length
      )
    }
    expect(shared(other)).toBeLessThan(shared(plain))
  })

  it('«уже недавно ели» уводит от продуктов, которых в неделе и так много', () => {
    const plain = replacementOptions(menu, h, entry.id, undefined, 5)
    const fresh = replacementOptions(menu, h, entry.id, 'recent', 5)
    const avg = (list: typeof plain) => list.reduce((s, o) => s + o.reuseShare, 0) / list.length
    // здесь переиспользование, наоборот, должно упасть: человеку приелось
    expect(avg(fresh)).toBeLessThan(avg(plain))
  })

  it('считает разницу с текущим блюдом', () => {
    const options = replacementOptions(menu, h, entry.id, undefined, 3)
    for (const o of options) {
      expect(o.deltaMinutes).toBe(o.minutes - RECIPE_BY_ID[entry.recipeId].steps.reduce((s, x) => s + x.minutes, 0))
      expect(Number.isFinite(o.deltaPrice)).toBe(true)
      expect(o.reuseShare).toBeGreaterThanOrEqual(0)
      expect(o.reuseShare).toBeLessThanOrEqual(1)
    }
  })

  it('любая причина сохраняет калорийность приёма пищи', () => {
    const reasons = ['dislike', 'too_long', 'expensive', 'no_ingredients', 'simpler', 'recent'] as const
    const target = slotTargetOn(h, entry.slot, entry.day)
    expect(target).toBeGreaterThan(0)
    for (const reason of reasons) {
      const top = replacementOptions(menu, h, entry.id, reason, 5)
      expect(top.length).toBe(5)
      const avg = top.reduce((s, o) => s + o.kcal, 0) / top.length
      // причина меняет, ЧТО предлагается, но не размер порции: держимся ±25% нормы
      expect(avg).toBeGreaterThan(target * 0.75)
      expect(avg).toBeLessThan(target * 1.25)
    }
  })
})

describe('оценки блюд', () => {
  it('складывает оценки всех едоков', () => {
    const recipe = RECIPES[0]
    const both = household({
      eaters: [
        eater({ id: 'a', ratings: { [recipe.id]: 1 } }),
        eater({ id: 'b', ratings: { [recipe.id]: 1 } }),
      ],
    })
    expect(ratingScore(recipe, both)).toBe(2)
  })

  it('спор в семье возвращает блюдо к нейтральному', () => {
    const recipe = RECIPES[0]
    const split = household({
      eaters: [
        eater({ id: 'a', ratings: { [recipe.id]: 1 } }),
        eater({ id: 'b', ratings: { [recipe.id]: -1 } }),
      ],
    })
    expect(ratingScore(recipe, split)).toBe(0)
  })

  const seeds = Array.from({ length: 40 }, (_, i) => i + 1)
  const appearances = (ratings: Record<string, 1 | -1>, recipeId: string) =>
    seeds.reduce(
      (n, seed) =>
        n +
        buildWeekMenu(household({ eaters: [eater({ ratings })] }), seed).menu.entries.filter(
          (e) => e.recipeId === recipeId,
        ).length,
      0,
    )
  // блюдо, которое подбор и так выбирает регулярно — на нём видно обе стороны
  const popular = 'draniki'

  it('«нравится» заметно поднимает блюдо в подборе', () => {
    const plain = appearances({}, popular)
    const liked = appearances({ [popular]: 1 }, popular)
    expect(plain).toBeGreaterThan(0)
    expect(liked).toBeGreaterThan(plain * 3)
  })

  it('«не нравится» делает блюдо редким, но не вычёркивает его', () => {
    const plain = appearances({}, popular)
    const disliked = appearances({ [popular]: -1 }, popular)
    expect(disliked).toBeLessThan(plain)
    // и всё же иногда выпадает: иначе оценка ничем не отличалась бы от скрытия
    expect(disliked).toBeGreaterThan(0)
  })

  it('скрытие, в отличие от оценки, убирает блюдо из подбора совсем', () => {
    const recipe = RECIPE_BY_ID[popular]
    const disliked = household({ eaters: [eater({ ratings: { [popular]: -1 } })] })
    const banned = household({ eaters: [eater({ bannedRecipes: [popular] })] })
    expect(isRecipeAllowed(recipe, disliked)).toBe(true)
    expect(isRecipeAllowed(recipe, banned)).toBe(false)
  })
})

describe('план и факт', () => {
  it('пропущенное блюдо не считается в норму дня', () => {
    const h = household()
    const { menu } = buildWeekMenu(h, 12)
    const day = 2
    const before = dayTotals(menu, day)
    const lunch = menu.entries.find((e) => e.day === day && e.slot === 'lunch')!
    const marked = {
      ...menu,
      entries: menu.entries.map((e) =>
        e.id === lunch.id ? { ...e, status: 'skipped' as const } : e,
      ),
    }
    const after = dayTotals(marked, day)
    expect(after.kcal).toBeLessThan(before.kcal)
    expect(after.price).toBeLessThan(before.price)
  })

  it('«приготовлено» и «съедено» норму не меняют — это факт, а не отмена', () => {
    const h = household()
    const { menu } = buildWeekMenu(h, 12)
    const before = dayTotals(menu, 2)
    for (const status of ['cooked', 'eaten'] as const) {
      const marked = {
        ...menu,
        entries: menu.entries.map((e) => (e.day === 2 ? { ...e, status } : e)),
      }
      expect(dayTotals(marked, 2)).toEqual(before)
    }
  })
})
