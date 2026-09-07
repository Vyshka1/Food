import { describe, expect, it } from 'vitest'
import { recipeById } from '../data/recipeRegistry'
import type { Eater, Household, Kitchen } from '../types'
import { planBatch } from './batch'
import { buildWeekMenu, cookTasks, defaultRepeats } from './menu'
import { cookedGrams } from './nutrition'
import { CONTAINER_GRAMS, freezerRoomGrams } from './pantry'
import { defaultOils } from './oil'
import { planWeekBatches } from './weekBatch'

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
      const plans = planWeekBatches(menu, household)
      const total = [...plans.values()].reduce((sum, p) => sum + p.chosen.freezeGrams, 0)
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
    const plans = planWeekBatches(menu, household)
    const tasks = cookTasks(menu).filter((t) => plans.has(t.key))
    expect(tasks.length).toBeGreaterThan(3)
    // дни готовки идут по возрастанию, и место кончается по ходу недели
    let left = room
    for (const task of tasks) {
      const plan = plans.get(task.key)!
      expect(plan.chosen.freezeGrams, task.recipeId).toBeLessThanOrEqual(left)
      left -= plan.chosen.freezeGrams
    }
  })

  it('без морозилки в морозилку ничего не уходит', () => {
    const noFreezer = { ...household, kitchen: { ...kitchen, hasFreezer: false } }
    const { menu } = buildWeekMenu(noFreezer, 3)
    const plans = planWeekBatches(menu, noFreezer)
    for (const plan of plans.values()) expect(plan.chosen.freezeGrams).toBe(0)
  })

  it('занятая морозилка оставляет меньше места', () => {
    const { menu } = buildWeekMenu(household, 5)
    const empty = planWeekBatches(menu, household)
    const full = planWeekBatches(menu, household, {
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
    const sum = (plans: ReturnType<typeof planWeekBatches>) =>
      [...plans.values()].reduce((s, p) => s + p.chosen.freezeGrams, 0)
    expect(sum(empty)).toBeGreaterThan(0)
    expect(sum(full)).toBe(0)
    expect(freezerRoomGrams(kitchen)).toBe(kitchen.containers * CONTAINER_GRAMS)
  })
})
