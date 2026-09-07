import type { Household, OilChoice, Recipe } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'

/**
 * На чём готовим.
 *
 * Масло — не мелочь: сто граммов это девятьсот килокалорий, и «обжарить на
 * масле» без числа в составе означает, что этих калорий в расчёте нет вовсе.
 * Поэтому масло везде лежит в ингредиентах числом, а здесь решается только
 * одно: каким именно маслом заменить то, что стоит в рецепте.
 *
 * Замена не механическая. Сливочное масло горит на сковороде, кокосовое
 * меняет вкус карри куда сильнее, чем вкус оладий, а оливковое в заправке
 * заменять подсолнечным незачем, если оливковое дома есть.
 */

export interface OilInfo {
  id: string
  label: string
  /** Годится для жарки: у сливочного низкая точка дымления. */
  canFry: boolean
  /** Заметно меняет вкус блюда. */
  strongTaste: boolean
  hint: string
}

export const OILS: OilInfo[] = [
  {
    id: 'sunflower_oil',
    label: 'Подсолнечное',
    canFry: true,
    strongTaste: false,
    hint: 'нейтральное, дешёвое, терпит жар',
  },
  {
    id: 'olive_oil',
    label: 'Оливковое',
    canFry: true,
    strongTaste: false,
    hint: 'и в заправку, и на сковороду',
  },
  { id: 'ghee', label: 'Гхи', canFry: true, strongTaste: true, hint: 'не горит, вкус топлёного' },
  {
    id: 'coconut_oil',
    label: 'Кокосовое',
    canFry: true,
    strongTaste: true,
    hint: 'заметный вкус, хорошо в карри',
  },
  {
    id: 'butter',
    label: 'Сливочное',
    canFry: false,
    strongTaste: true,
    hint: 'горит на сковороде — только для выпечки и каш',
  },
]

export const OIL_BY_ID = Object.fromEntries(OILS.map((o) => [o.id, o])) as Record<string, OilInfo>

/** Все продукты, которые считаются маслом: их и заменяем. */
const OIL_IDS = new Set(OILS.map((o) => o.id))

export function isOil(ingredientId: string): boolean {
  return OIL_IDS.has(ingredientId)
}

/** Сколько масла уходит на смазывание формы или противня, мл на закладку. */
export const GREASE_ML = 5

/**
 * «Как в рецепте» — состояние по умолчанию.
 *
 * Подставлять своё масло во все 78 блюд, пока человек ничего не выбрал,
 * неправильно: в заправку салата автор поставил оливковое не случайно, и
 * менять его на подсолнечное по умолчанию — решать за человека.
 */
export const AS_WRITTEN = 'recipe'

export function defaultOils(): OilChoice {
  return { mainId: AS_WRITTEN, alternatives: [], greaseForms: true }
}

/** Жарят ли в этом рецепте — от этого зависит, какое масло подойдёт. */
function fries(recipe: Recipe): boolean {
  return recipe.steps.some((s) => /обжар|пожар|жарить|поджар/i.test(s.text))
}

/** Печётся ли блюдо в форме: её и смазывают. */
function bakedInForm(recipe: Recipe): boolean {
  return (
    Boolean(recipe.needs?.includes('oven')) ||
    recipe.steps.some((s) => /смаз|в форм|на противен/i.test(s.text))
  )
}

/**
 * Какое масло реально пойдёт в это блюдо.
 *
 * Основное — если оно годится: на сковороду не отправляем сливочное, даже
 * когда человек выбрал его основным. Тогда берём первую подходящую
 * альтернативу, а если и её нет — оставляем то, что стоит в рецепте.
 */
export function oilFor(recipe: Recipe, currentOilId: string, choice: OilChoice): string {
  if (!isOil(currentOilId)) return currentOilId
  if (choice.mainId === AS_WRITTEN) return currentOilId
  const needsHeat = fries(recipe)
  const suits = (id: string) => {
    const info = OIL_BY_ID[id]
    return Boolean(info) && (!needsHeat || info.canFry)
  }
  if (suits(choice.mainId)) return choice.mainId
  const alt = choice.alternatives.find(suits)
  if (alt) return alt
  return currentOilId
}

/**
 * Рецепт с учётом выбора масла: замена продукта и, если нужно, масло для
 * смазывания формы. Отдельная строка «смазать форму» без числа в составе —
 * это те же пять миллилитров, которых нет ни в КБЖУ, ни в закупке.
 */
export function applyOils(recipe: Recipe, choice: OilChoice): Recipe {
  const items = recipe.items.map((item) =>
    isOil(item.ingredientId)
      ? { ...item, ingredientId: oilFor(recipe, item.ingredientId, choice) }
      : item,
  )
  const grease = choice.greaseForms && bakedInForm(recipe)
  if (grease) {
    // Форму смазывают тем же маслом, что и жарят. Если человек ничего не
    // выбирал, берём масло самого рецепта — а если и его нет, подсолнечное.
    const own = recipe.items.find((i) => isOil(i.ingredientId))?.ingredientId
    const id = OIL_BY_ID[choice.mainId] ? choice.mainId : (own ?? 'sunflower_oil')
    const existing = items.find((i) => i.ingredientId === id)
    if (existing) existing.qty += GREASE_ML / 4
    else items.push({ ingredientId: id, qty: GREASE_ML / 4 })
  }
  // ничего не поменялось — возвращаем тот же объект, чтобы не сбивать кэши
  const same =
    !grease &&
    items.every((item, i) => item.ingredientId === recipe.items[i].ingredientId)
  return same ? recipe : { ...recipe, items }
}

/** Сколько блюд в базе затронет смена основного масла — это стоит показать. */
export function affectedRecipes(recipes: Recipe[], choice: OilChoice): number {
  return recipes.filter((r) =>
    r.items.some((i) => isOil(i.ingredientId) && oilFor(r, i.ingredientId, choice) !== i.ingredientId),
  ).length
}

/** Масло, которое реально нужно купить при этом выборе. */
export function oilsInUse(recipes: Recipe[], choice: OilChoice): string[] {
  const ids = new Set<string>()
  for (const r of recipes) {
    for (const i of r.items) if (isOil(i.ingredientId)) ids.add(oilFor(r, i.ingredientId, choice))
  }
  if (choice.greaseForms && OIL_BY_ID[choice.mainId]) ids.add(choice.mainId)
  return [...ids].filter((id) => INGREDIENT_BY_ID[id])
}

export function oilsOf(household: Household): OilChoice {
  return household.oils ?? defaultOils()
}
