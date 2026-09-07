import { describe, expect, it } from 'vitest'
import type { PlannedStep } from '../types'
import { ALERT_BEFORE, cookProgress, stepKey } from './cookProgress'

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

  it('не предупреждает о том, что уже закончилось', () => {
    const p = cookProgress(busy, done, min(41))
    expect(p.running).toEqual([])
    expect(p.alerts).toEqual([])
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
