import { describe, expect, it } from 'vitest'
import type { Household, Kitchen, Eater } from '../types'
import { RECIPE_BY_ID } from '../data/recipes'
import { recipeById } from '../data/recipeRegistry'
import { buildWeekMenu, defaultRepeats } from './menu'
import { buildShoppingList } from './shopping'
import { defaultOils } from './oil'
import { addDays } from './day'
import {
  addFreezer,
  addStock,
  consumeRecipe,
  daysLeft,
  emptyPantry,
  expiring,
  freezerPortions,
  isAlways,
  setStock,
  stockOf,
  storePurchase,
  takeFreezer,
  takeStock,
  useByDate,
} from './pantry'

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

const eater: Eater = {
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
}

const household: Household = {
  eaters: [eater],
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

describe('постоянные продукты и запасы — разные вещи', () => {
  it('соль есть всегда, риса — 700 г', () => {
    const pantry = addStock(emptyPantry(), 'rice', 700, TODAY)
    expect(isAlways(pantry, 'salt')).toBe(true)
    expect(isAlways(pantry, 'rice')).toBe(false)
    expect(stockOf(pantry, 'rice')).toBe(700)
  })

  it('запас складывается, а не заводит вторую строку', () => {
    let pantry = addStock(emptyPantry(), 'rice', 700, TODAY)
    pantry = addStock(pantry, 'rice', 300, TODAY)
    expect(pantry.stock.filter((s) => s.ingredientId === 'rice')).toHaveLength(1)
    expect(stockOf(pantry, 'rice')).toBe(1000)
  })

  it('и уходит в ноль, а не висит нулевой строкой', () => {
    let pantry = addStock(emptyPantry(), 'rice', 100, TODAY)
    pantry = takeStock(pantry, 'rice', 100)
    expect(pantry.stock).toHaveLength(0)
    // взять больше, чем есть, — это ноль, а не долг
    expect(stockOf(takeStock(pantry, 'rice', 500), 'rice')).toBe(0)
  })

  it('количество можно выставить руками', () => {
    const pantry = setStock(addStock(emptyPantry(), 'rice', 700, TODAY), 'rice', 250, TODAY)
    expect(stockOf(pantry, 'rice')).toBe(250)
  })
})

describe('запасы вычитаются из закупки', () => {
  it('700 г риса дома — это 700 г, которых нет в чеке', () => {
    const { menu } = buildWeekMenu(household, 4)
    const plain = buildShoppingList(menu, household)
    const riceLine = plain.lines.find((l) => l.ingredientId === 'rice')
    if (!riceLine) return
    const pantry = addStock(emptyPantry(), 'rice', riceLine.needed, TODAY)
    const withStock = buildShoppingList(menu, household, pantry)
    const after = withStock.lines.find((l) => l.ingredientId === 'rice')!
    expect(after.needed).toBe(0)
    expect(after.fromStock).toBeGreaterThan(0)
    expect(withStock.total).toBeLessThan(plain.total)
  })

  it('«постоянно есть» убирает продукт из суммы совсем', () => {
    const { menu } = buildWeekMenu(household, 4)
    const line = buildShoppingList(menu, household).lines.find((l) => !l.staple)!
    const pantry = { ...emptyPantry(), always: [line.ingredientId] }
    const after = buildShoppingList(menu, household, pantry).lines.find(
      (l) => l.ingredientId === line.ingredientId,
    )!
    expect(after.staple).toBe(true)
  })
})

describe('остатки перемещаются сами', () => {
  it('излишек упаковки после покупки уходит в запасы', () => {
    const pantry = storePurchase(
      emptyPantry(),
      [{ ingredientId: 'minced_chicken', buy: 500, needed: 275 }],
      TODAY,
    )
    expect(stockOf(pantry, 'minced_chicken')).toBe(225)
  })

  it('а приготовленное блюдо запас тратит', () => {
    const recipe = RECIPE_BY_ID['buckwheat_meatballs']
    const item = recipe.items.find((i) => i.ingredientId === 'minced_chicken')!
    let pantry = addStock(emptyPantry(), 'minced_chicken', 500, TODAY)
    pantry = consumeRecipe(pantry, recipe, 2)
    expect(stockOf(pantry, 'minced_chicken')).toBeCloseTo(500 - item.qty * 2, 5)
  })

  it('постоянные продукты из запаса не тратятся', () => {
    // соль не считают: она есть всегда, и вычитать её граммы бессмысленно
    const recipe = RECIPE_BY_ID['borsch']
    const pantry = consumeRecipe(addStock(emptyPantry(), 'salt', 100, TODAY), recipe, 4)
    expect(stockOf(pantry, 'salt')).toBe(100)
  })
})

describe('морозилка', () => {
  const recipe = () => recipeById('lazy_cabbage_rolls')!

  it('контейнер знает, что это, когда сделано и до какого числа', () => {
    const pantry = addFreezer(emptyPantry(), recipe(), 2, 1.5, TODAY)
    const item = pantry.freezer[0]
    expect(item.containers).toBe(2)
    expect(item.portionsEach).toBe(1.5)
    expect(item.keepDays).toBeGreaterThan(20)
    expect(useByDate(item) > TODAY).toBe(true)
    expect(freezerPortions(pantry)).toBe(3)
  })

  it('две готовки одного блюда в один день — это один контейнерный ряд', () => {
    let pantry = addFreezer(emptyPantry(), recipe(), 1, 2, TODAY)
    pantry = addFreezer(pantry, recipe(), 1, 2, TODAY)
    expect(pantry.freezer).toHaveLength(1)
    expect(pantry.freezer[0].containers).toBe(2)
  })

  it('достали — контейнера больше нет', () => {
    let pantry = addFreezer(emptyPantry(), recipe(), 2, 1, TODAY)
    pantry = takeFreezer(pantry, recipe().id, 1)
    expect(pantry.freezer[0].containers).toBe(1)
    pantry = takeFreezer(pantry, recipe().id, 1)
    expect(pantry.freezer).toHaveLength(0)
  })

  it('срок считается от даты готовки, а не от сегодня', () => {
    const pantry = addFreezer(emptyPantry(), recipe(), 1, 1, '2026-01-01')
    const item = pantry.freezer[0]
    expect(daysLeft(item, '2026-01-01')).toBe(item.keepDays)
    expect(daysLeft(item, '2026-02-01')).toBe(item.keepDays - 31)
  })

  it('и то, что пора съесть, видно отдельно', () => {
    const pantry = addFreezer(emptyPantry(), recipe(), 1, 1, '2026-01-01')
    const soon = addDays('2026-01-01', pantry.freezer[0].keepDays - 3)
    expect(expiring(pantry, soon)).toHaveLength(1)
    expect(expiring(pantry, '2026-01-02')).toHaveLength(0)
  })
})
