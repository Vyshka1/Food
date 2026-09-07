import type { Recipe, RecipeBatch } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { MEAT_PACK_PREFERRED, purchaseInfo } from './purchase'

/**
 * Базовая закладка рецепта.
 *
 * Одного правила «½ / 1 / 1½ / 2» мало: у каждого блюда своя минимально
 * практичная партия, и определяет её не выход, а главный неудобно делимый
 * продукт. У котлет это упаковка фарша, у сырников — пачка творога, у супа
 * такого продукта нет вовсе, и его можно варить сколько угодно.
 *
 * Всё, что выводится здесь, помечается `derived`. Это характеристика
 * происхождения для аудита, а не разрешение показывать ложную точность:
 * число изделий у derived не показывается никогда.
 */

/**
 * Продукты, вокруг которых имеет смысл считать партию, по убыванию важности.
 *
 * Только скоропортящееся и фасованное. Сухие крупы и бобовые сюда не входят:
 * пачка чечевицы лежит полгода, и подгонять под неё размер кастрюли незачем —
 * первая версия правила из-за этого предлагала сварить 7,5 порций супа.
 */
const ANCHOR_CATEGORIES: string[] = ['meat', 'fish', 'dairy']

/** Дольше этого срока вскрытый остаток не поджимает — значит, и не якорь. */
const ANCHOR_MAX_OPENED_DAYS = 7

/** Сколько долей помещается в кастрюлю, когда якорного продукта нет. */
const POT_BATCH = 4

/** Блюдо, которое не доживёт до второго дня, готовят свежим — партии нет. */
function keepsWell(recipe: Recipe): boolean {
  return recipe.freezable || recipe.fridgeDays >= 3
}

/**
 * Доля веса, теряемая при готовке. Бытовая оценка: мясо и рыба ужариваются
 * заметно, крупы и макароны наоборот набирают воду, но её мы в вес закладки
 * не считаем — считаем сырьё.
 */
const COOK_LOSS = 0.12

/** Главный неудобно делимый продукт: самый «дорогой и фасованный» в рецепте. */
export function anchorIngredient(recipe: Recipe): string | undefined {
  let best: { id: string; rank: number; grams: number } | null = null
  for (const item of recipe.items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing || ing.staple) continue
    const rank = ANCHOR_CATEGORIES.indexOf(ing.category)
    if (rank < 0) continue
    // якорь должен поджимать по сроку: то, что лежит месяцами, партию не диктует
    if (purchaseInfo(ing).openedFridgeDays > ANCHOR_MAX_OPENED_DAYS) continue
    // среди подходящих категорий выбираем более приоритетную, при равенстве —
    // ту, которой в блюде больше по весу
    const grams = ing.unit === 'pcs' ? item.qty * (ing.pieceGrams ?? 50) : item.qty
    if (!best || rank < best.rank || (rank === best.rank && grams > best.grams)) {
      best = { id: item.ingredientId, rank, grams }
    }
  }
  return best?.id
}

/** Приблизительный вес сырья одной доли рецепта, г. */
export function rawGramsPerServing(recipe: Recipe): number {
  let grams = 0
  for (const item of recipe.items) {
    const ing = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing) continue
    grams += ing.unit === 'pcs' ? item.qty * (ing.pieceGrams ?? 50) : item.qty
  }
  return grams
}

/**
 * Во сколько долей рецепта укладывается одна закладка.
 *
 * Если есть якорный продукт с типовой фасовкой — закладка это ровно одна
 * упаковка: столько фарша, сколько лежит в пачке. Если якоря нет, закладка
 * равна одной доле, и блюдо масштабируется свободно.
 */
export function baseScaleOf(recipe: Recipe, anchorId: string | undefined): number {
  if (!anchorId) return 1
  const ing = INGREDIENT_BY_ID[anchorId]
  const item = recipe.items.find((i) => i.ingredientId === anchorId)
  if (!ing || !item || item.qty <= 0) return 1
  const info = purchaseInfo(ing)
  if (info.form === 'weight') return 1
  const pack = info.preferredPack ?? info.packSizes[0] ?? MEAT_PACK_PREFERRED
  if (!pack) return 1
  const perServing = ing.unit === 'pcs' ? item.qty * (ing.pieceGrams ?? 50) : item.qty
  const scale = pack / perServing
  // закладка не должна быть абсурдной: пачка творога 300 г при 30 г на порцию
  // это десять долей, и такое блюдо просто масштабируется свободно
  return scale >= 1.2 && scale <= 8 ? Math.round(scale * 4) / 4 : 1
}

export function batchInfoOf(recipe: Recipe): RecipeBatch {
  // блюдо, которое не хранится, готовят на один раз: партии у него нет
  if (!keepsWell(recipe)) {
    return {
      source: 'derived',
      baseScale: 1,
      scales: [1],
      minScale: 1,
      yieldGrams: Math.round(rawGramsPerServing(recipe) * (1 - COOK_LOSS)),
      freezeCooked: false,
      freezeRawAnchor: false,
      reason: 'fresh',
    }
  }

  const anchorIngredientId = anchorIngredient(recipe)
  const anchor = anchorIngredientId ? INGREDIENT_BY_ID[anchorIngredientId] : undefined
  const anchorInfo = anchor ? purchaseInfo(anchor) : undefined
  const anchorScale = baseScaleOf(recipe, anchorIngredientId)
  // якоря нет, но блюдо хранится — значит, его готовят кастрюлей
  const usesAnchor = anchorScale > 1
  const baseScale = usesAnchor ? anchorScale : POT_BATCH
  const yieldGrams = Math.round(rawGramsPerServing(recipe) * baseScale * (1 - COOK_LOSS))
  return {
    source: 'derived',
    baseScale,
    anchorIngredientId: usesAnchor ? anchorIngredientId : undefined,
    reason: usesAnchor ? 'anchor-pack' : 'pot',
    // Половина закладки практична только там, где упаковку можно вскрыть.
    // Для кастрюли половины нет вовсе: если причина партии в том, что меньше
    // кастрюли готовить непрактично, предлагать полкастрюли — противоречие
    // самому себе.
    scales: !usesAnchor || anchorInfo?.partialUse === false ? [1, 1.5, 2] : [0.5, 1, 1.5, 2],
    minScale: !usesAnchor || anchorInfo?.partialUse === false ? 1 : 0.5,
    yieldGrams,
    // число изделий у derived не выставляем: выдумывать «8 голубцов» нельзя
    yieldPieces: undefined,
    freezeCooked: recipe.freezable,
    freezeRawAnchor: anchorInfo?.rawFreezable ?? false,
  }
}
