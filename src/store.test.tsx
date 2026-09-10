// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider, useStore } from './store'
import { SCHEMA_VERSION } from './lib/persist'
import { encodeProfile } from './lib/transfer'
import { addFreezer, emptyPantry } from './lib/pantry'
import type { FreezerItem } from './types'
import { recipeById } from './data/recipeRegistry'
import { parseIso } from './lib/day'

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

declare global {
  interface Window {
    __link?: string
    __ban?: string
  }
}

function Probe() {
  const store = useStore()
  const [importResult, setImportResult] = useState('')
  return (
    <div>
      <span data-testid="eaters">{store.household?.eaters.length ?? -1}</span>
      <span data-testid="blocked">{String(store.storage.blocked)}</span>
      <span data-testid="read">{store.storage.readProblem ?? ''}</span>
      <span data-testid="save">{store.storage.saveProblem ?? ''}</span>
      <span data-testid="week">{store.menu?.weekStart ?? ''}</span>
      <span data-testid="dishes">{JSON.stringify(store.menu?.entries ?? [])}</span>
      <span data-testid="next-week">{store.nextWeek?.menu.weekStart ?? ''}</span>
      <span data-testid="next-dishes">{JSON.stringify(store.nextWeek?.menu.entries ?? [])}</span>
      <span data-testid="import-ok">{importResult}</span>
      <span data-testid="frozen">
        {store.menu?.entries.filter((e) => e.fromFreezer).length ?? -1}
      </span>
      <button onClick={() => store.setNotifications(true)}>изменить</button>
      {/*
        * Без try: анкета из ссылки чинится при разборе, а если это сломается,
        * исключение вылетит при отрисовке провайдера — поймать его здесь всё
        * равно нельзя, и тест упадёт, как и должен.
        */}
      <button onClick={() => setImportResult(store.importProfile(window.__link ?? '') ? 'да' : 'нет')}>
        импортировать
      </button>
      <button onClick={() => store.unbanRecipe(window.__ban ?? '')}>вернуть</button>
      <button onClick={store.reset}>сбросить</button>
      <button onClick={() => store.banRecipe('e1', window.__ban ?? '')}>скрыть</button>
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

/** Прошлый понедельник: загрузка сама начнёт новую неделю и соберёт меню. */
function lastMonday(): string {
  const d = parseIso(thisMonday())
  d.setDate(d.getDate() - 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Понедельник текущей недели: иначе загрузка тут же начнёт новую. */
function thisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function goodData(weekStart: string = thisMonday()): string {
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
      weekStart,
    },
    menu: { weekStart, seed: 1, entries: [] },
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
  vi.useRealTimers()
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

/*
 * Следующая неделя.
 *
 * Её нет в сохранённых данных: неделя появляется в понедельник, когда `boot`
 * убирает прошлую в историю и собирает новую. Предпросмотр — та же сборка,
 * сделанная заранее, и весь его смысл в том, что он не врёт: человек готовит в
 * воскресенье под увиденное, и в понедельник должен получить именно это.
 */
describe('следующая неделя', () => {
  /** Понедельники двух соседних недель: часы в тесте подменяем, чтобы не гадать. */
  const WEEK = '2026-09-07'
  const NEXT = '2026-09-14'

  /** Подменяем только часы: React в фальшивых таймерах жить не обязан. */
  const atNoonOf = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const [y, m, d] = iso.split('-').map(Number)
    vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
  }

  it('показывается неделя, следующая за текущей', () => {
    atNoonOf('2026-09-13')
    localStorage.setItem(KEY, goodData(WEEK))

    mount()

    expect(at('week')).toBe(WEEK)
    expect(at('next-week')).toBe(NEXT)
  })

  /*
   * То самое обещание. Раньше зерно новой недели бралось случайным, и совпасть
   * эти два меню не могли в принципе: предпросмотр показывал одно, понедельник
   * приносил другое, а воскресная готовка оказывалась не к тому меню.
   */
  it('в понедельник собирается ровно то, что показывал предпросмотр', () => {
    atNoonOf('2026-09-13')
    localStorage.setItem(KEY, goodData(WEEK))
    mount()
    const promised = at('next-dishes')
    // совпадение двух пустых меню ничего не проверяет
    expect(JSON.parse(promised ?? '[]').length).toBeGreaterThan(0)

    cleanup()
    atNoonOf(NEXT)
    mount()

    expect(at('week')).toBe(NEXT)
    expect(at('dishes')).toBe(promised)
  })

  /*
   * И обещание не должно зависеть от того, в какой день его пришли проверять.
   *
   * Предпросмотр считается от понедельника своей недели: срок контейнера
   * меряется от дня, когда его собираются съесть. Пока `boot` собирал новую
   * неделю от сегодняшнего числа, человек, открывший приложение во вторник,
   * получал другое меню — сроки в морозилке мерялись на день позже. Замерено:
   * на 756 сочетаниях блюд и сроков сдвиг «сегодня» на день менял состав меню
   * в 4.8% случаев.
   *
   * Заготовка здесь подобрана так, чтобы попасть ровно в границу: к
   * понедельнику ей остаётся день, ко вторнику — ноль.
   */
  it('и собирается то же самое, даже если открыть не в понедельник', () => {
    const withFreezer = (weekStart: string) => {
      const data = JSON.parse(goodData(weekStart)) as {
        pantry: { always: string[]; stock: unknown[]; freezer: FreezerItem[] }
      }
      const soup = recipeById('lentil_soup')!
      data.pantry.freezer = addFreezer(emptyPantry(), soup, 2, 2, '2026-09-01').freezer
      data.pantry.freezer[0].keepDays = 14
      return JSON.stringify(data)
    }

    atNoonOf('2026-09-13')
    localStorage.setItem(KEY, withFreezer(WEEK))
    mount()
    const promised = at('next-dishes')
    expect(JSON.parse(promised ?? '[]').length).toBeGreaterThan(0)

    cleanup()
    // вторник, а не понедельник: человек просто не открывал приложение сутки
    atNoonOf('2026-09-15')
    localStorage.setItem(KEY, withFreezer(WEEK))
    mount()

    expect(at('week')).toBe(NEXT)
    expect(at('dishes')).toBe(promised)
  })

  /*
   * Предпросмотр — вычисляемое значение, а не второе меню в записи. Иначе их
   * стало бы два: сохранённое в воскресенье и собранное в понедельник, — и
   * расходиться они начали бы с первой же покупки.
   */
  it('не попадает в сохранённые данные', () => {
    atNoonOf('2026-09-13')
    localStorage.setItem(KEY, goodData(WEEK))

    mount()

    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    expect(saved.nextWeek).toBeUndefined()
    expect(saved.menu.weekStart).toBe(WEEK)
  })

  it('без анкеты показывать нечего', () => {
    atNoonOf('2026-09-13')

    mount()

    expect(at('next-week')).toBe('')
  })

  /*
   * Нечитаемая дата недели.
   *
   * Такая запись у людей была: `lib/day` разбирает даты нарочно строго и на
   * мусоре бросает. Раньше мусор переживал загрузку — пересборка старого меню
   * шла первой и возвращалась до проверки понедельника, — и человек оставался
   * с «неделей» по имени «позавчера», в которой ничего нельзя отметить.
   *
   * Теперь неделя крутится первой, и мусорная дата просто заменяется
   * настоящим понедельником: анкета, кладовая и история целы, меню собрано,
   * предпросмотр считается. Ловушка вокруг сборки остаётся — она защищает
   * отрисовку провайдера, внутри которого живут и сообщение об ошибке, и
   * кнопка «скачать копию», — но добраться до неё через сохранённые данные
   * больше нечем.
   */
  it('нечитаемая дата недели заменяется настоящей неделей', () => {
    atNoonOf('2026-09-13')
    const data = JSON.parse(goodData(WEEK))
    data.household.weekStart = 'позавчера'
    data.menu.weekStart = 'позавчера'
    // запись без `portions` — меню из времён до личных порций
    data.menu.entries = [
      { id: 'x', recipeId: 'ovsyanka_yagody', slot: 'breakfast', day: 0, cookDay: 0, storage: 'fresh' },
    ]
    localStorage.setItem(KEY, JSON.stringify(data))

    mount()

    expect(at('eaters')).toBe('1')
    expect(at('blocked')).toBe('false')
    expect(at('week')).toBe(WEEK)
    expect(at('next-week')).toBe(NEXT)
    expect(JSON.parse(at('dishes') ?? '[]').length).toBeGreaterThan(0)
  })
})

describe('чужой профиль по ссылке', () => {
  /*
   * Ссылка приходит извне, и её числа никто не обещал. Нечисло в возрасте,
   * росте или весе делает норму NaN, а с NaN сборка меню падает на любом
   * зерне — прямо во время импорта, без всякого catch. Едоки из ссылки
   * проходят ту же починку, что и едоки из хранилища.
   */
  it('нечисло в теле едока не роняет приложение', () => {
    const household = JSON.parse(goodData()).household as {
      eaters: Record<string, unknown>[]
    }
    // строка, а не null: null в арифметике ведёт себя как ноль и норму не
    // ломает, а вот нечисло делает её NaN — и именно на этом падала сборка
    household.eaters[0].weightKg = '62 кг'
    window.__link = encodeProfile({
      household: household as never,
      customRecipes: [],
    })
    mount()
    act(() => screen.getByText('импортировать').click())
    expect(at('import-ok')).toBe('да')
    expect(at('dishes')).not.toBe('[]')
  })

  /*
   * Анкета приходит чужая, а морозилка остаётся своя: она лежит в этом
   * браузере, и импорт её не трогает. Пока меню по чужой анкете собиралось с
   * пустой морозилкой, заготовки пропадали из плана — приложение выписывало
   * готовку и покупку на еду, которая уже сварена и лежит в контейнере.
   */
  it('своя морозилка не пропадает из плана', () => {
    const soup = recipeById('lentil_soup')!
    const data = JSON.parse(goodData()) as {
      pantry: { always: string[]; stock: unknown[]; freezer: unknown[] }
      household: unknown
    }
    data.pantry.freezer = addFreezer(emptyPantry(), soup, 3, 2, thisMonday()).freezer
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(data))
    window.__link = encodeProfile({ household: data.household as never, customRecipes: [] })

    mount()
    act(() => screen.getByText('импортировать').click())

    expect(at('import-ok')).toBe('да')
    expect(Number(at('frozen'))).toBeGreaterThan(0)
  })
})

describe('скрыть блюдо', () => {
  /*
   * Пересборка после «не показывать это блюдо» шла мимо menuFor и потому не
   * получала ни морозилку, ни сегодняшнее число. Заготовки исчезали из плана
   * целиком: cookTasks выписывал готовку и покупку на еду, которая уже
   * сварена и лежит в контейнере.
   */
  it('заготовки из морозилки не исчезают из плана', () => {
    const soup = recipeById('lentil_soup')!
    const data = JSON.parse(goodData(lastMonday())) as {
      pantry: { always: string[]; stock: unknown[]; freezer: unknown[] }
    }
    data.pantry.freezer = addFreezer(emptyPantry(), soup, 3, 2, thisMonday()).freezer
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(data))
    mount()
    const before = Number(at('frozen'))
    expect(before).toBeGreaterThan(0)

    // прячем не суп, а первое блюдо не из морозилки: заготовки это не касается
    const menu = JSON.parse(at('dishes') ?? '[]') as { recipeId: string; fromFreezer?: boolean }[]
    window.__ban = menu.find((e) => !e.fromFreezer && e.recipeId !== soup.id)!.recipeId
    act(() => screen.getByText('скрыть').click())

    expect(Number(at('frozen'))).toBe(before)
  })

  it('и не исчезают, когда блюдо возвращают обратно', () => {
    const soup = recipeById('lentil_soup')!
    const data = JSON.parse(goodData(lastMonday())) as {
      pantry: { always: string[]; stock: unknown[]; freezer: unknown[] }
    }
    data.pantry.freezer = addFreezer(emptyPantry(), soup, 3, 2, thisMonday()).freezer
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(data))
    mount()
    const before = Number(at('frozen'))
    expect(before).toBeGreaterThan(0)

    const menu = JSON.parse(at('dishes') ?? '[]') as { recipeId: string; fromFreezer?: boolean }[]
    window.__ban = menu.find((e) => !e.fromFreezer && e.recipeId !== soup.id)!.recipeId
    act(() => screen.getByText('скрыть').click())
    act(() => screen.getByText('вернуть').click())

    expect(Number(at('frozen'))).toBe(before)
  })
})
