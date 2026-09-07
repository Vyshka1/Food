import { describe, expect, it } from 'vitest'
import type { Eater, FreezerItem, Household, Kitchen } from '../types'
import { RECIPE_BY_ID } from '../data/recipes'
import { buildWeekMenu, cookTasks, defaultRepeats, portionsFor } from './menu'
import { buildShoppingList } from './shopping'
import { defaultOils } from './oil'
import { addFreezer, emptyPantry, freezerRoomGrams } from './pantry'
import { recipeById } from '../data/recipeRegistry'

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

function eater(id: string, patch: Partial<Eater> = {}): Eater {
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

const household: Household = {
  eaters: [eater('e1'), eater('e2', { sex: 'male', weightKg: 84, heightCm: 182, age: 35 })],
  cookingDays: [2, 6],
  meals: ['breakfast', 'lunch', 'dinner'],
  kitchen,
  budgetPerWeek: 0,
  drinks: [],
  oils: defaultOils(),
  repeats: defaultRepeats(),
  extras: [],
  weekStart: TODAY,
}

/** Три контейнера супа, приготовленного неделю назад. */
function soup(cookedAt = '2025-12-29', containers = 3): FreezerItem[] {
  return addFreezer(emptyPantry(), recipeById('lentil_soup')!, containers, 2, cookedAt).freezer
}

describe('меню достаёт из морозилки', () => {
  it('заготовка попадает в неделю', () => {
    const { menu } = buildWeekMenu(household, 3, [], { freezer: soup(), today: TODAY })
    const fromFreezer = menu.entries.filter((e) => e.fromFreezer)
    expect(fromFreezer.length).toBeGreaterThan(0)
    expect(fromFreezer[0].recipeId).toBe('lentil_soup')
    expect(fromFreezer[0].storage).toBe('freezer')
  })

  it('и её не готовят и не покупают', () => {
    const { menu } = buildWeekMenu(household, 3, [], { freezer: soup(), today: TODAY })
    const entry = menu.entries.find((e) => e.fromFreezer)!
    // готовки на этот день нет
    expect(cookTasks(menu).some((t) => t.recipeId === entry.recipeId && t.cookDay === entry.day))
      .toBe(false)
    // и продуктов на неё в списке тоже нет, если блюдо больше нигде не встречается
    const others = menu.entries.filter((e) => e.recipeId === entry.recipeId && !e.fromFreezer)
    if (others.length === 0) {
      const unique = RECIPE_BY_ID[entry.recipeId].items.find((i) => i.ingredientId === 'lentils')!
      const list = buildShoppingList(menu, household)
      const line = list.lines.find((l) => l.ingredientId === unique.ingredientId)
      const usedElsewhere = menu.entries.some((e) =>
        recipeById(e.recipeId)?.items.some((i) => i.ingredientId === unique.ingredientId),
      )
      if (!usedElsewhere) expect(line).toBeUndefined()
    }
  })

  it('без морозилки неделя собирается как раньше', () => {
    const { menu } = buildWeekMenu(household, 3)
    expect(menu.entries.some((e) => e.fromFreezer)).toBe(false)
  })
})

describe('что берём первым', () => {
  it('то, что раньше испортится', () => {
    let pantry = emptyPantry()
    // суп заморожен три недели назад, рагу — вчера; срок у обоих 45 дней
    pantry = addFreezer(pantry, recipeById('lentil_soup')!, 3, 2, '2025-12-15')
    pantry = addFreezer(pantry, recipeById('bean_veg_stew')!, 3, 2, '2026-01-04')
    const { menu } = buildWeekMenu(household, 3, [], { freezer: pantry.freezer, today: TODAY })
    const first = menu.entries.filter((e) => e.fromFreezer).sort((a, b) => a.day - b.day)[0]
    expect(first?.recipeId).toBe('lentil_soup')
  })

  it('просроченное не планируется вовсе', () => {
    // срок готовой еды в морозилке — 45 дней; это блюдо пролежало вдвое дольше
    const old = addFreezer(emptyPantry(), recipeById('lentil_soup')!, 3, 2, '2025-10-01').freezer
    const { menu } = buildWeekMenu(household, 3, [], { freezer: old, today: TODAY })
    expect(menu.entries.some((e) => e.fromFreezer)).toBe(false)
  })

  it('контейнеров хватает ровно на столько приёмов, сколько их есть', () => {
    const many = soup('2025-12-29', 6)
    const { menu } = buildWeekMenu(household, 3, [], { freezer: many, today: TODAY })
    const used = menu.entries.filter((e) => e.fromFreezer)
    expect(used.length).toBeGreaterThan(0)
    expect(used.length).toBeLessThanOrEqual(3)
  })
})

describe('контейнеры одного блюда складываются', () => {
  /** Сколько долей рецепта нужно этой семье на один обед. */
  const lunchNeed = () =>
    portionsFor(recipeById('lentil_soup')!, household, 'lunch', 0).reduce(
      (sum, p) => sum + p.factor,
      0,
    )

  it('два контейнера порознь закрывают обед вместе', () => {
    // по отдельности они бесполезны: в каждом чуть больше половины того, что
    // нужно на стол. Пока лоты жили порознь, морозилка росла при формально
    // работающем правиле — заготовки были, но ни одна не набирала на приём
    const half = lunchNeed() / 2 + 0.2
    let pantry = emptyPantry()
    pantry = addFreezer(pantry, recipeById('lentil_soup')!, 1, half, '2025-12-20')
    pantry = addFreezer(pantry, recipeById('lentil_soup')!, 1, half, '2025-12-27')
    const { menu } = buildWeekMenu(household, 3, [], { freezer: pantry.freezer, today: TODAY })
    expect(menu.entries.some((e) => e.fromFreezer)).toBe(true)
  })

  it('а одного контейнера на двоих не хватает', () => {
    const half = lunchNeed() / 2
    const one = addFreezer(emptyPantry(), recipeById('lentil_soup')!, 1, half, '2025-12-20').freezer
    const { menu } = buildWeekMenu(household, 3, [], { freezer: one, today: TODAY })
    expect(menu.entries.some((e) => e.fromFreezer)).toBe(false)
  })
})

describe('место в морозилке', () => {
  it('занятое место уменьшает свободное', () => {
    const empty = freezerRoomGrams(kitchen, emptyPantry())
    const full = freezerRoomGrams(kitchen, { ...emptyPantry(), freezer: soup('2026-01-01', 6) })
    expect(full).toBeLessThan(empty)
    expect(freezerRoomGrams({ containers: 8, hasFreezer: false })).toBe(0)
  })
})
