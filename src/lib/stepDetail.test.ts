import { describe, expect, it } from 'vitest'
import { RECIPES } from '../data/recipes'
import {
  activeMinutesOf,
  deriveRecipeSteps,
  isUnattended,
  parseAppliance,
  parseTemp,
} from './stepDetail'

describe('температура из текста', () => {
  it('читает градусы духовки', () => {
    expect(parseTemp('Разогреть духовку до 200°')).toBe(200)
    expect(parseTemp('Запекать при 180 градусов')).toBe(180)
  })

  it('не принимает за градусы минуты и граммы', () => {
    expect(parseTemp('Варить 25 минут')).toBeUndefined()
    expect(parseTemp('Нарезать на 4 части')).toBeUndefined()
    expect(parseTemp('Добавить 500 г фарша')).toBeUndefined()
  })
})

describe('прибор из текста', () => {
  it('узнаёт прибор по названию', () => {
    expect(parseAppliance('Пробить блендером', 'prep')).toBe('blender')
    expect(parseAppliance('Готовить в мультиварке', 'prep')).toBe('multicooker')
    expect(parseAppliance('Разогреть в микроволновке', 'prep')).toBe('microwave')
    expect(parseAppliance('Запекать на противне', 'prep')).toBe('oven')
  })

  it('не выдумывает комбайн там, где режут руками', () => {
    // «нашинковать» и «натереть» — обычные ручные действия. Требовать под них
    // прибор значит предупреждать человека о том, чего задача не требует
    expect(parseAppliance('Нашинковать овощи', 'prep')).toBeUndefined()
    expect(parseAppliance('Натереть морковь', 'prep')).toBeUndefined()
    expect(parseAppliance('Измельчить в комбайне', 'prep')).toBe('processor')
  })

  it('доверяет станции, когда текст молчит', () => {
    expect(parseAppliance('Довести до готовности', 'stove')).toBe('stove')
    expect(parseAppliance('Довести до готовности', 'oven')).toBe('oven')
    expect(parseAppliance('Дать остыть', 'wait')).toBeUndefined()
  })
})

describe('можно ли отойти', () => {
  it('жарка присмотра требует всегда', () => {
    // ловушка первой версии правил: «под крышкой» перевешивало «обжарить»
    expect(isUnattended('Обжарить с двух сторон под крышкой', 'stove', false)).toBe(false)
    expect(isUnattended('Жарить до румяной корочки', 'stove', false)).toBe(false)
  })

  it('помешивание и снятие пены — тоже присмотр', () => {
    expect(isUnattended('Варить, помешивая', 'stove', false)).toBe(false)
    expect(isUnattended('Варить бульон, снимая пену', 'stove', false)).toBe(false)
  })

  it('духовка и ожидание отпускают повара', () => {
    expect(isUnattended('Запекать', 'oven', false)).toBe(true)
    expect(isUnattended('Дать настояться', 'wait', false)).toBe(true)
    expect(isUnattended('Варить под крышкой', 'stove', false)).toBe(true)
  })

  it('шаг руками не отпускает никогда', () => {
    expect(isUnattended('Нарезать овощи', 'prep', true)).toBe(false)
  })
})

describe('активное время', () => {
  it('ручной шаг занимает повара целиком', () => {
    expect(activeMinutesOf('Нарезать', 10, 'prep', true)).toBe(10)
  })

  it('духовка и ожидание не занимают повара', () => {
    expect(activeMinutesOf('Запекать', 30, 'oven', false)).toBe(0)
    expect(activeMinutesOf('Остудить', 20, 'wait', false)).toBe(0)
  })

  it('«помешивая» — часть времени, а не всё и не ноль', () => {
    const minutes = activeMinutesOf('Варить, помешивая', 20, 'stove', false)
    expect(minutes).toBeGreaterThan(0)
    expect(minutes).toBeLessThan(20)
  })
})

describe('температура переносится по рецепту', () => {
  it('следующие духовые шаги наследуют градусы от разогрева', () => {
    const steps = deriveRecipeSteps([
      { text: 'Разогреть духовку до 200°', minutes: 10, station: 'prep', handsOn: false },
      { text: 'Запекать картофель', minutes: 20, station: 'oven', handsOn: false },
      { text: 'Допекать вместе', minutes: 15, station: 'oven', handsOn: false },
    ])
    expect(steps.map((s) => s.tempC)).toEqual([200, 200, 200])
  })

  it('не приписывает градусы шагам на плите', () => {
    const steps = deriveRecipeSteps([
      { text: 'Разогреть духовку до 200°', minutes: 10, station: 'prep', handsOn: false },
      { text: 'Обжарить лук', minutes: 5, station: 'stove', handsOn: true },
    ])
    expect(steps[1].tempC).toBeUndefined()
  })
})

describe('разметка всей встроенной базы', () => {
  const steps = RECIPES.flatMap((r) => r.steps.map((s) => ({ title: r.title, step: s })))

  it('охватывает все 78 рецептов', () => {
    expect(RECIPES.length).toBe(78)
    expect(steps.length).toBeGreaterThan(250)
  })

  it('у каждого духового шага есть температура', () => {
    const withoutTemp = steps.filter((x) => x.step.appliance === 'oven' && !x.step.tempC)
    expect(withoutTemp.map((x) => `${x.title}: ${x.step.text}`)).toEqual([])
  })

  it('ни один шаг жарки не помечен «можно отойти»', () => {
    const bad = steps.filter((x) => /обжар|жарить/i.test(x.step.text) && x.step.unattended)
    expect(bad.map((x) => `${x.title}: ${x.step.text}`)).toEqual([])
  })

  it('активное время никогда не превышает длительность шага', () => {
    for (const { title, step } of steps) {
      expect(step.activeMinutes, `${title}: ${step.text}`).toBeLessThanOrEqual(step.minutes)
      expect(step.activeMinutes).toBeGreaterThanOrEqual(0)
    }
  })

  it('вся встроенная база помечена как выведенная, а не проверенная вручную', () => {
    // когда шаги будут вычитаны руками, эта проверка должна упасть — и это
    // именно тот сигнал, ради которого поле source существует
    expect(steps.every((x) => x.step.source === 'derived')).toBe(true)
  })
})

describe('что прибор не занимает', () => {
  it('замачивание и кипяток из чайника не занимают конфорку', () => {
    // «Замочить лапшу в кипятке» — станция wait, но текст содержит «кипят»,
    // и правило по тексту занимало этим плиту на все восемь минут
    expect(parseAppliance('Замочить лапшу в кипятке', 'wait')).toBeUndefined()
    expect(parseAppliance('Залить булгур кипятком 1:2', 'prep')).toBeUndefined()
  })

  it('станция «ожидание» не занимает ничего, что бы ни было в тексте', () => {
    expect(parseAppliance('Оставить в духовке остывать', 'wait')).toBeUndefined()
    expect(parseAppliance('Дать постоять под крышкой', 'wait')).toBeUndefined()
  })

  it('настоящее кипячение конфорку по-прежнему занимает', () => {
    expect(parseAppliance('Довести воду до кипения', 'stove')).toBe('stove')
  })

  it('во встроенной базе ни один шаг ожидания не занимает прибор', () => {
    const bad = RECIPES.flatMap((r) =>
      r.steps.filter((s) => s.station === 'wait' && s.appliance).map((s) => `${r.title}: ${s.text}`),
    )
    expect(bad).toEqual([])
  })
})
