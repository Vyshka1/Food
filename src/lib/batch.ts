import type { Ingredient, Recipe, RecipeBatch } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeStats } from './nutrition'
import { packPlan, purchaseInfo } from './purchase'
import { rawGramsPerServing } from './batchInfo'

/**
 * Выбор производственной партии.
 *
 * Норма человека говорит, сколько он съест. Она не должна говорить, сколько
 * готовить: фарш продаётся упаковкой, кастрюля имеет объём, и приготовить из
 * полной пачки почти не дольше, чем из половины. Поэтому партия выбирается
 * отдельно — из нескольких допустимых вариантов, а не делением потребности
 * на размер порции.
 *
 * Победителем считается вариант с наименьшим непристроенным остатком; при
 * сопоставимом остатке — более дешёвый и быстрый.
 */

export interface PackLine {
  ingredientId: string
  name: string
  /** Размер выбранной упаковки; 0 — продукт весовой. */
  packSize: number
  packs: number
  buy: number
  /** Сырой остаток вскрытой упаковки. */
  leftover: number
  /** Остаток можно заморозить сырым. */
  freezableRaw: boolean
}

export interface BatchOption {
  /** Множитель закладки: ½, 1, 1½, 2. */
  scale: number
  /** Во сколько долей рецепта это выливается. */
  servings: number
  /** Приблизительный выход готового блюда, г. */
  yieldGrams: number
  /** Уйдёт людям по меню. */
  servedGrams: number
  /** Уйдёт в морозилку готовым. */
  freezeGrams: number
  /** Некуда деть: ни в тарелки, ни в морозилку. */
  unplacedGrams: number
  /** Не хватает до потребности по меню. */
  shortfallGrams: number
  /** Сырой остаток главного продукта. */
  anchorLeftover: number
  packs: PackLine[]
  price: number
  minutes: number
}

export interface BatchPlan {
  recipeId: string
  batch: RecipeBatch
  chosen: BatchOption
  alternatives: BatchOption[]
  /** Сколько готового блюда требует меню. */
  neededGrams: number
}

/** Сколько минут занимает готовка партии: ручное растёт, пассивное — нет. */
function batchMinutes(recipe: Recipe, servings: number): number {
  let minutes = 0
  for (const step of recipe.steps) {
    const manual = step.handsOn || step.station === 'prep'
    const factor = manual ? Math.min(2, 0.7 + 0.3 * Math.max(1, servings)) : 1
    minutes += step.minutes * factor
  }
  return Math.round(minutes)
}

function packLines(recipe: Recipe, servings: number): PackLine[] {
  const lines: PackLine[] = []
  for (const item of recipe.items) {
    const ing: Ingredient | undefined = INGREDIENT_BY_ID[item.ingredientId]
    if (!ing || ing.staple) continue
    const needed = item.qty * servings
    const plan = packPlan(ing, needed)
    lines.push({
      ingredientId: ing.id,
      name: ing.name,
      packSize: plan.packSize,
      packs: plan.packs,
      buy: plan.buy,
      leftover: Math.round(plan.leftover),
      freezableRaw: purchaseInfo(ing).rawFreezable,
    })
  }
  return lines
}

/**
 * Куда разойдётся приготовленное.
 *
 * Сначала тарелки по меню, потом морозилка — но только если блюдо вообще
 * морозится и морозилка есть. Всё, что не уместилось, честно считается
 * непристроенным: приготовить и выбросить хуже, чем не приготовить.
 */
function place(
  yieldGrams: number,
  neededGrams: number,
  canFreeze: boolean,
  freezerRoomGrams: number,
): { servedGrams: number; freezeGrams: number; unplacedGrams: number } {
  const servedGrams = Math.min(yieldGrams, neededGrams)
  const rest = yieldGrams - servedGrams
  const freezeGrams = canFreeze ? Math.min(rest, freezerRoomGrams) : 0
  return { servedGrams, freezeGrams, unplacedGrams: Math.round(rest - freezeGrams) }
}

export interface BatchContext {
  /** Сколько готового блюда нужно по меню, г. */
  neededGrams: number
  hasFreezer: boolean
  /** Сколько ещё влезет в морозилку, г. Считаем по числу контейнеров. */
  freezerRoomGrams: number
}

export function buildOption(
  recipe: Recipe,
  batch: RecipeBatch,
  scale: number,
  context: BatchContext,
): BatchOption {
  const servings = batch.baseScale * scale
  const yieldGrams = Math.round(rawGramsPerServing(recipe) * servings * 0.88)
  const canFreeze = batch.freezeCooked && context.hasFreezer
  const { servedGrams, freezeGrams, unplacedGrams } = place(
    yieldGrams,
    context.neededGrams,
    canFreeze,
    context.freezerRoomGrams,
  )
  const packs = packLines(recipe, servings)
  const anchorLine = batch.anchorIngredientId
    ? packs.find((l) => l.ingredientId === batch.anchorIngredientId)
    : undefined
  return {
    scale,
    servings,
    yieldGrams,
    servedGrams: Math.round(servedGrams),
    freezeGrams: Math.round(freezeGrams),
    unplacedGrams,
    shortfallGrams: Math.max(0, Math.round(context.neededGrams - servedGrams)),
    anchorLeftover: anchorLine?.leftover ?? 0,
    packs,
    price: Math.round(recipeStats(recipe).price * servings),
    minutes: batchMinutes(recipe, servings),
  }
}

/**
 * Во что обходится вариант. Непристроенная еда дороже всего — её придётся
 * выбросить; сырой остаток дешевле, его можно заморозить или доесть; цена и
 * время учитываются в последнюю очередь, потому что приготовить из полной
 * пачки почти не дольше, чем из половины.
 */
export function optionCost(option: BatchOption, batch: RecipeBatch): number {
  // Недобор дороже излишка: лишнее можно заморозить или доесть, а нехватку
  // придётся закрывать второй готовкой или пустой тарелкой. Первая версия
  // штрафовала только излишек, и «Гречка с яйцом» предлагала 500 г там, где
  // по меню нужно 900.
  let cost = option.shortfallGrams * 6
  cost += option.unplacedGrams * 3
  // сырой остаток, который нельзя заморозить, почти так же плох, как готовый
  const rawPenalty = batch.freezeRawAnchor ? 0.4 : 2
  cost += option.anchorLeftover * rawPenalty
  cost += option.price * 0.15
  cost += option.minutes * 0.5
  return cost
}

/** Все допустимые партии и выбор лучшей. */
export function planBatch(recipe: Recipe, context: BatchContext): BatchPlan | null {
  const batch = recipe.batch
  if (!batch) return null

  // У свежего блюда партии нет, но готовить его всё равно надо столько,
  // сколько нужно по меню. Фиксированная закладка ×1 давала «нужно 1185 г,
  // приготовить 298 г» — то есть план, по которому семья остаётся голодной.
  if (batch.reason === 'fresh') {
    const perServing = rawGramsPerServing(recipe) * 0.88
    const scale = Math.max(1, Math.round((context.neededGrams / Math.max(1, perServing)) * 4) / 4)
    return {
      recipeId: recipe.id,
      batch,
      chosen: buildOption(recipe, batch, scale, context),
      alternatives: [],
      neededGrams: Math.round(context.neededGrams),
    }
  }

  // Если даже самая большая допустимая закладка не закрывает потребность,
  // добавляем ту, что закрывает: варят и две кастрюли, и три пачки фарша.
  // Без этого план молча предлагал приготовить меньше, чем нужно по меню.
  const perScale = rawGramsPerServing(recipe) * batch.baseScale * 0.88
  const maxScale = Math.max(...batch.scales)
  const needScale = Math.ceil((context.neededGrams / Math.max(1, perScale)) * 2) / 2
  const scales = [...batch.scales]
  if (needScale > maxScale) scales.push(Math.min(needScale, maxScale * 4))

  const options = scales
    .filter((scale) => scale >= batch.minScale)
    .map((scale) => buildOption(recipe, batch, scale, context))
  if (options.length === 0) return null

  const ranked = [...options].sort((a, b) => optionCost(a, batch) - optionCost(b, batch))
  const chosen = ranked[0]
  return {
    recipeId: recipe.id,
    batch,
    chosen,
    alternatives: ranked.slice(1),
    neededGrams: Math.round(context.neededGrams),
  }
}

/**
 * Как назвать выход. Штуки — только у проверенных вручную партий: «примерно
 * 1,8 кг» честно, «8 голубцов» без проверки — выдумка.
 */
export function yieldLabel(batch: RecipeBatch, option: BatchOption): string {
  const grams =
    option.yieldGrams >= 1000
      ? `${(option.yieldGrams / 1000).toFixed(1).replace('.', ',')} кг`
      : `${option.yieldGrams} г`
  if (batch.source === 'verified' && batch.yieldPieces && batch.pieceName) {
    const pieces = Math.round(batch.yieldPieces * option.scale)
    const [one, few, many] = batch.pieceName
    const mod100 = pieces % 100
    const mod10 = pieces % 10
    const word =
      mod100 > 10 && mod100 < 20 ? many : mod10 > 1 && mod10 < 5 ? few : mod10 === 1 ? one : many
    return `${pieces} ${word} · примерно ${grams}`
  }
  return `примерно ${grams}`
}

/** Почему партия именно такая — это человек должен понимать. */
export function batchReasonText(batch: RecipeBatch): string {
  if (batch.reason === 'fresh') return 'блюдо готовят свежим, впрок его не делают'
  if (batch.reason === 'pot') return 'меньше кастрюли готовить непрактично'
  const anchor = batch.anchorIngredientId ? INGREDIENT_BY_ID[batch.anchorIngredientId] : undefined
  const info = anchor ? purchaseInfo(anchor) : undefined
  const pack = info?.preferredPack ?? info?.packSizes[0]
  if (!anchor || !pack) return 'партия подобрана под упаковку главного продукта'
  const unit = anchor.unit === 'ml' ? 'мл' : 'г'
  return `${anchor.name.toLowerCase()} продаётся упаковкой ${pack} ${unit}`
}
