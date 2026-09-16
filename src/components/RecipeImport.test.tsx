// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { Recipe } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RecipeImport } from './RecipeImport'

/*
 * Работа этого экрана — «проверьте количества» перед тем, как рецепт уйдёт в
 * редактор. Значит, числа на нём и числа в рецепте обязаны быть одними и теми
 * же: разбор показывал штучное через закупочное округление, и «Яйцо — 1 шт»
 * спорило с 0,5 в редакторе, до которого одно нажатие.
 */

const TEXT = `Сырники из творога
на 4 порции

Ингредиенты:
- 400 г творога
- 2 яйца
- 3 ст. л. муки
- щепотка соли

Приготовление:
Размять творог вилкой, добавить яйца.
Всыпать муку, вымесить тесто.
Обжарить 4 минуты с каждой стороны.`

afterEach(cleanup)

function paste(text = TEXT) {
  const onReady = vi.fn((recipe: Recipe) => recipe)
  render(<RecipeImport onReady={onReady} onCancel={() => {}} />)
  const area = document.querySelector('textarea')!
  act(() => fireEvent.change(area, { target: { value: text } }))
  return onReady
}

/** Что написано против названия продукта в блоке «Узнали». */
function shown(name: string): string {
  const line = [...document.querySelectorAll('.ing-line')].find(
    (el) => el.querySelector('span')?.textContent === name,
  )
  return line?.querySelector('b')?.textContent ?? ''
}

/** Рецепт, который уйдёт в редактор. */
function openEditor(onReady: ReturnType<typeof paste>): Recipe {
  const button = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Открыть в редакторе'),
  )!
  act(() => fireEvent.click(button))
  return onReady.mock.calls[0][0]
}

describe('вставка рецепта текстом', () => {
  it('штучное показано долей порции, а не округлённой покупкой', () => {
    paste()
    // «2 яйца на 4 порции» — это полъяйца на порцию
    expect(shown('Яйцо')).toBe('0,5 шт')
  })

  it('число в разборе — то же, что уйдёт в рецепт', () => {
    const onReady = paste()
    const seen = shown('Яйцо')
    const recipe = openEditor(onReady)
    const egg = recipe.items.find((i) => i.ingredientId === 'egg')!
    expect(seen).toBe(`${String(egg.qty).replace('.', ',')} шт`)
  })

  it('ни одно штучное количество не расходится с рецептом', () => {
    const onReady = paste()
    const texts = new Map(
      [...document.querySelectorAll('.ing-line')].map((el) => [
        el.querySelector('span')?.textContent ?? '',
        el.querySelector('b')?.textContent ?? '',
      ]),
    )
    const recipe = openEditor(onReady)
    const pieces = recipe.items.filter(
      (item) => INGREDIENT_BY_ID[item.ingredientId]?.unit === 'pcs',
    )
    expect(pieces.length).toBeGreaterThan(0)
    for (const item of pieces) {
      const ing = INGREDIENT_BY_ID[item.ingredientId]!
      const label = texts.get(ing.name) ?? ''
      expect(Number(label.replace(' шт', '').replace(',', '.')), ing.name).toBeCloseTo(item.qty, 2)
    }
  })

  it('число порций меняет количество на порцию', () => {
    paste()
    const plus = [...document.querySelectorAll('.stepper button')].find(
      (b) => b.getAttribute('aria-label') === 'плюс',
    )!
    // на восьмерых из тех же двух яиц выходит четверть яйца на порцию
    act(() => fireEvent.click(plus))
    act(() => fireEvent.click(plus))
    act(() => fireEvent.click(plus))
    act(() => fireEvent.click(plus))
    expect(shown('Яйцо')).toBe('0,25 шт')
  })

  it('весовое и щепотки говорят прежним языком', () => {
    paste()
    // кухонные меры никуда не делись: это общее правило приложения
    expect(shown('Творог 5%')).toBe('100 г')
    expect(shown('Соль')).toBe('по вкусу')
  })
})
