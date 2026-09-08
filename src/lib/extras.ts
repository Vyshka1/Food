import type { DailyExtra, ExtraKind, Household, MealSlot, Norms } from '../types'
import { statsOf } from './nutrition'

/**
 * Ежедневные дополнения к столу.
 *
 * Овощная тарелка, фрукт, хлеб — это не блюда, и рецептом им быть незачем:
 * резать огурец по рецепту никто не станет. Но 200 г овощей каждый день —
 * это калории, клетчатка и пакет огурцов в закупке. Пока их не было в
 * расчёте, они были и в тарелке, и мимо всех цифр сразу.
 *
 * Устроены так же, как напитки: набор продуктов, доли, дни недели и
 * конкретный человек.
 */

interface Preset {
  label: string
  hint: string
  /** Из чего состоит набор: доли по весу. */
  parts: { ingredientId: string; share: number }[]
  /** Обычный размер в граммах (для штучного — в штуках). */
  defaultAmount: number
  unit: 'g' | 'pcs'
}

const PRESETS: Record<ExtraKind, Preset> = {
  veg_plate: {
    label: 'Овощная тарелка',
    hint: 'огурец, помидор, перец — нарезать и поставить на стол',
    parts: [
      { ingredientId: 'cucumber', share: 0.4 },
      { ingredientId: 'tomato', share: 0.4 },
      { ingredientId: 'bell_pepper', share: 0.2 },
    ],
    defaultAmount: 200,
    unit: 'g',
  },
  fruit: {
    label: 'Фрукт',
    hint: 'яблоко или груша к обеду',
    parts: [
      { ingredientId: 'apple', share: 0.5 },
      { ingredientId: 'pear', share: 0.5 },
    ],
    defaultAmount: 1,
    unit: 'pcs',
  },
  bread: {
    label: 'Хлеб',
    hint: 'ломоть к супу',
    parts: [{ ingredientId: 'bread', share: 1 }],
    defaultAmount: 60,
    unit: 'g',
  },
  nuts: {
    label: 'Орехи',
    hint: 'горсть к завтраку или на перекус',
    parts: [
      { ingredientId: 'walnuts', share: 0.5 },
      { ingredientId: 'almonds', share: 0.5 },
    ],
    defaultAmount: 30,
    unit: 'g',
  },
  yogurt: {
    label: 'Йогурт',
    hint: 'стакан греческого йогурта',
    parts: [{ ingredientId: 'greek_yogurt', share: 1 }],
    defaultAmount: 150,
    unit: 'g',
  },
  cheese: {
    label: 'Сыр',
    hint: 'пара ломтиков',
    parts: [{ ingredientId: 'cheese', share: 1 }],
    defaultAmount: 40,
    unit: 'g',
  },
}

export const EXTRA_KINDS: { id: ExtraKind; label: string; hint: string; unit: 'g' | 'pcs' }[] = (
  Object.keys(PRESETS) as ExtraKind[]
).map((id) => ({
  id,
  label: PRESETS[id].label,
  hint: PRESETS[id].hint,
  unit: PRESETS[id].unit,
}))

export function extraLabel(kind: ExtraKind): string {
  return PRESETS[kind].label
}

export function extraUnit(kind: ExtraKind): 'g' | 'pcs' {
  return PRESETS[kind].unit
}

export function defaultAmount(kind: ExtraKind): number {
  return PRESETS[kind].defaultAmount
}

/** Из чего складывается одно дополнение: продукты и количества. */
export function extraIngredients(extra: DailyExtra): { ingredientId: string; qty: number }[] {
  const preset = PRESETS[extra.kind]
  return preset.parts.map((part) => ({
    ingredientId: part.ingredientId,
    qty: Math.max(0, extra.amount) * part.share,
  }))
}

export interface ExtraStats extends Norms {
  price: number
}

/** Ккал, БЖУ, клетчатка и цена одного дополнения. */
export function extraStats(extra: DailyExtra): ExtraStats {
  return statsOf(extraIngredients(extra))
}

export function extraOn(extra: DailyExtra, day: number): boolean {
  return extra.days.length === 0 || extra.days.includes(day)
}

export function extrasOf(household: Household, eaterId: string, day: number): DailyExtra[] {
  return (household.extras ?? []).filter((e) => e.eaterId === eaterId && extraOn(e, day))
}

/** Что человек съест дополнениями за день. */
export function extraNorms(household: Household, eaterId: string, day: number): Norms {
  const acc: Norms = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
  for (const extra of extrasOf(household, eaterId, day)) {
    const stats = extraStats(extra)
    acc.kcal += stats.kcal
    acc.protein += stats.protein
    acc.fat += stats.fat
    acc.carbs += stats.carbs
    acc.fiber += stats.fiber
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein),
    fat: Math.round(acc.fat),
    carbs: Math.round(acc.carbs),
    fiber: Math.round(acc.fiber * 10) / 10,
  }
}

/** Дополнения к конкретному приёму пищи — их и показываем рядом с блюдом. */
export function extrasAt(household: Household, day: number, slot: MealSlot): DailyExtra[] {
  return (household.extras ?? []).filter((e) => e.slot === slot && extraOn(e, day))
}

/** Что купить на дополнения за неделю. */
export function extraShopping(household: Household): Map<string, number> {
  const need = new Map<string, number>()
  for (const extra of household.extras ?? []) {
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => extraOn(extra, d)).length
    if (days === 0) continue
    for (const { ingredientId, qty } of extraIngredients(extra)) {
      need.set(ingredientId, (need.get(ingredientId) ?? 0) + qty * days)
    }
  }
  return need
}

/**
 * Дательный падеж приёма пищи: «к обеду», а не «к обед». Четыре слова проще
 * выписать, чем склонять правилами.
 */
const SLOT_DAT: Record<MealSlot, string> = {
  breakfast: 'завтраку',
  lunch: 'обеду',
  dinner: 'ужину',
  snack: 'перекусу',
}

/** Подпись: «Овощная тарелка, 200 г, к обеду». */
export function extraSummary(extra: DailyExtra): string {
  const unit = extraUnit(extra.kind) === 'pcs' ? 'шт' : 'г'
  return `${extraLabel(extra.kind)}, ${extra.amount} ${unit}, к ${SLOT_DAT[extra.slot]}`
}
