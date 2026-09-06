import type { Recipe } from '../types'
import { RECIPES, RECIPE_BY_ID } from './recipes'

/**
 * Свои рецепты живут в localStorage и участвуют в подборе меню наравне со
 * встроенными. Реестр — единственное место, где эти два источника соединяются:
 * store обновляет его при каждом изменении, остальной код спрашивает только тут.
 */
let customRecipes: Recipe[] = []
let customById = new Map<string, Recipe>()

export function setCustomRecipes(list: Recipe[]): void {
  customRecipes = list
  customById = new Map(list.map((r) => [r.id, r]))
}

export function getCustomRecipes(): Recipe[] {
  return customRecipes
}

export function allRecipes(): Recipe[] {
  return customRecipes.length === 0 ? RECIPES : [...RECIPES, ...customRecipes]
}

export function recipeById(id: string): Recipe | undefined {
  return customById.get(id) ?? RECIPE_BY_ID[id]
}
