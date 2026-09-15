import type { Ingredient, Recipe, RecipeBatch } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { cookedYieldPerServing, recipeStats } from './nutrition'
import { packPlan, purchaseInfo } from './purchase'
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
  /**
   * Часть морозилки, которая и есть запас впрок: её варят нарочно, на начало
   * следующей недели. Считается отдельно от остального замороженного, потому
   * что в цене варианта они противоположны — случайный излишек это издержка,
   * а запас цель.
   */
  aheadGrams: number
  /** Сколько запаса не удалось пристроить: не влезло в морозилку. */
  aheadShortGrams: number
  /** Некуда деть: ни в тарелки, ни в морозилку. */
  unplacedGrams: number
  /**
   * Добавка к тем же запланированным приёмам пищи: меньше порции, и потому
   * расходится по уже назначенным тарелкам, а не остаётся ничьей.
   */
  tailGrams: number
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
 * Граница между заготовкой и хвостом.
 *
 * Двести граммов — это не заготовка, а остаток: на приём пищи он никогда не
 * наберёт, но полку займёт и через полтора месяца пропадёт. И ровно потому,
 * что он мал, его доедают за пару дней. Одно число служит обеим сторонам: что
 * слишком мало для контейнера — то и есть хвост.
 *
 * Перемерено после того, как потребность переехала в готовый вес: излишка
 * стало меньше, и порог стал отсекать больше заготовок, чем раньше. Замер
 * (12 недель × 12 прогонов): касса + выброшенное ₽/нед, в морозилке кг,
 * приёмов пищи из морозилки:
 *     0 г — 6983 + 675, 1.0 кг, 0.03
 *   300 г — 7002 + 470, 1.5 кг, 0.41
 *   400 г — 6964 + 448, 1.1 кг, 0.43
 *   500 г — 6966 + 446, 1.2 кг, 0.67
 *   700 г — 7008 + 466, 1.2 кг, 0.73
 * Без порога морозилка забивается крошками и перестаёт кормить совсем: три
 * сотых приёма пищи в неделю. По деньгам от 300 до 700 разница внутри шума,
 * а вот еду из морозилки достают заметно чаще при половине килограмма — это
 * примерно контейнер, то есть та заготовка, которую меню сможет взять целиком.
 */
export const FREEZE_MIN_GRAMS = 500

/**
 * Во сколько обходится грамм недобора: стол не закрыт.
 *
 * Замер по всей базе (936 случаев) и на 12 неделях × 12 прогонов; касса и
 * выброшенное ₽/нед:
 *    4 — недобор в 34% случаев (в среднем 54 г), варим на 11.0% больше нужного, 6975 + 456
 *    6 — 29% (41 г), 13.6%, 6966 + 446
 *   10 — 26% (36 г), 14.7%, 7074 + 431
 *   14 — 25% (31 г), 15.7%, 7100 + 439
 * Выше шести недобор почти не убывает: оставшийся — не выбор модели, а сетка
 * (нет варианта, который закрывал бы потребность точнее). Платить за него
 * сотней рублей в неделю не за что, а сорок граммов на килограмм закрывает
 * дополнение к столу.
 */
const SHORT_WEIGHT = 6

/**
 * Во сколько обходится грамм добавки — еды сверх нормы на тех же тарелках.
 *
 * Замер (12 недель × 12 прогонов): касса + выброшенное ₽/нед, хвостов г/нед,
 * приёмов пищи из морозилки:
 *   1 — 7085 + 422, 867 г, 0.18
 *   2 — 7068 + 422, 835 г, 0.24
 *   3 — 6966 + 446, 579 г, 0.67
 *   4 — 7015 + 460, 587 г, 0.55
 *
 * Тройка появилась при перемере: на прежней шкале, когда потребность считалась
 * в сыром весе и была завышена, двойка и тройка не отличались. С честной
 * потребностью хвост стал главным способом сбыть излишек — и подорожать ему
 * полезно: четверть килограмма еды в неделю сверх нормы уходит не в тарелку
 * сверх меры, а в морозилку заготовкой, которую потом достают втрое чаще.
 *
 * Перемер после того, как хвост ограничили порцией, ничего не сдвинул: вес
 * совпал с весом непристроенного (тоже 3), и на выбор варианта деление хвоста
 * и «некуда» больше не влияет — оно влияет только на то, как это назвать.
 */
const TAIL_WEIGHT = 3

/**
 * Докуда хвост ещё добавка, в порциях блюда.
 *
 * Граница у хвоста была та же, что у контейнера, — полкило, — и это была
 * граница не про то. «Останется 468 г — доесть в ближайшие дни» при
 * потребности в 570 г значит, что почти половину сваренного есть некому: у
 * этих граммов нет ни человека, ни дня, ни приёма пищи, и фраза «в ближайшие
 * дни» ровно это и скрывает.
 *
 * Правильная мера — порция, а не контейнер. Пока остаток меньше порции, он
 * расходится добавкой по тем же запланированным приёмам пищи: сварили полную
 * кастрюлю, налили всем чуть больше. Как только он дорастает до порции, это
 * уже отдельный приём пищи — и если его никто не съест по меню и он не влезет
 * в морозилку, честно называть его непристроенным.
 *
 * Замер (12 недель × 12 прогонов), порог в порциях: хвост г/нед, некуда г/нед,
 * выброшено ₽/нед:
 *   0    —   0, 271, 548
 *   0.5  — 129, 142, 512
 *   1    — 174,  97, 498
 *   2    — 256,  15, 472
 * Касса (6820 ₽/нед), сваренное (20.99 кг/нед) и замороженное (1.14 кг/нед) во
 * всём этом ряду не меняются вовсе: порог решает не сколько готовить, а как
 * называть остаток. Выбрана порция: ниже неё в «некуда» попадает еда, которую
 * семья на самом деле доедает, выше — в «доесть» попадают целые приёмы пищи.
 */
export const TAIL_MAX_SERVINGS = 1

/**
 * Как делится то, что не легло ни на тарелки, ни в морозилку.
 *
 * Одна функция на весь проект: и выбор партии, и карточка блюда спрашивают
 * здесь. Пока карточка решала это сама, порог у неё был другой — полкило, как
 * у контейнера, — и целые приёмы пищи, которые есть некому, она называла
 * остатком на доесть.
 */
export function splitLeftover(
  restGrams: number,
  servingGrams: number,
): { tailGrams: number; unplacedGrams: number } {
  const tailGrams = Math.min(Math.max(0, restGrams), servingGrams * TAIL_MAX_SERVINGS)
  return {
    tailGrams: Math.round(tailGrams),
    unplacedGrams: Math.round(Math.max(0, restGrams - tailGrams)),
  }
}

/**
 * Во сколько обходится грамм заготовки.
 *
 * Заготовка полезна — она экономит будущую готовку, — но не бесплатна:
 * продукты куплены сегодня, место занято сегодня, съесть надо до срока.
 * Пока этот грамм считался даром, порог заморозки толкал партии вверх:
 * голубцы на потребность в 1080 г предлагали шестнадцать штук вместо десяти
 * и две пачки фарша вместо одной — лишь бы остаток дотянул до контейнера.
 *
 * Замер (12 недель × 12 прогонов): касса + выброшенное ₽/нед, в морозилке кг,
 * приёмов пищи из морозилки:
 *   0.2 — 7017 + 459, 1.9 кг, 0.56
 *   0.4 — 6966 + 446, 1.2 кг, 0.67
 *   0.6 — 6937 + 435, 0.4 кг, 0.25
 * На 0.6 дешевле всего, но морозилка пустеет и перестаёт кормить. 0.4 — и
 * почти те же деньги, и самая работающая морозилка из измеренных.
 */
const FREEZE_WEIGHT = 0.4

/**
 * Куда разойдётся приготовленное.
 *
 * У каждого приготовленного грамма должен быть адрес, и адресов ровно четыре:
 * тарелка запланированного приёма пищи, добавка к тем же тарелкам, морозилка и
 * «некуда» — то есть явное списание. Пятого адреса вроде «доесть в ближайшие
 * дни» здесь нет: это не адрес, а способ не называть вещи своими именами.
 *
 * Сначала тарелки по меню, потом морозилка — но только если блюдо вообще
 * морозится, морозилка есть и на полке хватает места. Всё, что не уместилось,
 * честно считается непристроенным: приготовить и выбросить хуже, чем не
 * приготовить.
 */
function place(
  yieldGrams: number,
  neededGrams: number,
  servingGrams: number,
  aheadGrams: number,
  canFreeze: boolean,
  freezerRoomGrams: number,
): {
  servedGrams: number
  freezeGrams: number
  aheadGrams: number
  aheadShortGrams: number
  tailGrams: number
  unplacedGrams: number
} {
  const servedGrams = Math.min(yieldGrams, neededGrams)
  const rest = yieldGrams - servedGrams
  const room = Math.min(rest, freezerRoomGrams)
  /*
   * Порог контейнера запас не проходит: его морозят потому, что он нужен, а не
   * потому, что осталось. Двести граммов супа на понедельник — это обед, а не
   * «слишком мало для заготовки».
   */
  const wanted = Math.min(rest, freezerRoomGrams, aheadGrams)
  const freezeGrams = canFreeze ? (room >= FREEZE_MIN_GRAMS ? room : Math.max(0, wanted)) : 0
  const placedAhead = canFreeze ? Math.min(freezeGrams, aheadGrams) : 0
  const left = rest - freezeGrams
  return {
    servedGrams,
    freezeGrams,
    aheadGrams: Math.round(placedAhead),
    aheadShortGrams: Math.round(Math.max(0, aheadGrams - placedAhead)),
    ...splitLeftover(left, servingGrams),
  }
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
  /**
   * Сколько сверх меню сварить впрок и заморозить, г. Ноль — обычная готовка.
   * Это не пожелание «побольше», а потребность начала следующей недели: она
   * посчитана из анкеты ровно так же, как потребность этой.
   */
  aheadGrams?: number
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
    /*
     * «Впрок» — это не «побольше сварить», а «побольше пристроить»: считаем
     * тарелки и морозилку, а не выход. Пока сортировка шла по выходу среди
     * вариантов с нулём непристроенного, порог заморозки мог оставить такие
     * варианты вовсе без кандидатов, и «впрок» выбирала наименьшую партию —
     * ровно наоборот тому, что обещает.
     */
    const enough = options.filter((o) => o.shortfallGrams === 0)
    const covering = enough.length > 0 ? enough : options
    const placed = covering.filter((o) => o.unplacedGrams === 0)
    const pool = placed.length > 0 ? placed : covering
    const canPlace = (o: BatchOption) => o.servedGrams + o.freezeGrams + o.tailGrams
    return [...pool].sort((a, b) => canPlace(b) - canPlace(a) || a.unplacedGrams - b.unplacedGrams)
  }
  return [...options].sort((a, b) => optionCost(a, batch) - optionCost(b, batch))
}

/**
 * Сколько готового блюда даёт одна закладка, г.
 *
 * Одно выражение на весь модуль: и выбор размера, и сам выход считаются от
 * него, иначе «сварить ровно потребность» промахивается мимо потребности на
 * пару десятков граммов — и эти граммы тут же становятся ничьими.
 */
function yieldPerScale(recipe: Recipe, batch: RecipeBatch): number {
  return cookedYieldPerServing(recipe).grams * batch.baseScale
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
      : cookedYieldPerServing(recipe).grams * servings,
  )
  const canFreeze = batch.freezeCooked && context.hasFreezer
  const { servedGrams, freezeGrams, aheadGrams, aheadShortGrams, tailGrams, unplacedGrams } = place(
    yieldGrams,
    context.neededGrams,
    cookedYieldPerServing(recipe).grams,
    canFreeze ? Math.min(context.aheadGrams ?? 0, context.freezerRoomGrams) : 0,
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
    aheadGrams,
    aheadShortGrams,
    tailGrams,
    unplacedGrams,
    shortfallGrams: Math.max(0, Math.round(context.neededGrams - servedGrams)),
    anchorLeftover: anchorLine?.leftover ?? 0,
    packs,
    price: Math.round(recipeStats(recipe).price * servings),
    minutes: batchMinutes(recipe, servings, optionPieces(batch, scale)),
  }
}

/**
 * Во что обходится вариант.
 *
 * Непристроенная еда дороже всего — её придётся выбросить; хвост в порцию
 * дешевле, его доедают; заготовка ещё дешевле, но и она чего-то стоит; сырой
 * остаток можно заморозить или доесть; цена и время учитываются в последнюю
 * очередь, потому что приготовить из полной пачки почти не дольше, чем из
 * половины.
 */
export function optionCost(option: BatchOption, batch: RecipeBatch): number {
  // Недобор дороже излишка: лишнее можно заморозить или доесть, а нехватку
  // придётся закрывать второй готовкой или пустой тарелкой. Первая версия
  // штрафовала только излишек, и «Гречка с яйцом» предлагала 500 г там, где
  // по меню нужно 900.
  let cost = option.shortfallGrams * SHORT_WEIGHT
  cost += option.unplacedGrams * 3
  cost += option.tailGrams * TAIL_WEIGHT
  /*
   * Запас не штрафуется как излишек: его варят нарочно, ради начала следующей
   * недели, и заморозить его — не потеря, а смысл. А вот недобрать запас так же
   * плохо, как недобрать на стол: невыполненное обещание «в понедельник не
   * готовим» стоит понедельничной готовки.
   */
  cost += Math.max(0, option.freezeGrams - option.aheadGrams) * FREEZE_WEIGHT
  cost += option.aheadShortGrams * SHORT_WEIGHT
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

  /*
   * У блюда без партии готовим ровно потребность меню — ни граммом больше.
   *
   * Ровно, а не «примерно»: округление до четверти доли, которое здесь стояло
   * раньше, создавало остаток на пустом месте, а у остатка нет ни человека, ни
   * дня, ни приёма пищи. Замер по 60 неделям: округление давало 122 г/нед
   * непристроенной еды у блюд, которые вообще нельзя заготовить впрок.
   *
   * Запас впрок сюда входит, но только если блюдо вообще морозят. «Партии
   * нет» и «нельзя заморозить» — разные утверждения: сваренные заранее киноа
   * и курица морозятся прекрасно, и последняя готовка недели вправе накормить
   * её начало. Разница с партией в том, что впрок готовится ровно столько
   * порций, сколько записано в меню следующей недели, а не «сколько влезет».
   * Там, где блюдо не морозят, запас и не просят: `planAhead` выбирает по
   * тому же `freezeCooked`.
   *
   * Закладка может быть больше одной доли и здесь — так у выверенных вручную
   * партий, — поэтому долю считаем от закладки, а не от порции.
   */
  if (batch.reason === 'fresh') {
    const ahead =
      batch.freezeCooked && context.hasFreezer
        ? Math.min(context.aheadGrams ?? 0, context.freezerRoomGrams)
        : 0
    const scale = (context.neededGrams + ahead) / Math.max(1, yieldPerScale(recipe, batch))
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

  const perScale = yieldPerScale(recipe, batch)
  const maxScale = Math.max(...batch.scales)
  /*
   * Запас ограничен полкой: варить впрок больше, чем влезет в морозилку,
   * значит приготовить еду, которую некуда деть. Замерено — без этой отсечки
   * при одной готовке в среду в неделю оставалось около 300 г готовой еды,
   * которой не находилось ни тарелки, ни контейнера.
   */
  const aheadGrams = Math.min(context.aheadGrams ?? 0, context.freezerRoomGrams)
  /*
   * Кроме сетки — вариант ровно под потребность, там где размер ничем не
   * квантован.
   *
   * «Меньше кастрюли непрактично» — ограничение снизу, а не требование варить
   * строго кратно кастрюле: налить кастрюлю на три четверти можно, и это
   * обычное дело. Пока варианты брались только из сетки 1/1¼/1½, потребность
   * почти никогда не попадала в её узел, и разница оседала в хвосте — еде без
   * человека, дня и приёма пищи.
   *
   * У упаковки всё наоборот, и поэтому она сюда не входит. Пачка фарша
   * неделима: отрезать от неё ровно под потребность значит оставить сырой
   * остаток, который надо куда-то девать сегодня же. Замерено по всей базе
   * (228 случаев): с непрерывным вариантом и на упаковках пачка уходила в ноль
   * в 39.9% случаев вместо 48.2%, а средний сырой остаток рос с 57 до 66 г.
   * Готового излишка это экономит меньше, чем создаёт сырого.
   *
   * Замер по 60 неделям: хвостов было 715 г/нед, стало 370. Осталось у блюд,
   * которые варят объёмом, но покупают упаковкой, — «Курица с рисом и
   * брокколи», «Индейка с булгуром»; у остальных ноль.
   *
   * Полная непрерывность, включая упаковки, стоила бы дешевле (12 недель × 12
   * прогонов: касса 6820 против 6905 ₽/нед, хвостов 174 против 458 г/нед), но
   * дороже по выброшенному (498 против 471 ₽/нед) — и ровно за счёт сырых
   * остатков, которые нечем закрыть. Разница по деньгам 58 ₽/нед в пользу
   * непрерывности; она оставлена на потом, вместе с перемером веса сырого
   * остатка, который с тех пор не трогали.
   *
   * Верхняя отсечка та же, что была: варят и две кастрюли, и три пачки фарша,
   * но не десять — иначе «не хватает» лечилось бы неподъёмной готовкой.
   */
  const needScale = (context.neededGrams + aheadGrams) / Math.max(1, perScale)
  const scales = [...batch.scales]
  if (batch.reason === 'anchor-pack') {
    // упаковка делится только пополам, и то не всякая: сюда попадает лишь то,
    // что и так есть в сетке, — а закрыть потребность всё равно надо
    if (needScale > maxScale) scales.push(Math.min(needScale, maxScale * 4))
  } else {
    scales.push(Math.min(Math.max(needScale, batch.minScale), maxScale * 4))
  }

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
