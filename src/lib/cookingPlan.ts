import { recipeById } from '../data/recipeRegistry'
import type {
  Appliance,
  CookingPlan,
  FreezeTask,
  Household,
  Kitchen,
  PackTask,
  Pantry,
  PlannedStep,
  RecipeStep,
  WeekMenu,
} from '../types'
import { APPLIANCE_LABEL, applianceCapacity } from '../types'
import { WEEKDAYS_FULL, cookTasks, type CookTask } from './menu'
import { containerLabel, useByDate } from './freezing'
import { thawReminders } from './thaw'
import { FRY_STEP, optionPieces } from './batch'
import { planWeek } from './weekPlan'
import { fryMinutes, pieceCookingOf, useTwoPans } from './pieces'

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

/**
 * Активные минуты шага с той же поправкой на порции. Растёт только ручная
 * часть: духовка печёт двойную порцию столько же, а нарезать нужно вдвое
 * больше.
 */
export function scaledActiveMinutes(step: RecipeStep, portions: number): number {
  const active = step.activeMinutes ?? (step.handsOn ? step.minutes : 0)
  if (active === 0) return 0
  const factor = Math.min(2, 0.7 + 0.3 * Math.max(1, portions))
  return Math.min(scaledMinutes(step, portions), Math.max(1, Math.round(active * factor)))
}

interface SchedTask {
  index: number
  recipeId: string
  title: string
  emoji: string
  steps: { step: RecipeStep; minutes: number; activeMinutes: number }[]
  /** Сколько минут осталось от шага i до конца. */
  remaining: number[]
}

interface Running {
  task: number
  stepIndex: number
  end: number
  /** Индекс повара, занятого этим шагом, либо null. */
  cook: number | null
  appliance?: Appliance
}

export interface ScheduleResult {
  steps: PlannedStep[]
  makespan: number
  /** Минуты, когда повар занят целиком и ничем другим заняться не может. */
  handsOnMinutes: number
  /**
   * Присмотр поверх этого: помешать, перевернуть, заглянуть в кастрюлю. Такие
   * минуты идут параллельно другим делам, поэтому складывать их с handsOn
   * нельзя — сумма легко превысила бы всё время готовки, чего с одним поваром
   * не бывает.
   */
  attentionMinutes: number
  /**
   * Занятые минуты каждого повара по отдельности. handsOnMinutes — их сумма,
   * то есть работа в человеко-минутах: вдвоём её делают за меньшее время, но
   * меньше её не становится. Инвариант «не больше длительности готовки»
   * держится для каждого повара, а не для суммы.
   */
  perCookMinutes: number[]
  maxParallel: number
  warnings: string[]
}

/**
 * Списочное расписание с ограниченными ресурсами: один повар и приборы кухни.
 * Каждый прибор — отдельный ресурс со своей ёмкостью: четыре конфорки, две
 * духовки, один блендер. Раньше блендер вообще не был ресурсом, и план мог
 * поставить два блендерных шага в одну минуту — красиво и невыполнимо.
 */
export function scheduleSteps(
  tasks: SchedTask[],
  kitchen: Kitchen,
  cooks = 1,
): ScheduleResult {
  const planned: PlannedStep[] = []
  const warnings: string[] = []
  const nextStep = tasks.map(() => 0)
  const running: Running[] = []
  let time = 0
  /** Кто из поваров сейчас занят: индекс → занят. Вдвоём готовят вдвое быстрее
   * только там, где работа ручная; духовка от второй пары рук не ускоряется. */
  const cookBusy = new Array<boolean>(Math.max(1, cooks)).fill(false)
  const perCookMinutes = new Array<number>(Math.max(1, cooks)).fill(0)
  const used = new Map<Appliance, number>()
  let handsOnMinutes = 0
  let attentionMinutes = 0
  let forced = false
  const missing = new Set<Appliance>()

  const capacityOf = (appliance: Appliance): number => {
    const capacity = applianceCapacity(kitchen, appliance)
    if (capacity > 0) return capacity
    // прибора нет: шаг всё равно надо куда-то поставить, но честно предупредить
    missing.add(appliance)
    return 1
  }

  const needs = (task: SchedTask, stepIndex: number) => {
    const { step } = task.steps[stepIndex]
    return { cook: step.handsOn, appliance: step.appliance }
  }

  const readyTasks = () =>
    tasks
      .filter((t) => nextStep[t.index] < t.steps.length && !running.some((r) => r.task === t.index))
      .sort((a, b) => b.remaining[nextStep[b.index]] - a.remaining[nextStep[a.index]])

  const start = (task: SchedTask, force = false) => {
    const stepIndex = nextStep[task.index]
    const { step, minutes, activeMinutes } = task.steps[stepIndex]
    const need = needs(task, stepIndex)
    const freeCook = cookBusy.indexOf(false)
    if (!force) {
      if (need.cook && freeCook === -1) return false
      if (need.appliance && (used.get(need.appliance) ?? 0) >= capacityOf(need.appliance)) {
        return false
      }
    }
    // при force свободного повара может не быть — тогда шаг всё равно ставим,
    // но записываем его на первого: расписание уже помечено вынужденным
    const cookIndex = need.cook ? (freeCook === -1 ? 0 : freeCook) : null
    if (cookIndex !== null) cookBusy[cookIndex] = true
    if (need.appliance) used.set(need.appliance, (used.get(need.appliance) ?? 0) + 1)
    // повар — исключительный ресурс, поэтому занятые руки считаем только по
    // шагам, которые его держат. «Варить, помешивая» идёт параллельно другим
    // делам и попадает в присмотр
    if (cookIndex !== null) {
      handsOnMinutes += minutes
      perCookMinutes[cookIndex] += minutes
    } else {
      attentionMinutes += activeMinutes
    }
    planned.push({
      recipeId: task.recipeId,
      title: task.title,
      emoji: task.emoji,
      stepIndex,
      text: step.text,
      station: step.station,
      handsOn: step.handsOn,
      activeMinutes,
      appliance: step.appliance,
      tempC: step.tempC,
      unattended: step.unattended,
      cook: cookIndex,
      start: time,
      end: time + minutes,
    })
    running.push({
      task: task.index,
      stepIndex,
      end: time + minutes,
      cook: cookIndex,
      appliance: need.appliance,
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
      if (run.cook !== null) cookBusy[run.cook] = false
      if (run.appliance) used.set(run.appliance, Math.max(0, (used.get(run.appliance) ?? 1) - 1))
      nextStep[run.task] = run.stepIndex + 1
      running.splice(i, 1)
    }
  }

  for (const appliance of missing) {
    warnings.push(
      `В анкете нет прибора «${APPLIANCE_LABEL[appliance]}», а он нужен по рецепту — план считает, что он один.`,
    )
  }

  const makespan = planned.reduce((max, s) => Math.max(max, s.end), 0)
  planned.sort((a, b) => a.start - b.start || a.end - b.end)
  const maxParallel = planned.reduce((max, step) => {
    const at = planned.filter((s) => s.start <= step.start && step.start < s.end).length
    return Math.max(max, at)
  }, 0)
  return {
    steps: planned,
    makespan,
    handsOnMinutes,
    attentionMinutes,
    perCookMinutes,
    maxParallel,
    warnings,
  }
}

function toSchedTask(
  task: CookTask,
  index: number,
  household?: Household,
  pieces?: number,
): SchedTask | null {
  const recipe = recipeById(task.recipeId)
  if (!recipe) return null
  const portions = task.portions
  /*
   * У штучного блюда жарка занимает не «время рецепта × коэффициент», а число
   * заходов на время захода: на сковороде помещается пять оладий, и тридцать
   * штук — это шесть заходов. Прежняя поправка упиралась в двойное время и
   * обещала полчаса работы там, где её на час.
   */
  const cooking = pieceCookingOf(recipe)
  const pans =
    cooking && pieces && household && useTwoPans(pieces, cooking, household.kitchen) ? 2 : 1
  const steps = recipe.steps.map((step) => {
    if (cooking && pieces && FRY_STEP.test(step.text)) {
      const minutes = fryMinutes(pieces, cooking, pans)
      return { step, minutes, activeMinutes: minutes }
    }
    return {
      step,
      minutes: scaledMinutes(step, portions),
      activeMinutes: scaledActiveMinutes(step, portions),
    }
  })
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

export function buildCookingPlans(
  menu: WeekMenu,
  household: Household,
  cooks = 1,
  pantry?: Pantry,
): CookingPlan[] {
  // Партии берём из общего плана недели — те же самые, что показывает карточка
  const week = planWeek(menu, household, { pantry })
  const byDay = new Map<number, CookTask[]>()
  for (const task of cookTasks(menu)) {
    const list = byDay.get(task.cookDay) ?? []
    list.push(task)
    byDay.set(task.cookDay, list)
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cookDay, tasks]) => {
      const sched = tasks
        .map((task, i) => {
          const plan = week.byKey.get(task.key)
          const pieces = plan ? optionPieces(plan.batch, plan.chosen.scale) : undefined
          return toSchedTask(task, i, household, pieces)
        })
        .filter((t): t is SchedTask => t !== null)
      const result = scheduleSteps(sched, household.kitchen, cooks)

      // дата готовки нужна, чтобы посчитать срок годности для этикетки
      const cookedOn = new Date(menu.weekStart)
      cookedOn.setDate(cookedOn.getDate() + cookDay)

      const freeze: FreezeTask[] = tasks
        .filter((t) => t.freezerPortions > 0)
        .map((t) => {
          const recipe = recipeById(t.recipeId)
          const title = recipe?.title ?? t.recipeId
          const info = recipe?.freezing
          const containers = Math.max(1, Math.round(t.freezerPortions))
          const useBy = useByDate(cookedOn, info?.days ?? 30)
          return {
            recipeId: t.recipeId,
            title,
            portions: t.freezerPortions,
            eatOnDays: [...t.eatDays].sort((a, b) => a - b),
            containers,
            stage: info?.stage ?? 'cooked',
            afterStep: info?.afterStep,
            thaw: info?.thaw ?? 'fridge',
            thawHours: info?.thawHours ?? 12,
            useBy: useBy.toISOString().slice(0, 10),
            label: containerLabel(title, containers, useBy),
          }
        })

      const thaw = thawReminders(menu).filter((r) =>
        tasks.some((t) => t.recipeId === r.recipeId),
      )

      // Раскладывание — отдельный шаг после готовки. Контейнер нужен на каждый
      // день, кроме сегодняшнего: сегодня едят с тарелки.
      const pack: PackTask[] = tasks
        .map((t) => {
          const later = t.eatDays.filter((d) => d !== cookDay).sort((a, b) => a - b)
          return {
            recipeId: t.recipeId,
            title: recipeById(t.recipeId)?.title ?? t.recipeId,
            containers: later.length,
            forDays: later,
          }
        })
        .filter((t) => t.containers > 0)

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
          portions: t.portions,
        })),
        steps: result.steps,
        makespan: result.makespan,
        handsOnMinutes: result.handsOnMinutes,
        attentionMinutes: result.attentionMinutes,
        perCookMinutes: result.perCookMinutes,
        maxParallel: result.maxParallel,
        freeze,
        pack,
        thaw,
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
