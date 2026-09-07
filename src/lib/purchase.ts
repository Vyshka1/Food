import type { Ingredient, PurchaseInfo, SaleForm } from '../types'

/**
 * Как продукт продаётся и что делать со вскрытым остатком.
 *
 * Отдельно от рецепта: рецепту всё равно, а закупке — нет. Фарш продаётся
 * упаковкой 500 г, и рецепт на 377 г оставляет 123 г сырого фарша, которым
 * надо что-то распорядиться. Пока приложение об этом молчало, вопрос решал
 * человек — в тот момент, когда упаковка уже вскрыта.
 *
 * Свойства выводятся из того, что уже известно про продукт: единицы, фасовки
 * и категории. Отдельная таблица нужна только там, где категории
 * недостаточно.
 */

/** Типовые упаковки фарша и мяса. Позже это должно настраиваться человеком. */
export const MEAT_PACKS = [400, 500, 600]
export const MEAT_PACK_PREFERRED = 500

const MEAT_LIKE = new Set(['meat', 'fish'])

/** Продукты, у которых вскрытая упаковка живёт заметно дольше обычного. */
const LONG_OPENED: Record<string, number> = {
  butter: 20,
  cheese: 10,
  peanut_butter: 60,
  honey: 365,
  mustard: 60,
  soy_sauce: 180,
  vinegar: 365,
  tomato_paste: 7,
}

export function saleForm(ing: Ingredient): SaleForm {
  if (ing.unit === 'pcs') return 'piece'
  if (ing.pack && ing.pack > 0) return 'pack'
  return 'weight'
}

/**
 * Сколько дней живёт вскрытая упаковка в холодильнике. Числа бытовые и с
 * запасом в безопасную сторону: сырой фарш — сутки, а не «два-три дня».
 */
function openedFridgeDays(ing: Ingredient): number {
  if (LONG_OPENED[ing.id] !== undefined) return LONG_OPENED[ing.id]
  if (MEAT_LIKE.has(ing.category)) return 1
  switch (ing.category) {
    case 'dairy':
      return 4
    case 'egg':
      return 21
    case 'veg':
    case 'fruit':
      return 5
    case 'grain':
    case 'legume':
    case 'nuts':
    case 'pantry':
      return 180
    case 'bakery':
      return 4
    default:
      return 5
  }
}

export function purchaseInfo(ing: Ingredient): PurchaseInfo {
  const form = saleForm(ing)
  const meat = MEAT_LIKE.has(ing.category)
  return {
    form,
    // У мяса и рыбы кроме типовых фасовок есть своя, указанная у продукта, и
    // именно её магазин чаще всего и предлагает. Первая версия её затирала, и
    // подпись «продаётся упаковкой 500 г» противоречила плану, который брал
    // пачку 400 г.
    packSizes: meat
      ? [...new Set([...(ing.pack ? [ing.pack] : []), ...MEAT_PACKS])].sort((a, b) => a - b)
      : ing.pack
        ? [ing.pack]
        : [],
    preferredPack: ing.pack ?? (meat ? MEAT_PACK_PREFERRED : undefined),
    // штучное «частично» не открывают: половину яйца в холодильник не кладут
    partialUse: form !== 'piece',
    openedFridgeDays: openedFridgeDays(ing),
    // сырое мясо и рыбу можно переморозить, если они не были заморожены до
    rawFreezable: meat,
  }
}

/**
 * Сколько упаковок купить и сколько останется. Для весового продукта
 * упаковок нет — берут ровно сколько нужно.
 */
export function packPlan(
  ing: Ingredient,
  needed: number,
): { packSize: number; packs: number; buy: number; leftover: number } {
  const info = purchaseInfo(ing)
  // Штучное считается штуками всегда — даже когда типовой упаковки нет.
  // Проверка на пустой список фасовок стояла раньше и перехватывала бананы:
  // получалось «купить 10» на 0,3 банана, потому что вес округлялся до
  // десятков граммов.
  if (info.form === 'piece') {
    const buy = Math.max(1, Math.ceil(needed - 1e-9))
    return { packSize: 1, packs: buy, buy, leftover: buy - needed }
  }
  if (info.form === 'weight' || info.packSizes.length === 0) {
    const buy = Math.ceil(needed / 10) * 10
    return { packSize: 0, packs: 0, buy, leftover: Math.max(0, buy - needed) }
  }
  // из типовых фасовок берём ту, что даёт наименьший остаток; при равенстве —
  // предпочтительную, потому что её проще найти в магазине
  let best: { packSize: number; packs: number; buy: number; leftover: number } | null = null
  for (const packSize of info.packSizes) {
    const packs = Math.max(1, Math.ceil(needed / packSize))
    const buy = packs * packSize
    const leftover = buy - needed
    const better =
      best === null ||
      leftover < best.leftover - 1e-9 ||
      (Math.abs(leftover - best.leftover) < 1e-9 && packSize === info.preferredPack)
    if (better) best = { packSize, packs, buy, leftover }
  }
  return best!
}

/** Что делать со вскрытым остатком: понятная человеку строка. */
export function leftoverAdvice(ing: Ingredient, leftover: number): string | null {
  if (leftover <= 0) return null
  const info = purchaseInfo(ing)
  // У штучного остатка нет: покупают и кладут в блюдо целыми штуками, а меньше
  // штуки — это остаток округления, а не продукт. Совет «0 шт использовать за
  // 5 дн» человеку сказать нечего.
  if (info.form === 'piece') return null
  const unit = ing.unit === 'ml' ? 'мл' : 'г'
  if (info.rawFreezable) {
    return `${Math.round(leftover)} ${unit} — заморозить сырым или добавить в блюдо на этой неделе`
  }
  if (info.openedFridgeDays <= 5) {
    return `${Math.round(leftover)} ${unit} — использовать за ${info.openedFridgeDays} дн`
  }
  return `${Math.round(leftover)} ${unit} — останется в запасе`
}
