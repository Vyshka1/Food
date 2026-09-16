// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { buildCookingPlans } from '../lib/cookingPlan'
import { cookTaskId } from '../lib/menu'
import { recipeById } from '../data/recipeRegistry'
import { COOK_RUN_KEY } from '../lib/cookProgress'
import { CookNowScreen } from './CookNowScreen'
import type { AppState, CookEvent, CookingPlan, PlannedStep } from '../types'

/*
 * Пошаговый режим обещает две вещи: довести готовку до конца и ничего при этом
 * не соврать. Здесь проверяется и то и другое — что пройденная по шагам готовка
 * действительно записывается (продукты списаны, заготовки в морозилке), что она
 * переживает крестик и перезагрузку, и что экран не выдаёт за факт то, чего на
 * плите нет.
 */

const [KEY] = STORAGE_KEYS

/** Прошлый понедельник: тогда загрузка соберёт живое меню на текущую неделю. */
const LAST_WEEK = '2026-08-31'

/** Неделя, которую собрало хранилище: она текущая, а не та, что в анкете. */
const weekStart = () => state().menu!.weekStart

function saved(): string {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    household: {
      eaters: [
        {
          id: 'e1',
          name: 'Юлия',
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
        {
          id: 'e2',
          name: 'Кирилл',
          sex: 'male',
          age: 33,
          heightCm: 182,
          weightKg: 80,
          activity: 'medium',
          goal: 'keep',
          allergies: [],
          customAllergens: [],
          dislikes: [],
          bannedRecipes: [],
          mealPlaces: {},
          ratings: {},
        },
      ],
      cookingDays: [0, 2, 6],
      meals: ['breakfast', 'lunch', 'dinner'],
      kitchen: {
        burners: 4,
        ovens: 1,
        hasAirfryer: false,
        hasMulticooker: false,
        hasBlender: true,
        hasProcessor: false,
        hasMicrowave: true,
        hasDishwasher: false,
        containers: 8,
        hasFreezer: true,
      },
      budgetPerWeek: 0,
      drinks: [],
      extras: [],
      weekStart: LAST_WEEK,
    },
    menu: { weekStart: LAST_WEEK, seed: 1, entries: [] },
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

/** Состояние, которое хранилище записало при загрузке. */
function state(): AppState {
  return JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
}

/**
 * Дать хранилищу собрать меню на эту неделю и записать его.
 *
 * В сохранённой анкете меню пустое — его собирает провайдер при первой
 * загрузке. Пока это не случилось, плана готовки не существует, а пересобирать
 * меню в тесте самому значило бы проверять экран по другому меню.
 */
function boot() {
  render(
    <StoreProvider>
      <i />
    </StoreProvider>,
  )
  cleanup()
}

/** Тот же план, что открывает кнопка «Готовлю сейчас» на экране плана. */
function livePlan(): CookingPlan {
  const s = state()
  return buildCookingPlans(s.menu!, s.household!, 1, s.pantry)[0]
}

/** Записать факт готовки — ровно то, что делает кнопка «Приготовлено». */
function addCookEvent(event: CookEvent) {
  const s = state()
  localStorage.setItem(KEY, JSON.stringify({ ...s, cookEvents: [...s.cookEvents, event] }))
}

function mount(plan: CookingPlan) {
  return render(
    <StoreProvider>
      <CookNowScreen plan={plan} cookNames={['Юлия']} onExit={() => {}} />
    </StoreProvider>,
  )
}

const text = (selector: string) => document.querySelector(selector)?.textContent ?? ''
const all = (selector: string) => [...document.querySelectorAll(selector)]
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const button = (label: string) =>
  all('button').find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined
const click = (node: Element | undefined | null) => act(() => (node as HTMLElement).click())

/** «3 из 14» из шапки. */
const counter = () => text('.cook__elapsed .muted')

/** Закрыть все шаги, как это делает человек: кнопкой крупной операции. */
function finishAll(): number {
  let clicks = 0
  for (let i = 0; i < 300; i += 1) {
    const btn = document.querySelector('.cook__now .btn')
    if (!btn) break
    click(btn)
    clicks += 1
  }
  return clicks
}

function step(patch: Partial<PlannedStep> & { start: number; end: number }): PlannedStep {
  return {
    recipeId: 'zapekanka',
    title: 'Запеканка',
    emoji: '',
    stepIndex: 0,
    text: 'Шаг',
    station: 'prep',
    handsOn: true,
    activeMinutes: patch.end - patch.start,
    unattended: false,
    cook: 0,
    ...patch,
  }
}

/**
 * План на двоих: духовка занята сама по себе, а руки заняты другим блюдом.
 * Собран руками, а не сгенерирован: проверяются минуты, и они должны быть
 * ровными, а не «какими сегодня получился план».
 */
const ovenPlan: CookingPlan = {
  cookDay: 2,
  dishes: [
    { recipeId: 'zapekanka', title: 'Запеканка', emoji: '', portions: 2 },
    { recipeId: 'pirog', title: 'Пирожки', emoji: '', portions: 4 },
  ],
  steps: [
    step({
      start: 0,
      end: 30,
      text: 'Запекать овощи',
      station: 'oven',
      appliance: 'oven',
      tempC: 200,
      handsOn: false,
      activeMinutes: 0,
      unattended: true,
      cook: null,
    }),
    step({ start: 0, end: 50, recipeId: 'pirog', title: 'Пирожки', text: 'Лепить пирожки' }),
  ],
  makespan: 50,
  handsOnMinutes: 50,
  attentionMinutes: 0,
  perCookMinutes: [50],
  maxParallel: 2,
  freeze: [],
  pack: [],
  thaw: [],
  coversDays: [2],
  warnings: [],
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  // среда: неделя уже идёт, меню собрано, план готовки есть
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0))
  localStorage.setItem(KEY, saved())
  boot()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('пройденная по шагам готовка записывается', () => {
  it('когда закрыт последний шаг блюда, готовка отмечена', () => {
    const plan = livePlan()
    mount(plan)
    expect(state().cookEvents).toEqual([])

    finishAll()

    expect(text('.cook__done')).toContain('Готово, всё сделано')
    const marked = state().cookEvents.map((e) => e.taskId)
    const expected = plan.dishes.map((d) => cookTaskId(weekStart(), d.recipeId, plan.cookDay))
    expect(plan.dishes.length).toBeGreaterThan(1)
    expect(marked.sort()).toEqual(expected.sort())
  })

  it('продукты уходят из кладовой — это и есть смысл отметки', () => {
    const plan = livePlan()
    /*
     * Кладём домой всё, что понадобится на эту готовку, с запасом. Иначе
     * списывать нечего: пустая кладовая после списания выглядит точно так же,
     * как до него, и проверка ничего не ловит.
     */
    const need = new Map<string, number>()
    for (const dish of plan.dishes) {
      for (const item of recipeById(dish.recipeId)?.items ?? []) {
        need.set(item.ingredientId, (need.get(item.ingredientId) ?? 0) + item.qty * 10)
      }
    }
    const s = state()
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...s,
        pantry: {
          ...s.pantry,
          stock: [...need].map(([ingredientId, qty]) => ({
            ingredientId,
            qty,
            addedAt: '2026-09-08',
          })),
        },
      }),
    )
    const before = state().pantry.stock

    mount(plan)
    finishAll()
    const after = state()

    // отметка — это не галочка: кладовая после неё другая
    expect(after.cookEvents.some((e) => e.used.length > 0)).toBe(true)
    const spent = before.filter((item) => {
      const now = after.pantry.stock.find((x) => x.ingredientId === item.ingredientId)
      return (now?.qty ?? 0) < item.qty
    })
    expect(spent.length).toBeGreaterThan(0)
  })

  it('блюдо не отмечается дважды', () => {
    const plan = livePlan()
    mount(plan)
    finishAll()
    // ещё десяток отрисовок: эффект отметки не должен сработать по второму разу
    advance(10_000)
    const ids = state().cookEvents.map((e) => e.taskId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(plan.dishes.length)
  })

  it('пока блюдо не закончено, отметки нет', () => {
    const plan = livePlan()
    mount(plan)
    const first = plan.steps[0]
    const ofDish = plan.steps.filter((s) => s.recipeId === first.recipeId)
    expect(ofDish.length).toBeGreaterThan(1)

    click(document.querySelector('.cook__now .btn'))
    expect(state().cookEvents).toEqual([])
  })
})

describe('блюдо, отмеченное приготовленным в плане', () => {
  /** Ровно то, что делает кнопка «Приготовлено»: факт готовки уже записан. */
  function withCooked(): { plan: CookingPlan; recipeId: string; title: string } {
    const plan = livePlan()
    const dish = plan.dishes[0]
    addCookEvent({
      taskId: cookTaskId(weekStart(), dish.recipeId, plan.cookDay),
      at: '2026-09-09',
      recipeId: dish.recipeId,
      servings: 2,
      cookedGrams: 800,
      used: [],
    })
    return { plan, recipeId: dish.recipeId, title: dish.title }
  }

  it('его шаги в пошаговый режим не попадают', () => {
    const { plan, recipeId, title } = withCooked()
    const ofDish = plan.steps.filter((s) => s.recipeId === recipeId)
    expect(ofDish.length).toBeGreaterThan(0)
    mount(plan)

    // счётчик считает весь день, а закрытыми сразу идут шаги готового блюда
    expect(counter()).toBe(`${ofDish.length} из ${plan.steps.length}`)
    // и ни один его шаг не предлагается сделать ещё раз
    for (let i = 0; i < plan.steps.length; i += 1) {
      const btn = document.querySelector('.cook__now .btn')
      if (!btn) break
      expect(text('.cook__dish')).not.toBe(title)
      click(btn)
    }
    for (const row of all('.cook__parallel-row')) {
      expect(row.textContent).not.toContain(title)
    }
  })

  it('второй отметки не появляется', () => {
    const { plan } = withCooked()
    mount(plan)
    finishAll()
    const ids = state().cookEvents.map((e) => e.taskId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(plan.dishes.length)
  })
})

describe('крестик и перезагрузка не уносят готовку', () => {
  it('отметки и таймер живут после выхода из режима', () => {
    const plan = livePlan()
    mount(plan)
    advance(180_000)
    click(document.querySelector('.cook__now .btn'))
    click(document.querySelector('.cook__now .btn'))
    expect(counter()).toBe(`2 из ${plan.steps.length}`)

    // крестик размонтирует экран — ровно как случайный тап мокрым пальцем
    cleanup()
    advance(120_000)
    mount(plan)

    expect(counter()).toBe(`2 из ${plan.steps.length}`)
    // часы шли всё это время: 3 минуты до выхода и 2 минуты снаружи
    expect(text('.cook__elapsed b')).toBe('5:00')
  })

  it('мусор в ключе не роняет экран — готовка просто начинается заново', () => {
    const plan = livePlan()
    localStorage.setItem(COOK_RUN_KEY, '{ход готовки, но не json')
    mount(plan)
    expect(counter()).toBe(`0 из ${plan.steps.length}`)
    expect(text('.cook__elapsed b')).toBe('0:00')
  })

  it('ход чужого дня не подхватывается', () => {
    const plan = livePlan()
    mount(plan)
    click(document.querySelector('.cook__now .btn'))
    cleanup()

    // тот же ключ, другой день готовки: это не наша готовка
    mount({ ...plan, cookDay: plan.cookDay + 1 })
    expect(counter()).toBe(`0 из ${plan.steps.length}`)
  })

  it('ход готовки лежит в своём ключе и общее состояние не трогает', () => {
    const plan = livePlan()
    const before = localStorage.getItem(KEY)
    mount(plan)
    click(document.querySelector('.cook__now .btn'))
    expect(localStorage.getItem(COOK_RUN_KEY)).toContain('"done"')
    // ни одной отметки шага в общем ключе: там только факт готовки блюда
    expect(localStorage.getItem(KEY)).toBe(before)
  })
})

describe('пауза не останавливает духовку', () => {
  it('противень, который уже стоит внутри, печётся по настоящим часам', () => {
    mount(ovenPlan)
    // 10-я минута: руки лепят пирожки, духовке остаётся 20:00
    advance(600_000)
    expect(text('.cook__parallel-text')).toBe('Запекать овощи')
    expect(text('.cook__parallel-timer')).toBe('20:00')

    click(button('Пауза'))
    advance(360_000)

    // шесть минут паузы духовка отработала: осталось 14:00, а не 20:00
    expect(text('.cook__parallel-timer')).toBe('14:00')
    // а работа рук честно подождала: общий таймер стоит
    expect(text('.cook__elapsed b')).toBe('10:00')
    // и подпись не обещает, что подождало всё
    expect(text('.cook__paused')).toContain('Духовка и плита на паузу не встают')
  })

  it('после «Продолжить» духовка не отматывается назад', () => {
    mount(ovenPlan)
    advance(600_000)
    click(button('Пауза'))
    advance(360_000)
    click(button('Продолжить'))
    expect(text('.cook__parallel-timer')).toBe('14:00')
    advance(60_000)
    expect(text('.cook__parallel-timer')).toBe('13:00')
  })
})

describe('просроченный пассивный шаг', () => {
  it('остаётся на виду и кричит громче', () => {
    mount(ovenPlan)
    // 31-я минута: духовка своё отработала минуту назад, а её никто не снял
    advance(31 * 60_000)

    const row = document.querySelector('.cook__parallel-row')
    expect(row?.textContent).toContain('Запекать овощи')
    expect(text('.cook__parallel-timer')).toBe('+1:00')
    expect(all('.cook__alert[data-over="true"]')).toHaveLength(1)
    expect(text('.cook__alert')).toContain('Пора!')
  })
})

describe('«Начать заново»', () => {
  it('спрашивает подтверждение, а не обнуляет молча', () => {
    const plan = livePlan()
    mount(plan)
    advance(120_000)
    click(document.querySelector('.cook__now .btn'))

    click(button('Начать заново'))
    // одного касания мало: отметки и таймер на месте
    expect(counter()).toBe(`1 из ${plan.steps.length}`)
    expect(text('.cook__elapsed b')).toBe('2:00')

    click(button('Нет, продолжаем'))
    expect(counter()).toBe(`1 из ${plan.steps.length}`)

    click(button('Начать заново'))
    click(button('Да, заново'))
    expect(counter()).toBe(`0 из ${plan.steps.length}`)
    expect(text('.cook__elapsed b')).toBe('0:00')
  })

  it('не отменяет того, что уже приготовлено', () => {
    const plan = livePlan()
    mount(plan)
    finishAll()
    const marked = state().cookEvents.length
    expect(marked).toBe(plan.dishes.length)

    click(button('Начать заново'))
    click(button('Да, заново'))

    // продукты списаны и заготовки убраны — заново это блюдо не готовится
    expect(state().cookEvents).toHaveLength(marked)
    expect(counter()).toBe(`${plan.steps.length} из ${plan.steps.length}`)
  })
})
