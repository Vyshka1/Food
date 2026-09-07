import type { Ingredient } from '../types'
import { plural } from './format'

/**
 * Кухонные меры вместо аптечных.
 *
 * «Лук — 42 г» и «Сметана — 21 г» формально верны и совершенно бесполезны:
 * никто не взвешивает луковицу и не отмеряет двадцать один грамм сметаны.
 * Здесь количество переводится в то, чем человек реально меряет: штуки,
 * половинки, ложки, — а граммы остаются рядом как уточнение.
 *
 * Точность намеренно бытовая. Задача — чтобы человек узнал свою луковицу, а
 * не попал в грамм: средняя луковица бывает и 70, и 120 граммов, и делать
 * вид, что мы знаем её вес точно, было бы враньём. Поэтому везде «около».
 */

/** Крупы и сыпучее считаем с шагом 5 г — мельче не имеет смысла. */
const GRAIN_STEP = 5

/** Половинки, которые человек реально отмеряет: ¼, ⅓, ½, ⅔, ¾. */
const FRACTIONS: [value: number, label: string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
]

/** Ближайшая бытовая доля, если число близко к ней. */
function fractionLabel(value: number): string | null {
  for (const [amount, label] of FRACTIONS) {
    if (Math.abs(value - amount) <= 0.08) return label
  }
  return null
}

/** «1½», «2», «¾» — как человек назовёт количество штук. */
function countLabel(count: number): string | null {
  if (count < 0.17) return null
  const whole = Math.floor(count + 1e-9)
  const rest = count - whole
  const fraction = rest > 0.08 ? fractionLabel(rest) : ''
  if (fraction === null) return null
  if (whole === 0) return fraction || null
  return fraction ? `${whole}${fraction}` : String(whole)
}

/**
 * «1 луковица», но «½ луковицы» и «1½ луковицы»: дробное число в русском
 * требует родительного падежа, и склонять по округлённой единице нельзя.
 * Та же ловушка, что была с «2,5 порций».
 */
function pieceNoun(count: number, names: [string, string, string]): string {
  const rounded = Math.round(count * 100) / 100
  if (!Number.isInteger(rounded)) return names[1]
  return plural(rounded, names)
}

export interface Measure {
  /** Как это назвать человеку: «½ луковицы», «1 ст. л.», «220 г». */
  text: string
  /** Уточнение в граммах, если основная мера не в них. */
  approx?: string
}

/**
 * Количество в кухонном виде.
 *
 * Порядок проверок — от самого понятного к самому формальному:
 * штучное → штуки; то, что считают штуками, хоть и продают на вес →
 * «½ луковицы»; мелочь густую и жидкую → ложки; всё остальное → граммы с
 * разумным округлением.
 */
export function householdQty(ing: Ingredient, qty: number): Measure {
  if (qty <= 0) return { text: '—' }

  // Штучное — только целыми. Половину банана не купить и не отложить: она
  // потемнеет за день. Список покупок штучное и так округлял вверх, а карточка
  // показывала «1½ шт» — карточка и закупка расходились на одном и том же
  // продукте.
  if (ing.unit === 'pcs') {
    return { text: `${Math.max(1, Math.ceil(qty - 0.001))} шт` }
  }

  const unit = ing.unit === 'ml' ? 'мл' : 'г'

  // то, что считают штуками: лук, чеснок, перец — «½ луковицы, около 45 г»
  if (ing.pieceGrams && ing.pieceGrams > 0) {
    const count = qty / ing.pieceGrams
    // выше трёх штук дробность уже не помогает: проще сказать «около 400 г»
    if (count <= 3.2) {
      const label = countLabel(count)
      if (label) {
        const noun = ing.pieceName ? pieceNoun(count, ing.pieceName) : 'шт'
        return { text: `${label} ${noun}`, approx: `около ${roundTo(qty, 5)} ${unit}` }
      }
    }
  }

  // густое и жидкое по мелочи: ложками, а не граммами
  if (ing.tbspGrams && ing.tbspGrams > 0 && qty <= ing.tbspGrams * 4.5) {
    const spoons = qty / ing.tbspGrams
    const label = countLabel(Math.round(spoons * 2) / 2)
    if (label) {
      const whole = Math.max(1, Math.round(spoons))
      return {
        text: `${label} ${plural(whole, ['ст. л.', 'ст. л.', 'ст. л.'])}`,
        approx: `около ${roundTo(qty, 5)} ${unit}`,
      }
    }
  }

  // специи и соль масштабировать до долей грамма бессмысленно
  if (ing.staple && qty < 15) return { text: 'по вкусу' }

  return { text: `${roundTo(qty, qty < 100 ? GRAIN_STEP : 10)} ${unit}` }
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step)
}

/** Одной строкой: «½ луковицы · около 45 г». */
export function measureText(ing: Ingredient, qty: number): string {
  const measure = householdQty(ing, qty)
  return measure.approx ? `${measure.text} · ${measure.approx}` : measure.text
}

