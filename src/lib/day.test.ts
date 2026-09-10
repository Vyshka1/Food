import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isoDate, mondayOf, parseIso, today, weekLabel } from './day'

/*
 * Проверки написаны так, чтобы проходить в любом часовом поясе: даты и
 * строятся, и читаются по местному календарю. Там, где нужен именно сдвиг
 * относительно Гринвича, тест сам смотрит на смещение и пропускается в UTC —
 * иначе он был бы зелёным по случайности, а не по существу.
 */
const OFFSET_MINUTES = new Date(2026, 8, 9).getTimezoneOffset()

describe('календарный день', () => {
  it('дата берётся по местному календарю, а не по всемирному', () => {
    // половина второго ночи девятого сентября — это девятое сентября
    expect(isoDate(new Date(2026, 8, 9, 1, 30))).toBe('2026-09-09')
    expect(isoDate(new Date(2026, 8, 9, 23, 59))).toBe('2026-09-09')
    expect(isoDate(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
    expect(today(new Date(2026, 8, 9, 1, 30))).toBe('2026-09-09')
  })

  it('и это не то же самое, что всемирная дата', () => {
    /*
     * Ровно та поломка, из-за которой всё затевалось: в Москве с полуночи до
     * трёх ночи всемирная дата — ещё вчерашняя. В UTC проверять нечего.
     */
    if (OFFSET_MINUTES === 0) return
    const night = OFFSET_MINUTES > 0 ? new Date(2026, 8, 9, 23, 30) : new Date(2026, 8, 9, 1, 30)
    expect(isoDate(night)).toBe('2026-09-09')
    expect(night.toISOString().slice(0, 10)).not.toBe(isoDate(night))
  })

  it('разбор и печать сходятся туда и обратно', () => {
    for (const iso of ['2026-01-01', '2026-09-09', '2026-12-31', '2024-02-29']) {
      expect(isoDate(parseIso(iso)), iso).toBe(iso)
    }
    // и разбор даёт местную полночь, а не полночь по Гринвичу
    const d = parseIso('2026-09-09')
    expect(d.getHours()).toBe(0)
    expect(d.getDate()).toBe(9)
  })
})

describe('понедельник недели', () => {
  it('в любой час суток отвечает одинаково', () => {
    /*
     * Прежняя версия считала день недели по местному времени, а печатала по
     * всемирному, и ночью возвращала воскресенье. Приложение сравнивало это с
     * сохранённым понедельником, решало, что наступила новая неделя, и
     * пересобирало меню — ночью, молча, на случайном зерне.
     */
    for (const hour of [0, 1, 2, 3, 12, 23]) {
      expect(mondayOf(new Date(2026, 8, 9, hour, 30)), `${hour}:30`).toBe('2026-09-07')
    }
  })

  it('вся неделя сводится к своему понедельнику', () => {
    // 7 сентября 2026 — понедельник, 13-е — воскресенье
    for (let day = 7; day <= 13; day++) {
      expect(mondayOf(new Date(2026, 8, day, 1, 30)), `${day} сентября`).toBe('2026-09-07')
    }
    // а 14-е — уже следующая неделя
    expect(mondayOf(new Date(2026, 8, 14, 1, 30))).toBe('2026-09-14')
  })

  it('воскресенье относится к прошедшей неделе, а не к будущей', () => {
    expect(mondayOf(new Date(2026, 8, 13, 23, 59))).toBe('2026-09-07')
  })
})

describe('сдвиг и разность дней', () => {
  it('считает по календарю', () => {
    expect(addDays('2026-09-09', 1)).toBe('2026-09-10')
    expect(addDays('2026-09-09', -1)).toBe('2026-09-08')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(daysBetween('2026-09-09', '2026-09-16')).toBe(7)
    expect(daysBetween('2026-09-16', '2026-09-09')).toBe(-7)
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('перевод часов не отнимает и не добавляет суток', () => {
    /*
     * В ночь на 25 октября 2026 Европа переводит часы. Если считать разницу
     * миллисекундами от полуночи, сутки получаются 23- или 25-часовыми, и
     * срок годности заготовки уезжает на день.
     */
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })
})

describe('разбор не выдумывает дат', () => {
  it('мусор останавливает расчёт, а не отравляет его', () => {
    /*
     * Снисходительный разбор оказался хуже молчания: пустая строка давала 1900
     * год, строка с временем — Invalid Date, после чего все сравнения с ней
     * становились ложными и просроченный контейнер тихо исчезал из
     * напоминаний. Такое лучше заметить сразу.
     */
    for (const bad of ['', '2026', '2026-09', 'вчера', '2026-09-09T12:00:00Z', '2026-13-40x']) {
      expect(() => parseIso(bad), JSON.stringify(bad)).toThrow()
    }
    expect(() => parseIso(undefined as unknown as string)).toThrow()
    // а неполные, но однозначные числа читаются
    expect(parseIso('2026-9-9')).toEqual(parseIso('2026-09-09'))
  })
})

describe('в приложении нет всемирных дат', () => {
  it('никто не считает календарный день через всемирное время', () => {
    /*
     * Единственный способ не завести это заново: у экранов тестов нет, а
     * выражения соблазнительно короткие. Сторожим обе стороны — и печать даты,
     * и разбор строки: `new Date('2026-01-05')` это гринвичская полночь, то
     * есть в минусовых поясах предыдущий день.
     */
    const sources = import.meta.glob('../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    // проверка не должна молча опустеть, если glob однажды перестанет работать
    expect(Object.keys(sources).length).toBeGreaterThan(40)
    expect(Object.keys(sources).some((p) => p.endsWith('/store.tsx'))).toBe(true)

    const forbidden: [RegExp, string][] = [
      [/toISOString\(\)\s*\.\s*(slice|substring|substr)/, 'дата из toISOString'],
      [/toISOString\(\)\s*\.\s*split\(/, 'дата из toISOString'],
      [/getUTC(FullYear|Month|Date|Day)\b/, 'всемирные части даты'],
      [/new Date\(\s*['"`]\d{4}-\d{2}-\d{2}/, "разбор 'YYYY-MM-DD' через new Date"],
    ]
    const guilty: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      // сам модуль дат про это и рассказывает, а тесты вправе показывать «как было»
      if (path.includes('/day.') || path.includes('.test.')) continue
      for (const [pattern, what] of forbidden) {
        if (pattern.test(text)) guilty.push(`${path}: ${what}`)
      }
    }
    expect(guilty).toEqual([])
  })

  it('и сторож не пропустит, если это вернуть', () => {
    // проверка самой проверки: шаблоны действительно ловят прежний код
    const patterns = [
      /toISOString\(\)\s*\.\s*(slice|substring|substr)/,
      /new Date\(\s*['"`]\d{4}-\d{2}-\d{2}/,
    ]
    const wasBroken = "const today = new Date().toISOString().slice(0, 10)\nnew Date('2026-01-05')"
    expect(patterns.some((p) => p.test(wasBroken))).toBe(true)
    expect(patterns.every((p) => p.test(wasBroken))).toBe(true)
  })
})

describe('подпись недели', () => {
  /*
   * Одна неделя — одно название на всех экранах. Ветка на стыке месяцев не
   * проверялась ничем во всём проекте: её можно было заменить на «7.9 - 13.9»,
   * и все тесты оставались зелёными. А видна она читателю раз в месяц.
   */
  it('внутри месяца — короткая форма', () => {
    expect(weekLabel('2026-09-07')).toBe('7–13 сентября')
    expect(weekLabel('2026-09-01')).toBe('1–7 сентября')
  })

  it('на стыке месяцев называет оба', () => {
    expect(weekLabel('2026-09-28')).toBe('28 сентября — 4 октября')
    expect(weekLabel('2026-12-28')).toBe('28 декабря — 3 января')
  })

  it('високосный февраль не сбивает границу', () => {
    // 2024-02-26 + 6 = 3 марта, потому что февраль в 2024-м двадцатидевятидневный
    expect(weekLabel('2024-02-26')).toBe('26 февраля — 3 марта')
    // а в невисокосном 2026-м та же дата даёт другой конец недели
    expect(weekLabel('2026-02-23')).toBe('23 февраля — 1 марта')
  })

  it('месяцы стоят в родительном падеже', () => {
    expect(weekLabel('2026-05-04')).toBe('4–10 мая')
    expect(weekLabel('2026-08-03')).toBe('3–9 августа')
  })
})
