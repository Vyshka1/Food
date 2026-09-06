import { describe, expect, it } from 'vitest'
import { plural } from './format'
import { formatQty } from './shopping'
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
