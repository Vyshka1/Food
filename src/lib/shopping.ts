import { CATEGORY_LABEL, CATEGORY_ORDER, INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { Household, Pantry, ShoppingLine, WeekMenu } from '../types'
import { cookTasks } from './menu'
import type { BatchPreference } from './batch'
import { planWeek, purchaseFor } from './weekPlan'

export interface ShoppingList {
  lines: ShoppingLine[]
  /** Сумма без «уже есть дома». */
  total: number
}

/**
 * Потребность без семьи: столько, сколько просит меню, без партий и напитков.
 *
 * Так список считается только там, где семьи ещё нет — например, в предпросмотре
 * до онбординга. Для настоящей недели это неверный ответ: партия почти всегда
 * больше потребности.
 */
function purchaseWithoutHousehold(menu: WeekMenu, pantry?: Pantry) {
  const needed = new Map<string, number>()
  for (const task of cookTasks(menu)) {
    const recipe = recipeById(task.recipeId)
    if (!recipe) continue
    for (const item of recipe.items) {
      needed.set(item.ingredientId, (needed.get(item.ingredientId) ?? 0) + item.qty * task.portions)
    }
  }
  return purchaseFor(needed, pantry)
}

export function buildShoppingList(
  menu: WeekMenu,
  household?: Household,
  pantry?: Pantry,
  prefer?: BatchPreference,
): ShoppingList {
  /*
   * Что нужно на неделю, берём из плана недели: он уже свёл готовки, напитки и
   * дополнения. Покупаем ровно на ту готовку, которую и советуем — партия часто
   * больше потребности по меню (пачка фарша, полная форма, сковорода оладий), и
   * пока список считался по потребности, карточка говорила «приготовим 1,2 кг»,
   * а продуктов покупалось на 1,0 кг.
   */
  const purchase = household
    ? planWeek(menu, household, { pantry, prefer }).purchase
    : purchaseWithoutHousehold(menu, pantry)

  const lines: ShoppingLine[] = []
  for (const line of purchase.values()) {
    const ing = INGREDIENT_BY_ID[line.ingredientId]
    if (!ing) continue
    lines.push({
      ingredientId: line.ingredientId,
      name: ing.name,
      category: ing.category,
      unit: ing.unit,
      needed: line.toBuy,
      buy: line.buy,
      /*
       * Показываем фасовку только там, где она есть: «11 уп. по 1 шт» про яйца
       * — это не подсказка, а шум. Штучное считается штуками, а не упаковками.
       */
      packs:
        line.parts.some((p) => p.size > 1) && (line.parts.length > 1 || line.packs > 1)
          ? line.parts.map((p) => ({ count: p.count, size: p.size }))
          : undefined,
      price: line.price,
      staple: line.staple,
      fromStock: line.fromStock > 0 ? Math.round(line.fromStock) : undefined,
    })
  }

  lines.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.name.localeCompare(b.name, 'ru'),
  )

  const total = lines.filter((l) => !l.staple).reduce((s, l) => s + l.price, 0)
  return { lines, total }
}

/**
 * Три разных числа, которые раньше были одним.
 *
 * «К оплате» — сумма на кассе: упаковки покупаются целиком. «Продукты на эту
 * неделю» — сколько из них уйдёт в еду. Разница не потрачена впустую: она
 * останется дома и вычтется из следующей закупки. Пока это было одним числом,
 * рост чека читался как перерасход, хотя часть его — просто переезд денег в
 * кладовую.
 */
export interface WeekSpending {
  /** Сумма на кассе. */
  checkout: number
  /** Стоимость продуктов, которые уйдут в еду этой недели. */
  used: number
  /** Что останется дома из купленного. */
  leftAtHome: number
}

export function weekSpending(
  menu: WeekMenu,
  household: Household,
  pantry?: Pantry,
  skip: string[] = [],
): WeekSpending {
  const list = buildShoppingList(menu, household, pantry)
  const skipped = new Set(skip)
  const lines = list.lines.filter((l) => !l.staple && !skipped.has(l.ingredientId))
  const checkout = lines.reduce((sum, l) => sum + l.price, 0)

  // сколько каждого продукта реально уйдёт в еду этой недели — из того же плана
  const need = planWeek(menu, household, { pantry }).demand

  let used = 0
  for (const line of lines) {
    const ing = INGREDIENT_BY_ID[line.ingredientId]
    if (!ing) continue
    // считаем только то, что куплено сейчас: то, что взято из запаса, в чек
    // этой недели не входило и в «останется» его записывать не за что
    const inUse = Math.min(line.buy, Math.max(0, (need.get(line.ingredientId) ?? 0) - (line.fromStock ?? 0)))
    used += ing.unit === 'pcs' ? ing.price * inUse : (ing.price * inUse) / 1000
  }

  return {
    checkout: Math.round(checkout),
    used: Math.round(used),
    leftAtHome: Math.max(0, Math.round(checkout - used)),
  }
}

/** Текст списка для мессенджера: категории, позиции, итог. */
export function shoppingListText(
  list: ShoppingList,
  opts: { atHome: string[]; weekStart: string },
): string {
  const skip = new Set(opts.atHome)
  const lines = list.lines.filter((l) => !l.staple && !skip.has(l.ingredientId))
  const start = new Date(opts.weekStart)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`

  const out: string[] = [`Продукты на неделю ${fmt(start)}–${fmt(end)}`, '']
  for (const category of CATEGORY_ORDER) {
    const group = lines.filter((l) => l.category === category)
    if (group.length === 0) continue
    out.push(CATEGORY_LABEL[category])
    for (const line of group) out.push(`— ${line.name}, ${formatQty(line.buy, line.unit)}`)
    out.push('')
  }
  out.push(`Итого примерно ${lines.reduce((s, l) => s + l.price, 0)} ₽`)
  return out.join('\n')
}

export function formatQty(qty: number, unit: 'g' | 'ml' | 'pcs'): string {
  if (unit === 'pcs') return `${qty} шт`
  // «1,4 л», а не «1.4 л»: десятичная точка в русском тексте выглядит опечаткой
  if (qty >= 1000) {
    const big = (qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1).replace('.', ',')
    return `${big} ${unit === 'g' ? 'кг' : 'л'}`
  }
  return `${Math.round(qty)} ${unit === 'g' ? 'г' : 'мл'}`
}
