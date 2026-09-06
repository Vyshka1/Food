import { recipeById } from '../data/recipeRegistry'
import type { CookingPlan, FreezeTask, Household, PlannedStep, RecipeStep, WeekMenu } from '../types'
import { WEEKDAYS_FULL, cookTasks, type CookTask } from './menu'

/**
 * Длительность шага с поправкой на количество порций: ручная работа растёт
 * сублинейно (нарезать 4 порции ≈ ×1.9) и не больше чем вдвое — большая
 * кастрюля не отнимает вдвое больше времени. Пассивное время не меняется.
 */
export function scaledMinutes(step: RecipeStep, portions: number): number {
  const isManual = step.handsOn || step.station === 'prep'
  if (!isManual) return step.minutes
  const factor = Math.min(2, 0.7 + 0.3 * Math.max(1, portions))
  return Math.max(1, Math.round(step.minutes * factor))
}

interface SchedTask {
  index: number
  recipeId: string
  title: string
  emoji: string
  steps: { step: RecipeStep; minutes: number }[]
  /** Сколько минут осталось от шага i до конца. */
  remaining: number[]
}

interface Running {
  task: number
  stepIndex: number
  end: number
  usesCook: boolean
  usesBurner: boolean
  usesOven: boolean
}

export interface ScheduleResult {
  steps: PlannedStep[]
  makespan: number
  handsOnMinutes: number
  maxParallel: number
  warnings: string[]
}

/**
 * Списочное расписание с ограниченными ресурсами: один повар, N конфорок,
 * одна духовка. Пока что-то тушится, руки заняты следующим блюдом.
 */
export function scheduleSteps(tasks: SchedTask[], burners: number, ovens: number): ScheduleResult {
  const planned: PlannedStep[] = []
  const warnings: string[] = []
  const nextStep = tasks.map(() => 0)
  const running: Running[] = []
  let time = 0
  let cookBusy = false
  let burnersUsed = 0
  let ovensUsed = 0
  let handsOnMinutes = 0
  let forced = false

  const needs = (task: SchedTask, stepIndex: number) => {
    const { step } = task.steps[stepIndex]
    return {
      cook: step.handsOn,
      burner: step.station === 'stove',
      oven: step.station === 'oven',
    }
  }

  const readyTasks = () =>
    tasks
      .filter((t) => nextStep[t.index] < t.steps.length && !running.some((r) => r.task === t.index))
      .sort((a, b) => b.remaining[nextStep[b.index]] - a.remaining[nextStep[a.index]])

  const start = (task: SchedTask, force = false) => {
    const stepIndex = nextStep[task.index]
    const { step, minutes } = task.steps[stepIndex]
    const need = needs(task, stepIndex)
    if (!force) {
      if (need.cook && cookBusy) return false
      if (need.burner && burnersUsed >= burners) return false
      if (need.oven && ovensUsed >= ovens) return false
    }
    if (need.cook) cookBusy = true
    if (need.burner) burnersUsed++
    if (need.oven) ovensUsed++
    if (need.cook) handsOnMinutes += minutes
    planned.push({
      recipeId: task.recipeId,
      title: task.title,
      emoji: task.emoji,
      stepIndex,
      text: step.text,
      station: step.station,
      handsOn: step.handsOn,
      start: time,
      end: time + minutes,
    })
    running.push({
      task: task.index,
      stepIndex,
      end: time + minutes,
      usesCook: need.cook,
      usesBurner: need.burner,
      usesOven: need.oven,
    })
    return true
  }

  let guard = 0
  while (
    (tasks.some((t) => nextStep[t.index] < t.steps.length) || running.length > 0) &&
    guard++ < 10000
  ) {
    let startedSomething = true
    while (startedSomething) {
      startedSomething = false
      for (const task of readyTasks()) {
        if (start(task)) startedSomething = true
      }
    }

    if (running.length === 0) {
      // ресурсов не хватает даже на один шаг — ставим по одному, последовательно
      const stuck = readyTasks()[0]
      if (!stuck) break
      if (!forced) {
        warnings.push('Кухня загружена: часть шагов пришлось поставить подряд, а не параллельно.')
        forced = true
      }
      start(stuck, true)
    }

    const nextEnd = Math.min(...running.map((r) => r.end))
    time = nextEnd
    for (let i = running.length - 1; i >= 0; i--) {
      const run = running[i]
      if (run.end > time) continue
      if (run.usesCook) cookBusy = false
      if (run.usesBurner) burnersUsed--
      if (run.usesOven) ovensUsed--
      nextStep[run.task] = run.stepIndex + 1
      running.splice(i, 1)
    }
  }

  const makespan = planned.reduce((max, s) => Math.max(max, s.end), 0)
  planned.sort((a, b) => a.start - b.start || a.end - b.end)
  const maxParallel = planned.reduce((max, step) => {
    const at = planned.filter((s) => s.start <= step.start && step.start < s.end).length
    return Math.max(max, at)
  }, 0)
  return { steps: planned, makespan, handsOnMinutes, maxParallel, warnings }
}

function toSchedTask(task: CookTask, index: number): SchedTask | null {
  const recipe = recipeById(task.recipeId)
  if (!recipe) return null
  const portions = task.servings * task.scale
  const steps = recipe.steps.map((step) => ({ step, minutes: scaledMinutes(step, portions) }))
  const remaining: number[] = new Array(steps.length).fill(0)
  for (let i = steps.length - 1; i >= 0; i--) {
    remaining[i] = steps[i].minutes + (remaining[i + 1] ?? 0)
  }
  return {
    index,
    recipeId: recipe.id,
    title: recipe.title,
    emoji: recipe.emoji,
    steps,
    remaining,
  }
}

export function buildCookingPlans(menu: WeekMenu, household: Household): CookingPlan[] {
  const byDay = new Map<number, CookTask[]>()
  for (const task of cookTasks(menu)) {
    const list = byDay.get(task.cookDay) ?? []
    list.push(task)
    byDay.set(task.cookDay, list)
  }

  const burners = Math.max(1, household.kitchen.burners)
  const ovens = household.kitchen.hasOven ? 1 : 0

  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cookDay, tasks]) => {
      const sched = tasks
        .map((task, i) => toSchedTask(task, i))
        .filter((t): t is SchedTask => t !== null)
      const result = scheduleSteps(sched, burners, ovens)

      const freeze: FreezeTask[] = tasks
        .filter((t) => t.freezerPortions > 0)
        .map((t) => ({
          recipeId: t.recipeId,
          title: recipeById(t.recipeId)?.title ?? t.recipeId,
          portions: t.freezerPortions,
          eatOnDays: [...t.eatDays].sort((a, b) => a - b),
        }))

      const warnings = [...result.warnings]
      const containersNeeded = tasks.reduce((s, t) => s + Math.max(0, t.eatDays.length - 1), 0)
      if (household.kitchen.containers > 0 && containersNeeded > household.kitchen.containers) {
        warnings.push(
          `Нужно контейнеров: ${containersNeeded}, а указано ${household.kitchen.containers}. Часть придётся хранить в кастрюле.`,
        )
      }
      if (freeze.length > 0 && !household.kitchen.hasFreezer) {
        warnings.push('В анкете нет морозилки, а часть порций рассчитана на заморозку.')
      }
      // четыре часа безостановочной работы руками — это не план, а испытание
      if (result.handsOnMinutes > 150) {
        warnings.push(
          `Активной работы ${formatDuration(result.handsOnMinutes)} почти без пауз. Стоит добавить ещё один день готовки — тогда блюда разойдутся по двум дням.`,
        )
      }

      const coversDays = [...new Set(tasks.flatMap((t) => t.eatDays))].sort((a, b) => a - b)

      return {
        cookDay,
        dishes: tasks.map((t) => ({
          recipeId: t.recipeId,
          title: recipeById(t.recipeId)?.title ?? t.recipeId,
          emoji: recipeById(t.recipeId)?.emoji ?? '🍽️',
          servings: t.servings,
          scale: t.scale,
        })),
        steps: result.steps,
        makespan: result.makespan,
        handsOnMinutes: result.handsOnMinutes,
        maxParallel: result.maxParallel,
        freeze,
        coversDays,
        warnings,
      }
    })
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} мин`
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
}

export function cookDayLabel(day: number): string {
  return WEEKDAYS_FULL[day] ?? ''
}
