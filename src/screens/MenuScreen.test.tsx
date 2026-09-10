// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { MenuScreen } from './MenuScreen'

/*
 * Предпросмотр следующей недели на экране.
 *
 * Главное здесь не «видно ли меню», а то, что на ненаступившей неделе нечего
 * нажать. Идентификаторы записей у недель совпадают — они собираются из приёма
 * пищи, дня и рецепта, — и «съедено», «приготовлено» или булавка, нажатые в
 * предпросмотре, ушли бы в текущую неделю: списали бы продукты, которых ещё не
 * покупали, и переставили бы отметки, которых человек не ставил.
 */

const [KEY] = STORAGE_KEYS

/** Прошлый понедельник: тогда загрузка соберёт живое меню на текущую неделю. */
const LAST_WEEK = '2026-08-31'
const THIS_WEEK = '2026-09-07'

function saved(weekStart: string): string {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    household: {
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
      <MenuScreen />
    </StoreProvider>,
  )
}

const dishes = () => document.querySelectorAll('.dish--row').length
const click = (label: string) =>
  act(() => (screen.getByLabelText(label) as HTMLButtonElement).click())
/** Переключатель «День / Неделя»: у него не подпись, а текст. */
const tab = (text: string) =>
  act(() =>
    (
      [...document.querySelectorAll('.segmented button')].find(
        (b) => b.textContent?.trim() === text,
      ) as HTMLButtonElement
    ).click(),
  )

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  // среда: неделя уже идёт, до следующей ещё далеко
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0))
  localStorage.setItem(KEY, saved(LAST_WEEK))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('экран меню: следующая неделя', () => {
  it('открывается и возвращается обратно', () => {
    mount()
    expect(screen.getByText('7–13 сентября')).toBeTruthy()

    click('Следующая неделя')
    expect(screen.getByText('14–20 сентября')).toBeTruthy()
    expect(screen.getByText('следующая')).toBeTruthy()

    click('Текущая неделя')
    expect(screen.getByText('7–13 сентября')).toBeTruthy()
    expect(screen.queryByText('следующая')).toBeNull()
  })

  it('дальше следующей недели не уводит, а назад с текущей — некуда', () => {
    mount()
    expect(screen.getByLabelText('Текущая неделя').hasAttribute('disabled')).toBe(true)

    click('Следующая неделя')

    expect(screen.getByLabelText('Следующая неделя').hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Текущая неделя').hasAttribute('disabled')).toBe(false)
  })

  it('меню там показано, а не пустая заглушка', () => {
    mount()
    const now = dishes()
    expect(now).toBeGreaterThan(0)

    click('Следующая неделя')

    expect(dishes()).toBeGreaterThan(0)
    // и это другая неделя, а не та же самая под новой датой
    expect(screen.getByText('предпросмотр — неделя ещё не наступила')).toBeTruthy()
  })

  it('на ненаступившей неделе нечего отметить и нечего испортить', () => {
    mount()
    expect(screen.queryAllByText('Приготовлено').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Съедено').length).toBeGreaterThan(0)
    expect(screen.queryByText('Пересобрать')).toBeTruthy()

    click('Следующая неделя')

    expect(screen.queryAllByText('Приготовлено')).toHaveLength(0)
    expect(screen.queryAllByText('Съедено')).toHaveLength(0)
    expect(screen.queryAllByText('Пропущено')).toHaveLength(0)
    // пересборка меняет сохранённое меню — то есть не ту неделю, что открыта
    expect(screen.queryByText('Пересобрать')).toBeNull()
    // и блюдо не открывается: карточка считает партию по сохранённой неделе
    expect(document.querySelectorAll('button.dish__open')).toHaveLength(0)
  })

  /*
   * То же самое на доске — второй раскладке той же недели. Её не хватало:
   * проверки выше смотрят только на дневной экран, и безусловный onOpenEntry
   * на доске прошёл бы мимо них. Совпадение идентификаторов не теория —
   * замерено, что у соседних недель их совпадает три из двадцати одного, то
   * есть каждое седьмое нажатие ушло бы в сохранённую неделю.
   */
  it('на доске в предпросмотре плитка блюда тоже не нажимается', () => {
    mount()
    tab('Неделя')
    const live = document.querySelectorAll('button.board__dish')
    expect(live.length).toBeGreaterThan(0)
    expect([...live].every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)

    click('Следующая неделя')

    const preview = document.querySelectorAll('button.board__dish')
    expect(preview.length).toBeGreaterThan(0)
    expect([...preview].every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(document.querySelectorAll('.recipe-sheet')).toHaveLength(0)
  })

  it('доска показывает ту неделю, которая открыта', () => {
    mount()
    tab('Неделя')
    const now = [...document.querySelectorAll('.board__dish-title')].map((n) => n.textContent)
    expect(now.length).toBeGreaterThan(0)

    click('Следующая неделя')

    const next = [...document.querySelectorAll('.board__dish-title')].map((n) => n.textContent)
    expect(next.length).toBeGreaterThan(0)
    expect(next.join('|')).not.toBe(now.join('|'))
  })

  it('оговорка про запасы сказана словами, а не подразумевается', () => {
    mount()
    click('Следующая неделя')

    const note = document.querySelector('.preview-note')?.textContent ?? ''
    expect(note).toContain('понедельник')
    expect(note).toContain('морозилке')
  })

  it('текущая неделя от прогулки в будущее не меняется', () => {
    mount()
    const before = localStorage.getItem(KEY)

    click('Следующая неделя')
    click('Текущая неделя')

    expect(localStorage.getItem(KEY)).toBe(before)
    expect(JSON.parse(before ?? '{}').menu.weekStart).toBe(THIS_WEEK)
  })
})
