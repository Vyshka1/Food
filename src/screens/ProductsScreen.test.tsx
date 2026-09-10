// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { buildWeekMenu } from '../lib/menu'
import { buildShoppingList, weekSpending } from '../lib/shopping'
import { CATEGORY_LABEL } from '../data/ingredients'
import { STORE_LABEL, categoriesOf, storeOf } from '../lib/stores'
import { emptyPantry } from '../lib/pantry'
import type { Household } from '../types'
import { ProductsScreen } from './ProductsScreen'

/*
 * Экран закупки отвечает на четыре вопроса сразу: что купить, на какой срок,
 * сколько это стоит и где это лежит в магазине. Проверяем именно их, а не
 * вёрстку: числа считает `lib/shopping`, и второй раз здесь их считать нельзя.
 */

const [KEY] = STORAGE_KEYS

function eater() {
  return {
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
  }
}

/** Понедельник текущей недели: иначе загрузка тут же начнёт новую и пересоберёт меню. */
function thisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Ожидаемая подпись недели, посчитанная отдельно от экрана: если сойтись
 * должны две независимые записи, ошибка в одной из них видна.
 */
function expectedWeekLabel(monday: string): string {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ]
  const [y, m, d] = monday.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${months[end.getMonth()]}`
    : `${start.getDate()} ${months[start.getMonth()]} — ${end.getDate()} ${months[end.getMonth()]}`
}

function household(weekStart: string): Household {
  return {
    eaters: [eater()],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, ovens: 1, containers: 8, hasFreezer: true },
    budgetPerWeek: 0,
    drinks: [],
    extras: [],
    weekStart,
  } as unknown as Household
}

const MONDAY = thisMonday()
const HOUSE = household(MONDAY)
const MENU = buildWeekMenu(HOUSE, 7).menu

function seed() {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      version: SCHEMA_VERSION,
      household: HOUSE,
      menu: { ...MENU, weekStart: MONDAY },
      atHome: [],
      pantry: { always: [], stock: [], freezer: [] },
      notifications: false,
      bought: [],
      warnings: [],
      customRecipes: [],
      history: [],
      cookEvents: [],
    }),
  )
}

function mount() {
  return render(
    <StoreProvider>
      <ProductsScreen onShoppingMode={() => {}} />
    </StoreProvider>,
  )
}

/** Названия продуктов, которые сейчас видно в списке. */
function shownNames(): string[] {
  return [...document.querySelectorAll('.product__name > b')].map(
    (el) => el.childNodes[0].textContent ?? '',
  )
}

const LINES = buildShoppingList(MENU, HOUSE, emptyPantry()).lines

beforeEach(() => {
  localStorage.clear()
  seed()
})

afterEach(cleanup)

describe('экран «Продукты»', () => {
  it('в шапке написано, на какой срок собран список', () => {
    mount()
    // прямая жалоба владельца: «не понятно, на какой срок формируется корзина»
    expect(screen.getByText(`Список на неделю · ${expectedWeekLabel(MONDAY)}`)).toBeTruthy()
  })

  it('список не пустой — иначе остальные проверки ничего не значат', () => {
    mount()
    expect(LINES.length).toBeGreaterThan(5)
    expect(shownNames().length).toBe(LINES.length)
  })

  it('поиск оставляет только совпавшие продукты', () => {
    mount()
    const needle = LINES[0].name.slice(0, 4)
    act(() => {
      fireEvent.change(screen.getByLabelText('Найти продукт'), { target: { value: needle } })
    })
    const shown = shownNames()
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(LINES.length)
    for (const name of shown) expect(name.toLowerCase()).toContain(needle.toLowerCase())
  })

  it('чип категории оставляет только её', () => {
    mount()
    const category = LINES[0].category
    const expected = LINES.filter((l) => l.category === category).map((l) => l.name)
    expect(expected.length).toBeLessThan(LINES.length)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: CATEGORY_LABEL[category] }))
    })
    expect(shownNames().sort()).toEqual([...expected].sort())
  })

  it('строка отдела в рейке фильтрует список всеми его категориями', () => {
    mount()
    const kind = storeOf(LINES[0].category)
    const mine = LINES.filter((l) => storeOf(l.category) === kind)
    // отдел собирает несколько категорий сразу — в этом весь его смысл, и без
    // этой проверки тест прошёл бы и на фильтре по одной категории
    expect(new Set(mine.map((l) => l.category)).size).toBeGreaterThan(1)

    const rail = document.querySelector('.workspace__rail') as HTMLElement
    const row = within(rail)
      .getAllByRole('button')
      .find((b) => b.classList.contains('store-row') && b.textContent?.startsWith(STORE_LABEL[kind]))!
    act(() => fireEvent.click(row))

    expect(shownNames().sort()).toEqual(mine.map((l) => l.name).sort())
  })

  it('чипы показывают, какие категории оставил фильтр отдела', () => {
    mount()
    const kind = storeOf(LINES[0].category)
    const rail = document.querySelector('.workspace__rail') as HTMLElement
    const row = within(rail)
      .getAllByRole('button')
      .find((b) => b.classList.contains('store-row') && b.textContent?.startsWith(STORE_LABEL[kind]))!
    act(() => fireEvent.click(row))

    // список сужен — значит на чипах должно быть видно, чем именно
    const active = [...document.querySelectorAll('.products-cats .chip[data-active="true"]')]
    expect(active.map((el) => el.textContent).sort()).toEqual(
      categoriesOf(kind)
        .filter((c) => LINES.some((l) => l.category === c))
        .map((c) => CATEGORY_LABEL[c])
        .sort(),
    )
  })

  it('отдел, нажатый с вкладки запасов, открывает список, а не снимает фильтр', () => {
    mount()
    const kind = storeOf(LINES[0].category)
    const rail = document.querySelector('.workspace__rail') as HTMLElement
    const row = () =>
      within(rail)
        .getAllByRole('button')
        .find((b) => b.classList.contains('store-row') && b.textContent?.startsWith(STORE_LABEL[kind]))!

    act(() => fireEvent.click(row()))
    const filtered = shownNames().length

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Запасы' })))
    // тот же жест с другой вкладки значит «покажи мне этот отдел», а не «выключи»
    act(() => fireEvent.click(row()))

    expect(shownNames().length).toBe(filtered)
    expect(filtered).toBeLessThan(LINES.length)
  })

  it('пока ничего не отмечено, карточка «дома» объясняет, зачем отметка', () => {
    mount()
    // постоянные продукты есть в ней всегда, поэтому «пусто» тут не про список
    expect(screen.getByText(/Отметьте «есть дома» в списке/)).toBeTruthy()

    act(() => fireEvent.click(document.querySelectorAll('.home-pill')[0] as HTMLElement))

    expect(screen.queryByText(/Отметьте «есть дома» в списке/)).toBeNull()
    expect(screen.getByText(/закрыто тем, что уже есть дома/)).toBeTruthy()
  })

  it('вкладка «Морозилка» показывает морозилку вместо списка покупок', () => {
    mount()
    expect(shownNames().length).toBeGreaterThan(0)

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Морозилка' })))

    expect(shownNames().length).toBe(0)
    expect(screen.getByText(/Контейнеры появятся здесь сами/)).toBeTruthy()
  })

  it('«Проверить запасы» в рейке открывает вкладку запасов', () => {
    mount()
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Проверить запасы' })))
    expect(screen.getByText('Запасы дома')).toBeTruthy()
  })

  it('отметка «есть дома» убирает позицию из того, что осталось купить', () => {
    mount()
    const before = screen.getByText(/Осталось купить/).textContent ?? ''
    const [, leftBefore, totalBefore] = /(\d+) из (\d+)/.exec(before) ?? []

    act(() => fireEvent.click(document.querySelectorAll('.home-pill')[0] as HTMLElement))

    const after = screen.getByText(/Осталось купить/).textContent ?? ''
    const [, leftAfter, totalAfter] = /(\d+) из (\d+)/.exec(after) ?? []
    expect(Number(totalAfter)).toBe(Number(totalBefore) - 1)
    expect(Number(leftAfter)).toBe(Number(leftBefore) - 1)
  })
})

describe('деньги на экране закупки', () => {
  /*
   * Самая переделанная часть экрана не проверялась ни одним числом. А правило
   * проекта прямое: величина не считается заново. Здесь три места, где чек
   * может разойтись — крупное число в рейке, суммы отделов и суммы заголовков
   * категорий, — и все три обязаны быть одним и тем же числом.
   */
  const digits = (text: string | null | undefined) =>
    Number((text ?? '').replace(/[^0-9]/g, '')) || 0

  it('чек в рейке — тот же, что считает библиотека', () => {
    mount()
    const spending = weekSpending(MENU, HOUSE, emptyPantry(), [])
    expect(digits(document.querySelector('.rail-money')?.textContent)).toBe(spending.checkout)
  })

  it('суммы отделов складываются в чек', () => {
    mount()
    const spending = weekSpending(MENU, HOUSE, emptyPantry(), [])
    const rows = [...document.querySelectorAll('.store-row')]
    expect(rows.length).toBeGreaterThan(1)
    const sum = rows.reduce(
      (acc, row) => acc + digits(row.querySelector('.muted')?.textContent?.split('·')[1]),
      0,
    )
    expect(sum).toBe(spending.checkout)
  })

  it('позиции отделов складываются в число покупаемых строк', () => {
    mount()
    const list = buildShoppingList(MENU, HOUSE, emptyPantry())
    const buying = list.lines.filter((l) => !l.staple).length
    const rows = [...document.querySelectorAll('.store-row')]
    const sum = rows.reduce(
      (acc, row) => acc + digits(row.querySelector('.muted')?.textContent?.split('·')[0]),
      0,
    )
    expect(sum).toBe(buying)
  })

  it('доли «на неделю» и «в запасы» не выходят за сто процентов', () => {
    mount()
    const shares = [...document.querySelectorAll('.rail-split__label, .rail-split span')]
      .map((n) => digits(n.textContent))
      .filter((v) => v > 0)
    for (const share of shares) expect(share).toBeLessThanOrEqual(100)
  })
})
