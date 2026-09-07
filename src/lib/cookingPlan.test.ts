import { describe, expect, it } from 'vitest'
import { RECIPE_BY_ID } from '../data/recipes'
import type { Eater, Household, Kitchen, RecipeStep, Station } from '../types'
import { buildWeekMenu } from './menu'
import { buildCookingPlans, scaledMinutes, scheduleSteps } from './cookingPlan'
import { deriveRecipeSteps } from './stepDetail'

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
    containers: 12,
    hasFreezer: true,
    ...patch,
  }
}

function household(patch: Partial<Household> = {}): Household {
  const eater: Eater = {
    id: 'e1',
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
  }
  return {
    eaters: [eater],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: kitchen(),
    budgetPerWeek: 0,
    drinks: [],
    weekStart: '2026-09-07',
    ...patch,
  }
}

function step0(patch: Partial<RecipeStep> = {}): RecipeStep {
  return {
    text: '',
    minutes: 10,
    station: 'prep',
    handsOn: true,
    activeMinutes: patch.minutes ?? 10,
    unattended: false,
    source: 'derived',
    ...patch,
  }
}

/** Задача расписания из «сырых» шагов: разметку выводим теми же правилами. */
function schedTask(
  index: number,
  recipeId: string,
  title: string,
  raw: { text: string; minutes: number; station: Station; handsOn: boolean }[],
) {
  const steps = deriveRecipeSteps(raw).map((step) => ({
    step,
    minutes: step.minutes,
    activeMinutes: step.activeMinutes,
  }))
  const remaining: number[] = new Array(steps.length).fill(0)
  for (let i = steps.length - 1; i >= 0; i--) remaining[i] = steps[i].minutes + (remaining[i + 1] ?? 0)
  return { index, recipeId, title, emoji: '', steps, remaining }
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

describe('scaledMinutes', () => {
  it('растягивает ручные шаги на количество порций', () => {
    const step = step0({ minutes: 10, station: 'prep', handsOn: true })
    expect(scaledMinutes(step, 1)).toBe(10)
    expect(scaledMinutes(step, 4)).toBe(19)
  })

  it('не растягивает ручную работу больше чем вдвое', () => {
    const step = step0({ minutes: 10, station: 'prep', handsOn: true })
    expect(scaledMinutes(step, 12)).toBe(20)
  })

  it('не трогает пассивное время', () => {
    const step = step0({ minutes: 25, station: 'stove', handsOn: false })
    expect(scaledMinutes(step, 4)).toBe(25)
  })
})

describe('buildCookingPlans', () => {
  const h = household()
  const { menu } = buildWeekMenu(h, 42)
  const plans = buildCookingPlans(menu, h)

  it('строит по плану на каждый день готовки', () => {
    expect(plans.map((p) => p.cookDay)).toEqual([0, 2, 6])
  })

  it('сохраняет порядок шагов внутри блюда', () => {
    for (const plan of plans) {
      const byRecipe = new Map<string, typeof plan.steps>()
      for (const step of plan.steps) {
        const arr = byRecipe.get(step.recipeId) ?? []
        arr.push(step)
        byRecipe.set(step.recipeId, arr)
      }
      for (const [recipeId, steps] of byRecipe) {
        const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex)
        expect(ordered).toEqual(steps.slice().sort((a, b) => a.start - b.start || a.stepIndex - b.stepIndex))
        for (let i = 1; i < ordered.length; i++) {
          expect(ordered[i].start).toBeGreaterThanOrEqual(ordered[i - 1].end)
        }
        expect(steps.length).toBe(RECIPE_BY_ID[recipeId].steps.length)
      }
    }
  })

  it('не заставляет повара делать два дела одновременно', () => {
    for (const plan of plans) {
      const hands = plan.steps.filter((s) => s.handsOn)
      for (let i = 0; i < hands.length; i++) {
        for (let j = i + 1; j < hands.length; j++) {
          expect(overlaps(hands[i], hands[j])).toBe(false)
        }
      }
    }
  })

  it('не превышает число конфорок и одну духовку', () => {
    const small = household({
      kitchen: kitchen({ burners: 2 }),
    })
    const smallPlans = buildCookingPlans(buildWeekMenu(small, 42).menu, small)
    for (const plan of smallPlans) {
      const points = [...new Set(plan.steps.map((s) => s.start))]
      for (const t of points) {
        const active = plan.steps.filter((s) => s.start <= t && t < s.end)
        expect(active.filter((s) => s.station === 'stove').length).toBeLessThanOrEqual(2)
        expect(active.filter((s) => s.station === 'oven').length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('экономит время за счёт параллельной готовки', () => {
    for (const plan of plans) {
      const sequential = plan.steps.reduce((s, step) => s + (step.end - step.start), 0)
      expect(plan.makespan).toBeLessThan(sequential)
      expect(plan.handsOnMinutes).toBeLessThanOrEqual(plan.makespan)
    }
  })

  it('раскладывает по морозилке порции, которые едят позже срока хранения', () => {
    const frozenEntries = menu.entries.filter((e) => e.storage === 'freezer')
    const planned = plans.flatMap((p) => p.freeze)
    for (const entry of frozenEntries) {
      expect(planned.some((f) => f.recipeId === entry.recipeId)).toBe(true)
    }
  })
})

describe('приборы как ресурс расписания', () => {
  /** Два блюда, каждое требует блендер на всё время. */
  const blenderTasks = () => [
    schedTask(0, 'soup_a', 'Суп А', [
      { text: 'Пробить блендером', minutes: 10, station: 'prep' as const, handsOn: false },
    ]),
    schedTask(1, 'soup_b', 'Суп Б', [
      { text: 'Пробить блендером', minutes: 10, station: 'prep' as const, handsOn: false },
    ]),
  ]

  it('не ставит два блюда в один блендер одновременно', () => {
    const result = scheduleSteps(blenderTasks(), kitchen({ hasBlender: true }))
    const [a, b] = result.steps
    // раньше блендер вообще не был ресурсом, и оба шага вставали в одну минуту
    expect(overlaps(a, b)).toBe(false)
    expect(result.makespan).toBe(20)
  })

  it('предупреждает, если нужного прибора нет в анкете', () => {
    const result = scheduleSteps(blenderTasks(), kitchen({ hasBlender: false }))
    expect(result.warnings.some((w) => w.includes('блендер'))).toBe(true)
  })

  it('две духовки запекают параллельно, одна — по очереди', () => {
    const ovenTasks = () => [
      schedTask(0, 'bake_a', 'Запеканка А', [
        { text: 'Запекать', minutes: 30, station: 'oven' as const, handsOn: false },
      ]),
      schedTask(1, 'bake_b', 'Запеканка Б', [
        { text: 'Запекать', minutes: 30, station: 'oven' as const, handsOn: false },
      ]),
    ]
    expect(scheduleSteps(ovenTasks(), kitchen({ ovens: 1 })).makespan).toBe(60)
    expect(scheduleSteps(ovenTasks(), kitchen({ ovens: 2 })).makespan).toBe(30)
  })

  it('конфорок хватает ровно на столько блюд, сколько их есть', () => {
    const stoveTasks = () =>
      [0, 1, 2].map((i) =>
        schedTask(i, `pot_${i}`, `Кастрюля ${i}`, [
          { text: 'Варить под крышкой', minutes: 20, station: 'stove' as const, handsOn: false },
        ]),
      )
    expect(scheduleSteps(stoveTasks(), kitchen({ burners: 3 })).makespan).toBe(20)
    expect(scheduleSteps(stoveTasks(), kitchen({ burners: 1 })).makespan).toBe(60)
  })
})

describe('занятые руки и присмотр', () => {
  const h = household()
  const { menu } = buildWeekMenu(h, 42)
  const plans = buildCookingPlans(menu, h)

  it('повар не может быть занят дольше, чем идёт готовка', () => {
    // ловушка: активные минуты параллельных шагов складывались, и «руки заняты»
    // выходило больше, чем вся готовка, — с одним поваром так не бывает
    for (const plan of plans) {
      expect(plan.handsOnMinutes).toBeLessThanOrEqual(plan.makespan)
    }
  })

  it('присмотр считается отдельно и не смешивается с занятыми руками', () => {
    for (const plan of plans) {
      expect(plan.attentionMinutes).toBeGreaterThanOrEqual(0)
      const stirring = plan.steps.filter((s) => !s.handsOn && s.activeMinutes > 0)
      if (stirring.length > 0) expect(plan.attentionMinutes).toBeGreaterThan(0)
    }
  })
})

describe('готовим вдвоём', () => {
  /** Три независимых блюда, каждое — только ручная работа по 20 минут. */
  const manualTasks = () =>
    [0, 1, 2].map((i) =>
      schedTask(i, `dish_${i}`, `Блюдо ${i}`, [
        { text: 'Нарезать и собрать', minutes: 20, station: 'prep' as const, handsOn: true },
      ]),
    )

  it('вдвоём ручная работа идёт параллельно', () => {
    const alone = scheduleSteps(manualTasks(), kitchen(), 1)
    const pair = scheduleSteps(manualTasks(), kitchen(), 2)
    expect(alone.makespan).toBe(60)
    expect(pair.makespan).toBe(40)
  })

  it('работы меньше не становится — она только делится', () => {
    const alone = scheduleSteps(manualTasks(), kitchen(), 1)
    const pair = scheduleSteps(manualTasks(), kitchen(), 2)
    // человеко-минуты те же самые: вдвоём быстрее, но не дешевле
    expect(pair.handsOnMinutes).toBe(alone.handsOnMinutes)
    expect(pair.perCookMinutes.reduce((s, m) => s + m, 0)).toBe(pair.handsOnMinutes)
  })

  it('каждый повар занят не дольше самой готовки', () => {
    // инвариант держится на каждом поваре, а не на сумме: вдвоём сумма
    // законно превышает длительность, и проверять её было бы ошибкой
    const pair = scheduleSteps(manualTasks(), kitchen(), 2)
    expect(pair.handsOnMinutes).toBeGreaterThan(pair.makespan)
    for (const minutes of pair.perCookMinutes) {
      expect(minutes).toBeLessThanOrEqual(pair.makespan)
    }
  })

  it('у каждого ручного шага есть исполнитель, у пассивного — нет', () => {
    const pair = scheduleSteps(manualTasks(), kitchen(), 2)
    for (const step of pair.steps) {
      expect(step.cook).not.toBeNull()
      expect(step.cook).toBeLessThan(2)
    }
    const oven = scheduleSteps(
      [
        schedTask(0, 'bake', 'Запеканка', [
          { text: 'Запекать', minutes: 30, station: 'oven' as const, handsOn: false },
        ]),
      ],
      kitchen(),
      2,
    )
    expect(oven.steps[0].cook).toBeNull()
  })

  it('вторая пара рук не ускоряет духовку', () => {
    const bake = () => [
      schedTask(0, 'bake_a', 'Запеканка А', [
        { text: 'Запекать', minutes: 30, station: 'oven' as const, handsOn: false },
      ]),
    ]
    expect(scheduleSteps(bake(), kitchen({ ovens: 1 }), 1).makespan).toBe(30)
    expect(scheduleSteps(bake(), kitchen({ ovens: 1 }), 2).makespan).toBe(30)
  })
})
