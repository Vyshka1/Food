import type { Kitchen, PieceCooking, Recipe } from '../types'

/**
 * Штучное блюдо на кухне, а не в таблице.
 *
 * «33 оладьи» — арифметически честное число: столько выходит из теста. Но на
 * сковороде помещается пять, значит это семь заходов, и время готовки нельзя
 * взять из базового рецепта с поправкой «не больше чем вдвое». Здесь живут те
 * три вещи, которых не хватало: сколько влезает за раз, сколько это заходов и
 * какие количества человек вообще считает нормальными.
 */

export function pieceCookingOf(recipe: Recipe): PieceCooking | undefined {
  return recipe.batch?.piece
}

/** Сколько заходов нужно на это количество изделий. */
export function loads(pieces: number, cooking: PieceCooking, pans = 1): number {
  const capacity = Math.max(1, cooking.perLoad * Math.max(1, pans))
  return Math.max(1, Math.ceil(pieces / capacity))
}

/**
 * Сколько минут займёт жарка. Не «время рецепта × коэффициент», а число
 * заходов на время захода: сковорода не растягивается.
 */
export function fryMinutes(pieces: number, cooking: PieceCooking, pans = 1): number {
  return loads(pieces, cooking, pans) * cooking.loadMinutes
}

/**
 * Можно ли и стоит ли ставить вторую сковороду. Одна конфорка — нельзя; два
 * захода и так недолго, а вот с четырёх начинает иметь смысл.
 */
export function needsTwoPans(pieces: number, cooking: PieceCooking, kitchen: Kitchen): boolean {
  return kitchen.burners >= 2 && loads(pieces, cooking) >= 4
}

/**
 * Ближайшее удобное количество, которое закрывает потребность.
 *
 * Ровно столько, сколько нужно по норме, человек не делает: он делает дюжину
 * или полторы. Если потребность выше разумного максимума — упираемся в него,
 * а не жарим сорок котлет.
 */
export function convenientCount(target: number, cooking: PieceCooking): number {
  const sizes = [...cooking.sizes].sort((a, b) => a - b)
  const fits = sizes.find((size) => size >= target)
  return Math.min(cooking.max, fits ?? sizes[sizes.length - 1] ?? cooking.max)
}

/** Все удобные размеры, которые имеет смысл предложить. */
export function sizeOptions(cooking: PieceCooking): number[] {
  return [...cooking.sizes].filter((s) => s <= cooking.max).sort((a, b) => a - b)
}

/** «20 оладий — 4 захода по сковороде, 16 минут жарки». */
export function loadLabel(pieces: number, cooking: PieceCooking, pans = 1): string {
  const count = loads(pieces, cooking, pans)
  const word = count === 1 ? 'заход' : count > 1 && count < 5 ? 'захода' : 'заходов'
  const pansNote = pans > 1 ? ' на двух сковородах' : ''
  const perLoad = cooking.perLoad * Math.max(1, pans)
  return `${count} ${word}${pansNote} по ${perLoad} шт · ${fryMinutes(pieces, cooking, pans)} мин`
}
