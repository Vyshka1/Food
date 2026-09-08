import type { OilChoice, Recipe } from '../types'
import { RECIPES, RECIPE_BY_ID } from './recipes'
import { normalizeRecipe } from './normalize'
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

/** Список собирается лениво, при первом обращении, и кэшируется до изменений. */
function ensure(): Recipe[] {
  if (!adapted) rebuild()
  return adapted!
}

function rebuild(): void {
  adapted = [...RECIPES, ...customRecipes].map((r) => applyOils(r, oils))
  adaptedById = new Map(adapted.map((r) => [r.id, r]))
}

/**
 * Свои рецепты проходят ту же нормализацию, что и встроенные.
 *
 * Редактор сохраняет то, что написал человек: состав, шаги, слоты. Прибор,
 * активное время, разметку заморозки и производственную партию дописывает
 * normalizeRecipe. Без этого своё блюдо приходило в подбор без партии, и весь
 * расчёт сваливался на запасной путь «партии нет — считаем по потребности
 * меню»: своё блюдо считалось иначе, чем встроенное.
 */
export function setCustomRecipes(list: Recipe[]): void {
  customRecipes = list.map(normalizeRecipe)
  customById = new Map(customRecipes.map((r) => [r.id, r]))
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
