// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { buildCookingPlans } from '../lib/cookingPlan'
import { cookBlocks } from '../lib/cookBlocks'
import { formatDuration } from '../lib/cookingPlan'
import { kitchenLoad } from '../lib/kitchenLoad'
import { PlanScreen } from './PlanScreen'
import type { AppState, CookingPlan } from '../types'

/*
 * Экран плана обещает одно: показать, что идёт одновременно. Список шагов на
 * этот вопрос не отвечал — по нему нельзя сказать, стоит ли суп на плите, пока
 * режется салат. Здесь проверяется, что диаграмма построена по тем же минутам,
 * которые посчитало расписание, и что ни одно число экрана не посчитано заново.
 */

const [KEY] = STORAGE_KEYS

/** Прошлый понедельник: тогда загрузка соберёт живое меню на текущую неделю. */
const LAST_WEEK = '2026-08-31'

function saved(cookingDays: number[] = [0, 2, 6]): string {
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
      cookingDays,
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

let cooked: CookingPlan | null = null

function mount() {
  cooked = null
  return render(
    <StoreProvider>
      <PlanScreen onCookNow={(plan) => (cooked = plan)} />
    </StoreProvider>,
  )
}

/**
 * Тот же план, что видит экран. Берём его из состояния, которое хранилище
 * записало при загрузке: пересобирать меню в тесте значило бы проверять экран
 * по другому меню.
 */
function planOnScreen(): { plan: CookingPlan; state: AppState } {
  const state = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
  const plans = buildCookingPlans(state.menu!, state.household!, 1, state.pantry)
  return { plan: plans[0], state }
}

const all = (selector: string) => [...document.querySelectorAll(selector)]

/**
 * Диаграмма уехала под кнопку: главный экран отвечает на «что делать
 * сейчас», а она — на «как устроен день». Тесты про неё её и открывают.
 */
const openGantt = () => {
  const toggle = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Показать загрузку кухни'),
  )
  if (toggle) act(() => (toggle as HTMLButtonElement).click())
}
const text = (selector: string) => document.querySelector(selector)?.textContent ?? ''

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  // среда: неделя уже идёт, меню собрано, план готовки есть
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0))
  localStorage.setItem(KEY, saved())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('план готовки: расписание диаграммой', () => {
  it('строка на блюдо и отрезок на каждый шаг — ни одного шага не потеряно', () => {
    mount()
    openGantt()
    const { plan } = planOnScreen()
    const dishes = new Set(plan.steps.map((s) => s.recipeId))

    expect(plan.steps.length).toBeGreaterThan(0)
    expect(all('.gantt__lane')).toHaveLength(dishes.size)
    expect(all('.gantt__bar')).toHaveLength(plan.steps.length)
  })

  it('отрезок стоит там же, где шаг стоит в расписании', () => {
    mount()
    openGantt()
    const { plan } = planOnScreen()
    const bars = [...document.querySelectorAll('.gantt__bar')] as HTMLElement[]

    /*
     * Сверяем каждый отрезок, а не первый. Первый шаг плана всегда начинается
     * в ноль, поэтому проверка на нём сводилась к «0% равно 0%»: отрезки можно
     * было прижать к левому краю все разом, и тест этого не замечал.
     */
    const byLane = new Map<string, typeof plan.steps>()
    for (const step of plan.steps) {
      byLane.set(step.recipeId, [...(byLane.get(step.recipeId) ?? []), step])
    }
    const expected = [...byLane.values()].flat()
    expect(bars).toHaveLength(expected.length)

    let movedRight = 0
    expected.forEach((step, i) => {
      expect(bars[i].style.left, step.text).toBe(`${(step.start / plan.makespan) * 100}%`)
      expect(bars[i].style.width, step.text).toBe(
        `${((step.end - step.start) / plan.makespan) * 100}%`,
      )
      if (step.start > 0) movedRight += 1
    })
    // и хотя бы часть отрезков действительно сдвинута — иначе сверять нечего
    expect(movedRight).toBeGreaterThan(0)
  })

  it('у отрезка есть имя, а не только подсказка при наведении', () => {
    mount()
    openGantt()
    const bars = [...document.querySelectorAll('.gantt__bar')] as HTMLElement[]
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      // title на телефоне не показывается: наводить нечем
      expect(bar.getAttribute('aria-label')).toBeTruthy()
      expect(bar.getAttribute('aria-label')).toBe(bar.getAttribute('title'))
    }
  })

  it('подробности шага видны в списке, а не только на отрезке', () => {
    mount()
    const { plan } = planOnScreen()
    /*
     * План по времени показывает все шаги сразу — разворачивать нечего.
     * Подробности («руки заняты 5 из 40», «180°», «можно отойти») обязаны
     * быть текстом: на телефоне подсказки при наведении не существует.
     */
    const details = all('.next-step:not(.next-step--after) .next-step__detail')
    expect(details).toHaveLength(plan.steps.length)
    for (const node of details) {
      expect(node.textContent?.length).toBeGreaterThan(0)
    }
  })

  it('«руками» старше прибора: занятые руки видно, даже если это плита', () => {
    mount()
    openGantt()
    const { plan } = planOnScreen()
    const handsOn = plan.steps.filter((s) => s.handsOn)
    // в живом плане ручные шаги у плиты есть — иначе проверка ничего не ловит
    expect(handsOn.some((s) => s.appliance === 'stove')).toBe(true)
    expect(all('.gantt__bar[data-band="hands"]')).toHaveLength(handsOn.length)
  })

  it('ось времени подписана временем дня и идёт ровным шагом', () => {
    mount()
    openGantt()
    const ticks = all('.gantt__tick').map((t) => t.textContent ?? '')
    const minutes = ticks.map((t) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    })
    // первая засечка — час старта, дальше ровный шаг: 11:00, 11:15, 11:30…
    expect(ticks[0]).toBe('11:00')
    expect(ticks.length).toBeGreaterThan(1)
    const step = minutes[1] - minutes[0]
    expect(minutes.every((m, i) => m === minutes[0] + i * step)).toBe(true)
    // подписей не больше, чем помещается без слипания
    expect(ticks.length).toBeLessThanOrEqual(7)
  })

  it('диаграмма прокручивается внутри себя — страницу за собой не тянет', () => {
    mount()
    openGantt()
    const scroll = document.querySelector('.gantt__scroll')
    expect(scroll).toBeTruthy()
    expect(document.querySelector('.gantt__grid')?.getAttribute('style')).toContain('--gantt-lanes')
  })
})

describe('план готовки: рейка и ближайшие шаги', () => {
  it('план по времени идёт блоками, и ни один шаг не потерян', () => {
    mount()
    const { plan } = planOnScreen()
    const blocks = cookBlocks(plan.steps)

    expect(all('.plan-block')).toHaveLength(blocks.length + (plan.pack.length > 0 ? 1 : 0))
    // каждый шаг плана стоит в списке ровно один раз
    expect(all('.next-step__what').length).toBeGreaterThanOrEqual(plan.steps.length)
    expect(text('.plan-block__time')).toBe('11:00')
  })

  it('сводка называет числа плана, а не соседние', () => {
    mount()
    const { plan } = planOnScreen()
    const tiles = all('.plan-stat').map((n) => n.textContent ?? '')
    expect(tiles).toHaveLength(4)
    /*
     * Главная перемена экрана не проверялась ничем: «действий» можно было
     * сдвинуть на единицу, «всего» подменить занятыми руками, «блюд» —
     * посчитать иначе, и все 699 тестов оставались зелёными.
     */
    expect(tiles[0]).toContain(formatDuration(plan.makespan))
    expect(tiles[1]).toContain(String(plan.steps.length))
    expect(tiles[2]).toContain(String(plan.dishes.length))
    // «закончите» — старт плюс длительность, а старт в фикстуре 11:00
    const end = 11 * 60 + plan.makespan
    expect(tiles[3]).toContain(
      `${Math.floor(end / 60) % 24}:${String(end % 60).padStart(2, '0')}`,
    )
    // и это не длительность, выданная за время
    expect(tiles[3]).not.toContain(formatDuration(plan.makespan))
  })

  it('время блока — время его первого шага, а не начала готовки', () => {
    mount()
    const { plan } = planOnScreen()
    const blocks = cookBlocks(plan.steps)
    const times = all('.plan-block__time').map((n) => n.textContent)
    expect(blocks.length).toBeGreaterThan(1)
    // сверяем каждый блок: первый всегда стартует в ноль и ничего не доказывает
    blocks.forEach((block, i) => {
      const h = 11 + Math.floor(block.start / 60)
      const m = block.start % 60
      expect(times[i]).toBe(`${h}:${String(m).padStart(2, '0')}`)
    })
  })

  it('первый блок не обещает одновременности, когда повар один', () => {
    mount()
    const head = document.querySelector('.plan-block__head')?.textContent ?? ''
    expect(head).toContain('Начните с')
    // «одновременно» — обещание, которое один человек выполнить не может
    expect(head.toLowerCase()).not.toContain('одновременно')
    expect(head).toContain('по порядку')
  })

  it('рейка показывает первые блюда, а не весь список', () => {
    mount()
    const { plan } = planOnScreen()
    if (plan.dishes.length <= 4) return
    expect(all('.rail-dish')).toHaveLength(4)
    const more = [...document.querySelectorAll('.rail-more')][0] as HTMLButtonElement
    expect(more.textContent).toContain(String(plan.dishes.length))

    act(() => more.click())

    expect(all('.rail-dish')).toHaveLength(plan.dishes.length)
  })

  it('загрузка кухни — пик занятости, а не число шагов у плиты', () => {
    mount()
    const { plan, state } = planOnScreen()
    const stove = kitchenLoad(plan.steps, state.household!.kitchen).find(
      (l) => l.appliance === 'stove',
    )!
    const stoveSteps = plan.steps.filter((s) => s.appliance === 'stove').length

    expect(text('.load-row')).toContain(`${stove.peak} из ${stove.capacity} конфорок`)
    expect(all('.load-row .load-dots i[data-busy="true"]')).toHaveLength(stove.peak)
    // ради этого всё и затевалось: шагов у плиты заметно больше, чем конфорок
    expect(stoveSteps).toBeGreaterThan(stove.peak)
  })

  it('в «что приготовим» у блюда стоят его же минуты и его же прибор', () => {
    mount()
    const { plan } = planOnScreen()
    const rows = all('.rail-dish')
    expect(rows).toHaveLength(plan.dishes.length)

    const first = plan.dishes[0]
    const handsOn = plan.steps
      .filter((s) => s.recipeId === first.recipeId && s.handsOn)
      .reduce((sum, s) => sum + (s.end - s.start), 0)
    expect(rows[0].textContent).toContain(first.title)
    expect(rows[0].textContent).toContain(`${handsOn} мин`)
  })

  it('«готовлю сейчас» из рейки открывает тот день, который выбран', () => {
    mount()
    const { plan } = planOnScreen()
    act(() => (document.querySelector('.rail-cta .btn') as HTMLButtonElement).click())
    expect(cooked?.cookDay).toBe(plan.cookDay)
  })

  it('плашка про второй день — только когда свободных минут не осталось', () => {
    mount()
    const { plan } = planOnScreen()
    const free = plan.makespan - plan.handsOnMinutes
    // подсказка под плитками и плашка в рейке отвечают на один и тот же вопрос
    expect(free).toBeGreaterThan(0)
    expect(document.querySelector('.rail-tip')).toBeNull()
    expect(text('.plan-main > .hint:last-of-type')).toContain('Свободного времени остаётся')
  })
})

describe('план готовки: день и второй повар', () => {
  const dayButtons = () =>
    [...document.querySelectorAll('.day-toggle button')] as HTMLButtonElement[]

  it('переключение дня меняет и расписание, и рейку', () => {
    mount()
    const state = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    const plans = buildCookingPlans(state.menu!, state.household!, 1, state.pantry)
    expect(plans.length).toBeGreaterThan(1)

    /*
     * Рейка показывает первые четыре блюда, поэтому для сверки минут её
     * нужно раскрыть: тождество «минуты по блюдам = handsOnMinutes» верно
     * для всех блюд, а не для показанной части.
     */
    const expand = () => {
      const more = document.querySelector('.rail-more') as HTMLButtonElement | null
      if (more && more.textContent?.startsWith('Все')) act(() => more.click())
    }
    const snapshot = () => {
      expand()
      return {
      steps: all('.next-step:not(.next-step--after)').length,
      dishes: all('.rail-dish__name b').map((n) => n.textContent).join('|'),
      // минуты в рейке — не украшение: их сумма это handsOnMinutes плана
      minutes: all('.rail-dish__name .muted')
        .map((n) => Number((n.textContent ?? '').match(/^(\d+) мин/)?.[1] ?? 0))
        .reduce((a, b) => a + b, 0),
      }
    }
    const before = snapshot()
    act(() => dayButtons()[1].click())
    const after = snapshot()

    /*
     * Рейка обязана поехать вместе с диаграммой. Пока этого не проверяли,
     * «Что приготовим» и «Загрузка кухни» можно было навсегда привязать к
     * первому дню, и тесты этого не замечали.
     */
    expect(after.dishes).not.toBe(before.dishes)
    expect(before.steps).toBe(plans[0].steps.length)
    expect(after.steps).toBe(plans[1].steps.length)
    expect(before.minutes).toBe(plans[0].handsOnMinutes)
    expect(after.minutes).toBe(plans[1].handsOnMinutes)
  })

  it('«готовлю сейчас» открывает выбранный день, а не первый', () => {
    mount()
    const state = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    const plans = buildCookingPlans(state.menu!, state.household!, 1, state.pantry)

    act(() => dayButtons()[1].click())
    const start = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Готовлю сейчас',
    )!
    act(() => (start as HTMLButtonElement).click())

    expect(cooked?.cookDay).toBe(plans[1].cookDay)
  })

  it('вдвоём свободное время считается по самому занятому повару', () => {
    /*
     * Одна готовка в неделю: тогда за раз варится столько, что работа кухни
     * заметно превышает настенные часы, и две формулы расходятся знаком. На
     * трёх днях готовки день слишком лёгкий — расхождения не видно, и проверка
     * была бы пустой.
     */
    localStorage.setItem(KEY, saved([6]))
    mount()
    const state = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    const pairs = buildCookingPlans(state.menu!, state.household!, 2, state.pantry)

    /*
     * handsOnMinutes — это работа всей кухни, и вдвоём она вдвое больше
     * настенных часов. Пока вычитали её, экран советовал добавить второй день
     * готовки ровно там, где второй повар уже сократил день: план на 1 ч 40 с
     * поварами по 1 ч 10 и 1 ч 06 давал «минус 36 минут».
     */
    const byWholeKitchen = (p: CookingPlan) => p.makespan - p.handsOnMinutes
    const byBusiestCook = (p: CookingPlan) => p.makespan - Math.max(...p.perCookMinutes)

    // фикстура обязана различать два ответа хотя бы на одном дне
    const telling = pairs.findIndex((p) => byWholeKitchen(p) <= 0 && byBusiestCook(p) > 0)
    expect(telling, 'ни один день не различает две формулы — фикстура устарела').toBeGreaterThan(-1)

    const second = [...document.querySelectorAll('.segmented button')].find((b) =>
      b.textContent?.includes('вдвоём'),
    )!
    act(() => (second as HTMLButtonElement).click())

    // и так на каждом дне: совет «разнеси на два дня» — только когда времени правда нет
    pairs.forEach((plan, i) => {
      act(() => dayButtons()[i].click())
      const crowded = byBusiestCook(plan) <= 0
      expect(!!document.querySelector('.rail-tip'), `день ${plan.cookDay}`).toBe(crowded)
      if (!crowded) expect(text('.plan-free')).toContain('Свободного времени остаётся')
    })
  })
})

describe('план готовки: отметка о готовке', () => {
  /*
   * Отметка живёт здесь, и это единственный вход в самую опасную операцию
   * приложения: она списывает продукты из кладовой и кладёт заготовки в
   * морозилку. Когда её убрали из меню, она не «переехала» — она исчезла, и
   * вместе с ней перестали работать списание и морозилка. Этот тест стоит
   * ровно против такого повтора.
   */
  const cookedButtons = () =>
    [...document.querySelectorAll('.rail-dish__cooked')] as HTMLButtonElement[]

  it('готовку можно отметить и снять', () => {
    mount()
    const buttons = cookedButtons()
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons[0].textContent).toContain('Приготовлено')

    act(() => buttons[0].click())

    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    expect(saved.cookEvents).toHaveLength(1)
    expect(cookedButtons()[0].textContent).toContain('Готово')

    act(() => cookedButtons()[0].click())

    expect(
      (JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState).cookEvents,
    ).toHaveLength(0)
  })

  it('отметка записывает, что именно ушло в кастрюлю', () => {
    mount()
    act(() => cookedButtons()[0].click())

    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    const event = saved.cookEvents[0]
    /*
     * Продукты списываются по факту готовки, и снимок «что взяли» лежит в
     * самом событии: план потом пересчитается, а списанное уже списано.
     * Пустая кладовая в фикстуре — не повод не проверять сам факт.
     */
    expect(event.used.length).toBeGreaterThan(0)
    expect(event.used.every((u) => u.qty > 0)).toBe(true)
    expect(event.cookedGrams).toBeGreaterThan(0)
  })

  it('ключ отметки — день, который открыт, а не первый', () => {
    mount()
    const days = [...document.querySelectorAll('.day-toggle button')] as HTMLButtonElement[]
    act(() => days[1].click())
    act(() => cookedButtons()[0].click())

    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    const state = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    const plans = buildCookingPlans(state.menu!, state.household!, 1, state.pantry)
    expect(saved.cookEvents[0].taskId).toContain(`|${plans[1].cookDay}`)
  })
})
