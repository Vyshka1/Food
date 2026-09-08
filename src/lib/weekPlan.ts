import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { CookTask } from './menu'
import type { Household, Pantry, Recipe, RecipeBatch, WeekMenu } from '../types'
import { planBatch } from './batch'
import type { BatchOption, BatchPreference } from './batch'
import { drinkShopping } from './drinks'
import { extraShopping } from './extras'
import { cookTasks } from './menu'
import { cookedGrams, statsOf } from './nutrition'
import type { RecipeStats } from './nutrition'
import { freezerRoomGrams, isAlways, stockOf } from './pantry'
import { absorbable, packPlan } from './purchase'

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
   * Это фактический расход, а не потребность по составу: штучное считается
   * целыми штуками, и сюда же попадают пристроенные хвосты упаковок. И это не
   * покупка — покупка сводится по всей неделе: две готовки по 250 г это одна
   * пачка 500 г, а не две.
   */
  ingredients: Map<string, number>
  /** Сколько чего досыпано сверх состава: остаток упаковки и целые штуки. */
  absorbed: Map<string, number>
  /** КБЖУ и цена всего, что уйдёт в кастрюлю. Считается по ingredients. */
  stats: RecipeStats
}

/**
 * Что купить на неделю по одному продукту.
 *
 * Фасовка решается один раз и на всю неделю: две готовки по 250 г — это одна
 * пачка 500 г, а не две. Пока каждая готовка считала упаковки сама, карточка
 * блюда и список покупок расходились на каждой шестнадцатой строке, а на мясе
 * ещё и по-разному выбирали фасовку.
 */
export interface PurchaseLine {
  ingredientId: string
  /** Сколько нужно на неделю всего, сырьё, до кладовой. */
  needed: number
  /** Сколько из этого закрыто запасом дома. */
  fromStock: number
  /** Сколько докупить по бытовой мере: целая штука, десяток граммов. */
  toBuy: number
  /** Сколько придётся купить с учётом фасовки. */
  buy: number
  /** Крупнейшая из взятых фасовок. 0 — продаётся на вес. */
  packSize: number
  /** Сколько упаковок всего. */
  packs: number
  /** Из каких фасовок сложилась покупка: размеры можно смешивать. */
  parts: { size: number; count: number }[]
  /** Что останется от упаковок после недели. */
  leftover: number
  /** Цена покупки, ₽. */
  price: number
  /** Постоянный продукт: в чек не идёт. */
  staple: boolean
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
  /** Что купить на неделю: одно решение о фасовке на продукт. */
  purchase: Map<string, PurchaseLine>
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
  const cooking = cookingFor(menu, household, options)
  /*
   * Покупка считается каждый раз, а не берётся из кэша: она зависит от запасов
   * дома, а готовка — нет. Один общий кэш на то и другое означал бы, что список
   * покупок не замечает, как разложили пакеты, — и он действительно не замечал,
   * пока покупка сюда не переехала.
   */
  /*
   * Готовки копируем, а не правим на месте: они лежат в кэше, а пристраивание
   * хвостов их меняет. Иначе второй вызов на то же меню досыпал бы остаток
   * упаковки ещё раз — и так на каждый кадр.
   */
  const tasks = cooking.tasks.map((task) => ({
    ...task,
    ingredients: new Map(task.ingredients),
    absorbed: new Map(task.absorbed),
  }))
  const demand = new Map(cooking.demand)
  const purchase = purchaseFor(demand, options.pantry)
  return absorbTails({
    tasks,
    byKey: new Map(tasks.map((t) => [t.task.key, t])),
    demand,
    purchase,
    missing: cooking.missing,
  })
}

/**
 * Досыпать мелкие хвосты упаковок в блюда.
 *
 * Двадцать граммов муки некуда девать, а в тесте они растворятся. Но хвост
 * один, а блюд с этим продуктом за неделю бывает несколько: пока каждая
 * карточка решала это сама, один и тот же остаток попадал в состав двух блюд
 * сразу — и калории дважды.
 *
 * Поэтому хвост достаётся ровно одной готовке — той, что берёт продукта
 * больше всех: там он и правда растворится. И он списывается: положили в
 * блюдо — значит, продукт израсходован, а КБЖУ пересчитаны.
 */
function absorbTails(plan: WeekPlan): WeekPlan {
  const changed = new Set<TaskPlan>()
  for (const [ingredientId, line] of plan.purchase) {
    const ing = INGREDIENT_BY_ID[ingredientId]
    if (!ing || ing.unit === 'pcs') continue
    const leftover = line.buy + line.fromStock - line.needed
    if (!absorbable(ing, leftover, line.packSize || line.buy)) continue
    let best: TaskPlan | null = null
    for (const task of plan.tasks) {
      const qty = task.ingredients.get(ingredientId)
      if (!qty) continue
      if (!best || qty > (best.ingredients.get(ingredientId) ?? 0)) best = task
    }
    if (!best) continue
    best.ingredients.set(ingredientId, (best.ingredients.get(ingredientId) ?? 0) + leftover)
    best.absorbed.set(ingredientId, (best.absorbed.get(ingredientId) ?? 0) + leftover)
    plan.demand.set(ingredientId, (plan.demand.get(ingredientId) ?? 0) + leftover)
    changed.add(best)
  }
  for (const task of changed) {
    task.stats = statsOf([...task.ingredients].map(([ingredientId, qty]) => ({ ingredientId, qty })))
  }
  return plan
}

/** Готовки недели: то, что не зависит от запасов и потому кэшируется. */
type WeekCooking = Omit<WeekPlan, 'purchase'>

function cookingFor(
  menu: WeekMenu,
  household: Household,
  options: WeekPlanOptions,
): WeekCooking {
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
    /*
     * Штучное считается целыми штуками: половину банана в кастрюлю не кладут и
     * половину луковицы обратно в холодильник не убирают. Округляем здесь, на
     * уровне готовки, а не в карточке: иначе покупка считает 1.6 банана, а две
     * карточки показывают по одному целому — и на кухне не хватает.
     */
    const ingredients = new Map<string, number>()
    const absorbed = new Map<string, number>()
    for (const item of recipe.items) {
      const ing = INGREDIENT_BY_ID[item.ingredientId]
      const exact = item.qty * batchPlan.chosen.servings
      const qty = ing?.unit === 'pcs' ? Math.ceil(exact - 1e-9) : exact
      ingredients.set(item.ingredientId, (ingredients.get(item.ingredientId) ?? 0) + qty)
      if (qty > exact) absorbed.set(item.ingredientId, qty - exact)
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
      absorbed,
      stats: statsOf([...ingredients].map(([ingredientId, qty]) => ({ ingredientId, qty }))),
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

  const result: WeekCooking = { tasks, byKey, demand, missing }
  toCache(menu, household, options, result)
  return result
}

/**
 * Покупка: сначала свести потребность всей недели, потом решить про упаковки.
 *
 * Порядок здесь и есть смысл: расход считается по готовкам, а фасовка — по
 * неделе. Если решать про упаковки на уровне готовки, две готовки по 250 г
 * превращаются в две пачки, хотя на неделю нужна одна.
 */
export function purchaseFor(
  demand: Map<string, number>,
  pantry: Pantry | undefined,
): Map<string, PurchaseLine> {
  const lines = new Map<string, PurchaseLine>()
  for (const [ingredientId, needed] of demand) {
    const ing = INGREDIENT_BY_ID[ingredientId]
    if (!ing) continue
    // То, что уже лежит дома, покупать не нужно. Считаем до округления: 700 г
    // риса в запасе — это 700 г, которых нет в чеке, а не «есть немного».
    const fromStock = pantry ? Math.min(needed, stockOf(pantry, ingredientId)) : 0
    const rest = Math.max(0, needed - fromStock)
    const toBuy = ing.unit === 'pcs' ? Math.ceil(rest) : Math.ceil(rest / 10) * 10
    // закрыто запасом целиком — упаковку не открываем
    const pack =
      rest > 0 ? packPlan(ing, rest) : { packSize: 0, packs: 0, parts: [], buy: 0, leftover: 0 }
    const price = ing.unit === 'pcs' ? ing.price * pack.buy : (ing.price * pack.buy) / 1000
    lines.set(ingredientId, {
      ingredientId,
      needed,
      fromStock,
      toBuy,
      buy: pack.buy,
      packSize: pack.packSize,
      packs: pack.packs,
      parts: pack.parts,
      leftover: pack.leftover,
      price: Math.round(price),
      // «постоянно есть» — это тот же staple, только выбранный человеком
      staple: Boolean(ing.staple) || Boolean(pantry && isAlways(pantry, ingredientId)),
    })
  }
  return lines
}

/*
 * Карточку, список покупок и план готовки рисуют рядом, и каждый спрашивает
 * план недели заново. Считать его по три раза на кадр незачем — меню за это
 * время не меняется.
 */
const cache = new WeakMap<WeekMenu, { sig: string; plan: WeekCooking }>()

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
): WeekCooking | null {
  const hit = cache.get(menu)
  return hit && hit.sig === signature(household, options) ? hit.plan : null
}

function toCache(
  menu: WeekMenu,
  household: Household,
  options: WeekPlanOptions,
  plan: WeekCooking,
): void {
  cache.set(menu, { sig: signature(household, options), plan })
}

/**
 * Факт готовок для дневного итога: доли партии и её КБЖУ по ключу готовки.
 *
 * Отдаём простой картой, а не планом целиком: dayTotals живёт в menu.ts, а
 * menu — под планом недели, и тащить его наверх значило бы завести круг.
 */
export function cookedStats(
  plan: WeekPlan,
  pantry?: Pantry,
): Map<string, { servings: number; stats: RecipeStats }> {
  const map = new Map(
    plan.tasks.map((t) => [t.task.key, { servings: t.servings, stats: t.stats }] as const),
  )
  /*
   * Заготовки считаем по той партии, из которой их убрали: она помнит свои
   * калории. Ключ отдельный — у заготовки нет готовки на этой неделе.
   */
  for (const lot of pantry?.freezer ?? []) {
    if (!lot.stats) continue
    map.set(`${FREEZER_KEY}${lot.recipeId}`, { servings: 1, stats: lot.stats })
  }
  return map
}

/** Префикс ключа для заготовки: готовки на этой неделе у неё нет. */
export const FREEZER_KEY = 'freezer:'
