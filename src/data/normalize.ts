import type { Recipe, RecipeStep } from '../types'
import { batchInfoOf } from '../lib/batchInfo'
import { freezingOf } from '../lib/freezing'
import { deriveRecipeSteps } from '../lib/stepDetail'
import { VERIFIED_BATCHES } from './verifiedBatches'

/**
 * Дописывает рецепту всё, что выводится из него самого.
 *
 * Рецепт пишут руками: состав, шаги, слоты. Прибор, температуру, активное
 * время, разметку заморозки и производственную партию выводит код — и делать
 * это надо ровно одним способом для всех рецептов. Пока эта работа жила внутри
 * фабрики встроенной базы, свой рецепт приходил в подбор без партии и без
 * заморозки, а весь расчёт молча сваливался на запасной путь: «партии нет —
 * считаем по потребности меню». То есть своё блюдо считалось иначе, чем
 * встроенное, и разошлись бы карточка с закупкой.
 *
 * Выверенная вручную партия сильнее любого правила — но и она проходит здесь.
 */
export function normalizeRecipe(recipe: Recipe): Recipe {
  const steps: RecipeStep[] = deriveRecipeSteps(
    recipe.steps.map((s) => ({
      text: s.text,
      minutes: s.minutes,
      station: s.station,
      handsOn: s.handsOn,
    })),
  )
  const withSteps: Recipe = { ...recipe, steps }
  // разметка заморозки считается от готового рецепта: ей нужны и шаги, и состав
  const withFreezing: Recipe = { ...withSteps, freezing: freezingOf(withSteps) }
  return {
    ...withFreezing,
    batch: recipe.batch ?? VERIFIED_BATCHES[recipe.id] ?? batchInfoOf(withFreezing),
  }
}
