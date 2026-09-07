import type { OilChoice, Recipe } from '../types'
import { RECIPES, RECIPE_BY_ID } from './recipes'
import { applyOils, defaultOils } from '../lib/oil'

/**
 * Свои рецепты живут в localStorage и участвуют в подборе меню наравне со
 * встроенными. Реестр — единственное место, где эти два источника соединяются:
 * store обновляет его при каждом изменении, остальной код спрашивает только тут.
 *
 * Здесь же применяется выбор масла. Он меняет состав блюда, а значит и КБЖУ, и
 * закупку — поэтому подменять масло где-то в одном экране нельзя: карточка и
 * список покупок разошлись бы на одном и том же продукте.
 */
let customRecipes: Recipe[] = []
let customById = new Map<string, Recipe>()
let oils: OilChoice = defaultOils()
let adapted: Recipe[] | null = null
let adaptedById = new Map<string, Recipe>()

/**
 * Список собирается лениво, при первом обращении.
 *
 * Строить его в момент загрузки модуля нельзя: data/recipes собирает разметку
 * заморозки и партий через lib/freezing, тот тянет реестр обратно, и на этом
 * круге RECIPES ещё пуст. Ленивое построение разрывает круг без танцев с
 * порядком импортов.
 */
function ensure(): Recipe[] {
  if (!adapted) rebuild()
  return adapted!
}

function rebuild(): void {
  adapted = [...RECIPES, ...customRecipes].map((r) => applyOils(r, oils))
  adaptedById = new Map(adapted.map((r) => [r.id, r]))
}

export function setCustomRecipes(list: Recipe[]): void {
  customRecipes = list
  customById = new Map(list.map((r) => [r.id, r]))
  rebuild()
}

/** Выбор масла: он же меняет состав блюд, поэтому живёт рядом с рецептами. */
export function setOilChoice(choice: OilChoice): void {
  oils = choice
  rebuild()
}

export function getCustomRecipes(): Recipe[] {
  return customRecipes
}

export function allRecipes(): Recipe[] {
  return ensure()
}

export function recipeById(id: string): Recipe | undefined {
  ensure()
  return adaptedById.get(id)
}

/** Рецепт как он написан, без подстановки масла — для редактора своих блюд. */
export function rawRecipeById(id: string): Recipe | undefined {
  return customById.get(id) ?? RECIPE_BY_ID[id]
}
