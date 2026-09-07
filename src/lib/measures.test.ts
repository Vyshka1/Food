import { describe, expect, it } from 'vitest'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { householdQty, measureText } from './measures'

describe('то, что считают штуками', () => {
  it('лук — луковицами, а не граммами', () => {
    // «Лук — 42 г» формально верно и бесполезно: никто не взвешивает луковицу
    expect(measureText(INGREDIENT_BY_ID['onion'], 45)).toBe('½ луковицы · около 45 г')
    expect(measureText(INGREDIENT_BY_ID['onion'], 90)).toBe('1 луковица · около 90 г')
    expect(measureText(INGREDIENT_BY_ID['onion'], 135)).toBe('1½ луковицы · около 135 г')
  })

  it('чеснок — зубчиками', () => {
    expect(householdQty(INGREDIENT_BY_ID['garlic'], 8).text).toBe('2 зубчика')
    expect(householdQty(INGREDIENT_BY_ID['garlic'], 4).text).toBe('1 зубчик')
  })

  it('много штук проще назвать весом', () => {
    // «4½ луковицы» человеку уже ничего не облегчает
    expect(householdQty(INGREDIENT_BY_ID['onion'], 500).text).toBe('500 г')
  })
})

describe('густое и жидкое по мелочи', () => {
  it('сметана — ложками', () => {
    expect(measureText(INGREDIENT_BY_ID['sour_cream'], 25)).toBe('1 ст. л. · около 25 г')
    expect(measureText(INGREDIENT_BY_ID['sour_cream'], 50)).toBe('2 ст. л. · около 50 г')
  })

  it('масло — ложками, пока его мало', () => {
    expect(householdQty(INGREDIENT_BY_ID['olive_oil'], 17).text).toBe('1 ст. л.')
  })

  it('когда много — обычный вес', () => {
    // 300 г сметаны ложками отмерять никто не станет
    expect(householdQty(INGREDIENT_BY_ID['sour_cream'], 300).text).toBe('300 г')
  })
})

describe('штучное остаётся штучным', () => {
  it('яйца целыми', () => {
    expect(householdQty(INGREDIENT_BY_ID['egg'], 3).text).toBe('3 шт')
  })

  it('дробное яйцо округляется до понятного', () => {
    const text = householdQty(INGREDIENT_BY_ID['egg'], 2.5).text
    expect(text).toBe('2½ шт')
  })
})

describe('специи не масштабируются до абсурда', () => {
  it('щепотку соли не пишем в граммах', () => {
    expect(householdQty(INGREDIENT_BY_ID['salt'], 2).text).toBe('по вкусу')
    expect(householdQty(INGREDIENT_BY_ID['pepper'], 1).text).toBe('по вкусу')
  })

  it('но большое количество показываем честно', () => {
    expect(householdQty(INGREDIENT_BY_ID['salt'], 40).text).toBe('40 г')
  })
})

describe('крупы и сыпучее', () => {
  it('мелкое считаем с шагом 5 г, а не до грамма', () => {
    expect(householdQty(INGREDIENT_BY_ID['oats'], 63).text).toBe('65 г')
  })

  it('крупное — с шагом 10 г', () => {
    expect(householdQty(INGREDIENT_BY_ID['rice'], 224).text).toBe('220 г')
  })

  it('миллилитры остаются миллилитрами', () => {
    expect(householdQty(INGREDIENT_BY_ID['milk'], 300).text).toBe('300 мл')
  })
})

describe('во всей базе меры осмысленны', () => {
  it('ни один продукт не даёт пустую или нулевую меру', () => {
    for (const ing of Object.values(INGREDIENT_BY_ID)) {
      for (const qty of [3, 25, 90, 250, 700]) {
        const text = measureText(ing, qty)
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toContain('NaN')
        expect(text).not.toMatch(/(^|\s)0 (г|мл|шт)/)
      }
    }
  })
})
