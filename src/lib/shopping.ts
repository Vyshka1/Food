import { CATEGORY_ORDER, INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPE_BY_ID } from '../data/recipes'
import type { ShoppingLine, WeekMenu } from '../types'
import { cookTasks } from './menu'

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

export interface ShoppingList {
  lines: ShoppingLine[]
  /** Сумма без «уже есть дома». */
  total: number
}

export function buildShoppingList(menu: WeekMenu): ShoppingList {
  const needed = new Map<string, number>()

  for (const task of cookTasks(menu)) {
    const recipe = RECIPE_BY_ID[task.recipeId]
    if (!recipe) continue
    const portions = task.servings * task.scale
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

export function formatQty(qty: number, unit: 'g' | 'ml' | 'pcs'): string {
  if (unit === 'pcs') return `${qty} шт`
  if (qty >= 1000) return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)} ${unit === 'g' ? 'кг' : 'л'}`
  return `${Math.round(qty)} ${unit === 'g' ? 'г' : 'мл'}`
}
