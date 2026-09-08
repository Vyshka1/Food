import { describe, expect, it } from 'vitest'
import { recipeById } from '../data/recipeRegistry'
import type { Eater, Household, Kitchen, Recipe, WeekMenu } from '../types'
import { planBatch } from './batch'
import { buildWeekMenu, cookTasks, defaultRepeats } from './menu'
import { cookedGrams } from './nutrition'
import { CONTAINER_GRAMS, freezerRoomGrams } from './pantry'
import { defaultOils } from './oil'
import { planWeek } from './weekPlan'
import { setCustomRecipes } from '../data/recipeRegistry'
import { deriveRecipeSteps } from './stepDetail'

const kitchen: Kitchen = {
  burners: 4,
  ovens: 1,
  hasAirfryer: false,
  hasMulticooker: false,
  hasBlender: true,
  hasProcessor: false,
  hasMicrowave: true,
  hasDishwasher: false,
  containers: 4,
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

describe('партии на неделю', () => {
  const room = freezerRoomGrams(kitchen)

  it('в морозилку за неделю уходит не больше, чем в неё влезает', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { menu } = buildWeekMenu(household, seed)
      const plan = planWeek(menu, household)
      const total = plan.tasks.reduce((sum, t) => sum + t.placement.freezeGrams, 0)
      expect(total, `неделя ${seed}`).toBeLessThanOrEqual(room)
    }
  })

  it('порознь каждая готовка обещала бы всю полку себе', () => {
    /*
     * Проверка, что предыдущий тест не пустой: пока каждое блюдо считало
     * партию само по себе, все они видели одну и ту же свободную полку.
     * Порознь каждый расчёт верен, вместе — морозилка вшестеро больше
     * настоящей.
     */
    let overcommitted = 0
    for (let seed = 1; seed <= 20; seed++) {
      const { menu } = buildWeekMenu(household, seed)
      let alone = 0
      for (const task of cookTasks(menu)) {
        const recipe = recipeById(task.recipeId)
        if (!recipe) continue
        const plan = planBatch(recipe, {
          neededGrams: cookedGrams(recipe, task.portions),
          hasFreezer: true,
          freezerRoomGrams: room,
        })
        alone += plan?.chosen.freezeGrams ?? 0
      }
      if (alone > room) overcommitted++
    }
    expect(overcommitted).toBeGreaterThan(0)
  })

  it('место достаётся тому, кто готовит раньше', () => {
    const { menu } = buildWeekMenu(household, 7)
    const week = planWeek(menu, household)
    expect(week.tasks.length).toBeGreaterThan(3)
    // дни готовки идут по возрастанию, и место кончается по ходу недели
    let left = room
    for (const cooking of week.tasks) {
      expect(cooking.placement.freezeGrams, cooking.recipe.title).toBeLessThanOrEqual(left)
      left -= cooking.placement.freezeGrams
    }
  })

  it('без морозилки в морозилку ничего не уходит', () => {
    const noFreezer = { ...household, kitchen: { ...kitchen, hasFreezer: false } }
    const { menu } = buildWeekMenu(noFreezer, 3)
    const week = planWeek(menu, noFreezer)
    for (const cooking of week.tasks) expect(cooking.placement.freezeGrams).toBe(0)
  })

  it('занятая морозилка оставляет меньше места', () => {
    const { menu } = buildWeekMenu(household, 5)
    const empty = planWeek(menu, household)
    const full = planWeek(menu, household, {
      pantry: {
        always: [],
        stock: [],
        freezer: [
          {
            id: 'f1',
            recipeId: 'x',
            containers: kitchen.containers,
            portionsEach: 1,
            cookedAt: '2026-01-01',
            keepDays: 90,
          },
        ],
      },
    })
    const sum = (week: ReturnType<typeof planWeek>) =>
      week.tasks.reduce((s, t) => s + t.placement.freezeGrams, 0)
    expect(sum(empty)).toBeGreaterThan(0)
    expect(sum(full)).toBe(0)
    expect(freezerRoomGrams(kitchen)).toBe(kitchen.containers * CONTAINER_GRAMS)
  })
})

describe('план недели — единственный расчёт готовки', () => {
  it('у каждой готовки есть план: запасного пути нет', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { menu } = buildWeekMenu(household, seed)
      const week = planWeek(menu, household)
      expect(week.missing, `неделя ${seed}`).toEqual([])
      expect(week.tasks.length).toBe(cookTasks(menu).length)
      for (const cooking of week.tasks) {
        expect(week.byKey.get(cooking.task.key)).toBe(cooking)
      }
    }
  })

  it('приготовленное всё куда-то девается', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { menu } = buildWeekMenu(household, seed)
      for (const cooking of planWeek(menu, household).tasks) {
        const p = cooking.placement
        const sum = p.servedGrams + p.freezeGrams + p.tailGrams + p.unplacedGrams
        expect(Math.abs(sum - cooking.cookedGrams), cooking.recipe.title).toBeLessThanOrEqual(2)
      }
    }
  })

  it('расход готовок сходится с недельной потребностью', () => {
    /*
     * Два разных ответа, и оба нужны: сколько ушло в конкретную готовку и
     * сколько нужно купить на неделю. Второе — сумма первых плюс напитки и
     * дополнения; если они разойдутся, список покупок перестанет соответствовать
     * тому, что стоит на плите.
     */
    const bare = { ...household, drinks: [], extras: [] }
    for (let seed = 1; seed <= 10; seed++) {
      const { menu } = buildWeekMenu(bare, seed)
      const week = planWeek(menu, bare)
      const fromTasks = new Map<string, number>()
      for (const cooking of week.tasks) {
        for (const [id, qty] of cooking.ingredients) {
          fromTasks.set(id, (fromTasks.get(id) ?? 0) + qty)
        }
      }
      expect(new Set(fromTasks.keys())).toEqual(new Set(week.demand.keys()))
      for (const [id, qty] of week.demand) {
        expect(Math.abs((fromTasks.get(id) ?? 0) - qty), id).toBeLessThan(0.001)
      }
    }
  })

  it('свой рецепт считается тем же способом, что и встроенный', () => {
    /*
     * Раньше рецепт из редактора приходил без производственной модели, и весь
     * расчёт сваливался на запасной путь «партии нет — считаем по потребности
     * меню». Своё блюдо считалось иначе, чем встроенное, и карточка с закупкой
     * разошлись бы на нём же.
     */
    const own: Recipe = {
      id: 'custom-test',
      title: 'Своя запеканка',
      emoji: '🥘',
      slots: ['dinner'],
      items: [
        { ingredientId: 'potato', qty: 200 },
        { ingredientId: 'egg', qty: 1 },
        { ingredientId: 'milk', qty: 50 },
      ],
      steps: deriveRecipeSteps([
        { text: 'Нарезать картофель', minutes: 10, station: 'prep', handsOn: true },
        { text: 'Запекать в духовке 40 минут', minutes: 40, station: 'oven', handsOn: false },
      ]),
      tags: [],
      freezable: true,
      fridgeDays: 3,
      custom: true,
    }
    try {
      setCustomRecipes([own])
      const registered = recipeById('custom-test')!
      expect(registered.batch, 'своему рецепту дописали партию').toBeTruthy()
      expect(registered.freezing, 'и разметку заморозки').toBeTruthy()
      // прибор выводится из текста шага так же, как у встроенных
      expect(registered.steps[1].appliance).toBe('oven')

      const menu: WeekMenu = {
        weekStart: household.weekStart,
        seed: 1,
        entries: [
          {
            id: 'dinner-2-custom-test',
            recipeId: 'custom-test',
            slot: 'dinner',
            day: 2,
            cookDay: 2,
            portions: [
              { eaterId: 'e1', factor: 1 },
              { eaterId: 'e2', factor: 1.2 },
            ],
            storage: 'fridge',
          },
        ],
      }
      const week = planWeek(menu, household)
      expect(week.missing).toEqual([])
      expect(week.tasks.length).toBe(1)
      const cooking = week.tasks[0]
      expect(cooking.servings).toBeGreaterThan(0)
      expect(cooking.cookedGrams).toBeGreaterThan(0)
      expect(cooking.ingredients.get('potato')).toBeCloseTo(200 * cooking.servings, 5)
    } finally {
      setCustomRecipes([])
    }
  })
})
