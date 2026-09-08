import { recipeById } from '../data/recipeRegistry'
import type { CookTask } from './menu'
import type { Household, Pantry, Recipe, RecipeBatch, WeekMenu } from '../types'
import { planBatch } from './batch'
import type { BatchOption, BatchPreference } from './batch'
import { drinkShopping } from './drinks'
import { extraShopping } from './extras'
import { cookTasks } from './menu'
import { cookedGrams } from './nutrition'
import { freezerRoomGrams } from './pantry'

/**
 * План недели — единственный расчёт готовки, который есть у приложения.
 *
 * Карточка блюда, список покупок, расписание готовки, отметка «приготовлено» и
 * симуляция спрашивают одно и то же: сколько ставим на плиту, сколько из этого
 * выйдет, куда денется и что для этого нужно купить. Пока каждый считал сам,
 * ответы расходились — и расходились правдоподобно, поэтому замечали их не по
 * ошибке в числе, а по тому, что два экрана про одну готовку говорят разное.
 *
 * Здесь этот ответ считается один раз. Ниже по течению не должно оставаться ни
 * одного места, которое выводит те же величины заново.
 */

/** Куда денется приготовленное. Берётся из партии, а не считается заново. */
export interface Placement {
  /** На тарелки по меню, г. */
  servedGrams: number
  /** В морозилку заготовкой, г. */
  freezeGrams: number
  /** Хвост на доесть в ближайшие дни, г. */
  tailGrams: number
  /** Ни туда, ни туда: места в морозилке нет, г. */
  unplacedGrams: number
}

export interface TaskPlan {
  /** Готовка: одно блюдо на все приёмы пищи, которые оно закрывает. */
  task: CookTask
  recipe: Recipe
  /** Производственная модель блюда: почему партия именно такая. */
  batch: RecipeBatch
  /** Выбранный размер партии. */
  chosen: BatchOption
  /** Остальные размеры — «изменить количество» в карточке. */
  alternatives: BatchOption[]
  /** Сколько долей рецепта ставим на плиту. */
  servings: number
  /** Сколько готового блюда нужно по меню, г. */
  neededGrams: number
  /** Сколько готового блюда выйдет, г. */
  cookedGrams: number
  placement: Placement
  /**
   * Сырьё на эту готовку: сколько чего уйдёт в кастрюлю.
   *
   * Это расход, а не покупка. Покупка сводится по всей неделе: две готовки по
   * 250 г — это одна пачка 500 г, а не две.
   */
  ingredients: Map<string, number>
}

export interface WeekPlan {
  tasks: TaskPlan[]
  /** Та же готовка по ключу задачи — для тех, кто пришёл с записью меню. */
  byKey: Map<string, TaskPlan>
  /**
   * Сколько какого продукта нужно на неделю всего: готовки, напитки, дополнения.
   * Сырьё, до кладовой и до упаковок.
   */
  demand: Map<string, number>
  /** Готовки, для которых не нашлось рецепта: молча терять их нельзя. */
  missing: string[]
}

export interface WeekPlanOptions {
  pantry?: Pantry
  prefer?: BatchPreference
  /** Свободное место в морозилке, г. По умолчанию считается по кладовой. */
  room?: number
}

/**
 * Партии считаются на всю неделю сразу — с одним общим местом в морозилке.
 *
 * Пока каждое блюдо планировалось само по себе, все они видели одну и ту же
 * полку: шесть готовок за неделю рассчитывали убрать излишек в одни и те же
 * свободные 600 г. Порознь каждый расчёт был верен, вместе — обещали морозилку
 * вшестеро больше настоящей.
 *
 * Место — общий ресурс, и делится оно в порядке готовки: во вторник полка ещё
 * свободна, к субботе на ней уже лежит вторник.
 */
export function planWeek(
  menu: WeekMenu,
  household: Household,
  options: WeekPlanOptions = {},
): WeekPlan {
  const cached = fromCache(menu, household, options)
  if (cached) return cached

  const tasks: TaskPlan[] = []
  const byKey = new Map<string, TaskPlan>()
  const demand = new Map<string, number>()
  const missing: string[] = []
  const need = (id: string, qty: number) => demand.set(id, (demand.get(id) ?? 0) + qty)

  let room = options.room ?? freezerRoomGrams(household.kitchen, options.pantry)
  // cookTasks уже отсортированы по дню готовки
  for (const task of cookTasks(menu)) {
    const recipe = recipeById(task.recipeId)
    if (!recipe) {
      missing.push(task.recipeId)
      continue
    }
    const neededGrams = cookedGrams(recipe, task.portions)
    const batchPlan = planBatch(recipe, {
      neededGrams,
      hasFreezer: household.kitchen.hasFreezer,
      freezerRoomGrams: room,
      prefer: options.prefer,
    })
    if (!batchPlan) {
      // Рецепт без производственной модели — дефект данных: её дописывает
      // normalizeRecipe и встроенным, и своим. Молча считать такую готовку по
      // потребности меню нельзя: это и был тот запасной путь, из-за которого
      // своё блюдо считалось иначе, чем встроенное.
      missing.push(task.recipeId)
      continue
    }
    const ingredients = new Map<string, number>()
    for (const item of recipe.items) {
      const qty = item.qty * batchPlan.chosen.servings
      ingredients.set(item.ingredientId, (ingredients.get(item.ingredientId) ?? 0) + qty)
      need(item.ingredientId, qty)
    }
    const plan: TaskPlan = {
      task,
      recipe,
      batch: batchPlan.batch,
      chosen: batchPlan.chosen,
      alternatives: batchPlan.alternatives,
      servings: batchPlan.chosen.servings,
      neededGrams,
      cookedGrams: batchPlan.chosen.yieldGrams,
      placement: {
        servedGrams: batchPlan.chosen.servedGrams,
        freezeGrams: batchPlan.chosen.freezeGrams,
        tailGrams: batchPlan.chosen.tailGrams,
        unplacedGrams: batchPlan.chosen.unplacedGrams,
      },
      ingredients,
    }
    tasks.push(plan)
    byKey.set(task.key, plan)
    room = Math.max(0, room - batchPlan.chosen.freezeGrams)
  }

  // Напитки и дополнения — не блюда, но молоко для капучино покупать всё равно
  // нужно, и покупает его тот же список.
  for (const source of [drinkShopping(household), extraShopping(household)]) {
    for (const [id, qty] of source) need(id, qty)
  }

  const result: WeekPlan = { tasks, byKey, demand, missing }
  toCache(menu, household, options, result)
  return result
}

/*
 * Карточку, список покупок и план готовки рисуют рядом, и каждый спрашивает
 * план недели заново. Считать его по три раза на кадр незачем — меню за это
 * время не меняется.
 */
const cache = new WeakMap<WeekMenu, { sig: string; plan: WeekPlan }>()

function signature(household: Household, options: WeekPlanOptions): string {
  const busy = (options.pantry?.freezer ?? []).reduce((sum, f) => sum + f.containers, 0)
  return [
    household.kitchen.hasFreezer,
    household.kitchen.containers,
    busy,
    options.prefer ?? 'cost',
    options.room ?? '',
    household.drinks.length,
    household.extras.length,
  ].join('|')
}

function fromCache(
  menu: WeekMenu,
  household: Household,
  options: WeekPlanOptions,
): WeekPlan | null {
  const hit = cache.get(menu)
  return hit && hit.sig === signature(household, options) ? hit.plan : null
}

function toCache(
  menu: WeekMenu,
  household: Household,
  options: WeekPlanOptions,
  plan: WeekPlan,
): void {
  cache.set(menu, { sig: signature(household, options), plan })
}
