import type { Ingredient, Recipe, RecipeBatch } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeStats } from './nutrition'
import { packPlan, purchaseInfo } from './purchase'
import { rawGramsPerServing } from './batchInfo'
import { fryMinutes, pieceCookingOf, sizeOptions } from './pieces'

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

/**
 * Сколько минут занимает готовка партии.
 *
 * Ручное растёт, пассивное — нет. А у штучного жарка растёт не коэффициентом,
 * а заходами: на сковороде помещается пять оладий, и тридцать штук — это шесть
 * заходов, сколько ни умножай время рецепта.
 */
function batchMinutes(recipe: Recipe, servings: number, pieces?: number): number {
  const cooking = pieceCookingOf(recipe)
  let minutes = 0
  for (const step of recipe.steps) {
    if (cooking && pieces && FRY_STEP.test(step.text)) {
      minutes += fryMinutes(pieces, cooking)
      continue
    }
    const manual = step.handsOn || step.station === 'prep'
    const factor = manual ? Math.min(2, 0.7 + 0.3 * Math.max(1, servings)) : 1
    minutes += step.minutes * factor
  }
  return Math.round(minutes)
}

/** Шаг, который делается заходами: жарка, выпекание партии, катание шариков. */
export const FRY_STEP = /жарить|обжарить|пожарить|выпека|запека|скатать|слепить/i

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

/**
 * Чем руководствоваться при выборе размера партии.
 *
 * `cost` — как сейчас: минимальная суммарная цена ошибки (недобор, непристроенное,
 * сырой остаток, деньги, время). `min` — наименьшая партия, которая закрывает
 * потребность: меньше заготовок и меньше чек сегодня. `max` — наибольшая, всё
 * содержимое которой есть куда деть: больше впрок и меньше будущих готовок.
 */
export type BatchPreference = 'cost' | 'min' | 'max'

export interface BatchContext {
  /** Сколько готового блюда нужно по меню, г. */
  neededGrams: number
  hasFreezer: boolean
  /** Сколько ещё влезет в морозилку, г. Считаем по числу контейнеров. */
  freezerRoomGrams: number
  /** Чем руководствоваться при выборе размера. По умолчанию — ценой ошибки. */
  prefer?: BatchPreference
}

/**
 * Порядок вариантов при выбранной стратегии.
 *
 * Правила физики стратегия не отменяет: варианты те же самые, меняется только
 * то, какой из них считается лучшим. «Меньше потратить» никогда не выберет
 * партию, которой не хватит на стол, а «впрок» — ту, что придётся выбросить.
 */
function rank(options: BatchOption[], batch: RecipeBatch, prefer: BatchPreference): BatchOption[] {
  if (prefer === 'min') {
    const enough = options.filter((o) => o.shortfallGrams === 0)
    const pool = enough.length > 0 ? enough : options
    return [...pool].sort(
      (a, b) => a.shortfallGrams - b.shortfallGrams || a.yieldGrams - b.yieldGrams,
    )
  }
  if (prefer === 'max') {
    const placed = options.filter((o) => o.shortfallGrams === 0 && o.unplacedGrams === 0)
    const pool = placed.length > 0 ? placed : options
    return [...pool].sort(
      (a, b) => a.unplacedGrams - b.unplacedGrams || b.yieldGrams - a.yieldGrams,
    )
  }
  return [...options].sort((a, b) => optionCost(a, batch) - optionCost(b, batch))
}

/** Сколько изделий даст этот вариант. */
export function optionPieces(batch: RecipeBatch, scale: number): number | undefined {
  if (batch.source !== 'verified' || !batch.yieldPieces) return undefined
  return Math.max(1, Math.round(batch.yieldPieces * scale))
}

export function buildOption(
  recipe: Recipe,
  batch: RecipeBatch,
  scale: number,
  context: BatchContext,
): BatchOption {
  const servings = batch.baseScale * scale
  // Проверенный вручную выход сильнее расчёта по составу: он и выставлялся
  // затем, чтобы заменить прикидку. Первая версия его молча игнорировала, и
  // выверенные числа никуда не шли.
  const yieldGrams = Math.round(
    batch.source === 'verified'
      ? batch.yieldGrams * scale
      : rawGramsPerServing(recipe) * servings * 0.88,
  )
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
    minutes: batchMinutes(recipe, servings, optionPieces(batch, scale)),
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

  /*
   * У штучного блюда размер партии задаётся не множителем, а числом изделий:
   * человек делает дюжину сырников или двадцать оладий, а не «полторы
   * закладки». Поэтому варианты берём из удобной сетки, а множитель считаем
   * обратным счётом — наружу он всё равно не показывается.
   */
  const cooking = pieceCookingOf(recipe)
  if (cooking && batch.yieldPieces) {
    const options = rank(
      sizeOptions(cooking).map((pieces) =>
        buildOption(recipe, batch, pieces / batch.yieldPieces!, context),
      ),
      batch,
      context.prefer ?? 'cost',
    )
    if (options.length > 0) {
      return {
        recipeId: recipe.id,
        batch,
        chosen: options[0],
        alternatives: options.slice(1),
        neededGrams: Math.round(context.neededGrams),
      }
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

  const ranked = rank(options, batch, context.prefer ?? 'cost')
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
  if (batch.reason === 'form') return 'больше в форму не помещается'
  if (batch.reason === 'pan') return 'жарится партиями на сковороде, и одну штуку жарить незачем'
  if (batch.reason === 'keeps') return 'блюдо хорошо хранится, его удобно сделать впрок'
  const anchor = batch.anchorIngredientId ? INGREDIENT_BY_ID[batch.anchorIngredientId] : undefined
  const info = anchor ? purchaseInfo(anchor) : undefined
  const pack = info?.preferredPack ?? info?.packSizes[0]
  if (!anchor || !pack) return 'партия подобрана под упаковку главного продукта'
  const unit = anchor.unit === 'ml' ? 'мл' : 'г'
  return `${anchor.name.toLowerCase()} продаётся упаковкой ${pack} ${unit}`
}
