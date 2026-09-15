// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { buildWeekMenu } from '../lib/menu'
import { buildShoppingList } from '../lib/shopping'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../data/ingredients'
import { STORE_LABEL, STORE_ORDER, categoriesOf, storeOf } from '../lib/stores'
import { emptyPantry } from '../lib/pantry'
import type { Household, IngredientCategory, ShoppingLine } from '../types'
import { CATEGORY_HEADS_FROM, ShoppingModeScreen } from './ShoppingModeScreen'

/*
 * Режим магазина проверяем тем, чем он и отличается от списка на экране
 * «Продукты»: порядком. Человек идёт по залу один раз, и порядок строк на
 * экране — это маршрут. Сами числа считает `lib/shopping`, отделы — `lib/stores`;
 * здесь ни то, ни другое заново не считается, ожидания берутся оттуда же.
 */

const [KEY] = STORAGE_KEYS

function eater(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    sex: 'female',
    age: 32,
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
    ...patch,
  }
}

/** Понедельник текущей недели: иначе загрузка тут же начнёт новую и пересоберёт меню. */
function thisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function household(weekStart: string): Household {
  return {
    // семья из двух едоков: на одного список короче, и большие отделы,
    // ради которых и заведён порог подзаголовков, в нём не появляются
    eaters: [eater('e1'), eater('e2', { sex: 'male', weightKg: 84, heightCm: 182, age: 35 })],
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
const LINES = buildShoppingList(MENU, HOUSE, emptyPantry()).lines
/** То, что режим магазина показывает: без постоянных и без «есть дома». */
const TO_BUY = LINES.filter((l) => !l.staple)
const CATEGORY_OF = new Map(LINES.map((l) => [l.name, l.category]))

function seed(patch: Record<string, unknown> = {}) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      version: SCHEMA_VERSION,
      household: HOUSE,
      menu: { ...MENU, weekStart: MONDAY },
      atHome: [],
      pantry: emptyPantry(),
      notifications: false,
      bought: [],
      warnings: [],
      customRecipes: [],
      history: [],
      cookEvents: [],
      ...patch,
    }),
  )
}

let exits = 0

function mount() {
  exits = 0
  return render(
    <StoreProvider>
      <ShoppingModeScreen onExit={() => (exits += 1)} />
    </StoreProvider>,
  )
}

/** Что стоит на экране сверху вниз: заголовки отделов, подзаголовки, строки. */
type Item =
  | { kind: 'store'; text: string }
  | { kind: 'category'; text: string }
  | { kind: 'row'; text: string }

function flow(): Item[] {
  return [...document.querySelectorAll('.shop__store, .shop__cat, .shop__row')].map((el) => {
    if (el.classList.contains('shop__store')) return { kind: 'store', text: el.textContent ?? '' }
    if (el.classList.contains('shop__cat')) return { kind: 'category', text: el.textContent ?? '' }
    return { kind: 'row', text: el.querySelector('.shop__name')?.textContent ?? '' }
  })
}

function rowNames(): string[] {
  return [...document.querySelectorAll('.shop__name')].map((el) => el.textContent ?? '')
}

/** Отделы, которые должны быть в списке, — порядок обхода, а не порядок строк. */
function expectedStores(lines: ShoppingLine[] = TO_BUY) {
  return STORE_ORDER.filter((kind) => lines.some((l) => storeOf(l.category) === kind))
}

beforeEach(() => {
  localStorage.clear()
  seed()
})

afterEach(cleanup)

describe('режим магазина: порядок обхода', () => {
  it('список не пустой и отделов больше одного — иначе порядок нечего проверять', () => {
    mount()
    expect(TO_BUY.length).toBeGreaterThan(20)
    expect(rowNames().length).toBe(TO_BUY.length)
    expect(expectedStores().length).toBeGreaterThan(2)
  })

  it('заголовки — отделы магазина в порядке обхода', () => {
    mount()
    const heads = flow().filter((i) => i.kind === 'store').map((i) => i.text)
    expect(heads).toEqual(expectedStores().map((kind) => STORE_LABEL[kind]))
  })

  it('пустых отделов на экране нет', () => {
    mount()
    const heads = flow().filter((i) => i.kind === 'store').map((i) => i.text)
    // хлеба в меню может не быть вовсе — «Хлеб» без единой строки это не список,
    // а обещание лишнего похода
    const empty = STORE_ORDER.filter((kind) => !TO_BUY.some((l) => storeOf(l.category) === kind))
    // без непустых отделов проверка «нет лишнего» проходит и на пустом экране
    expect(heads.length).toBe(expectedStores().length)
    expect(empty.length).toBeGreaterThan(0)
    for (const kind of empty) expect(heads).not.toContain(STORE_LABEL[kind])
  })

  it('каждая строка стоит под своим отделом', () => {
    mount()
    let current: string | null = null
    let checked = 0
    for (const item of flow()) {
      if (item.kind === 'store') current = item.text
      if (item.kind !== 'row') continue
      const category = CATEGORY_OF.get(item.text)!
      expect(current, `${item.text} оказался не в своём отделе`).toBe(
        STORE_LABEL[storeOf(category)],
      )
      checked++
    }
    expect(checked).toBe(TO_BUY.length)
  })

  it('внутри отдела продукты идут в порядке категорий списка', () => {
    mount()
    let previous = -1
    let jumps = 0
    for (const item of flow()) {
      if (item.kind === 'store') {
        previous = -1
        continue
      }
      if (item.kind !== 'row') continue
      const at = CATEGORY_ORDER.indexOf(CATEGORY_OF.get(item.text)!)
      expect(at, `${item.text} нарушает порядок категорий внутри отдела`).toBeGreaterThanOrEqual(
        previous,
      )
      if (at > previous && previous >= 0) jumps++
      previous = at
    }
    // в отделе несколько категорий — иначе проверка порядка ничего не значит
    expect(jumps).toBeGreaterThan(0)
  })

  it('яйца лежат в молочном отделе, а не в бакалее', () => {
    mount()
    const eggs = TO_BUY.filter((l) => l.category === 'egg')
    expect(eggs.length).toBeGreaterThan(0)
    let current: string | null = null
    for (const item of flow()) {
      if (item.kind === 'store') current = item.text
      if (item.kind === 'row' && CATEGORY_OF.get(item.text) === 'egg') {
        expect(current).toBe(STORE_LABEL.dairy)
      }
    }
  })
})

describe('подзаголовки категорий внутри отдела', () => {
  /** Подзаголовки, которые экран показал внутри каждого отдела. */
  function subheads(): Map<string, string[]> {
    const out = new Map<string, string[]>()
    let current = ''
    for (const item of flow()) {
      if (item.kind === 'store') {
        current = item.text
        out.set(current, [])
      }
      if (item.kind === 'category') out.get(current)!.push(item.text)
    }
    return out
  }

  it('появляются только в больших отделах с несколькими категориями', () => {
    mount()
    const shown = subheads()
    let big = 0
    let small = 0
    for (const kind of expectedStores()) {
      const mine = TO_BUY.filter((l) => storeOf(l.category) === kind)
      const categories = categoriesOf(kind).filter((c) => mine.some((l) => l.category === c))
      const expected =
        mine.length >= CATEGORY_HEADS_FROM && categories.length > 1
          ? categories.map((c) => CATEGORY_LABEL[c])
          : []
      expect(shown.get(STORE_LABEL[kind]), STORE_LABEL[kind]).toEqual(expected)
      if (expected.length) big++
      else small++
    }
    // на настоящем списке встречаются оба случая — иначе правило проверено
    // только с одной стороны и «показывать всегда» прошло бы тоже
    expect(big).toBeGreaterThan(0)
    expect(small).toBeGreaterThan(0)
  })

  it('короткий отдел остаётся сплошным списком', () => {
    mount()
    const shown = subheads()
    const short = expectedStores().find(
      (kind) => TO_BUY.filter((l) => storeOf(l.category) === kind).length < CATEGORY_HEADS_FROM,
    )!
    expect(short).toBeTruthy()
    expect(shown.get(STORE_LABEL[short])).toEqual([])
  })
})

describe('режим магазина: что экран умел раньше', () => {
  it('отметка купленного вычёркивает строку и уменьшает счётчик', () => {
    mount()
    const counter = () => Number(document.querySelector('.shop__counter b')?.textContent)
    const before = counter()
    expect(before).toBe(TO_BUY.length)

    const row = document.querySelectorAll('.shop__row')[0] as HTMLElement
    act(() => fireEvent.click(row))

    expect((document.querySelectorAll('.shop__row')[0] as HTMLElement).dataset.done).toBe('true')
    expect(counter()).toBe(before - 1)
  })

  it('«прятать купленное» убирает отмеченное из списка', () => {
    mount()
    const first = rowNames()[0]
    act(() => fireEvent.click(document.querySelectorAll('.shop__row')[0] as HTMLElement))
    act(() => fireEvent.click(screen.getByLabelText('Прятать купленное')))

    expect(rowNames()).not.toContain(first)
    expect(rowNames().length).toBe(TO_BUY.length - 1)
  })

  it('отдел уходит с экрана, когда в нём всё куплено и купленное спрятано', () => {
    // отделы считаются по тому, что видно, а не по всему списку: иначе в зале
    // остаётся заголовок без единой строки под ним
    const short = expectedStores().reduce((a, b) =>
      TO_BUY.filter((l) => storeOf(l.category) === a).length <=
      TO_BUY.filter((l) => storeOf(l.category) === b).length
        ? a
        : b,
    )
    const ids = TO_BUY.filter((l) => storeOf(l.category) === short).map((l) => l.ingredientId)
    seed({ bought: ids })
    mount()

    expect(rowNames().length).toBe(TO_BUY.length)
    act(() => fireEvent.click(screen.getByLabelText('Прятать купленное')))

    const heads = flow().filter((i) => i.kind === 'store').map((i) => i.text)
    expect(heads).not.toContain(STORE_LABEL[short])
    expect(rowNames().length).toBe(TO_BUY.length - ids.length)
  })

  it('«есть дома» в магазин не попадает', () => {
    const home = TO_BUY[0]
    seed({ atHome: [home.ingredientId] })
    mount()
    expect(rowNames()).not.toContain(home.name)
    expect(rowNames().length).toBe(TO_BUY.length - 1)
  })

  it('когда всё отмечено, покупки можно разложить по запасам', () => {
    seed({ bought: TO_BUY.map((l) => l.ingredientId) })
    mount()
    expect(screen.getByText('Всё собрано')).toBeTruthy()

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Разложить покупки' })))

    expect(exits).toBe(1)
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // излишек упаковок не исчезает, а переезжает в запасы
    expect(saved.pantry.stock.length).toBeGreaterThan(0)
    /*
     * А отметки о покупках остаются: раскладка отвечает на вопрос «что лежит
     * дома», а не «что я уже взял в магазине». Пока она стирала отметки,
     * неделя начиналась заново — «Продукты» снова просили купить все 33
     * позиции, — и следующий заход раскладывал ту же покупку ещё раз.
     */
    expect(saved.bought).toEqual(TO_BUY.map((l) => l.ingredientId))
  })

  it('пока не всё куплено, «Всё собрано» не показывается', () => {
    mount()
    expect(screen.queryByText('Всё собрано')).toBeNull()
  })
})

/** Категория каждой строки известна: иначе проверки порядка молча пропускают строки. */
it('каждая строка списка знает свою категорию', () => {
  for (const line of TO_BUY) {
    expect(CATEGORY_OF.get(line.name), line.name).toBeTruthy()
    expect(CATEGORY_ORDER).toContain(CATEGORY_OF.get(line.name) as IngredientCategory)
  }
})
