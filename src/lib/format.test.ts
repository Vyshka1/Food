import { describe, expect, it } from 'vitest'
import { plural } from './format'
import { formatQty, shoppingListText } from './shopping'
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
