// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { buildCookingPlans } from '../lib/cookingPlan'
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
    const { plan } = planOnScreen()
    const dishes = new Set(plan.steps.map((s) => s.recipeId))

    expect(plan.steps.length).toBeGreaterThan(0)
    expect(all('.gantt__lane')).toHaveLength(dishes.size)
    expect(all('.gantt__bar')).toHaveLength(plan.steps.length)
  })

  it('отрезок стоит там же, где шаг стоит в расписании', () => {
    mount()
    const { plan } = planOnScreen()
    const bars = all('.gantt__bar') as HTMLElement[]
    // порядок отрезков внутри строки — порядок шагов блюда
    const first = plan.steps.find((s) => s.recipeId === plan.steps[0].recipeId)!
    expect(bars[0].style.left).toBe(`${(first.start / plan.makespan) * 100}%`)
    expect(bars[0].style.width).toBe(`${((first.end - first.start) / plan.makespan) * 100}%`)
  })

  it('«руками» старше прибора: занятые руки видно, даже если это плита', () => {
    mount()
    const { plan } = planOnScreen()
    const handsOn = plan.steps.filter((s) => s.handsOn)
    // в живом плане ручные шаги у плиты есть — иначе проверка ничего не ловит
    expect(handsOn.some((s) => s.appliance === 'stove')).toBe(true)
    expect(all('.gantt__bar[data-band="hands"]')).toHaveLength(handsOn.length)
  })

  it('ось времени подписана временем дня и идёт ровным шагом', () => {
    mount()
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
    const scroll = document.querySelector('.gantt__scroll')
    expect(scroll).toBeTruthy()
    expect(document.querySelector('.gantt__grid')?.getAttribute('style')).toContain('--gantt-lanes')
  })
})

describe('план готовки: рейка и ближайшие шаги', () => {
  it('в «ближайших шагах» — только первые шаги расписания, а не всё подряд', () => {
    mount()
    const { plan } = planOnScreen()
    const rows = all('.next-step')

    expect(plan.steps.length).toBeGreaterThan(rows.length)
    expect(rows).toHaveLength(4)
    expect(rows[0].textContent).toContain('11:00')
    expect(rows[0].textContent).toContain(plan.steps[0].text)
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
