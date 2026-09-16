// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { buildWeekMenu } from '../lib/menu'
import type { Household, Recipe } from '../types'
import { MyRecipesScreen } from './MyRecipesScreen'

/*
 * Свой рецепт человек набивает руками, и другого его экземпляра нет нигде: ни
 * в истории недель, ни в ссылке переноса. Значит, удаление здесь необратимо —
 * и спрашивать перед ним обязательно.
 */

const [KEY] = STORAGE_KEYS

function thisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MONDAY = thisMonday()

const HOUSE = {
  eaters: [
    {
      id: 'e1',
      name: 'Я',
      sex: 'female',
      age: 30,
      heightCm: 168,
      weightKg: 62,
      activity: 'light',
      goal: 'keep',
      allergies: [],
      customAllergens: [],
      dislikes: [],
      bannedRecipes: [],
      mealPlaces: {},
      ratings: {},
    },
  ],
  cookingDays: [2, 6],
  meals: ['breakfast', 'lunch', 'dinner'],
  kitchen: { burners: 4, ovens: 1, containers: 8, hasFreezer: true },
  budgetPerWeek: 0,
  drinks: [],
  extras: [],
  weekStart: MONDAY,
} as unknown as Household

const MINE: Recipe = {
  id: 'custom-syrniki',
  title: 'Сырники бабушки',
  emoji: '🥞',
  slots: ['breakfast'],
  items: [
    { ingredientId: 'cottage_cheese', qty: 100 },
    { ingredientId: 'egg', qty: 0.5 },
  ],
  steps: [{ text: 'Размять творог', minutes: 10, station: 'prep', handsOn: true }],
  tags: [],
  freezable: false,
  fridgeDays: 3,
  custom: true,
} as unknown as Recipe

function seed() {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      version: SCHEMA_VERSION,
      household: HOUSE,
      menu: { ...buildWeekMenu(HOUSE, 7).menu, weekStart: MONDAY },
      atHome: [],
      pantry: { always: [], stock: [], freezer: [] },
      notifications: false,
      bought: [],
      warnings: [],
      customRecipes: [MINE],
      history: [],
      cookEvents: [],
    }),
  )
}

function mount() {
  return render(
    <StoreProvider>
      <MyRecipesScreen onBack={() => {}} />
    </StoreProvider>,
  )
}

/** Названия своих рецептов, которые сейчас в списке. */
function titles(): string[] {
  return [...document.querySelectorAll('.dish__title')].map((el) => el.textContent ?? '')
}

function clickDelete() {
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Удалить' })))
}

beforeEach(() => {
  localStorage.clear()
  seed()
})

afterEach(cleanup)

describe('свои рецепты: удаление', () => {
  it('рецепт на месте — иначе проверять нечего', () => {
    mount()
    expect(titles()).toEqual([MINE.title])
  })

  it('первое нажатие только спрашивает, рецепт остаётся', () => {
    mount()
    clickDelete()

    expect(titles()).toEqual([MINE.title])
    expect(screen.getByText(new RegExp(`Удалить «${MINE.title}»\\?`))).toBeTruthy()
  })

  it('«Отмена» оставляет рецепт и убирает вопрос', () => {
    mount()
    clickDelete()
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Отмена' })))

    expect(titles()).toEqual([MINE.title])
    expect(screen.queryByText(/Удалить «/)).toBeNull()
  })

  it('повторное нажатие «Удалить» снимает вопрос, а не удаляет', () => {
    mount()
    clickDelete()
    clickDelete()

    expect(titles()).toEqual([MINE.title])
    expect(screen.queryByText(/Удалить «/)).toBeNull()
  })

  it('«Да, удалить» удаляет — и только оно', () => {
    mount()
    clickDelete()
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Да, удалить' })))

    expect(titles()).toEqual([])
    expect(screen.queryByText(/Удалить «/)).toBeNull()
  })

  it('в вопросе сказано, что вернуть рецепт будет нечем', () => {
    mount()
    clickDelete()
    // человек должен решать, зная цену: отмены у этого действия нет
    expect(screen.getByText(/вернуть его будет нечем/)).toBeTruthy()
  })
})
