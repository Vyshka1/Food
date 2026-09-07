import { CATEGORY_LABEL, CATEGORY_ORDER, INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { Household, ShoppingLine, WeekMenu } from '../types'
import { cookTasks } from './menu'
import { drinkShopping } from './drinks'

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

export interface ShoppingList {
  lines: ShoppingLine[]
  /** Сумма без «уже есть дома». */
  total: number
}

export function buildShoppingList(menu: WeekMenu, household?: Household): ShoppingList {
  const needed = new Map<string, number>()

  // Напитки — не блюда, но молоко для капучино покупать всё равно нужно, и
  // покупает его тот же список. Без этого две пачки молока в неделю уходили
  // мимо закупки.
  if (household) {
    for (const [ingredientId, qty] of drinkShopping(household)) {
      needed.set(ingredientId, (needed.get(ingredientId) ?? 0) + qty)
    }
  }

  for (const task of cookTasks(menu)) {
    const recipe = recipeById(task.recipeId)
    if (!recipe) continue
    const portions = task.portions
    for (const item of recipe.items) {
      needed.set(item.ingredientId, (needed.get(item.ingredientId) ?? 0) + item.qty * portions)
    }
  }

  const lines: ShoppingLine[] = []
  for (const [ingredientId, rawQty] of needed) {
    const ing = INGREDIENT_BY_ID[ingredientId]
    if (!ing) continue
    const neededQty = ing.unit === 'pcs' ? Math.ceil(rawQty) : roundUpTo(rawQty, 10)
    let buy = neededQty
    let packs: ShoppingLine['packs']
    if (ing.pack && ing.pack > 0) {
      const count = Math.ceil(neededQty / ing.pack)
      buy = count * ing.pack
      if (count > 1) packs = { count, size: ing.pack }
    }
    const price = ing.unit === 'pcs' ? ing.price * buy : (ing.price * buy) / 1000
    lines.push({
      ingredientId,
      name: ing.name,
      category: ing.category,
      unit: ing.unit,
      needed: neededQty,
      buy,
      packs,
      price: Math.round(price),
      staple: Boolean(ing.staple),
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
  if (qty >= 1000) return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)} ${unit === 'g' ? 'кг' : 'л'}`
  return `${Math.round(qty)} ${unit === 'g' ? 'г' : 'мл'}`
}
