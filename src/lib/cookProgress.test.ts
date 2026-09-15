import { describe, expect, it } from 'vitest'
import type { PlannedStep } from '../types'
import {
  ALERT_BEFORE,
  COOK_RUN_KEY,
  cookProgress,
  cookedDishes,
  newCookRun,
  parseCookRun,
  runElapsed,
  runPauses,
  secondsLeft,
  stepKey,
} from './cookProgress'

function step(patch: Partial<PlannedStep> & { start: number; end: number }): PlannedStep {
  return {
    recipeId: 'r1',
    title: 'Блюдо',
    emoji: '',
    stepIndex: 0,
    text: 'Шаг',
    station: 'prep',
    handsOn: true,
    activeMinutes: patch.end - patch.start,
    unattended: false,
    cook: 0,
    ...patch,
  }
}

/** Нарезать 0–10, запекать 10–40 (само), полить 40–45. */
const plan: PlannedStep[] = [
  step({ start: 0, end: 10, stepIndex: 0, text: 'Нарезать' }),
  step({
    start: 10, end: 40, stepIndex: 1, text: 'Запекать',
    station: 'oven', handsOn: false, unattended: true, activeMinutes: 0, cook: null,
  }),
  step({ start: 40, end: 45, stepIndex: 2, text: 'Полить соусом' }),
]

const min = (m: number) => m * 60

describe('что делать сейчас', () => {
  it('в начале показывает первый шаг', () => {
    const p = cookProgress(plan, [], 0)
    expect(p.current?.text).toBe('Нарезать')
    expect(p.started).toBe(true)
    expect(p.doneCount).toBe(0)
    expect(p.totalCount).toBe(3)
  })

  it('после отметки переходит к следующему', () => {
    const p = cookProgress(plan, [stepKey(plan[0])], min(10))
    expect(p.current?.text).toBe('Запекать')
    expect(p.doneCount).toBe(1)
  })

  it('шаг, который ещё не начался, помечен как не начатый', () => {
    // всё сделано раньше плана: следующий шаг показать надо, но как «скоро»
    const p = cookProgress(plan, [stepKey(plan[0]), stepKey(plan[1])], min(12))
    expect(p.current?.text).toBe('Полить соусом')
    expect(p.started).toBe(false)
  })

  it('когда всё отмечено, текущего шага нет', () => {
    const p = cookProgress(plan, plan.map(stepKey), min(50))
    expect(p.allDone).toBe(true)
    expect(p.current).toBeNull()
    expect(p.next).toBeNull()
  })
})

describe('параллельные процессы', () => {
  it('пока духовка работает, крупной операцией идёт дело для рук', () => {
    // 15-я минута: запеканка в духовке, но заняться надо посудой — иначе
    // экран советует смотреть на духовку вместо того, чем занять руки
    const withHands = cookProgress(
      [...plan, step({ start: 12, end: 20, stepIndex: 3, text: 'Помыть посуду' })],
      [stepKey(plan[0])],
      min(15),
    )
    expect(withHands.current?.text).toBe('Помыть посуду')
    expect(withHands.running.map((s) => s.text)).toContain('Запекать')
  })

  it('если делать больше нечего, показывает то, что идёт само', () => {
    const p = cookProgress(plan, [stepKey(plan[0])], min(20))
    expect(p.current?.text).toBe('Запекать')
    expect(p.running).toEqual([])
  })

  it('одно и то же дело не показывается дважды', () => {
    // регрессия: «Дальше» повторяло шаг, который уже висел в «идёт само»
    const withHands = cookProgress(
      [...plan, step({ start: 12, end: 20, stepIndex: 3, text: 'Помыть посуду' })],
      [stepKey(plan[0])],
      min(15),
    )
    for (const running of withHands.running) {
      expect(withHands.next).not.toBe(running)
    }
    expect(withHands.next).not.toBe(withHands.current)
  })

  it('шаг, требующий рук, в «идёт само» не попадает', () => {
    const p = cookProgress(plan, [], min(5))
    expect(p.running).toEqual([])
  })
})

describe('предупреждение «через 3 минуты»', () => {
  // руки заняты долгим делом, пока в духовке стоит запеканка — тот самый
  // случай, ради которого предупреждение и нужно
  const busy = [...plan, step({ start: 12, end: 45, stepIndex: 3, text: 'Лепить котлеты' })]
  const done = [stepKey(plan[0])]

  it('молчит, пока духовке ещё долго', () => {
    expect(cookProgress(busy, done, min(20)).alerts).toEqual([])
  })

  it('срабатывает ровно за три минуты до конца', () => {
    expect(cookProgress(busy, done, min(40 - ALERT_BEFORE) - 1).alerts).toEqual([])
    expect(cookProgress(busy, done, min(40 - ALERT_BEFORE)).alerts).toHaveLength(1)
    expect(cookProgress(busy, done, min(39)).alerts[0].text).toBe('Запекать')
  })

  /*
   * Раньше здесь проверялось обратное: просроченный шаг из «идёт само» и из
   * тревог убирался. Так и было — и именно это ловила ревизия: «дать тесту
   * постоять» тикало до 0:20 и на следующем тике пропадало с экрана целиком,
   * ровно в ту минуту, ради которой режим и включают. Молчать о просроченной
   * духовке нельзя: еда из неё сама не выйдет.
   */
  it('просроченный пассивный шаг остаётся на виду и кричит громче', () => {
    const p = cookProgress(busy, done, min(41))
    expect(p.running.map((s) => s.text)).toEqual(['Запекать'])
    expect(p.alerts.map((s) => s.text)).toEqual(['Запекать'])
    // счётчик показывает, насколько ушли за срок, а не «0:00»
    expect(secondsLeft(p.alerts[0], min(41))).toBe(min(-1))
  })

  it('в секунду готовности шаг никуда не девается', () => {
    // граница, на которой он исчезал: elapsed < end было ложью ровно в end
    for (const at of [min(40) - 1, min(40), min(40) + 1]) {
      const p = cookProgress(busy, done, at)
      expect(p.running.map((s) => s.text), `${at} с`).toEqual(['Запекать'])
    }
  })

  it('срочное идёт первым: просроченное важнее, чем «через три минуты»', () => {
    // «Настояться» стоит в плане раньше — то есть порядок задаёт срочность, а
    // не место в списке: просроченная духовка обязана быть первой строкой
    const two = [
      step({
        start: 20, end: 60, stepIndex: 0, recipeId: 'r3', text: 'Настояться',
        handsOn: false, unattended: true, activeMinutes: 0, cook: null,
      }),
      ...busy,
    ]
    // 58-я минута: «Запекать» просрочено на 18 минут, «Настояться» — через две
    const p = cookProgress(two, done, min(58))
    expect(p.alerts.map((s) => s.text)).toEqual(['Запекать', 'Настояться'])
  })
})

describe('«идёт само» — это утверждение о факте', () => {
  /** Нарезать 0–15, варить 15–30 (само), посолить 30–35. */
  const soup: PlannedStep[] = [
    step({ start: 0, end: 15, stepIndex: 0, text: 'Нарезать овощи' }),
    step({
      start: 15, end: 30, stepIndex: 1, text: 'Варить до мягкости',
      station: 'stove', handsOn: false, unattended: true, activeMinutes: 0, cook: null,
    }),
    step({ start: 30, end: 35, stepIndex: 2, text: 'Посолить' }),
  ]

  it('кастрюля, которую не ставили, на плите не кипит', () => {
    // двадцать минут ничего не нажимали: по часам варка идёт, по факту овощи
    // ещё не нарезаны — и кнопка «Снял» унесла бы шаг из плана насовсем
    const p = cookProgress(soup, [], min(20))
    expect(p.current?.text).toBe('Нарезать овощи')
    expect(p.running).toEqual([])
    expect(p.next?.text).toBe('Варить до мягкости')
  })

  it('после отметки предшественника — кипит', () => {
    const p = cookProgress([...soup, step({ start: 16, end: 25, stepIndex: 0, recipeId: 'r2', text: 'Помыть посуду' })], [stepKey(soup[0])], min(20))
    expect(p.running.map((s) => s.text)).toEqual(['Варить до мягкости'])
  })
})

describe('пауза не останавливает духовку', () => {
  /** Запекать 0–30 (само), лепить 0–50 руками. */
  const oven = step({
    start: 0, end: 30, stepIndex: 0, text: 'Запекать овощи',
    station: 'oven', appliance: 'oven', handsOn: false, unattended: true, activeMinutes: 0, cook: null,
  })
  const hands = step({ start: 0, end: 50, stepIndex: 0, recipeId: 'r2', text: 'Лепить пирожки' })

  it('шесть минут паузы съедают шесть минут духовки', () => {
    // 10-я минута плана, до конца 20:00; постояли 6 минут — в духовке 14:00
    const paused = [{ at: min(10), seconds: min(6) }]
    expect(secondsLeft(oven, min(10))).toBe(min(20))
    expect(secondsLeft(oven, min(10), paused)).toBe(min(14))
  })

  it('ручной шаг на паузу встаёт вместе с поваром', () => {
    const paused = [{ at: min(10), seconds: min(6) }]
    expect(secondsLeft(hands, min(10), paused)).toBe(min(40))
  })

  it('пауза до начала шага сдвигает его вместе с планом', () => {
    // в духовке пока пусто: пауза пришлась на время до того, как её включили
    const later = step({ ...oven, start: 20, end: 50 })
    expect(secondsLeft(later, min(10), [{ at: min(5), seconds: min(6) }])).toBe(min(40))
  })

  it('тревога срабатывает, пока стоим на паузе', () => {
    const paused = [{ at: min(10), seconds: min(18) }]
    const p = cookProgress([oven, hands], [], min(10), paused)
    expect(p.current?.text).toBe('Лепить пирожки')
    expect(p.alerts.map((s) => s.text)).toEqual(['Запекать овощи'])
  })
})

describe('какие блюда приготовлены', () => {
  const two = [
    step({ start: 0, end: 10, stepIndex: 0, text: 'Нарезать' }),
    step({ start: 10, end: 20, stepIndex: 1, text: 'Потушить' }),
    step({ start: 0, end: 5, stepIndex: 0, recipeId: 'r2', title: 'Салат', text: 'Смешать' }),
  ]

  it('блюдо считается приготовленным, когда закрыт его последний шаг', () => {
    expect(cookedDishes(two, [])).toEqual([])
    expect(cookedDishes(two, [stepKey(two[0])])).toEqual([])
    expect(cookedDishes(two, [stepKey(two[2])])).toEqual(['r2'])
    expect(cookedDishes(two, two.map(stepKey)).sort()).toEqual(['r1', 'r2'])
  })

  it('блюда без шагов не приготовлены сами собой', () => {
    expect(cookedDishes([], [])).toEqual([])
  })
})

describe('ход готовки переживает крестик и перезагрузку', () => {
  const run = newCookRun('2026-08-31|2', 1_000_000, ['ключ'])

  it('таймер продолжает идти от старта, а не с нуля', () => {
    expect(runElapsed(run, 1_000_000 + min(5) * 1000)).toBe(min(5))
  })

  it('на паузе таймер стоит', () => {
    const paused = { ...run, pausedAt: 1_000_000 + 60_000 }
    expect(runElapsed(paused, 1_000_000 + 600_000)).toBe(60)
  })

  it('незакрытая пауза считается сразу — духовка не ждёт «Продолжить»', () => {
    const paused = { ...run, pausedAt: 1_000_000 + 60_000 }
    expect(runPauses(paused, 1_000_000 + 300_000)).toEqual([{ at: 60, seconds: 240 }])
  })

  it('прочитанный ход — тот же, что записали', () => {
    const saved = { ...run, pauses: [{ at: 12, seconds: 30 }], done: ['a', 'b'] }
    expect(parseCookRun(JSON.stringify(saved), run.id, 1_100_000)).toEqual(saved)
  })

  it('чужой день и мусор в ключе не поднимаются', () => {
    const cases: [string, string | null][] = [
      ['пусто', null],
      ['не json', '{битый'],
      ['не объект', '"строка"'],
      ['другая готовка', JSON.stringify({ ...run, id: '2026-08-31|5' })],
      ['нет времени старта', JSON.stringify({ ...run, startedAt: 'вчера' })],
      ['отметки не строки', JSON.stringify({ ...run, done: [1, 2] })],
      ['паузы не список', JSON.stringify({ ...run, pauses: { at: 1 } })],
      ['пауза без числа', JSON.stringify({ ...run, pauses: [{ at: 1 }] })],
      ['старт в будущем', JSON.stringify({ ...run, startedAt: 2_000_000 })],
    ]
    for (const [name, raw] of cases) {
      expect(parseCookRun(raw, run.id, 1_100_000), name).toBeNull()
    }
  })

  it('вчерашняя готовка не поднимается: она давно кончилась', () => {
    // самый длинный план в замере — 478 минут; сутки заведомо больше
    const day = 24 * 60 * 60 * 1000
    expect(parseCookRun(JSON.stringify(run), run.id, 1_000_000 + day - 1)).not.toBeNull()
    expect(parseCookRun(JSON.stringify(run), run.id, 1_000_000 + day + 1)).toBeNull()
  })

  it('ключ у хода готовки свой — общее состояние он не трогает', () => {
    expect(COOK_RUN_KEY).not.toBe('menu-nedelya.v1')
  })
})

describe('отставание от плана', () => {
  it('пока успеваем — отставания нет', () => {
    expect(cookProgress(plan, [], min(5)).driftMinutes).toBe(0)
  })

  it('считается по самому раннему просроченному шагу', () => {
    // первый шаг должен был закончиться на 10-й минуте, а идёт 25-я
    expect(cookProgress(plan, [], min(25)).driftMinutes).toBe(15)
  })

  it('исчезает, когда просроченное отмечено сделанным', () => {
    const p = cookProgress(plan, [stepKey(plan[0])], min(25))
    expect(p.driftMinutes).toBe(0)
  })
})
