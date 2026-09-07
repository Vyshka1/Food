import type { Eater, Household, MealPlace, MealSlot } from '../types'
import { MEAL_SLOTS } from '../types'
import { plural } from './format'

/**
 * Кто где ест.
 *
 * Двух состояний «дома / не дома» не хватает. Обед, который Кирилл берёт с
 * собой в офис, — это не «не дома»: еду для него готовят и покупают, просто
 * съедена она будет в другом месте и из контейнера. Пока эти два случая были
 * одним, приложение либо покупало лишний обед, либо не покупало нужный.
 *
 * Отсюда три состояния и разные последствия у каждого:
 *   дома     — готовим, покупаем, едим за столом;
 *   с собой  — готовим и покупаем, но нужен контейнер и блюдо, которое доедет;
 *   не дома  — не готовим и не покупаем.
 */

/** Ключ приёма пищи: день недели плюс приём. */
export function mealKey(day: number, slot: MealSlot): string {
  return `${day}:${slot}`
}

/** Где человек ест этот приём пищи. По умолчанию — дома. */
export function mealPlaceOf(eater: Eater, day: number, slot: MealSlot): MealPlace {
  return eater.mealPlaces?.[mealKey(day, slot)] ?? 'home'
}

/** Готовим ли мы на этого человека в этот приём пищи. */
export function isFed(eater: Eater, day: number, slot: MealSlot): boolean {
  return mealPlaceOf(eater, day, slot) !== 'away'
}

/** Нужен ли контейнер. */
export function isTakeaway(eater: Eater, day: number, slot: MealSlot): boolean {
  return mealPlaceOf(eater, day, slot) === 'takeaway'
}

/** На кого готовим этот приём пищи. */
export function fedEaters(household: Household, day: number, slot: MealSlot): Eater[] {
  return household.eaters.filter((e) => isFed(e, day, slot))
}

/** Кому в этот приём пищи собирать контейнер. */
export function takeawayEaters(household: Household, day: number, slot: MealSlot): Eater[] {
  return household.eaters.filter((e) => isTakeaway(e, day, slot))
}

/** Следующее состояние по кругу: дома → с собой → не дома → дома. */
export function nextPlace(place: MealPlace): MealPlace {
  return place === 'home' ? 'takeaway' : place === 'takeaway' ? 'away' : 'home'
}

export interface PlaceCounts {
  home: number
  takeaway: number
  away: number
}

/** Сколько приёмов пищи каждого вида у человека за неделю. */
export function placeCounts(eater: Eater, meals: MealSlot[]): PlaceCounts {
  const counts: PlaceCounts = { home: 0, takeaway: 0, away: 0 }
  for (let day = 0; day < 7; day++) {
    for (const slot of meals) counts[mealPlaceOf(eater, day, slot)]++
  }
  return counts
}

/**
 * Сколько контейнеров нужно собрать в этот день. Считаем по приёмам, а не по
 * людям: два человека берут обед с собой — это два контейнера.
 */
export function containersOn(household: Household, day: number): number {
  return household.meals.reduce((sum, slot) => sum + takeawayEaters(household, day, slot).length, 0)
}

/** Всего контейнеров за неделю — с этим числом сверяется запас на кухне. */
export function containersPerWeek(household: Household): number {
  let total = 0
  for (let day = 0; day < 7; day++) total += containersOn(household, day)
  return total
}

export interface AttendanceTemplate {
  id: string
  label: string
  hint: string
  /** Что получится для одного человека при данном наборе приёмов пищи. */
  build(meals: MealSlot[]): Record<string, MealPlace>
}

const WORKDAYS = [0, 1, 2, 3, 4]

function build(
  meals: MealSlot[],
  pick: (day: number, slot: MealSlot) => MealPlace,
): Record<string, MealPlace> {
  const map: Record<string, MealPlace> = {}
  for (let day = 0; day < 7; day++) {
    for (const slot of meals) {
      const place = pick(day, slot)
      // «дома» — состояние по умолчанию, хранить его незачем
      if (place !== 'home') map[mealKey(day, slot)] = place
    }
  }
  return map
}

/**
 * Готовые расклады. Заполнять матрицу из 28 клеток руками ради «обычной
 * рабочей недели» человек не станет, а без неё расчёт покупает лишнее.
 */
export const ATTENDANCE_TEMPLATES: AttendanceTemplate[] = [
  {
    id: 'workweek',
    label: 'Рабочая неделя',
    hint: 'обед с собой по будням',
    build: (meals) => build(meals, (day, slot) => (slot === 'lunch' && WORKDAYS.includes(day) ? 'takeaway' : 'home')),
  },
  {
    id: 'office',
    label: 'Обеды в офисе',
    hint: 'по будням обедает не дома',
    build: (meals) => build(meals, (day, slot) => (slot === 'lunch' && WORKDAYS.includes(day) ? 'away' : 'home')),
  },
  {
    id: 'home',
    label: 'Все дома',
    hint: 'отпуск, выходные, удалённая неделя',
    build: (meals) => build(meals, () => 'home'),
  },
  {
    id: 'trip',
    label: 'Командировка',
    hint: 'будни вне дома, выходные дома',
    build: (meals) => build(meals, (day) => (WORKDAYS.includes(day) ? 'away' : 'home')),
  },
]

/** Скопировать расклад одного дня на все будни — «каждый вторник одно и то же». */
export function copyDayToWorkdays(
  places: Record<string, MealPlace>,
  meals: MealSlot[],
  from: number,
): Record<string, MealPlace> {
  const next = { ...places }
  for (const day of WORKDAYS) {
    for (const slot of meals) {
      const place = places[mealKey(from, slot)] ?? 'home'
      if (place === 'home') delete next[mealKey(day, slot)]
      else next[mealKey(day, slot)] = place
    }
  }
  return next
}

/** Человеческая сводка: «5 приёмов с собой, 1 вне дома». */
export function attendanceSummary(eater: Eater, meals: MealSlot[]): string {
  const counts = placeCounts(eater, meals)
  if (counts.takeaway === 0 && counts.away === 0) return 'ест дома всю неделю'
  const parts: string[] = []
  const word = (n: number) => plural(n, ['приём', 'приёма', 'приёмов'])
  if (counts.takeaway > 0) parts.push(`${counts.takeaway} ${word(counts.takeaway)} с собой`)
  if (counts.away > 0) parts.push(`${counts.away} ${word(counts.away)} вне дома`)
  return parts.join(', ')
}

/** Название приёма пищи в нижнем регистре — для подписей и подсказок. */
export function slotLabel(slot: MealSlot): string {
  return (MEAL_SLOTS.find((m) => m.id === slot)?.label ?? slot).toLowerCase()
}
