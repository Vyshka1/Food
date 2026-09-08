import type { CookEvent, Household, Pantry, WeekMenu } from '../types'
import { CONTAINER_GRAMS, addFreezer, addStock, isAlways, takeFreezer, takeStock } from './pantry'
import { cookedGrams } from './nutrition'
import { planWeek } from './weekPlan'

/**
 * Факт готовки: что действительно списали и убрали в морозилку.
 *
 * Живёт отдельно от React намеренно. Это самая опасная операция приложения —
 * она меняет запасы, — и проверять её надо без экрана: двойное нажатие,
 * несколько приёмов из одной готовки, пересчёт плана после отметки.
 */

/** Часть состояния, которую эта операция меняет. */
export interface CookFacts {
  pantry: Pantry
  cookEvents: CookEvent[]
}

/**
 * Отметить готовку сделанной.
 *
 * Работает на уровне готовки, а не записи меню, и ровно один раз. Одна готовка
 * закрывает несколько приёмов и несколько человек: пока факт записывался на
 * запись меню, «приготовлено» на понедельник и на вторник списывало продукты
 * дважды и дважды клало остаток в морозилку — либо, если считать по одной
 * записи, списывало потребность одного приёма вместо всей партии.
 *
 * План читается здесь, один раз, из того же состояния, которое и меняется:
 * между чтением задачи и списанием он не пересчитывается. В факт кладётся
 * снимок — план потом пересчитается, а списанное уже списано.
 */
export function completeCookTask(
  facts: CookFacts,
  menu: WeekMenu,
  household: Household,
  taskId: string,
  today: string,
): CookFacts {
  // идемпотентность: второе нажатие ничего не меняет
  if (facts.cookEvents.some((e) => e.taskId === taskId)) return facts
  const cooking = planWeek(menu, household, { pantry: facts.pantry }).byKey.get(taskId)
  if (!cooking) return facts

  let pantry = facts.pantry
  const used: CookEvent['used'] = []
  for (const [ingredientId, qty] of cooking.ingredients) {
    // постоянные продукты не считают: соль и масло всегда есть
    if (isAlways(pantry, ingredientId)) continue
    pantry = takeStock(pantry, ingredientId, qty)
    used.push({ ingredientId, qty })
  }

  let frozen: CookEvent['frozen']
  const freezeGrams = cooking.placement.freezeGrams
  if (freezeGrams > 0) {
    // неполный контейнер занимает место целиком — считаем вверх
    const containers = Math.max(1, Math.ceil(freezeGrams / CONTAINER_GRAMS))
    const perServing = Math.max(1, cookedGrams(cooking.recipe, 1))
    const portionsEach = freezeGrams / containers / perServing
    pantry = addFreezer(pantry, cooking.recipe, containers, portionsEach, today)
    frozen = { containers, portionsEach, grams: freezeGrams }
  }

  const event: CookEvent = {
    taskId,
    at: today,
    recipeId: cooking.recipe.id,
    servings: cooking.servings,
    cookedGrams: cooking.cookedGrams,
    used,
    frozen,
  }
  return { pantry, cookEvents: [...facts.cookEvents, event] }
}

/**
 * Снять отметку о готовке: вернуть продукты и забрать заготовку обратно.
 *
 * Возвращаем по снимку, а не по плану: план с тех пор мог пересчитаться, и
 * вернуть в кладовую надо ровно то, что из неё брали.
 */
export function undoCookTask(facts: CookFacts, taskId: string, today: string): CookFacts {
  const event = facts.cookEvents.find((e) => e.taskId === taskId)
  if (!event) return facts
  let pantry = facts.pantry
  for (const { ingredientId, qty } of event.used) {
    pantry = addStock(pantry, ingredientId, qty, today)
  }
  if (event.frozen) pantry = takeFreezer(pantry, event.recipeId, event.frozen.containers)
  return { pantry, cookEvents: facts.cookEvents.filter((e) => e !== event) }
}
