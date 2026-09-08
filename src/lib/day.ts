/**
 * Календарные даты приложения — местные, а не всемирные.
 *
 * Приложение оперирует днями, а не моментами времени: «сегодня», «понедельник
 * этой недели», «до какого числа съесть». Такие даты живут строкой
 * `YYYY-MM-DD`, и переводить их через UTC нельзя ни в одну сторону.
 *
 * Как ломалось. `new Date().toISOString().slice(0, 10)` берёт всемирную дату:
 * в Москве с полуночи до трёх ночи это ещё вчера. А `mondayOf` считал день
 * недели по местному времени и печатал результат по всемирному — и в те же
 * ночные часы возвращал воскресенье вместо понедельника. Проверка «наступила
 * ли новая неделя» сравнивала сохранённый понедельник с этим воскресеньем,
 * не сходилась, и приложение, открытое ночью, убирало текущую неделю в
 * историю и пересобирало меню на случайном зерне: закрепления, отметки и
 * подбор пропадали.
 *
 * Обратный разбор так же важен: `new Date('2026-01-05')` — это полночь по
 * Гринвичу, то есть в минусовых поясах предыдущий день. Поэтому строки
 * разбираются здесь же, и туда и обратно одинаково.
 */

/** Дата как календарный день по местному времени: `YYYY-MM-DD`. */
export function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Сегодняшний день. */
export function today(now: Date = new Date()): string {
  return isoDate(now)
}

/** Разбор `YYYY-MM-DD` в местную полночь. */
export function parseIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** Понедельник той недели, в которую попадает дата. */
export function mondayOf(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay(): воскресенье это 0, а неделя у нас начинается с понедельника
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoDate(d)
}

/** Дата через столько дней. Отрицательное значение — назад. */
export function addDays(iso: string, days: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

/**
 * Сколько суток между двумя календарными днями.
 *
 * Считаем по календарю, а не по миллисекундам: между 27 и 28 октября ровно
 * один день, даже если в эту ночь переводили часы.
 */
export function daysBetween(from: string, to: string): number {
  const a = parseIso(from)
  const b = parseIso(to)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
