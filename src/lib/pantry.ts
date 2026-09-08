import type { FreezerItem, Ingredient, Pantry, Recipe, StockItem, WeekMenu } from '../types'
import { INGREDIENTS, INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import { freezerDaysOf } from './freezing'
import { addDays, daysBetween } from './day'

/**
 * Что есть дома.
 *
 * Отметка «есть дома» жила ровно одну неделю: соль, рис и масло приходилось
 * отмечать заново каждый понедельник. Но дома есть две разные вещи — то, что
 * есть всегда, и то, что есть сейчас. Первое не покупают вообще, второе
 * вычитают из закупки и тратят по мере готовки.
 *
 * Всё здесь — чистые функции над Pantry: состояние живёт в store, а решения
 * о том, что считать запасом и когда он кончится, принимаются тут.
 */

export function emptyPantry(): Pantry {
  return {
    // «постоянно есть» заводится из продуктов, помеченных базовыми: соль,
    // специи, масло. Это отправная точка, а не приговор — список правится
    always: INGREDIENTS.filter((i) => i.staple).map((i) => i.id),
    stock: [],
    freezer: [],
  }
}

export function isAlways(pantry: Pantry, ingredientId: string): boolean {
  return pantry.always.includes(ingredientId)
}

/** Сколько этого продукта лежит дома. */
export function stockOf(pantry: Pantry, ingredientId: string): number {
  return pantry.stock
    .filter((s) => s.ingredientId === ingredientId)
    .reduce((sum, s) => sum + s.qty, 0)
}

/** Положить в запасы. Одинаковые продукты складываются в одну строку. */
export function addStock(
  pantry: Pantry,
  ingredientId: string,
  qty: number,
  today: string,
): Pantry {
  if (qty <= 0) return pantry
  const existing = pantry.stock.find((s) => s.ingredientId === ingredientId)
  const stock = existing
    ? pantry.stock.map((s) =>
        s.ingredientId === ingredientId ? { ...s, qty: s.qty + qty, addedAt: today } : s,
      )
    : [...pantry.stock, { ingredientId, qty, addedAt: today }]
  return { ...pantry, stock }
}

/** Взять из запасов. Уходит в ноль — строка исчезает, а не висит нулём. */
export function takeStock(pantry: Pantry, ingredientId: string, qty: number): Pantry {
  if (qty <= 0) return pantry
  const stock: StockItem[] = []
  let left = qty
  for (const item of pantry.stock) {
    if (item.ingredientId !== ingredientId || left <= 0) {
      stock.push(item)
      continue
    }
    const take = Math.min(item.qty, left)
    left -= take
    const rest = Math.round((item.qty - take) * 100) / 100
    if (rest > 0) stock.push({ ...item, qty: rest })
  }
  return { ...pantry, stock }
}

export function setStock(pantry: Pantry, ingredientId: string, qty: number, today: string): Pantry {
  const without = { ...pantry, stock: pantry.stock.filter((s) => s.ingredientId !== ingredientId) }
  return qty > 0 ? addStock(without, ingredientId, qty, today) : without
}

/**
 * Списать продукты приготовленного блюда.
 *
 * Именно здесь запас перестаёт быть вечным: приготовили — значит, съели то,
 * что лежало. Без этого «700 г риса» остались бы в списке навсегда и каждую
 * неделю вычитались бы из закупки заново.
 */
export function consumeRecipe(pantry: Pantry, recipe: Recipe, portions: number): Pantry {
  let next = pantry
  for (const item of recipe.items) {
    if (isAlways(pantry, item.ingredientId)) continue
    next = takeStock(next, item.ingredientId, item.qty * portions)
  }
  return next
}

/**
 * Разложить покупки: излишек упаковок уходит в запасы.
 *
 * Пачка фарша 500 г при нужных 275 — это 225 г, которые остаются дома. До сих
 * пор приложение честно писало «останется 225 г» и на этом забывало о них.
 */
export function storePurchase(
  pantry: Pantry,
  lines: { ingredientId: string; buy: number; needed: number }[],
  today: string,
): Pantry {
  let next = pantry
  for (const line of lines) {
    const rest = Math.round((line.buy - line.needed) * 100) / 100
    if (rest > 0) next = addStock(next, line.ingredientId, rest, today)
  }
  return next
}

/** Добавить контейнеры в морозилку. */
export function addFreezer(
  pantry: Pantry,
  recipe: Recipe,
  containers: number,
  portionsEach: number,
  today: string,
  stats?: FreezerItem['stats'],
): Pantry {
  if (containers <= 0) return pantry
  const item: FreezerItem = {
    id: `f${Date.now().toString(36)}-${recipe.id}`,
    recipeId: recipe.id,
    containers,
    portionsEach: Math.round(portionsEach * 10) / 10,
    cookedAt: today,
    // морозим уже готовое: контейнер с ужином, а не сырой фарш
    keepDays: freezerDaysOf(recipe, 'cooked'),
    stats,
  }
  const existing = pantry.freezer.find((f) => f.recipeId === recipe.id && f.cookedAt === today)
  const freezer = existing
    ? pantry.freezer.map((f) =>
        f === existing ? { ...f, containers: f.containers + containers } : f,
      )
    : [...pantry.freezer, item]
  return { ...pantry, freezer }
}

/** Достать контейнер: съели — значит, его больше нет. */
export function takeFreezer(pantry: Pantry, recipeId: string, containers = 1): Pantry {
  let left = containers
  const freezer: FreezerItem[] = []
  for (const item of pantry.freezer) {
    if (item.recipeId !== recipeId || left <= 0) {
      freezer.push(item)
      continue
    }
    const take = Math.min(item.containers, left)
    left -= take
    if (item.containers - take > 0) freezer.push({ ...item, containers: item.containers - take })
  }
  return { ...pantry, freezer }
}

/** Сколько дней осталось контейнеру. Отрицательное — срок вышел. */
export function daysLeft(item: FreezerItem, today: string): number {
  return item.keepDays - daysBetween(item.cookedAt, today)
}

/** Дата, до которой стоит съесть: срок годности заготовки. */
export function expiresOn(item: FreezerItem): string {
  return addDays(item.cookedAt, item.keepDays)
}

/**
 * Сколько места в морозилке ещё есть, г.
 *
 * Пока это число считалось «сколько контейнеров у вас всего», приложение
 * планировало заготовки в морозилку, забитую доверху: место было занято
 * прошлыми неделями, а расчёт этого не видел.
 */
export function freezerRoomGrams(kitchen: { containers: number; hasFreezer: boolean }, pantry?: Pantry): number {
  if (!kitchen.hasFreezer) return 0
  const total = Math.max(0, kitchen.containers) * CONTAINER_GRAMS
  const busy = (pantry?.freezer ?? []).reduce((sum, f) => sum + f.containers * CONTAINER_GRAMS, 0)
  return Math.max(0, total - busy)
}

/** Сколько еды помещается в один контейнер. Бытовая мера, не физика. */
export const CONTAINER_GRAMS = 400

/** Что в морозилке пора съесть — по этому и предупреждаем. */
export function expiring(pantry: Pantry, today: string, withinDays = 14): FreezerItem[] {
  return pantry.freezer
    .filter((f) => daysLeft(f, today) <= withinDays)
    .sort((a, b) => daysLeft(a, today) - daysLeft(b, today))
}

/** Сколько порций лежит в морозилке всего — это уже готовая еда. */
export function freezerPortions(pantry: Pantry): number {
  return pantry.freezer.reduce((sum, f) => sum + f.containers * f.portionsEach, 0)
}

/** Блюда из морозилки, которых нет в меню недели: про них легко забыть. */
export function forgottenInFreezer(pantry: Pantry, menu: WeekMenu | null): FreezerItem[] {
  const planned = new Set(menu?.entries.map((e) => e.recipeId) ?? [])
  return pantry.freezer.filter((f) => !planned.has(f.recipeId))
}

/** Название блюда для контейнера — этикетка на морозилке. */
export function freezerLabel(item: FreezerItem): string {
  return recipeById(item.recipeId)?.title ?? item.recipeId
}

/** Продукты, которые вообще имеет смысл держать в запасах. */
export function stockableIngredients(): Ingredient[] {
  return INGREDIENTS.filter((i) => !i.staple)
}

export function ingredientName(id: string): string {
  return INGREDIENT_BY_ID[id]?.name ?? id
}
