// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { ProfileScreen } from './ProfileScreen'

/*
 * Профиль: обзор и вкладки.
 *
 * Проверяем не «нарисовалось ли», а три обещания. Расписание правится прямо в
 * обзоре — это самая часто меняемая настройка. Сброс лежит только в «Данных» —
 * он стирает анкету, кладовую и историю разом, и соседство с недельными
 * переключателями ему не по чину. И правка отзывается отметкой «Сохранено», а
 * не кнопкой сохранения у каждой мелочи.
 */

const [KEY] = STORAGE_KEYS

function thisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function saved(): string {
  const weekStart = thisMonday()
  return JSON.stringify({
    version: SCHEMA_VERSION,
    household: {
      eaters: [
        {
          id: 'e1',
          name: 'Юлия',
          sex: 'female',
          age: 34,
          heightCm: 168,
          weightKg: 62,
          activity: 'light',
          goal: 'lose',
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
      weekStart,
    },
    menu: { weekStart, seed: 1, entries: [] },
    atHome: [],
    pantry: { always: [], stock: [], freezer: [] },
    notifications: false,
    bought: [],
    warnings: [],
    customRecipes: [],
    history: [],
    cookEvents: [],
  })
}

function mount() {
  return render(
    <StoreProvider>
      <ProfileScreen onEdit={() => {}} onRecipes={() => {}} />
    </StoreProvider>,
  )
}

const tab = (text: string) =>
  act(() =>
    (
      [...document.querySelectorAll('.ptabs button')].find(
        (b) => b.textContent?.trim() === text,
      ) as HTMLButtonElement
    ).click(),
  )

const status = () => document.querySelector('.pstatus b')?.textContent

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(KEY, saved())
})

afterEach(cleanup)

describe('профиль', () => {
  it('расписание правится прямо в обзоре', () => {
    mount()
    const days = document.querySelectorAll('.pcard .day-toggle button')
    expect(days).toHaveLength(7)
    // пятница выключена: включаем её и смотрим, что это ушло в анкету
    expect((days[4] as HTMLElement).dataset.active).toBe('false')

    act(() => (days[4] as HTMLButtonElement).click())

    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').household.cookingDays).toEqual([2, 4, 6])
  })

  it('последний день готовки снять нельзя: собирать меню будет не из чего', () => {
    mount()
    const days = [...document.querySelectorAll('.pcard .day-toggle button')] as HTMLButtonElement[]
    act(() => days[2].click())
    act(() => days[6].click())

    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').household.cookingDays).toHaveLength(1)
  })

  it('правка отзывается «Сохранено», а не кнопкой сохранения', () => {
    mount()
    expect(status()).toBe('Анкета заполнена')
    expect(screen.queryByText('Сохранить')).toBeNull()

    const days = document.querySelectorAll('.pcard .day-toggle button')
    act(() => (days[4] as HTMLButtonElement).click())

    expect(status()).toBe('Сохранено')
  })

  it('сброс лежит только в «Данных»', () => {
    mount()
    for (const name of ['Обзор', 'Семья', 'Расписание', 'Питание', 'Кухня']) {
      tab(name)
      expect(screen.queryByText('Сбросить анкету и меню'), name).toBeNull()
    }

    tab('Данные')

    expect(screen.getByText('Сбросить анкету и меню')).toBeTruthy()
  })

  it('в обзоре — сводка, конструктор напитков открывается отдельно', () => {
    mount()
    // «Питание и привычки» в обзоре: заголовок есть, полей ввода нет
    expect(screen.getByText('Питание и привычки')).toBeTruthy()
    expect(document.querySelectorAll('.pgrid input, .pgrid select')).toHaveLength(0)

    tab('Питание')

    expect(screen.getByText('Привычные напитки')).toBeTruthy()
    expect(screen.getByText('На чём готовим')).toBeTruthy()
  })

  it('места за столом показаны значками, а не буквами', () => {
    mount()
    const cells = [...document.querySelectorAll('.attend__cell')]
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      const place = cell.getAttribute('data-place')
      // «не дома» — единственное состояние, в котором не происходит ничего
      if (place === 'away') continue
      expect(cell.querySelector('svg'), place ?? '').toBeTruthy()
      expect(cell.textContent).toBe('')
    }
  })
})
