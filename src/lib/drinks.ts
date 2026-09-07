import type { DrinkHabit, DrinkKind, Eater, Household, Norms } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { dailyNorm } from './nutrition'

/**
 * Привычные напитки.
 *
 * Кофе, сок и какао — не блюда, и в меню им делать нечего. Но калории у них
 * настоящие: два капучино в день — это около 280 ккал. Пока вся норма
 * отдавалась еде, фактический рацион оказывался выше нормы ровно на эту
 * величину, и увидеть это было негде.
 *
 * Поэтому напитки резервируют калории заранее: меню собирается уже под
 * остаток. Состав чашки считается из тех же ингредиентов, что и рецепты, —
 * отдельной таблицы калорийности нет и быть не должно.
 */

/** Из чего состоит чашка: доля молока в объёме и что кладут кроме него. */
interface Composition {
  label: string
  /** Какая часть объёма — молоко. Остальное вода или сама основа. */
  milkShare: number
  /** Основа: id продукта и сколько его на чашку 250 мл. */
  baseId?: string
  baseGramsPer250: number
  /** Напиток целиком состоит из основы: сок, газировка, вино. */
  liquidBase?: boolean
  /** Молоко по умолчанию, если человек ничего не выбрал. */
  defaultMilk?: string
}

const COMPOSITION: Record<DrinkKind, Composition> = {
  americano: { label: 'Американо', milkShare: 0, baseId: 'coffee', baseGramsPer250: 9 },
  latte: {
    label: 'Латте',
    milkShare: 0.8,
    baseId: 'coffee',
    baseGramsPer250: 9,
    defaultMilk: 'milk',
  },
  cappuccino: {
    label: 'Капучино',
    milkShare: 0.6,
    baseId: 'coffee',
    baseGramsPer250: 9,
    defaultMilk: 'milk',
  },
  matcha: {
    label: 'Матча',
    milkShare: 0.7,
    baseId: 'matcha',
    baseGramsPer250: 2,
    defaultMilk: 'milk',
  },
  cocoa: {
    label: 'Какао',
    milkShare: 0.9,
    baseId: 'cocoa',
    baseGramsPer250: 12,
    defaultMilk: 'milk',
  },
  tea: { label: 'Чай', milkShare: 0, baseId: 'tea', baseGramsPer250: 2 },
  juice: { label: 'Сок', milkShare: 0, baseId: 'orange_juice', baseGramsPer250: 250, liquidBase: true },
  soda: { label: 'Газировка', milkShare: 0, baseId: 'cola', baseGramsPer250: 250, liquidBase: true },
  protein: {
    label: 'Протеиновый коктейль',
    milkShare: 1,
    baseId: 'protein_powder',
    baseGramsPer250: 30,
    defaultMilk: 'milk',
  },
  wine: { label: 'Вино', milkShare: 0, baseId: 'wine_dry', baseGramsPer250: 250, liquidBase: true },
  beer: { label: 'Пиво', milkShare: 0, baseId: 'beer_light', baseGramsPer250: 250, liquidBase: true },
}

export const DRINK_KINDS: { id: DrinkKind; label: string }[] = (
  Object.keys(COMPOSITION) as DrinkKind[]
).map((id) => ({ id, label: COMPOSITION[id].label }))

export function drinkLabel(kind: DrinkKind): string {
  return COMPOSITION[kind].label
}

/** Молочные продукты, которыми имеет смысл разбавлять. */
export const MILK_OPTIONS = ['milk', 'oat_milk', 'cream_10', 'coconut_milk']

/**
 * Предложный падеж: «на овсяном молоке», а не «на овсяное молоко». Названия
 * продуктов лежат в базе в именительном, и склонять их правилами ради
 * четырёх строк не нужно.
 */
const MILK_ON: Record<string, string> = {
  milk: 'на молоке',
  oat_milk: 'на овсяном молоке',
  cream_10: 'на сливках',
  coconut_milk: 'на кокосовом молоке',
}

/** Чайная ложка сахара — 5 г; это та ложка, которой сахар кладут в чашку. */
const SUGAR_TSP_G = 5

/** Сколько чего уходит на одну чашку, в базовых единицах продукта. */
export function cupIngredients(habit: DrinkHabit): { ingredientId: string; qty: number }[] {
  const comp = COMPOSITION[habit.kind]
  const out: { ingredientId: string; qty: number }[] = []
  const volume = Math.max(0, habit.volumeMl)
  if (comp.baseId) {
    const qty = comp.liquidBase ? volume : (comp.baseGramsPer250 * volume) / 250
    if (qty > 0) out.push({ ingredientId: comp.baseId, qty })
  }
  const milkId = habit.milkId ?? comp.defaultMilk
  if (milkId && comp.milkShare > 0) {
    out.push({ ingredientId: milkId, qty: volume * comp.milkShare })
  }
  if (habit.sugarTsp > 0) out.push({ ingredientId: 'sugar', qty: habit.sugarTsp * SUGAR_TSP_G })
  if (habit.syrupMl > 0) out.push({ ingredientId: 'syrup', qty: habit.syrupMl })
  return out
}

export interface DrinkStats extends Norms {
  price: number
}

/** Ккал, БЖУ и цена одной чашки. */
export function cupStats(habit: DrinkHabit): DrinkStats {
  let kcal = 0
  let protein = 0
  let fat = 0
  let carbs = 0
  let fiber = 0
  let price = 0
  for (const { ingredientId, qty } of cupIngredients(habit)) {
    const ing = INGREDIENT_BY_ID[ingredientId]
    if (!ing) continue
    const factor = ing.unit === 'pcs' ? qty : qty / 100
    kcal += ing.kcal * factor
    protein += ing.protein * factor
    fat += ing.fat * factor
    carbs += ing.carbs * factor
    fiber += ing.fiber * factor
    price += ing.unit === 'pcs' ? ing.price * qty : (ing.price * qty) / 1000
  }
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    fiber: Math.round(fiber * 10) / 10,
    price: Math.round(price),
  }
}

/** Пьёт ли человек этот напиток в этот день недели. */
export function drinkOn(habit: DrinkHabit, day: number): boolean {
  return habit.days.length === 0 || habit.days.includes(day)
}

/** Напитки одного человека в конкретный день. */
export function drinksOf(household: Household, eaterId: string, day: number): DrinkHabit[] {
  return (household.drinks ?? []).filter((d) => d.eaterId === eaterId && drinkOn(d, day))
}

/** Сколько калорий и БЖУ уходит в напитки за день. */
export function drinkNorms(household: Household, eaterId: string, day: number): Norms {
  const acc: Norms = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
  for (const habit of drinksOf(household, eaterId, day)) {
    const stats = cupStats(habit)
    const times = Math.max(0, habit.perDay)
    acc.kcal += stats.kcal * times
    acc.protein += stats.protein * times
    acc.fat += stats.fat * times
    acc.carbs += stats.carbs * times
    acc.fiber += stats.fiber * times
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein),
    fat: Math.round(acc.fat),
    carbs: Math.round(acc.carbs),
    fiber: Math.round(acc.fiber * 10) / 10,
  }
}

/**
 * Сколько нормы остаётся еде. Ниже этой доли не опускаемся: если напитки
 * съедают почти всю норму, ужимать обед до трёхсот килокалорий — не решение,
 * об этом нужно сказать человеку, а не молча собрать голодное меню.
 */
export const MIN_FOOD_SHARE = 0.6

/** Личная норма за вычетом напитков — по ней и собирается меню. */
export function foodNorm(eater: Eater, household: Household, day: number): Norms {
  const full = dailyNorm(eater)
  const drinks = drinkNorms(household, eater.id, day)
  if (drinks.kcal <= 0) return full
  const floor = full.kcal * MIN_FOOD_SHARE
  const kcal = Math.max(floor, full.kcal - drinks.kcal)
  // БЖУ уменьшаем в той же пропорции, что и калории: делить макросы напитка
  // по отдельности бессмысленно — в капучино нет углеводов ужина
  const share = kcal / (full.kcal || 1)
  return {
    kcal: Math.round(kcal),
    protein: Math.round(full.protein * share),
    fat: Math.round(full.fat * share),
    carbs: Math.round(full.carbs * share),
    // клетчатку не ужимаем: капучино её не заменяет
    fiber: full.fiber,
  }
}

/** Напитки съедают слишком много нормы — это стоит сказать вслух. */
export function drinksOvershoot(eater: Eater, household: Household, day: number): boolean {
  const full = dailyNorm(eater)
  return drinkNorms(household, eater.id, day).kcal > full.kcal * (1 - MIN_FOOD_SHARE)
}

/** Что купить на напитки за неделю: те же продукты, что и для блюд. */
export function drinkShopping(household: Household): Map<string, number> {
  const need = new Map<string, number>()
  for (const habit of household.drinks ?? []) {
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => drinkOn(habit, d)).length
    const cups = days * Math.max(0, habit.perDay)
    if (cups === 0) continue
    for (const { ingredientId, qty } of cupIngredients(habit)) {
      need.set(ingredientId, (need.get(ingredientId) ?? 0) + qty * cups)
    }
  }
  return need
}

/** Человеческая подпись привычки: «Капучино 250 мл на молоке, 2 раза в день». */
export function habitLabel(habit: DrinkHabit): string {
  const parts = [`${drinkLabel(habit.kind)} ${habit.volumeMl} мл`]
  const comp = COMPOSITION[habit.kind]
  const milkId = habit.milkId ?? comp.defaultMilk
  if (comp.milkShare > 0 && milkId) {
    parts.push(MILK_ON[milkId] ?? `на ${INGREDIENT_BY_ID[milkId]?.name.toLowerCase() ?? 'молоке'}`)
  }
  if (habit.sugarTsp > 0) parts.push(`${habit.sugarTsp} ч. л. сахара`)
  if (habit.syrupMl > 0) parts.push(`${habit.syrupMl} мл сиропа`)
  return parts.join(', ')
}
