import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY,
  SCHEMA_VERSION,
  blankState,
  makeRecord,
  needsRebuild,
  parseState,
  rotateWeek,
  serialize,
} from './persist'
import type { AppState, CookEvent, Eater, Household, MenuEntry, WeekMenu } from '../types'

/*
 * Строки в этих проверках — то, что действительно могло лежать у человека в
 * браузере: шесть форм данных, накопленных за время жизни приложения, и восемь
 * способов эти данные испортить. Проверяем одно свойство, ради которого файл и
 * появился: разбор либо возвращает годное состояние, либо честно говорит
 * «сломано» — и никогда не выдаёт пустоту за успешно прочитанное.
 */

function eater(extra: Record<string, unknown> = {}) {
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
    ...extra,
  }
}

function household(extra: Record<string, unknown> = {}) {
  return {
    eaters: [eater()],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, ovens: 1, containers: 8, hasFreezer: true },
    budgetPerWeek: 0,
    drinks: [],
    extras: [],
    weekStart: '2026-09-07',
    ...extra,
  }
}

function entry(extra: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    recipeId: 'omlet',
    slot: 'breakfast',
    day: 0,
    cookDay: 0,
    portions: [{ eaterId: 'e1', factor: 1 }],
    storage: 'fresh',
    ...extra,
  }
}

function saved(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    household: household(),
    menu: { weekStart: '2026-09-07', seed: 1, entries: [entry()] },
    atHome: [],
    pantry: { always: ['salt'], stock: [], freezer: [] },
    notifications: false,
    bought: [],
    warnings: [],
    customRecipes: [],
    history: [],
    cookEvents: [],
    ...extra,
  })
}

describe('пустое состояние', () => {
  it('каждый раз своё: общий объект испортили бы для всех', () => {
    const a = blankState()
    const b = blankState()
    expect(a).toEqual(b)
    a.pantry.stock.push({ ingredientId: 'ris', qty: 500, addedAt: '2026-09-07' })
    a.history.push(makeRecord({ weekStart: 'x', seed: 0, entries: [] }, [], 'now'))
    expect(b.pantry.stock).toHaveLength(0)
    expect(b.history).toHaveLength(0)
  })
})

describe('нечитаемые данные', () => {
  it('ничего не сохранено — это не поломка, а первый запуск', () => {
    for (const raw of [null, '']) {
      const result = parseState(raw)
      expect(result.broken).toBe(false)
      expect(result.problem).toBeNull()
      expect(result.state.household).toBeNull()
    }
  })

  /*
   * Главное свойство файла. Каждая из этих строк раньше проваливалась в
   * `catch { return emptyState }`, а эффект записи в первом же кадре затирал
   * ими исходные байты — вместе с анкетой, кладовой и историей недель.
   */
  it.each([
    ['обрезанная запись', '{"household":{"eaters":[{"id":"e1"'],
    ['строка undefined', 'undefined'],
    ['сохранённый null', 'null'],
    ['не объект, а число', '42'],
    ['не объект, а строка', '"анкета"'],
    ['массив вместо объекта', '[]'],
    ['мусор от другого приложения', '<!DOCTYPE html>'],
    ['пустая анкета без едоков', JSON.stringify({ household: { eaters: [] } })],
    ['меню без списка записей', saved({ menu: { weekStart: '2026-09-07', seed: 1 } })],
  ])('%s — сломано, и об этом сказано', (_name, raw) => {
    const result = parseState(raw)
    expect(result.broken).toBe(true)
    expect(result.problem).toBeTruthy()
    expect(result.state).toEqual(blankState())
  })

  it('данные новее этой сборки не читаются и не переписываются', () => {
    const result = parseState(saved({ version: SCHEMA_VERSION + 1 }))
    expect(result.broken).toBe(true)
    expect(result.problem).toContain(String(SCHEMA_VERSION + 1))
  })

  it('данные постарше читаются как свои', () => {
    expect(parseState(saved({ version: SCHEMA_VERSION - 1 })).broken).toBe(false)
    expect(parseState(saved({ version: undefined })).broken).toBe(false)
  })
})

describe('починка полей', () => {
  it('сохранённый null — это не «пусто по умолчанию»', () => {
    const raw = saved({
      atHome: null,
      bought: null,
      warnings: null,
      customRecipes: null,
      history: null,
      cookEvents: null,
    })
    const { state, broken } = parseState(raw)
    expect(broken).toBe(false)
    for (const list of [
      state.atHome,
      state.bought,
      state.warnings,
      state.customRecipes,
      state.history,
      state.cookEvents,
    ]) {
      expect(Array.isArray(list)).toBe(true)
      expect(list).toHaveLength(0)
    }
  })

  it('кладовая чинится по частям, а не только целиком', () => {
    // пропавший freezer переживал загрузку и падал уже при отрисовке
    const broken = parseState(saved({ pantry: { always: ['salt'], stock: [] } }))
    expect(broken.state.pantry.freezer).toEqual([])
    expect(broken.state.pantry.always).toEqual(['salt'])

    const missing = parseState(saved({ pantry: null }))
    expect(missing.state.pantry.stock).toEqual([])
    expect(missing.state.pantry.always.length).toBeGreaterThan(0)
  })

  it('версия в состоянии всегда своя, даже если сохранена чужая', () => {
    expect(parseState(saved({ version: 2 })).state.version).toBe(SCHEMA_VERSION)
    expect(JSON.parse(serialize(blankState())).version).toBe(SCHEMA_VERSION)
  })
})

describe('старые формы данных', () => {
  it('анкета без мест приёма пищи: awayMeals — это «не дома»', () => {
    const raw = saved({
      household: household({
        eaters: [eater({ mealPlaces: undefined, awayMeals: ['1-lunch'] })],
      }),
    })
    const { state } = parseState(raw)
    const first = state.household?.eaters[0] as Eater & { awayMeals?: string[] }
    expect(first.mealPlaces['1-lunch']).toBe('away')
    expect(first.awayMeals).toBeUndefined()
  })

  it('кухня без списка приборов: hasOven — это одна духовка', () => {
    const withOven = parseState(saved({ household: household({ kitchen: { hasOven: true } }) }))
    expect(withOven.state.household?.kitchen.ovens).toBe(1)
    const without = parseState(saved({ household: household({ kitchen: { hasOven: false } }) }))
    expect(without.state.household?.kitchen.ovens).toBe(0)
    // а прибора, которого тогда не было, нет и сейчас
    expect(without.state.household?.kitchen.hasMulticooker).toBe(false)
  })

  it('анкета без напитков, масел, повторов и дополнений', () => {
    const raw = saved({
      household: household({ drinks: null, oils: undefined, repeats: undefined, extras: null }),
    })
    const { state, broken } = parseState(raw)
    expect(broken).toBe(false)
    expect(state.household?.drinks).toEqual([])
    expect(state.household?.extras).toEqual([])
    expect(state.household?.oils).toBeTruthy()
    expect(state.household?.repeats).toBeTruthy()
  })

  it('меню без личных порций просит пересборки', () => {
    const old = parseState(saved({ menu: { weekStart: '2026-09-07', seed: 1, entries: [entry({ portions: undefined })] } }))
    expect(needsRebuild(old.state)).toBe(true)
    expect(needsRebuild(parseState(saved()).state)).toBe(false)
    expect(needsRebuild(blankState())).toBe(false)
  })

  /*
   * Отметка «приготовлено» жила на записи меню, и продукты списывались тут же.
   * Снимок списанного восстановить нельзя, но списать второй раз — можно, и
   * это была бы настоящая потеря: продукты ушли бы из кладовой дважды.
   */
  it('старая отметка «приготовлено» становится фактом с пустым списанием', () => {
    const raw = saved({
      menu: {
        weekStart: '2026-09-07',
        seed: 1,
        entries: [entry({ status: 'cooked' }), entry({ id: 'm2', status: 'eaten' })],
      },
    })
    const { state } = parseState(raw)
    expect(state.cookEvents).toHaveLength(1)
    expect(state.cookEvents[0].taskId).toBe('2026-09-07|omlet|0')
    expect(state.cookEvents[0].used).toEqual([])
    expect(state.menu?.entries[0].status).toBeUndefined()
    // чужие состояния записей не трогаем
    expect(state.menu?.entries[1].status).toBe('eaten')
  })

  it('и не задваивается, если факт уже есть', () => {
    const known: CookEvent = {
      taskId: '2026-09-07|omlet|0',
      at: '2026-09-07',
      recipeId: 'omlet',
      servings: 2,
      cookedGrams: 500,
      used: [{ ingredientId: 'yaico', qty: 4 }],
    }
    const raw = saved({
      menu: { weekStart: '2026-09-07', seed: 1, entries: [entry({ status: 'cooked' })] },
      cookEvents: [known],
    })
    const { state } = parseState(raw)
    expect(state.cookEvents).toEqual([known])
  })
})

describe('смена недели', () => {
  const menu: WeekMenu = { weekStart: '2026-09-14', seed: 7, entries: [entry() as unknown as MenuEntry] }

  function weekState(): AppState {
    return {
      ...blankState(),
      household: household() as unknown as Household,
      menu: { weekStart: '2026-09-07', seed: 1, entries: [entry() as unknown as MenuEntry] },
      bought: ['ris'],
      cookEvents: [
        { taskId: '2026-09-07|omlet|0', at: '2026-09-07', recipeId: 'omlet', servings: 2, cookedGrams: 500, used: [] },
        { taskId: '2026-01-05|old|0', at: '2026-01-05', recipeId: 'old', servings: 1, cookedGrams: 100, used: [] },
      ],
    }
  }

  it('прошлая неделя уходит в историю, а не затирается', () => {
    const next = rotateWeek(weekState(), '2026-09-14', menu, [], '2026-09-14T08:00:00.000Z')
    expect(next.history).toHaveLength(1)
    expect(next.history[0].weekStart).toBe('2026-09-07')
    expect(next.history[0].cooked).toBe(1)
    expect(next.menu).toBe(menu)
    expect(next.household?.weekStart).toBe('2026-09-14')
    expect(next.bought).toEqual([])
  })

  it('факты готовки живут столько же, сколько недели, к которым относятся', () => {
    const next = rotateWeek(weekState(), '2026-09-14', menu, [], '2026-09-14T08:00:00.000Z')
    expect(next.cookEvents.map((e) => e.taskId)).toEqual(['2026-09-07|omlet|0'])
  })

  it('одна и та же неделя не попадает в историю дважды', () => {
    const once = rotateWeek(weekState(), '2026-09-14', menu, [], 'a')
    const twice = rotateWeek(once, '2026-09-14', menu, [], 'b')
    expect(twice.history.filter((r) => r.weekStart === '2026-09-07')).toHaveLength(1)
  })

  it('история не растёт бесконечно: localStorage не резиновый', () => {
    let state = weekState()
    for (let week = 0; week < MAX_HISTORY + 5; week += 1) {
      const day = String(14 + week * 7).padStart(2, '0')
      state = {
        ...state,
        menu: { ...state.menu!, weekStart: `2026-09-${day}`, seed: week },
      }
      state = rotateWeek(state, `2026-09-${day}`, { ...menu, seed: week + 100 }, [], 'now')
    }
    expect(state.history.length).toBeLessThanOrEqual(MAX_HISTORY)
  })

  it('без анкеты или без меню менять нечего', () => {
    const empty = blankState()
    expect(rotateWeek(empty, '2026-09-14', menu, [], 'now')).toBe(empty)
  })
})
