import type { Ingredient, PurchaseInfo, SaleForm, Unit } from '../types'

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
/** Какие упаковки берём и сколько их. */
export interface PackChoice {
  /** Крупнейшая из взятых фасовок; 0 — продукт весовой. */
  packSize: number
  /** Сколько упаковок всего. */
  packs: number
  /** Из каких фасовок сложилась покупка. Одна запись — один размер. */
  parts: { size: number; count: number }[]
  buy: number
  leftover: number
}

/**
 * Лучшая комбинация фасовок из целых упаковок, не меньше нужного.
 *
 * Размеры можно смешивать: в магазине берут пачку 500 и пачку 600, а не четыре
 * по 600 «потому что так делится ровнее». Пока выбирался один размер на всю
 * покупку, на мясе набегало 65 ₽ в неделю лишнего — при том, что человек в
 * магазине сложил бы пачки как раз так.
 *
 * Перебор по остатку: сколько граммов можно набрать целыми упаковками. Шаг —
 * наибольший общий делитель фасовок, поэтому таблица маленькая.
 */
function bestPacks(sizes: number[], needed: number, preferred?: number): PackChoice {
  const step = sizes.reduce((a, b) => {
    let x = a
    let y = b
    while (y) [x, y] = [y, x % y]
    return x
  })
  const target = Math.max(1, Math.ceil((needed - 1e-9) / step))
  const limit = target + Math.ceil(Math.max(...sizes) / step)
  // минимальное число упаковок, которым набирается ровно i шагов
  const packsFor = new Array<number>(limit + 1).fill(Infinity)
  const lastSize = new Array<number>(limit + 1).fill(0)
  packsFor[0] = 0
  for (let i = 1; i <= limit; i++) {
    for (const size of sizes) {
      const units = size / step
      if (units > i || packsFor[i - units] + 1 >= packsFor[i]) continue
      packsFor[i] = packsFor[i - units] + 1
      lastSize[i] = size
    }
  }
  /*
   * Берём ближайший достижимый объём, а не тот, что собирается из меньшего
   * числа упаковок. Четыре банки тунца по 185 г — это ровно 740 г и ноль
   * остатка; одна банка 600 и одна 185 — это две упаковки, но 45 г лишних.
   * Меньше остатка важнее, чем меньше упаковок.
   */
  let bestTotal = -1
  for (let i = target; i <= limit; i++) {
    if (packsFor[i] === Infinity) continue
    bestTotal = i
    break
  }
  if (bestTotal < 0) {
    // недостижимо не бывает, но если фасовки странные — берём предпочтительную
    const size = preferred ?? sizes[0]
    const count = Math.max(1, Math.ceil(needed / size))
    const buy = count * size
    return { packSize: size, packs: count, parts: [{ size, count }], buy, leftover: buy - needed }
  }
  const counts = new Map<number, number>()
  for (let i = bestTotal; i > 0; i -= lastSize[i] / step) {
    counts.set(lastSize[i], (counts.get(lastSize[i]) ?? 0) + 1)
  }
  const parts = [...counts.entries()]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => b.size - a.size)
  const buy = bestTotal * step
  return {
    packSize: parts[0].size,
    packs: parts.reduce((sum, p) => sum + p.count, 0),
    parts,
    buy,
    leftover: buy - needed,
  }
}

export function packPlan(ing: Ingredient, needed: number): PackChoice {
  const info = purchaseInfo(ing)
  // Штучное считается штуками всегда — даже когда типовой упаковки нет.
  // Проверка на пустой список фасовок стояла раньше и перехватывала бананы:
  // получалось «купить 10» на 0,3 банана, потому что вес округлялся до
  // десятков граммов.
  if (info.form === 'piece') {
    const buy = Math.max(1, Math.ceil(needed - 1e-9))
    return { packSize: 1, packs: buy, parts: [{ size: 1, count: buy }], buy, leftover: buy - needed }
  }
  if (info.form === 'weight' || info.packSizes.length === 0) {
    const buy = Math.ceil(needed / 10) * 10
    return { packSize: 0, packs: 0, parts: [], buy, leftover: Math.max(0, buy - needed) }
  }
  return bestPacks(info.packSizes, needed, info.preferredPack)
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

/** Ниже этого веса остаток проще досыпать в блюдо, чем куда-то девать. */
const ABSORB_MAX_G = 30
/** …или если это меньше двадцатой части упаковки. */
const ABSORB_MAX_SHARE = 0.05

/**
 * Мелкий хвост упаковки: его проще досыпать в блюдо, чем куда-то девать.
 *
 * У штучного порог свой и жёсткий: остаток меньше штуки — это не остаток, а
 * дробь. Полторы луковицы не бывает: вторую кладут целиком, и именно её надо
 * считать и в КБЖУ, и в цене, иначе состав карточки расходится с её же
 * калориями.
 */
export function absorbable(ing: Ingredient, leftover: number, packSize: number): boolean {
  if (leftover <= 0) return false
  if (ing.unit === 'pcs') return leftover < 1
  if (ing.staple) return false
  const limit = Math.max(ABSORB_MAX_G, packSize * ABSORB_MAX_SHARE)
  return leftover <= limit
}

/**
 * Стоит ли вообще говорить об остатке упаковки.
 *
 * Правило одно на всё приложение: и список покупок, и карточка блюда молчат об
 * одном и том же. Четыре грамма лука — не остаток, а разность округлений, и
 * «использовать за 5 дней» про них звучит издевательски.
 *
 * Два условия, потому что «мало» бывает разным: сорок граммов мало само по
 * себе, а сто граммов от двух килограммов мало относительно. Штучное меряется
 * только долей: одно яйцо из десяти — настоящий остаток.
 */
export function leftoverWorthTelling(rest: number, bought: number, unit: Unit): boolean {
  if (rest <= 0) return false
  const share = rest / Math.max(1, bought)
  if (share < 0.15) return false
  return unit === 'pcs' || rest >= 40
}
