import { describe, expect, it } from 'vitest'
import { dishWorkloads, kitchenLoad } from './kitchenLoad'
import type { Appliance, Kitchen, PlannedStep } from '../types'

/*
 * Загрузка кухни — это ответ на вопрос «есть ли куда поставить ещё одну
 * кастрюлю», а не «сколько раз за день включали плиту». Разница видна на
 * первом же плане: три шага у плиты подряд занимают одну конфорку, а два
 * пересекающихся — две.
 */

const KITCHEN: Kitchen = {
  burners: 4,
  ovens: 1,
  hasAirfryer: false,
  hasMulticooker: false,
  hasBlender: true,
  hasProcessor: false,
  hasMicrowave: true,
  hasDishwasher: false,
  containers: 8,
  hasFreezer: true,
}

function step(
  partial: Partial<PlannedStep> & { start: number; end: number },
): PlannedStep {
  return {
    recipeId: 'r1',
    title: 'Блюдо',
    emoji: '🍽️',
    stepIndex: 0,
    text: 'шаг',
    station: 'stove',
    handsOn: false,
    activeMinutes: 0,
    unattended: false,
    cook: null,
    ...partial,
  }
}

const load = (steps: PlannedStep[], appliance: Appliance, kitchen = KITCHEN) =>
  kitchenLoad(steps, kitchen).find((l) => l.appliance === appliance)

describe('загрузка кухни', () => {
  it('считает одновременность, а не число шагов', () => {
    const steps = [
      step({ start: 0, end: 20, appliance: 'stove' }),
      step({ start: 10, end: 30, appliance: 'stove' }),
      // третий начинается, когда первые два уже сняты с плиты
      step({ start: 40, end: 60, appliance: 'stove' }),
    ]
    expect(load(steps, 'stove')?.peak).toBe(2)
  })

  it('шаг, который начинается ровно в минуту конца соседнего, конфорку не делит', () => {
    const steps = [
      step({ start: 0, end: 20, appliance: 'stove' }),
      step({ start: 20, end: 40, appliance: 'stove' }),
    ]
    expect(load(steps, 'stove')?.peak).toBe(1)
  })

  it('шаг нулевой длины прибор не занимает', () => {
    expect(load([step({ start: 15, end: 15, appliance: 'blender' })], 'blender')?.peak).toBe(0)
  })

  it('свободный прибор виден в отчёте — это и есть ответ «есть куда поставить»', () => {
    const oven = load([step({ start: 0, end: 10, appliance: 'stove' })], 'oven')
    expect(oven).toEqual({ appliance: 'oven', capacity: 1, peak: 0 })
  })

  it('прибора нет, а он нужен по рецепту — строка всё равно есть, с нулевой ёмкостью', () => {
    const kitchen = { ...KITCHEN, hasProcessor: false }
    const processor = load([step({ start: 0, end: 8, appliance: 'processor' })], 'processor', kitchen)
    expect(processor).toEqual({ appliance: 'processor', capacity: 0, peak: 1 })
  })

  it('прибора нет и он не нужен — в отчёте его тоже нет', () => {
    const rows = kitchenLoad([step({ start: 0, end: 10, appliance: 'stove' })], KITCHEN)
    expect(rows.map((r) => r.appliance)).not.toContain('multicooker')
  })

  it('порядок строк постоянный: плита, духовка, потом мелочь', () => {
    const steps = [
      step({ start: 0, end: 10, appliance: 'blender' }),
      step({ start: 0, end: 10, appliance: 'stove' }),
    ]
    expect(kitchenLoad(steps, KITCHEN).map((r) => r.appliance)).toEqual([
      'stove',
      'oven',
      'blender',
      'microwave',
    ])
  })
})

describe('во что обходится блюдо', () => {
  const steps = [
    step({ recipeId: 'a', start: 0, end: 6, handsOn: true, station: 'prep' }),
    step({ recipeId: 'a', start: 6, end: 26, appliance: 'stove' }),
    step({ recipeId: 'a', start: 26, end: 30, handsOn: true, appliance: 'stove' }),
    step({ recipeId: 'b', start: 0, end: 5, handsOn: true, station: 'prep' }),
    step({ recipeId: 'b', start: 5, end: 45, appliance: 'oven' }),
    step({ recipeId: 'b', start: 5, end: 8, appliance: 'blender' }),
  ]

  it('ручные минуты блюда — это его доля общих занятых рук', () => {
    const work = dishWorkloads(steps)
    expect(work.get('a')?.handsOnMinutes).toBe(10)
    expect(work.get('b')?.handsOnMinutes).toBe(5)
    // сумма долей — те самые занятые руки плана, а не второй ответ на тот же вопрос
    const total = [...work.values()].reduce((s, w) => s + w.handsOnMinutes, 0)
    expect(total).toBe(steps.filter((s) => s.handsOn).reduce((s, x) => s + (x.end - x.start), 0))
  })

  it('прибор блюда — тот, за которым оно стоит дольше всего', () => {
    const work = dishWorkloads(steps)
    expect(work.get('a')?.appliance).toBe('stove')
    // у «b» блендер тоже занят, но три минуты против сорока в духовке
    expect(work.get('b')?.appliance).toBe('oven')
  })

  it('блюдо без приборов остаётся без прибора, а не с чужим', () => {
    const work = dishWorkloads([step({ recipeId: 'c', start: 0, end: 9, handsOn: true, station: 'prep' })])
    expect(work.get('c')).toEqual({ handsOnMinutes: 9, appliance: undefined })
  })
})
