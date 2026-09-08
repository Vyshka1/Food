import { describe, expect, it } from 'vitest'
import type { CookEvent, Eater, Household, Kitchen, Pantry, WeekMenu } from '../types'
import { recipeById } from '../data/recipeRegistry'
import { RECIPES } from '../data/recipes'
import { completeCookTask, undoCookTask } from './cookFact'
import type { CookFacts } from './cookFact'
import { buildWeekMenu, cookTaskId, cookTasks, defaultRepeats } from './menu'
import { defaultOils } from './oil'
import { emptyPantry, isAlways, setStock, stockOf } from './pantry'
import { planWeek } from './weekPlan'

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

const eater = (id: string, patch: Partial<Eater> = {}): Eater => ({
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
})

const household: Household = {
  eaters: [eater('e1'), eater('e2', { sex: 'male', weightKg: 84, heightCm: 182, age: 35 })],
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

const TODAY = '2026-01-07'

/** Кладовая, в которой всего вдоволь: тогда видно ровно то, что списали. */
function stockedFor(menu: WeekMenu, pantry = emptyPantry()): Pantry {
  let next = pantry
  for (const cooking of planWeek(menu, household).tasks) {
    for (const [id, qty] of cooking.ingredients) {
      next = setStock(next, id, stockOf(next, id) + qty * 3, '2026-01-01')
    }
  }
  return next
}

function facts(pantry: Pantry, cookEvents: CookEvent[] = []): CookFacts {
  return { pantry, cookEvents }
}

/** Готовка, которая закрывает несколько приёмов пищи — таких большинство. */
function multiMealTask(menu: WeekMenu) {
  return cookTasks(menu).find((t) => t.eatDays.length > 1)
}

describe('факт готовки', () => {
  it('двойное нажатие ничего не меняет', () => {
    const { menu } = buildWeekMenu(household, 4)
    const task = cookTasks(menu)[0]
    const start = facts(stockedFor(menu))

    const once = completeCookTask(start, menu, household, task.key, TODAY)
    expect(once).not.toBe(start)
    expect(once.cookEvents).toHaveLength(1)

    const twice = completeCookTask(once, menu, household, task.key, TODAY)
    // не просто «то же самое», а буквально то же состояние: работы не было
    expect(twice).toBe(once)
    expect(twice.cookEvents).toHaveLength(1)
    expect(twice.pantry).toBe(once.pantry)
  })

  it('десять нажатий подряд списывают ровно одну готовку', () => {
    const { menu } = buildWeekMenu(household, 5)
    const task = cookTasks(menu)[0]
    const start = facts(stockedFor(menu))
    let state = start
    for (let i = 0; i < 10; i++) {
      state = completeCookTask(state, menu, household, task.key, TODAY)
    }
    expect(state.cookEvents).toHaveLength(1)
    const plan = planWeek(menu, household, { pantry: start.pantry }).byKey.get(task.key)!
    for (const [id, qty] of plan.ingredients) {
      // постоянные продукты не списывают: соль и масло дома есть всегда
      if (isAlways(start.pantry, id)) continue
      const before = stockOf(start.pantry, id)
      const after = stockOf(state.pantry, id)
      // кладовая хранит количества с точностью до сотых — сравниваем так же
      expect(before - after, id).toBeCloseTo(qty, 1)
    }
  })

  it('несколько приёмов из одной готовки — одно списание', () => {
    /*
     * Ровно тот случай, ради которого факт переехал с записи меню на готовку:
     * блюдо стоит на столе в понедельник и во вторник, а варят его один раз.
     */
    let seed = 1
    let menu: WeekMenu | null = null
    let task = undefined as ReturnType<typeof multiMealTask>
    while (seed < 40 && !task) {
      menu = buildWeekMenu(household, seed).menu
      task = multiMealTask(menu)
      if (!task) seed++
    }
    expect(task, 'нашлась готовка на несколько приёмов').toBeTruthy()
    const entries = menu!.entries.filter(
      (e) => e.recipeId === task!.recipeId && e.cookDay === task!.cookDay && !e.fromFreezer,
    )
    expect(entries.length).toBeGreaterThan(1)

    const start = facts(stockedFor(menu!))
    // «приготовлено» нажали на каждой записи меню этой готовки
    let state = start
    for (const entry of entries) {
      state = completeCookTask(
        state,
        menu!,
        household,
        cookTaskId(menu!.weekStart, entry.recipeId, entry.cookDay),
        TODAY,
      )
    }
    expect(state.cookEvents).toHaveLength(1)
    // и в морозилку положили один раз, а не по разу на каждый приём
    expect(state.pantry.freezer.length).toBeLessThanOrEqual(1)

    // списано на всю партию, а не на потребность одного приёма
    const plan = planWeek(menu!, household, { pantry: start.pantry }).byKey.get(task!.key)!
    expect(state.cookEvents[0].servings).toBeCloseTo(plan.servings, 5)
    expect(state.cookEvents[0].servings).toBeGreaterThan(0)
  })

  it('факт не меняется от того, что план пересчитали', () => {
    /*
     * После отметки кладовая изменилась, а значит изменился и план: свободного
     * места в морозилке стало меньше, запасы другие. Списанное от этого
     * меняться не должно — иначе отметка «приготовлено» переписывала бы прошлое.
     */
    const { menu } = buildWeekMenu(household, 8)
    const task = cookTasks(menu)[0]
    const start = facts(stockedFor(menu))
    const state = completeCookTask(start, menu, household, task.key, TODAY)
    const event = state.cookEvents[0]

    // план после отметки: другая кладовая, другая морозилка
    const after = planWeek(menu, household, { pantry: state.pantry }).byKey.get(task.key)!
    const snapshot = { ...event, used: [...event.used] }

    // повторная отметка ничего не делает, даже если план теперь другой
    const again = completeCookTask(state, menu, household, task.key, TODAY)
    expect(again.cookEvents[0]).toEqual(snapshot)
    void after

    // и возврат идёт по снимку: в кладовую вернулось ровно то, что взяли
    const undone = undoCookTask(again, task.key, TODAY)
    expect(undone.cookEvents).toHaveLength(0)
    for (const { ingredientId, qty } of snapshot.used) {
      expect(stockOf(undone.pantry, ingredientId), ingredientId).toBeCloseTo(
        stockOf(start.pantry, ingredientId),
        1,
      )
      expect(qty).toBeGreaterThan(0)
    }
    expect(undone.pantry.freezer).toHaveLength(0)
  })

  it('ключ готовки переживает пересборку меню и различает недели', () => {
    const a = buildWeekMenu(household, 3).menu
    const b = buildWeekMenu(household, 3).menu
    expect(cookTasks(a).map((t) => t.key)).toEqual(cookTasks(b).map((t) => t.key))

    const next = buildWeekMenu({ ...household, weekStart: '2026-01-12' }, 3).menu
    const sameDish = cookTasks(next).find((t) => cookTasks(a).some((x) => x.recipeId === t.recipeId))
    if (sameDish) {
      expect(cookTasks(a).map((t) => t.key)).not.toContain(sameDish.key)
    }
    expect(cookTaskId('2026-01-05', 'borsch', 2)).not.toBe(cookTaskId('2026-01-12', 'borsch', 2))
  })

  it('неизвестная готовка не трогает запасы', () => {
    const { menu } = buildWeekMenu(household, 6)
    const start = facts(stockedFor(menu))
    const state = completeCookTask(start, menu, household, 'нет-такой-задачи', TODAY)
    expect(state).toBe(start)
    expect(undoCookTask(start, 'нет-такой-задачи', TODAY)).toBe(start)
  })

  it('постоянные продукты не списываются', () => {
    const { menu } = buildWeekMenu(household, 9)
    const task = cookTasks(menu)[0]
    const plan = planWeek(menu, household).byKey.get(task.key)!
    const always = [...plan.ingredients.keys()].find((id) => !isAlways(emptyPantry(), id))!
    const start = facts({ ...stockedFor(menu), always: [always] })
    const state = completeCookTask(start, menu, household, task.key, TODAY)
    expect(state.cookEvents[0].used.map((u) => u.ingredientId)).not.toContain(always)
    expect(stockOf(state.pantry, always)).toBeCloseTo(stockOf(start.pantry, always), 1)
  })

  it('в морозилку уходит ровно то, что посчитал план', () => {
    const { menu } = buildWeekMenu(household, 11)
    const start = facts(stockedFor(menu))
    let state = start
    let checked = 0
    for (const cooking of planWeek(menu, household, { pantry: start.pantry }).tasks) {
      if (cooking.placement.freezeGrams <= 0) continue
      state = completeCookTask(state, menu, household, cooking.task.key, TODAY)
      const event = state.cookEvents[state.cookEvents.length - 1]
      expect(event.frozen?.grams).toBe(cooking.placement.freezeGrams)
      checked++
      break
    }
    expect(checked, 'нашлась готовка с заготовкой').toBe(1)
  })

  it('рецепт есть у каждого события', () => {
    const { menu } = buildWeekMenu(household, 2)
    const start = facts(stockedFor(menu))
    let state = start
    for (const task of cookTasks(menu)) {
      state = completeCookTask(state, menu, household, task.key, TODAY)
    }
    expect(state.cookEvents).toHaveLength(cookTasks(menu).length)
    for (const event of state.cookEvents) {
      expect(recipeById(event.recipeId), event.recipeId).toBeTruthy()
      expect(RECIPES.length).toBeGreaterThan(0)
    }
  })
})
