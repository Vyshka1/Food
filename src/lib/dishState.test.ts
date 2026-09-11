import { describe, expect, it } from 'vitest'
import type { MenuEntry } from '../types'
import { dishState } from './dishState'

/*
 * Состояние блюда — это и есть граница между планом и фактом. Проверяем, что
 * две прежние плашки («из холодильника» + «готовим Ср») больше не спорят и
 * что несделанная готовка не выдаётся за сделанную.
 */

function entry(patch: Partial<MenuEntry> = {}): MenuEntry {
  return {
    id: 'e',
    recipeId: 'r',
    slot: 'lunch',
    day: 4,
    cookDay: 2,
    portions: [],
    storage: 'fridge',
    ...patch,
  }
}

describe('состояние блюда', () => {
  it('до дня готовки — это план, а не факт', () => {
    const s = dishState(entry({ cookDay: 5, day: 5 }), false, 3)
    expect(s.stage).toBe('planned')
    expect(s.label).toContain('Приготовим')
    expect(s.warn).toBe(false)
  })

  it('в день готовки — «готовим сегодня»', () => {
    expect(dishState(entry({ cookDay: 3, day: 3 }), false, 3).stage).toBe('today')
  })

  it('отмеченная готовка называет день и место хранения одной строкой', () => {
    const s = dishState(entry({ cookDay: 2, day: 4, storage: 'fridge' }), true, 4)
    expect(s.stage).toBe('ready')
    expect(s.label).toContain('Готово в среду')
    expect(s.label).toContain('из холодильника')
    // двух плашек, спорящих друг с другом, больше нет
    expect(s.label.toLowerCase()).not.toContain('готовим')
  })

  it('готовка в тот же день не приписывает лишнего дня', () => {
    expect(dishState(entry({ cookDay: 4, day: 4 }), true, 4).label).toBe('Готово')
  })

  it('день готовки прошёл, а отметки нет — об этом говорят прямо', () => {
    const s = dishState(entry({ cookDay: 2, day: 4 }), false, 4)
    expect(s.stage).toBe('unconfirmed')
    expect(s.warn).toBe(true)
    expect(s.label).toContain('Не отмечено')
  })

  it('заготовка с прошлых недель — не готовка, а «достать»', () => {
    const s = dishState(entry({ fromFreezer: true, cookDay: 0 }), false, 4)
    expect(s.stage).toBe('freezer')
    expect(s.label).toBe('Достать из морозилки')
    expect(s.warn).toBe(false)
  })

  it('морозилка внутри недели названа морозилкой, а не холодильником', () => {
    const s = dishState(entry({ cookDay: 2, day: 6, storage: 'freezer' }), true, 6)
    expect(s.label).toContain('из морозилки')
  })
})
