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

/**
 * Разбор `YYYY-MM-DD` в местную полночь.
 *
 * Строго: на мусоре падает с внятной ошибкой, а не подставляет число. Первая
 * версия была снисходительной, и это выходило хуже молчания — пустая строка
 * превращалась в 1900 год, а строка с временем в `Invalid Date`, после чего
 * все сравнения с ней становились ложными и просроченный контейнер тихо
 * исчезал из напоминаний. Дата, которую не удалось прочитать, должна остановить
 * расчёт, а не отравить его.
 */
export function parseIso(iso: string): Date {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso ?? '')
  if (!match) throw new Error(`не дата: ${JSON.stringify(iso)}`)
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) throw new Error(`не дата: ${iso}`)
  return date
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

/**
 * Месяцы в родительном падеже: «7 сентября», а не «7 сентябрь».
 *
 * Лежат здесь, а не в каждом экране: одна и та же неделя не должна
 * называться по-разному на соседних экранах.
 */
export const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const

/**
 * Подпись недели: «7–13 сентября», а на стыке месяцев «28 сентября — 4
 * октября».
 *
 * Была написана четырьмя копиями — в меню, в истории недель, в закупке и
 * своим массивом месяцев в морозилке. Копии совпадали побайтно ровно до
 * первой правки: поменяв тире или падеж в одной, получаешь два экрана,
 * по-разному называющих одну и ту же неделю.
 */
export function weekLabel(weekStart: string): string {
  const start = parseIso(weekStart)
  const end = parseIso(weekStart)
  end.setDate(end.getDate() + 6)
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${MONTHS_GEN[end.getMonth()]}`
    : `${start.getDate()} ${MONTHS_GEN[start.getMonth()]} — ${end.getDate()} ${MONTHS_GEN[end.getMonth()]}`
}
