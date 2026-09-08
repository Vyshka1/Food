// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider, useStore } from './store'
import { SCHEMA_VERSION } from './lib/persist'

/*
 * Здесь проверяется одно обещание, ради которого затевалась вся эта работа:
 * приложение не стирает данные, которых не поняло.
 *
 * Раньше любая ошибка разбора превращалась в пустое состояние, а безусловный
 * эффект записи в первом же кадре затирал им исходные байты. Человек терял
 * анкету, свои рецепты, кладовую, морозилку, двенадцать недель истории и все
 * факты готовки — и восстановить их было неоткуда: ссылка-профиль хранит
 * только анкету и свои рецепты.
 */

const [KEY, LEGACY_KEY] = STORAGE_KEYS

function Probe() {
  const store = useStore()
  return (
    <div>
      <span data-testid="eaters">{store.household?.eaters.length ?? -1}</span>
      <span data-testid="blocked">{String(store.storage.blocked)}</span>
      <span data-testid="read">{store.storage.readProblem ?? ''}</span>
      <span data-testid="save">{store.storage.saveProblem ?? ''}</span>
      <button onClick={() => store.setNotifications(true)}>изменить</button>
      <button onClick={store.reset}>сбросить</button>
    </div>
  )
}

function mount() {
  return render(
    <StoreProvider>
      <Probe />
    </StoreProvider>,
  )
}

const at = (id: string) => screen.getByTestId(id).textContent

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

/** Понедельник текущей недели: иначе загрузка тут же начнёт новую. */
function thisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function goodData(): string {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    household: {
      eaters: [eater()],
      cookingDays: [2, 6],
      meals: ['breakfast', 'lunch', 'dinner'],
      kitchen: { burners: 4, ovens: 1, containers: 8, hasFreezer: true },
      budgetPerWeek: 0,
      drinks: [],
      extras: [],
      weekStart: thisMonday(),
    },
    menu: { weekStart: thisMonday(), seed: 1, entries: [] },
    atHome: [],
    pantry: { always: ['sol'], stock: [], freezer: [] },
    notifications: false,
    bought: [],
    warnings: [],
    customRecipes: [],
    history: [],
    cookEvents: [],
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('сохранение', () => {
  it('нечитаемые данные остаются нетронутыми, а не затираются пустотой', () => {
    const original = '{"household":{"eaters":[{"id":"e1","name":"Я"'
    localStorage.setItem(KEY, original)

    mount()

    expect(localStorage.getItem(KEY)).toBe(original)
    expect(at('blocked')).toBe('true')
    expect(at('read')).not.toBe('')
  })

  it('и не затираются даже после того, как человек что-то изменил', () => {
    const original = 'не json вовсе'
    localStorage.setItem(KEY, original)
    mount()

    act(() => screen.getByText('изменить').click())

    expect(localStorage.getItem(KEY)).toBe(original)
  })

  it('данные новее этой сборки старая вкладка не переписывает', () => {
    const future = JSON.parse(goodData())
    future.version = SCHEMA_VERSION + 1
    const raw = JSON.stringify(future)
    localStorage.setItem(KEY, raw)

    mount()

    expect(localStorage.getItem(KEY)).toBe(raw)
    expect(at('blocked')).toBe('true')
  })

  it('целые данные читаются и сохраняются обратно с номером версии', () => {
    localStorage.setItem(KEY, goodData())

    mount()

    expect(at('eaters')).toBe('1')
    expect(at('blocked')).toBe('false')
    expect(at('read')).toBe('')
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').version).toBe(SCHEMA_VERSION)
  })

  it('анкета из старого ключа не теряется', () => {
    localStorage.setItem(LEGACY_KEY, goodData())

    mount()

    expect(at('eaters')).toBe('1')
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').household.eaters).toHaveLength(1)
  })

  it('кончилось место — человек об этом узнаёт, а приложение работает дальше', () => {
    localStorage.setItem(KEY, goodData())
    const quota = new DOMException('quota', 'QuotaExceededError')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quota
    })

    mount()

    expect(at('save')).toContain('место')
    expect(at('eaters')).toBe('1')
  })

  it('«начать заново» стирает оба ключа и снова включает сохранение', () => {
    localStorage.setItem(KEY, 'сломано')
    localStorage.setItem(LEGACY_KEY, goodData())
    mount()
    expect(at('blocked')).toBe('true')

    act(() => screen.getByText('сбросить').click())

    expect(at('blocked')).toBe('false')
    expect(at('eaters')).toBe('-1')
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    // а на месте старой строки теперь пустое состояние, записанное нарочно
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').household).toBeNull()
  })

  /*
   * `boot` работает инициализатором состояния: исключение оттуда уносит с собой
   * весь провайдер — вместе с сообщением об ошибке и кнопкой «скачать копию»,
   * которые живут внутри него. Человек получал белый экран без единого способа
   * что-то сделать, и перезагрузка повторяла это бесконечно.
   */
  it('свой рецепт без шагов не оставляет человека с белым экраном', () => {
    const data = JSON.parse(goodData())
    data.customRecipes = [{ id: 'r1', title: 'Своё', items: [] }]
    const raw = JSON.stringify(data)
    localStorage.setItem(KEY, raw)

    mount()

    expect(at('blocked')).toBe('true')
    expect(at('read')).not.toBe('')
    expect(localStorage.getItem(KEY)).toBe(raw)
  })

  it('и не оставляет, если рецепт сломан глубже, чем видно на входе', () => {
    // проверка на входе смотрит на форму рецепта; здесь форма правильная, а
    // внутри шагов пусто — реестр падает уже на разборе. Провайдер обязан
    // остаться на ногах и в этом случае
    const data = JSON.parse(goodData())
    data.customRecipes = [{ id: 'r1', title: 'Своё', items: [], steps: [null] }]
    const raw = JSON.stringify(data)
    localStorage.setItem(KEY, raw)

    mount()

    expect(at('blocked')).toBe('true')
    expect(localStorage.getItem(KEY)).toBe(raw)
  })

  it('данные из старого ключа не заслоняются пустой строкой в новом', () => {
    localStorage.setItem(KEY, '')
    localStorage.setItem(LEGACY_KEY, goodData())

    mount()

    expect(at('eaters')).toBe('1')
    expect(at('blocked')).toBe('false')
  })

  it('первый запуск: пусто — это не поломка', () => {
    mount()
    expect(at('blocked')).toBe('false')
    expect(at('read')).toBe('')
    expect(at('eaters')).toBe('-1')
  })
})
