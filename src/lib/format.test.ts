import { describe, expect, it } from 'vitest'
import { decimal, plural, portionsLabel } from './format'
import { formatQty, shoppingListText } from './shopping'
import { WEEKDAYS_ACC, WEEKDAYS_FULL } from './menu'
import { formatDuration } from './cookingPlan'

const dish: [string, string, string] = ['блюдо', 'блюда', 'блюд']

describe('plural', () => {
  it('склоняет по русским правилам', () => {
    expect([1, 2, 5, 11, 14, 21, 22, 25, 101].map((n) => plural(n, dish))).toEqual([
      'блюдо',
      'блюда',
      'блюд',
      'блюд',
      'блюд',
      'блюдо',
      'блюда',
      'блюд',
      'блюдо',
    ])
  })
})

describe('plural для людей', () => {
  it('1 человек, 2 человека, 5 человек', () => {
    const forms: [string, string, string] = ['человек', 'человека', 'человек']
    expect([1, 2, 3, 5, 11, 21, 22].map((n) => plural(n, forms))).toEqual([
      'человек',
      'человека',
      'человека',
      'человек',
      'человек',
      'человек',
      'человека',
    ])
  })
})

describe('formatQty', () => {
  it('переводит в кило- и литры от 1000', () => {
    expect(formatQty(950, 'g')).toBe('950 г')
    expect(formatQty(1400, 'g')).toBe('1.4 кг')
    expect(formatQty(2000, 'ml')).toBe('2 л')
    expect(formatQty(3, 'pcs')).toBe('3 шт')
  })
})

describe('formatDuration', () => {
  it('показывает часы и минуты', () => {
    expect(formatDuration(45)).toBe('45 мин')
    expect(formatDuration(60)).toBe('1 ч')
    expect(formatDuration(100)).toBe('1 ч 40 мин')
  })
})

describe('shoppingListText', () => {
  const list = {
    total: 300,
    lines: [
      { ingredientId: 'potato', name: 'Картофель', category: 'veg' as const, unit: 'g' as const, needed: 1200, buy: 1200, price: 60, staple: false },
      { ingredientId: 'salt', name: 'Соль', category: 'pantry' as const, unit: 'g' as const, needed: 30, buy: 1000, price: 30, staple: true },
      { ingredientId: 'milk', name: 'Молоко', category: 'dairy' as const, unit: 'ml' as const, needed: 900, buy: 1000, price: 90, staple: false },
    ],
  }

  it('группирует по категориям и считает итог', () => {
    const text = shoppingListText(list, { atHome: [], weekStart: '2026-09-07' })
    expect(text).toContain('Продукты на неделю 7.09–13.09')
    expect(text).toContain('Овощи и зелень')
    expect(text).toContain('— Картофель, 1.2 кг')
    expect(text).toContain('— Молоко, 1 л')
    expect(text).toContain('Итого примерно 150 ₽')
  })

  it('не пишет то, что есть дома, и специи', () => {
    const text = shoppingListText(list, { atHome: ['milk'], weekStart: '2026-09-07' })
    expect(text).not.toContain('Молоко')
    expect(text).not.toContain('Соль')
    expect(text).toContain('Итого примерно 60 ₽')
  })
})

describe('portionsLabel', () => {
  it('склоняет целые порции по правилам русского', () => {
    expect(portionsLabel(1)).toBe('1 порция')
    expect(portionsLabel(2)).toBe('2 порции')
    expect(portionsLabel(5)).toBe('5 порций')
    expect(portionsLabel(11)).toBe('11 порций')
    expect(portionsLabel(21)).toBe('21 порция')
  })

  it('дробные ставит в родительный падеж, а не по целой части', () => {
    // «2,5 порций» — типичная ошибка: склонять по округлённой тройке нельзя
    expect(portionsLabel(2.5)).toBe('2,5 порции')
    expect(portionsLabel(1.5)).toBe('1,5 порции')
    expect(portionsLabel(0.5)).toBe('0,5 порции')
    expect(portionsLabel(4.5)).toBe('4,5 порции')
  })

  it('пишет десятичную запятую и не тянет лишний ноль', () => {
    expect(decimal(1)).toBe('1')
    expect(decimal(1.25)).toBe('1,3')
    expect(portionsLabel(3.0)).toBe('3 порции')
  })
})

describe('дни недели в винительном падеже', () => {
  it('«на среду», а не «на среда»', () => {
    // на экране разморозки именительный давал «на пятница» — видно сразу,
    // но только если посмотреть
    expect(`на ${WEEKDAYS_ACC[2]}`).toBe('на среду')
    expect(`на ${WEEKDAYS_ACC[4]}`).toBe('на пятницу')
    expect(`на ${WEEKDAYS_ACC[5]}`).toBe('на субботу')
  })

  it('дни, которые не меняются, остаются как есть', () => {
    expect(WEEKDAYS_ACC[0]).toBe('понедельник')
    expect(WEEKDAYS_ACC[3]).toBe('четверг')
    expect(WEEKDAYS_ACC[6]).toBe('воскресенье')
  })

  it('совпадает по длине с остальными списками дней', () => {
    expect(WEEKDAYS_ACC).toHaveLength(7)
    expect(WEEKDAYS_FULL).toHaveLength(7)
  })
})
