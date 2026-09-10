import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen } from '../types'
import { recipeById } from '../data/recipeRegistry'
import { buildWeekMenu, cookTasks, defaultRepeats, cookingSegments } from './menu'
import { defaultOils } from './oil'
import { planWeek } from './weekPlan'
import { addFreezer, emptyPantry } from './pantry'
import { cookedGrams } from './nutrition'
import { buildShoppingList } from './shopping'
import { cookCard } from './cookCard'
import { slotLabel } from './attendance'
import { WEEKDAYS } from './menu'

/*
 * Запас впрок: последняя готовка недели кормит и начало следующей.
 *
 * Проверяем не «поле заполнилось», а то, ради чего запас и заведён: продукты
 * на него покупаются, партия растёт, он уходит в морозилку — и следующая
 * неделя достаёт его оттуда, не готовя и не покупая заново.
 */

const kitchen: Kitchen = {
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

function household(patch: Partial<Household> = {}): Household {
  return {
    eaters: [eater('a'), eater('b', { sex: 'male', weightKg: 82, heightCm: 182 })],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen,
    budgetPerWeek: 0,
    drinks: [],
    oils: defaultOils(),
    repeats: defaultRepeats(),
    extras: [],
    weekStart: '2026-01-05',
    ...patch,
  }
}

const ahead = (h: Household, seed: number) =>
  buildWeekMenu(h, seed, [], { freezer: [], today: h.weekStart }).menu.ahead ?? []

describe('когда запас не нужен', () => {
  it('готовят с понедельника — переносить нечего', () => {
    for (const days of [[0, 3], [0], [0, 2, 4]]) {
      const h = household({ cookingDays: days })
      expect(ahead(h, 7), `дни ${days.join(',')}`).toEqual([])
    }
  })

  it('без морозилки: холодильник между неделями приложение не помнит', () => {
    const h = household({ kitchen: { ...kitchen, hasFreezer: false } })
    expect(ahead(h, 7)).toEqual([])
  })

  it('разрыв в один день не окупается', () => {
    // готовка по вторникам и пятницам: до первой готовки один понедельник
    expect(cookingSegments([1, 4])[0].days).toEqual([0])
    expect(ahead(household({ cookingDays: [1, 4] }), 7)).toEqual([])
  })

  it('запас не длиннее, чем семья согласна есть одно и то же', () => {
    // готовка только в воскресенье: до неё шесть дней, но повторы разрешают два
    const h = household({ cookingDays: [6] })
    const repeats = defaultRepeats()
    expect(cookingSegments([6])[0].days).toHaveLength(6)
    for (const batch of ahead(h, 7)) {
      expect(batch.forDays.length).toBeLessThanOrEqual(repeats.maxPerWeek[batch.slot] ?? 0)
    }
  })
})

describe('запас впрок', () => {
  const h = household()
  const seed = 7
  const built = buildWeekMenu(h, seed, [], { freezer: [], today: h.weekStart })

  it('варится в последнюю готовку недели и ради её начала', () => {
    const batches = built.menu.ahead ?? []
    expect(batches.length).toBeGreaterThan(0)
    for (const batch of batches) {
      expect(batch.cookDay).toBe(6)
      expect(batch.forDays.every((d) => d <= 1)).toBe(true)
      expect(batch.portions).toBeGreaterThan(0)
      // морозится только то, что вообще морозится
      expect(recipeById(batch.recipeId)?.batch?.freezeCooked).toBe(true)
    }
  })

  it('прибавляется к своей готовке, а не заводит новую', () => {
    const withAhead = cookTasks(built.menu)
    const without = cookTasks({ ...built.menu, ahead: [] })
    expect(withAhead).toHaveLength(without.length)
    const batch = (built.menu.ahead ?? [])[0]
    const task = withAhead.find((t) => t.recipeId === batch.recipeId && t.cookDay === batch.cookDay)!
    const plain = without.find((t) => t.key === task.key)!
    expect(task.aheadPortions).toBeCloseTo(batch.portions, 5)
    // порции на стол не изменились: запас — это сверх недели, а не вместо неё
    expect(task.portions).toBeCloseTo(plain.portions, 5)
    expect(plain.aheadPortions).toBe(0)
  })

  it('исчез из меню — исчез и запас', () => {
    const gone = new Set((built.menu.ahead ?? []).map((b) => b.recipeId))
    const menu = {
      ...built.menu,
      entries: built.menu.entries.filter((e) => !gone.has(e.recipeId)),
    }
    expect(built.menu.ahead?.length).toBeGreaterThan(0)
    expect(cookTasks(menu).some((t) => t.aheadPortions > 0)).toBe(false)
  })

  it('партия растёт, и продукты на него покупаются', () => {
    const pantry = emptyPantry()
    const plan = planWeek(built.menu, h, { pantry })
    const plain = planWeek({ ...built.menu, ahead: [] }, h, { pantry })
    const batch = (built.menu.ahead ?? [])[0]
    const key = [...plan.byKey.keys()].find((k) => plan.byKey.get(k)!.recipe.id === batch.recipeId)!
    const withAhead = plan.byKey.get(key)!
    const without = plain.byKey.get(key)!

    expect(withAhead.cookedGrams).toBeGreaterThan(without.cookedGrams)
    // запас именно замораживается, а не оседает на тарелках
    expect(withAhead.placement.aheadGrams).toBeGreaterThan(0)
    expect(withAhead.placement.freezeGrams).toBeGreaterThanOrEqual(
      withAhead.placement.aheadGrams,
    )
    expect(withAhead.placement.servedGrams).toBeCloseTo(without.placement.servedGrams, 0)

    // и это видно в чеке: сваренного больше — значит и куплено больше
    const bill = (menu: typeof built.menu) => buildShoppingList(menu, h, pantry).total
    expect(bill(built.menu)).toBeGreaterThan(bill({ ...built.menu, ahead: [] }))
  })

  it('не больше, чем влезет в морозилку', () => {
    // одна ёмкость: места почти нет, и варить впрок нечего
    const tight = household({ kitchen: { ...kitchen, containers: 1 } })
    const menu = buildWeekMenu(tight, seed, [], { freezer: [], today: tight.weekStart }).menu
    const plan = planWeek(menu, tight, { pantry: emptyPantry() })
    const roomy = planWeek(
      buildWeekMenu(h, seed, [], { freezer: [], today: h.weekStart }).menu,
      h,
      { pantry: emptyPantry() },
    )
    const sum = (p: typeof plan) => p.tasks.reduce((s, t) => s + t.placement.aheadGrams, 0)
    expect(sum(plan)).toBeLessThan(sum(roomy))
  })
})

describe('следующая неделя', () => {
  /*
   * Ради этого всё и затевалось: то, что сварено впрок, следующая неделя
   * достаёт из морозилки — не готовя заново.
   *
   * Сравниваем не с идеалом, а с той же самой неделей без запаса: морозилка не
   * резиновая, и часть запаса в неё не помещается. Правильный вопрос не «весь
   * ли запас доехал», а «стало ли в начале следующей недели меньше готовки».
   */
  const h1 = household({ cookingDays: [6], weekStart: '2026-01-05' })
  const built = buildWeekMenu(h1, 3, [], { freezer: [], today: h1.weekStart })
  const gapDays = cookingSegments(h1.cookingDays)[0].days

  /** Заморозить ровно то, что план велел заморозить. */
  function freeze(menu: typeof built.menu) {
    let pantry = emptyPantry()
    for (const task of planWeek(menu, h1, { pantry: emptyPantry() }).tasks) {
      const grams = task.placement.freezeGrams
      if (grams <= 0) continue
      const perServing = Math.max(1, cookedGrams(task.recipe, 1))
      pantry = addFreezer(pantry, task.recipe, 1, grams / perServing, '2026-01-11')
    }
    return pantry.freezer
  }

  const h2 = household({ cookingDays: [6], weekStart: '2026-01-12' })
  const nextWith = buildWeekMenu(h2, 4, [], { freezer: freeze(built.menu), today: h2.weekStart })
  const nextWithout = buildWeekMenu(h2, 4, [], {
    freezer: freeze({ ...built.menu, ahead: [] }),
    today: h2.weekStart,
  })
  const inGap = (menu: typeof built.menu) =>
    menu.entries.filter((e) => e.fromFreezer && gapDays.includes(e.day)).length

  it('в начале недели меньше готовки', () => {
    expect(built.menu.ahead?.length).toBeGreaterThan(0)
    expect(inGap(nextWith.menu)).toBeGreaterThan(inGap(nextWithout.menu))
  })

  it('достаёт именно то, что варилось впрок', () => {
    const taken = new Set(
      nextWith.menu.entries.filter((e) => e.fromFreezer).map((e) => e.recipeId),
    )
    const planned = (built.menu.ahead ?? []).map((b) => b.recipeId)
    expect(planned.some((id) => taken.has(id))).toBe(true)
  })

  it('заготовку не готовят и не покупают заново', () => {
    const frozenEntries = nextWith.menu.entries.filter((e) => e.fromFreezer)
    expect(frozenEntries.length).toBeGreaterThan(0)
    const tasks = cookTasks(nextWith.menu)
    for (const entry of frozenEntries) {
      const cooked = tasks.filter((t) => t.recipeId === entry.recipeId)
      expect(cooked.flatMap((t) => t.eatDays)).not.toContain(entry.day)
    }
  })
})

describe('подбор блюд под запас', () => {
  /*
   * Последней готовке недели нужно блюдо, которое морозится: иначе переносить
   * на следующую неделю нечего. Это вес в счёте, а не жёсткое правило — норму
   * он не перевешивает, — и потому проверяется долей, а не каждым случаем.
   */
  it('в последнюю готовку недели чаще ставит то, что морозится', () => {
    const h = household({ cookingDays: [6] })
    let freezable = 0
    let total = 0
    for (let seed = 1; seed <= 20; seed++) {
      const menu = buildWeekMenu(h, seed, [], { freezer: [], today: h.weekStart }).menu
      for (const slot of h.meals) {
        const entry = menu.entries.find((e) => e.slot === slot && e.cookDay === 6 && !e.fromFreezer)
        if (!entry) continue
        total++
        if (recipeById(entry.recipeId)?.batch?.freezeCooked) freezable++
      }
    }
    // замерено: с весом AHEAD_WEIGHT=150 — 58 из 60, без веса — 8 из 60
    expect(total).toBeGreaterThan(50)
    expect(freezable / total).toBeGreaterThan(0.8)
  })
})

describe('карточка готовки', () => {
  it('называет запас вслух и говорит, ради чего он', () => {
    const h = household({ cookingDays: [6] })
    const menu = buildWeekMenu(h, 3, [], { freezer: [], today: h.weekStart }).menu
    const batch = (menu.ahead ?? [])[0]
    expect(batch).toBeTruthy()
    const entry = menu.entries.find(
      (e) => e.recipeId === batch.recipeId && e.cookDay === batch.cookDay && !e.fromFreezer,
    )!
    const card = cookCard(menu, h, entry, emptyPantry())!
    expect(card.ahead).toBeTruthy()
    expect(card.ahead!.grams).toBeGreaterThan(0)
    // «обед в Пн и Вт» — приём пищи и дни, а не голое число граммов
    expect(card.ahead!.label).toContain(slotLabel(batch.slot))
    for (const day of batch.forDays) expect(card.ahead!.label).toContain(WEEKDAYS[day])
    // и запас — часть морозилки, а не что-то сверх неё
    expect(card.freezeGrams).toBeGreaterThanOrEqual(card.ahead!.grams)
  })

  it('без запаса строки нет', () => {
    const h = household({ cookingDays: [0, 3] })
    const menu = buildWeekMenu(h, 3, [], { freezer: [], today: h.weekStart }).menu
    expect(menu.ahead).toEqual([])
    for (const entry of menu.entries) {
      expect(cookCard(menu, h, entry, emptyPantry())?.ahead).toBeUndefined()
    }
  })
})
