import type { Eater, MenuEntry, Recipe, WeekMenu } from '../types'
import { portionOf, totalPortions } from './menu'
import { portionWeight, recipeStats } from './nutrition'

/**
 * Перевод внутренних коэффициентов в кухонные величины.
 *
 * Внутри алгоритма нормально получить долю 1,087 — так считается норма
 * человека. Но на экране «1,1 порции» бессмысленно: в быту порция — это то,
 * что съедают за раз, и дробной она не бывает. Наружу должны выходить
 * граммы готового блюда и контейнеры, а не коэффициенты.
 */

export interface ServingRow {
  day: number
  eaterId: string
  eaterName: string
  grams: number
  kcal: number
}

export interface CookBatch {
  /** Все записи меню, которые закрывает одна готовка. */
  entries: MenuEntry[]
  /** Общий выход готового блюда, г. */
  totalGrams: number
  /**
   * Сумма долей. Нужна для расчёта продуктов и КБЖУ и наружу не
   * показывается — это внутренняя величина, а не «порции».
   */
  totalFactor: number
  /** Кто, когда и сколько получает. */
  rows: ServingRow[]
  /** Сколько выйдет контейнеров: один приём пищи одного человека. */
  containers: number
}

/**
 * Одна готовка целиком: сколько всего готовим и как это разойдётся по дням
 * и людям.
 *
 * Раньше карточка смешивала три разных масштаба: шапка говорила про всю
 * готовку, а продукты и КБЖУ считались на один день. Человек, готовящий по
 * карточке, сделал бы вдвое меньше, чем купил по списку покупок, — список
 * при этом всегда считался правильно, по всей готовке.
 */
export function cookBatch(
  menu: WeekMenu,
  recipe: Recipe,
  entry: MenuEntry,
  eaters: Eater[],
): CookBatch {
  const entries = menu.entries
    .filter((e) => e.recipeId === entry.recipeId && e.cookDay === entry.cookDay)
    .sort((a, b) => a.day - b.day)

  const kcalPerServing = recipeStats(recipe).kcal
  const rows: ServingRow[] = []
  for (const item of entries) {
    for (const eater of eaters) {
      const factor = portionOf(item, eater.id)
      if (factor <= 0) continue
      rows.push({
        day: item.day,
        eaterId: eater.id,
        eaterName: eater.name,
        grams: portionWeight(recipe, factor),
        kcal: Math.round(kcalPerServing * factor),
      })
    }
  }

  const totalFactor = entries.reduce((sum, e) => sum + totalPortions(e), 0)
  return {
    entries,
    totalFactor,
    totalGrams: portionWeight(recipe, totalFactor),
    rows,
    containers: rows.length,
  }
}
