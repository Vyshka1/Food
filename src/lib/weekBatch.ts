import { recipeById } from '../data/recipeRegistry'
import type { Household, Pantry, WeekMenu } from '../types'
import { planBatch } from './batch'
import type { BatchPlan, BatchPreference } from './batch'
import { cookTasks } from './menu'
import { cookedGrams } from './nutrition'
import { freezerRoomGrams } from './pantry'

export interface WeekBatchOptions {
  pantry?: Pantry
  prefer?: BatchPreference
  /** Свободное место в морозилке, г. По умолчанию считается по кладовой. */
  room?: number
}

/**
 * Партии на всю неделю сразу — с одним общим местом в морозилке.
 *
 * Пока каждое блюдо планировалось само по себе, все они видели одну и ту же
 * полку: шесть готовок за неделю рассчитывали убрать излишек в одни и те же
 * свободные 600 г. Порознь каждый расчёт был верен, вместе — обещали морозилку
 * вшестеро больше настоящей, и в симуляции набегал килограмм готовой еды в
 * неделю, которую некуда деть.
 *
 * Место — общий ресурс, и делится оно в порядке готовки: во вторник полка ещё
 * свободна, к субботе на ней уже лежит вторник. Кто готовится позже, тот и
 * считает партию по остатку места — обычно это значит партию поменьше.
 */
export function planWeekBatches(
  menu: WeekMenu,
  household: Household,
  options: WeekBatchOptions = {},
): Map<string, BatchPlan> {
  const cached = fromCache(menu, household, options)
  if (cached) return cached
  const plans = new Map<string, BatchPlan>()
  let room = options.room ?? freezerRoomGrams(household.kitchen, options.pantry)
  // cookTasks уже отсортированы по дню готовки
  for (const task of cookTasks(menu)) {
    const recipe = recipeById(task.recipeId)
    if (!recipe) continue
    const plan = planBatch(recipe, {
      neededGrams: cookedGrams(recipe, task.portions),
      hasFreezer: household.kitchen.hasFreezer,
      freezerRoomGrams: room,
      prefer: options.prefer,
    })
    if (!plan) continue
    plans.set(task.key, plan)
    room = Math.max(0, room - plan.chosen.freezeGrams)
  }
  toCache(menu, household, options, plans)
  return plans
}

/** Сколько долей рецепта ставится на плиту — с учётом партии. */
export function weekServings(
  plans: Map<string, BatchPlan>,
  task: { key: string; portions: number },
): number {
  return plans.get(task.key)?.chosen.servings ?? task.portions
}

/*
 * Карточку, список покупок и план готовки рисуют рядом, и каждый спрашивает
 * партии заново. Считать их по три раза на кадр незачем — меню за это время
 * не меняется.
 */
const cache = new WeakMap<WeekMenu, { sig: string; plans: Map<string, BatchPlan> }>()

function signature(household: Household, options: WeekBatchOptions): string {
  const busy = (options.pantry?.freezer ?? []).reduce((sum, f) => sum + f.containers, 0)
  return [
    household.kitchen.hasFreezer,
    household.kitchen.containers,
    busy,
    options.prefer ?? 'cost',
    options.room ?? '',
  ].join('|')
}

function fromCache(
  menu: WeekMenu,
  household: Household,
  options: WeekBatchOptions,
): Map<string, BatchPlan> | null {
  const hit = cache.get(menu)
  return hit && hit.sig === signature(household, options) ? hit.plans : null
}

function toCache(
  menu: WeekMenu,
  household: Household,
  options: WeekBatchOptions,
  plans: Map<string, BatchPlan>,
): void {
  cache.set(menu, { sig: signature(household, options), plans })
}
