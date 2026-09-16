// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { STORAGE_KEYS } from './store'
import { SCHEMA_VERSION } from './lib/persist'
import { COOK_RUN_KEY, stepKey } from './lib/cookProgress'
import { buildCookingPlans } from './lib/cookingPlan'
import type { AppState } from './types'
import App from './App'

/*
 * Плашка «готовка продолжается».
 *
 * Ход готовки переживает перезагрузку, а сам режим после неё не открывается —
 * и без этой плашки обновление страницы читается как «всё пропало»: человек
 * идёт готовить заново поверх целых отметок. Поэтому проверяется не вид
 * плашки, а три обещания: она появляется только когда есть что продолжать,
 * говорит правду про число отмеченных шагов и возвращает в ту же готовку.
 */

const [KEY] = STORAGE_KEYS
/** Прошлый понедельник: на загрузке неделя прокрутится и меню соберётся живым. */
const LAST_WEEK = '2026-09-07'

function saved(): string {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    household: {
      eaters: [
        {
          id: 'e1',
          name: 'Юлия',
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
        },
      ],
      cookingDays: [0, 3],
      meals: ['breakfast', 'lunch', 'dinner'],
      kitchen: { burners: 4, ovens: 1, containers: 8, hasFreezer: true, hasBlender: true },
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
    stored: [],
    warnings: [],
    customRecipes: [],
    history: [],
    cookEvents: [],
  })
}

/** Неделя, день готовки и настоящие ключи шагов — после загрузки. */
function current(): { week: string; day: number; keys: string[] } {
  const state = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
  const day = Number(state.household!.cookingDays[0])
  const plan = buildCookingPlans(state.menu!, state.household!, 1, state.pantry).find(
    (p) => p.cookDay === day,
  )
  return { week: state.menu!.weekStart, day, keys: (plan?.steps ?? []).map(stepKey) }
}

function run(patch: Record<string, unknown> = {}): void {
  const { week, day } = current()
  localStorage.setItem(
    COOK_RUN_KEY,
    JSON.stringify({
      id: `${week}|${day}`,
      startedAt: Date.now() - 6 * 60_000,
      pausedAt: null,
      pausedTotal: 0,
      pauses: [],
      done: current().keys.slice(0, 2),
      cooks: 1,
      ...patch,
    }),
  )
}

const bar = () => document.querySelector('.cook-bar')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-09-14T10:00:00'))
  localStorage.clear()
  localStorage.setItem(KEY, saved())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('плашка «готовка продолжается»', () => {
  it('без начатой готовки её нет', () => {
    render(<App />)
    expect(bar()).toBeNull()
  })

  it('с начатой — говорит, сколько шагов отмечено', () => {
    render(<App />)
    cleanup()
    run()
    render(<App />)
    const text = bar()?.textContent ?? ''
    expect(text).toContain('Готовка продолжается')
    expect(text).toMatch(/отмечено шагов: 2 из \d+/)
  })

  it('«Вернуться» открывает ту самую готовку, а не начинает новую', () => {
    render(<App />)
    cleanup()
    run()
    render(<App />)
    act(() => (bar()?.querySelector('button') as HTMLButtonElement).click())

    // экран готовки открыт, и отметки на месте: счётчик не обнулился
    expect(bar()).toBeNull()
    expect(document.body.textContent).toContain('2 из')
  })

  it('чужая неделя не поднимается', () => {
    render(<App />)
    cleanup()
    run({ id: '2026-08-31|0' })
    render(<App />)
    expect(bar()).toBeNull()
  })

  it('день, которого нет в плане, не поднимается', () => {
    render(<App />)
    cleanup()
    run({ id: `${current().week}|5` })
    render(<App />)
    expect(bar()).toBeNull()
  })
  /*
   * План пересобирается, когда меняется кладовая, и ключ шага включает его
   * минуту — в отметках могут остаться ключи, которых в сегодняшнем
   * расписании уже нет. Плашка, обещающая «отмечено 5», после которой на
   * экране стоит «0 из 24», хуже, чем её отсутствие.
   */
  it('устаревшие отметки в счёт не идут', () => {
    render(<App />)
    cleanup()
    run({ done: [...current().keys.slice(0, 2), 'шаг-которого-нет', 'и-этого-тоже'] })
    render(<App />)
    expect(bar()?.textContent ?? '').toMatch(/отмечено шагов: 2 из \d+/)
  })

  /*
   * Вдвоём расписание другое: те же шаги стоят в другие минуты, а ключ шага
   * включает минуту. Поднять ход вдвоём как ход одного повара — значит
   * потерять все отметки, хотя они на месте.
   */
  it('ход вдвоём поднимается вдвоём, а не в одиночку', () => {
    const state = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    state.household!.eaters.push({
      ...state.household!.eaters[0],
      id: 'e2',
      name: 'Кирилл',
      sex: 'male',
    })
    localStorage.setItem(KEY, JSON.stringify(state))
    render(<App />)
    cleanup()

    const after = JSON.parse(localStorage.getItem(KEY) ?? '{}') as AppState
    const day = Number(after.household!.cookingDays[0])
    const pair = buildCookingPlans(after.menu!, after.household!, 2, after.pantry).find(
      (p) => p.cookDay === day,
    )!
    const solo = buildCookingPlans(after.menu!, after.household!, 1, after.pantry).find(
      (p) => p.cookDay === day,
    )!
    const keys = pair.steps.map(stepKey).slice(0, 3)
    // расписания и правда разные — иначе проверка ничего не значит
    expect(keys.some((k) => !solo.steps.map(stepKey).includes(k))).toBe(true)

    localStorage.setItem(
      COOK_RUN_KEY,
      JSON.stringify({
        id: `${after.menu!.weekStart}|${day}`,
        startedAt: Date.now() - 6 * 60_000,
        pausedAt: null,
        pausedTotal: 0,
        pauses: [],
        done: keys,
        cooks: 2,
      }),
    )
    render(<App />)
    expect(bar()?.textContent ?? '').toMatch(/отмечено шагов: 3 из \d+/)
  })

})
