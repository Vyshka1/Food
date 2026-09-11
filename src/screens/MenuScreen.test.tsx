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
    expect(screen.queryAllByText('Съедено').length).toBeGreaterThan(0)
    expect(screen.queryByText('Изменить меню')).toBeTruthy()
    /*
     * «Приготовлено» из меню убрано насовсем: это факт про всю готовку, и
     * место ему в «Готовке». Рядом со «съедено» оно читалось третьим равным
     * состоянием, хотя блюдо сначала готовят, а потом едят.
     */
    expect(screen.queryAllByText('Приготовлено')).toHaveLength(0)

    click('Следующая неделя')

    expect(screen.queryAllByText('Съедено')).toHaveLength(0)
    expect(screen.queryAllByText('Пропущено')).toHaveLength(0)
    // пересборка меняет сохранённое меню — то есть не ту неделю, что открыта
    expect(screen.queryByText('Изменить меню')).toBeNull()
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

describe('экран меню: кто ест и что с блюдом', () => {
  /** Тот же день, но в доме двое, и одного нет весь день. */
  function twoEaters(): string {
    const data = JSON.parse(saved(LAST_WEEK)) as {
      household: { eaters: Record<string, unknown>[]; meals: string[] }
    }
    const second: Record<string, unknown> = {
      ...data.household.eaters[0],
      id: 'e2',
      name: 'Кирилл',
      sex: 'male',
    }
    const away: Record<string, string> = {}
    for (let d = 0; d < 7; d++) for (const m of data.household.meals) away[`${d}:${m}`] = 'away'
    second.mealPlaces = away
    data.household.eaters.push(second)
    return JSON.stringify(data)
  }

  it('«не дома весь день» сказано один раз, а не у каждого приёма', () => {
    localStorage.setItem(KEY, twoEaters())
    mount()

    const day = document.querySelector('.day-who')?.textContent ?? ''
    expect(day).toContain('Сегодня едят дома')
    expect(day).toContain('Кирилл не дома весь день')
    /*
     * Это свойство дня. Пока строка повторялась у всех четырёх приёмов, она
     * читалась как шум и ничего не добавляла.
     */
    expect(document.querySelectorAll('.meal-head__away')).toHaveLength(0)
  })

  it('у приёма про отсутствие говорят, только если день неоднородный', () => {
    const data = JSON.parse(twoEaters()) as {
      household: { eaters: Record<string, unknown>[] }
    }
    /*
     * Часы в этом файле стоят на среде, а неделя начинается с понедельника —
     * значит экран открыт на дне 2. Кирилл дома весь день, кроме обеда: вот
     * теперь у обеда про это и стоит сказать.
     */
    data.household.eaters[1].mealPlaces = { '2:lunch': 'away' }
    localStorage.setItem(KEY, JSON.stringify(data))
    mount()

    const notes = [...document.querySelectorAll('.meal-head__away')].map((n) => n.textContent)
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.join(' ')).toContain('Кирилл')
    expect(document.querySelector('.day-who')?.textContent).not.toContain('весь день')
  })

  it('в семейном режиме видно, сколько достаётся каждому', () => {
    localStorage.setItem(KEY, twoEaters())
    mount()
    const rows = document.querySelector('.dish__who')?.textContent ?? ''
    const first = JSON.parse(twoEaters()).household.eaters[0].name as string
    expect(rows).toContain(first)
    expect(rows).toContain('Кирилл')
    // Кирилла нет — и это сказано, а не спрятано в нулевых калориях
    expect(rows).toContain('не дома')
  })

  it('у блюда одна плашка состояния, а не две спорящие', () => {
    mount()
    const badges = [...document.querySelectorAll('.dish--row .badge[data-stage]')]
    expect(badges.length).toBeGreaterThan(0)
    for (const badge of badges) {
      const text = badge.textContent ?? ''
      // «из холодильника» рядом с «готовим Ср» — это и было противоречие
      expect(text.includes('холодильника') && text.includes('Готовим')).toBe(false)
    }
    // и рядом с ними нет второй плашки про день готовки
    expect(document.querySelectorAll('.dish--row .badge').length).toBe(badges.length)
  })

  it('разбивка дня складывается, а не вычитается', () => {
    const data = JSON.parse(twoEaters()) as {
      household: { drinks: unknown[]; extras: unknown[]; eaters: { id: string }[] }
    }
    data.household.drinks = [
      { id: 'd1', eaterId: data.household.eaters[0].id, kind: 'cappuccino', volumeMl: 250,
        sugarTsp: 0, syrupMl: 0, perDay: 2, days: [0, 1, 2, 3, 4, 5, 6] },
    ]
    localStorage.setItem(KEY, JSON.stringify(data))
    mount()

    const parts = document.querySelector('.day-parts')?.textContent ?? ''
    const nums = [...parts.matchAll(/(\d+)/g)].map((m) => Number(m[1]))
    expect(nums.length).toBeGreaterThanOrEqual(3)
    /*
     * Кольцо показывает только блюда: напитки в него не подмешаны, а вычтены
     * из нормы. Значит «всего» — это сумма, а не разность. Я сначала написал
     * наоборот и получил «блюда 4254» там, где на тарелках 4448.
     */
    const total = nums[nums.length - 1]
    const summed = nums.slice(0, -1).reduce((a, b) => a + b, 0)
    expect(total).toBe(summed)
    expect(parts).toContain('блюда')
    expect(parts).toContain('напитки')
  })

  it('факт готовки из меню убран: это другой слой', () => {
    mount()
    expect(screen.queryAllByText('Приготовлено')).toHaveLength(0)
    const actions = [...document.querySelectorAll('.dish__status button')].map((b) => b.textContent)
    expect(new Set(actions)).toEqual(new Set(['Съедено', 'Пропущено']))
  })
})
