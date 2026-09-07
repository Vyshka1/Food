import { describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import type { Eater, Household } from '../types'
import { buildWeekMenu } from './menu'
import { buildCookingPlans } from './cookingPlan'
import { containerLabel, formatUseBy, isSafeThaw, rawFreezeStep, thawReminders, useByDate } from './freezing'
import { defaultOils } from './oil'

describe('на каком этапе морозить', () => {
  it('лепное и потом жареное морозится сырым', () => {
    // котлеты и тефтели, замороженные готовыми, после разморозки
    // разваливаются и сохнут; сырыми они жарятся как свежие
    const ids = ['turkey_meatballs_rice', 'cottage_pancakes', 'chicken_cutlets_veg']
    for (const id of ids) {
      const recipe = RECIPE_BY_ID[id]
      expect(recipe, id).toBeDefined()
      expect(recipe.freezable, id).toBe(true)
      expect(recipe.freezing?.stage, id).toBe('raw')
      const step = recipe.steps[recipe.freezing!.afterStep!]
      expect(step, id).toBeDefined()
      // шаг, на котором морозим, — это лепка, а не жарка
      expect(step.text, id).toMatch(/сформ|слепить|скатать/i)
      expect(step.text, id).not.toMatch(/жарить|обжар|запек/i)
    }
  })

  it('шаг формовки, в котором уже жарят, сырой заморозкой не считается', () => {
    // «Сформовать биточки, обжарить» — заморозить «после» такого шага значит
    // заморозить уже обжаренными. Честнее отнести блюдо к готовым
    const merged = rawFreezeStep([
      { text: 'Сформовать биточки, обжарить', minutes: 10, station: 'stove', handsOn: true,
        activeMinutes: 10, unattended: false, source: 'derived' },
      { text: 'Тушить под крышкой', minutes: 20, station: 'stove', handsOn: false,
        activeMinutes: 3, unattended: true, source: 'derived' },
    ])
    expect(merged).toBeUndefined()
  })

  it('лепное, которое потом не готовят, сырым не морозится', () => {
    // овсяно-финиковые шарики скатали и убрали в холод — морозить нечего
    const noHeat = rawFreezeStep([
      { text: 'Смешать с хлопьями и какао, скатать', minutes: 8, station: 'prep', handsOn: true,
        activeMinutes: 8, unattended: false, source: 'derived' },
      { text: 'Убрать в холод', minutes: 20, station: 'wait', handsOn: false,
        activeMinutes: 0, unattended: true, source: 'derived' },
    ])
    expect(noHeat).toBeUndefined()
  })

  it('заливка в форму — не лепка', () => {
    // на «выложить в форму» правило ошибочно относило запеканку к сырой заморозке
    const poured = rawFreezeStep([
      { text: 'Добавить изюм, выложить в форму', minutes: 5, station: 'prep', handsOn: true,
        activeMinutes: 5, unattended: false, source: 'derived' },
      { text: 'Запекать', minutes: 35, station: 'oven', handsOn: false,
        activeMinutes: 0, unattended: true, source: 'derived' },
    ])
    expect(poured).toBeUndefined()
  })
})

describe('разморозка', () => {
  it('сырое размораживают только в холодильнике', () => {
    // вопрос безопасности, а не удобства: никаких «на столе» для сырого
    for (const recipe of RECIPES) {
      if (!recipe.freezing) continue
      expect(isSafeThaw(recipe.freezing)).toBe(true)
    }
  })

  it('супы и рагу греют сразу, размораживать их незачем', () => {
    const soup = RECIPES.find((r) => r.freezable && /суп|борщ/i.test(r.title))
    expect(soup?.freezing?.thaw).toBe('direct')
    expect(soup?.freezing?.thawHours).toBe(0)
  })

  it('у всего, что морозится, есть срок и способ разморозки', () => {
    for (const recipe of RECIPES.filter((r) => r.freezable)) {
      expect(recipe.freezing).toBeDefined()
      expect(recipe.freezing!.days).toBeGreaterThan(0)
      expect(recipe.freezing!.source).toBe('derived')
    }
  })

  it('то, что не морозится, разметки не получает', () => {
    for (const recipe of RECIPES.filter((r) => !r.freezable)) {
      expect(recipe.freezing).toBeUndefined()
    }
  })
})

describe('этикетка контейнера', () => {
  it('содержит блюдо, число контейнеров и дату', () => {
    const useBy = useByDate(new Date('2026-09-09'), 90)
    expect(formatUseBy(useBy)).toBe('до 8 декабря')
    expect(containerLabel('Тефтели из индейки', 2, useBy)).toBe(
      'Тефтели из индейки · 2 контейнера · до 8 декабря',
    )
  })

  it('склоняет контейнеры', () => {
    const d = new Date('2026-09-10')
    expect(containerLabel('Суп', 1, d)).toContain('1 контейнер ·')
    expect(containerLabel('Суп', 5, d)).toContain('5 контейнеров ·')
  })
})

describe('когда доставать из морозилки', () => {
  const eater: Eater = {
    id: 'e1', name: 'Юлия', sex: 'female', age: 32, heightCm: 168, weightKg: 62,
    activity: 'light', goal: 'keep', allergies: [], customAllergens: [], dislikes: [],
    bannedRecipes: [], mealPlaces: {}, ratings: {},
  }
  const household: Household = {
    eaters: [eater], cookingDays: [0], meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, ovens: 1, hasAirfryer: false, hasMulticooker: false, hasBlender: true,
      hasProcessor: false, hasMicrowave: true, hasDishwasher: false, containers: 10, hasFreezer: true },
    budgetPerWeek: 0,
    drinks: [],
    oils: defaultOils(), weekStart: '2026-09-07',
  }

  it('накануне, если размораживать в холодильнике', () => {
    const menu = buildWeekMenu(household, 7).menu
    for (const reminder of thawReminders(menu)) {
      if (reminder.hours >= 8) expect(reminder.day).toBe(reminder.forDay - 1)
      expect(reminder.day).toBeGreaterThanOrEqual(0)
    }
  })

  it('о том, что греют сразу, не напоминаем', () => {
    const menu = buildWeekMenu(household, 7).menu
    for (const reminder of thawReminders(menu)) {
      expect(reminder.method).not.toBe('direct')
    }
  })

  it('план готовки несёт этикетки и напоминания', () => {
    const menu = buildWeekMenu(household, 7).menu
    const plans = buildCookingPlans(menu, household)
    for (const plan of plans) {
      for (const task of plan.freeze) {
        expect(task.label).toContain(task.title)
        expect(task.label).toMatch(/до \d+ /)
        expect(task.containers).toBeGreaterThan(0)
      }
    }
  })
})
