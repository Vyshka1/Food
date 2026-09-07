import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen } from '../types'
import { buildWeekMenu, defaultRepeats, mealKey } from './menu'
import { addFreezer, emptyPantry } from './pantry'
import { recipeById } from '../data/recipeRegistry'
import { defaultOils } from './oil'
import { dueNow, remindersFor } from './reminders'

const TODAY = '2026-01-05'

const kitchen: Kitchen = {
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
}

function eater(patch: Partial<Eater> = {}): Eater {
  return {
    id: patch.id ?? 'e1',
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
    ...patch,
  }
}

function household(patch: Partial<Household> = {}): Household {
  return {
    eaters: [eater()],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen,
    budgetPerWeek: 0,
    drinks: [],
    oils: defaultOils(),
    repeats: defaultRepeats(),
    extras: [],
    weekStart: TODAY,
    ...patch,
  }
}

describe('дела на сегодня', () => {
  it('в день готовки говорит о готовке', () => {
    const h = household()
    const { menu } = buildWeekMenu(h, 4)
    const list = remindersFor(h, menu, emptyPantry(), 2, TODAY)
    expect(list.some((r) => r.kind === 'cooking')).toBe(true)
    expect(remindersFor(h, menu, emptyPantry(), 3, TODAY).some((r) => r.kind === 'cooking')).toBe(
      false,
    )
  })

  it('накануне напоминает собрать контейнер', () => {
    // контейнер собирают с вечера, поэтому напоминание — за день до
    const h = household({
      eaters: [eater({ mealPlaces: { [mealKey(3, 'lunch')]: 'takeaway' } })],
    })
    const { menu } = buildWeekMenu(h, 4)
    const eve = remindersFor(h, menu, emptyPantry(), 2, TODAY)
    expect(eve.some((r) => r.kind === 'container')).toBe(true)
    expect(eve.find((r) => r.kind === 'container')!.text).toContain('Четверг')
  })

  it('и переложить из морозилки — тоже накануне вечером', () => {
    // один день готовки: часть недели придётся размораживать
    const h = household({ cookingDays: [6] })
    const { menu } = buildWeekMenu(h, 4)
    const all = [0, 1, 2, 3, 4, 5, 6].flatMap((d) =>
      remindersFor(h, menu, emptyPantry(), d, TODAY),
    )
    const thaw = all.filter((r) => r.kind === 'thaw')
    expect(thaw.length).toBeGreaterThan(0)
    expect(thaw[0].hour).toBeGreaterThanOrEqual(18)
  })

  it('о сроке в морозилке предупреждает заранее, а не задним числом', () => {
    const recipe = recipeById('lazy_cabbage_rolls')!
    const pantry = addFreezer(emptyPantry(), recipe, 1, 2, '2026-01-01')
    const keep = pantry.freezer[0].keepDays
    const soon = new Date('2026-01-01')
    soon.setDate(soon.getDate() + keep - 5)
    const late = new Date('2026-01-01')
    late.setDate(late.getDate() + keep + 5)
    const h = household()
    const { menu } = buildWeekMenu(h, 4)
    const before = remindersFor(h, menu, pantry, 0, soon.toISOString().slice(0, 10))
    const after = remindersFor(h, menu, pantry, 0, late.toISOString().slice(0, 10))
    expect(before.find((r) => r.kind === 'expiring')!.title).toBe('Скоро истечёт срок')
    expect(after.find((r) => r.kind === 'expiring')!.title).toBe('Срок вышел')
  })

  it('ничего не происходит — и напоминаний нет', () => {
    const h = household({ cookingDays: [2, 6] })
    const { menu } = buildWeekMenu(h, 4)
    const quiet = remindersFor(h, menu, emptyPantry(), 4, TODAY)
    expect(quiet).toHaveLength(0)
  })
})

describe('время суток', () => {
  it('утреннее напоминание не показывается ночью', () => {
    const h = household({
      eaters: [eater({ mealPlaces: { [mealKey(3, 'lunch')]: 'takeaway' } })],
    })
    const { menu } = buildWeekMenu(h, 4)
    const list = remindersFor(h, menu, emptyPantry(), 2, TODAY)
    expect(dueNow(list, 3)).toHaveLength(0)
    expect(dueNow(list, 9).some((r) => r.kind === 'container')).toBe(true)
  })

  it('и список отсортирован по времени', () => {
    const h = household({ cookingDays: [6] })
    const { menu } = buildWeekMenu(h, 4)
    const list = remindersFor(h, menu, emptyPantry(), 5, TODAY)
    const hours = list.map((r) => r.hour)
    expect([...hours].sort((a, b) => a - b)).toEqual(hours)
  })
})
