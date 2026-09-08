import type { Household, Pantry, WeekMenu } from '../types'
import { THAW_LABEL } from '../types'
import { recipeById } from '../data/recipeRegistry'
import { WEEKDAYS_ACC, WEEKDAYS_FULL, cookTasks, takeawayEaters } from './menu'
import { thawReminders } from './thaw'
import { daysLeft, freezerLabel } from './pantry'
import { plural } from './format'

/**
 * Что нужно сделать сегодня и вечером.
 *
 * После появления морозилки напоминания стали функционально важными: блюдо
 * само себя из морозилки в холодильник не переложит, а «достать за 12 часов»
 * узнать постфактум бесполезно.
 *
 * Здесь только вычисление списка. Показывать его можно как угодно — карточкой
 * на экране или системным уведомлением; список от способа показа не зависит.
 */

export type ReminderKind = 'thaw' | 'container' | 'cooking' | 'expiring'

export interface Reminder {
  id: string
  kind: ReminderKind
  title: string
  text: string
  /** Час дня, когда это уместно показать. */
  hour: number
}

/** Вечером накануне — потому что размораживать нужно за ночь. */
const THAW_HOUR = 20
/** Утром — контейнер с собой берут перед выходом. */
const CONTAINER_HOUR = 7
/** Днём — чтобы день готовки не свалился как новость в девять вечера. */
const COOKING_HOUR = 10
const EXPIRING_HOUR = 11

/** Сколько дней до конца срока считается «пора съесть». */
const EXPIRING_SOON_DAYS = 14

export function remindersFor(
  household: Household,
  menu: WeekMenu | null,
  pantry: Pantry,
  day: number,
  today: string,
): Reminder[] {
  const out: Reminder[] = []
  if (!menu) return out

  // 1. Переложить из морозилки в холодильник — сегодня вечером на завтра
  for (const reminder of thawReminders(menu)) {
    if (reminder.day !== day) continue
    const recipe = recipeById(reminder.recipeId)
    if (!recipe) continue
    out.push({
      id: `thaw:${reminder.recipeId}:${reminder.day}`,
      kind: 'thaw',
      title: 'Переложить из морозилки',
      text: `${recipe.title} — ${THAW_LABEL[reminder.method]}, на ${WEEKDAYS_ACC[reminder.forDay]}`,
      hour: THAW_HOUR,
    })
  }

  // 2. Контейнеры с собой — на завтра, потому что собирают их с вечера
  const tomorrow = (day + 1) % 7
  const containers = household.meals.flatMap((slot) =>
    takeawayEaters(household, tomorrow, slot).map((e) => ({ slot, eater: e })),
  )
  if (containers.length > 0) {
    out.push({
      id: `container:${tomorrow}`,
      kind: 'container',
      title: 'Собрать контейнеры',
      text: `${WEEKDAYS_FULL[tomorrow]}: ${containers
        .map((c) => c.eater.name)
        .join(', ')} — ${containers.length} ${plural(containers.length, [
        'контейнер',
        'контейнера',
        'контейнеров',
      ])} с собой`,
      hour: CONTAINER_HOUR,
    })
  }

  // 3. Сегодня день готовки
  const tasks = cookTasks(menu).filter((t) => t.cookDay === day)
  if (tasks.length > 0) {
    out.push({
      id: `cooking:${day}`,
      kind: 'cooking',
      title: 'Сегодня готовим',
      text: `${tasks.length} ${plural(tasks.length, ['блюдо', 'блюда', 'блюд'])} на ближайшие дни`,
      hour: COOKING_HOUR,
    })
  }

  // 4. В морозилке что-то подходит к сроку
  for (const item of pantry.freezer) {
    const left = daysLeft(item, today)
    if (left > EXPIRING_SOON_DAYS) continue
    out.push({
      id: `expiring:${item.id}`,
      kind: 'expiring',
      title: left > 0 ? 'Скоро истечёт срок' : 'Срок вышел',
      text:
        left > 0
          ? `${freezerLabel(item)} в морозилке — осталось ${left} ${plural(left, ['день', 'дня', 'дней'])}`
          : `${freezerLabel(item)} лежит в морозилке дольше срока`,
      hour: EXPIRING_HOUR,
    })
  }

  return out.sort((a, b) => a.hour - b.hour)
}

/** Напоминания, время которых уже наступило — их и показываем. */
export function dueNow(reminders: Reminder[], hour: number): Reminder[] {
  return reminders.filter((r) => hour >= r.hour)
}
