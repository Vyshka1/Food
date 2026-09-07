import { describe, expect, it } from 'vitest'
import type { DrinkHabit, Eater, Household, Kitchen } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPE_BY_ID } from '../data/recipes'
import {
  MIN_FOOD_SHARE,
  cupIngredients,
  cupStats,
  drinkNorms,
  drinkShopping,
  drinksOvershoot,
  foodNorm,
  habitLabel,
} from './drinks'
import { dailyNorm, recipeStats } from './nutrition'
import { buildWeekMenu, dayNorms, defaultRepeats} from './menu'
import { buildShoppingList } from './shopping'
import { defaultOils } from './oil'

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

function habit(patch: Partial<DrinkHabit> = {}): DrinkHabit {
  return {
    id: 'd1',
    eaterId: 'e1',
    kind: 'cappuccino',
    volumeMl: 250,
    milkId: 'milk',
    sugarTsp: 0,
    syrupMl: 0,
    perDay: 1,
    days: [0, 1, 2, 3, 4, 5, 6],
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
    weekStart: '2026-01-05',
    ...patch,
  }
}

describe('чашка считается из продуктов, а не из таблицы', () => {
  it('капучино 250 мл — это 150 мл молока', () => {
    const items = cupIngredients(habit())
    const milk = items.find((i) => i.ingredientId === 'milk')!
    expect(milk.qty).toBeCloseTo(150, 5)
    expect(items.some((i) => i.ingredientId === 'coffee')).toBe(true)
  })

  it('и укладывается в бытовые 130–160 ккал', () => {
    const kcal = cupStats(habit()).kcal
    expect(kcal).toBeGreaterThan(70)
    expect(kcal).toBeLessThan(120)
  })

  it('американо без молока — почти ноль', () => {
    expect(cupStats(habit({ kind: 'americano', milkId: undefined })).kcal).toBeLessThan(10)
  })

  it('овсяное молоко меняет счёт, а не подпись', () => {
    const cow = cupStats(habit()).kcal
    const oat = cupStats(habit({ milkId: 'oat_milk' })).kcal
    expect(oat).toBeLessThan(cow)
    expect(habitLabel(habit({ milkId: 'oat_milk' }))).toContain('овсяном молоке')
  })

  it('сахар и сироп считаются, а не игнорируются', () => {
    const plain = cupStats(habit()).kcal
    const sweet = cupStats(habit({ sugarTsp: 2, syrupMl: 20 })).kcal
    // две ложки сахара — 10 г, сироп 20 мл: около 40 и 54 ккал
    expect(sweet - plain).toBeGreaterThan(80)
  })

  it('сок и газировка — это сам напиток, а не добавка к воде', () => {
    const juice = cupIngredients(habit({ kind: 'juice', volumeMl: 200 }))
    expect(juice[0]).toEqual({ ingredientId: 'orange_juice', qty: 200 })
  })
})

describe('калории резервируются заранее', () => {
  it('два капучино в день уменьшают норму еды', () => {
    const h = household({ drinks: [habit({ perDay: 2 })] })
    const full = dailyNorm(eater())
    const food = foodNorm(eater(), h, 0)
    const drinks = drinkNorms(h, 'e1', 0)
    expect(drinks.kcal).toBeGreaterThan(150)
    expect(food.kcal).toBe(full.kcal - drinks.kcal)
  })

  it('в день без напитка норма остаётся полной', () => {
    const h = household({ drinks: [habit({ days: [0, 1, 2, 3, 4] })] })
    expect(foodNorm(eater(), h, 5).kcal).toBe(dailyNorm(eater()).kcal)
    expect(foodNorm(eater(), h, 0).kcal).toBeLessThan(dailyNorm(eater()).kcal)
  })

  it('норма дня в меню тоже уменьшается', () => {
    const dry = household()
    const withDrinks = household({ drinks: [habit({ perDay: 2 })] })
    expect(dayNorms(withDrinks, 0, 'e1').kcal).toBeLessThan(dayNorms(dry, 0, 'e1').kcal)
  })

  it('но еде всегда остаётся хотя бы 60% нормы', () => {
    // литр латте с сиропом — это не повод собирать меню на 300 ккал
    const h = household({ drinks: [habit({ kind: 'latte', volumeMl: 500, perDay: 5, syrupMl: 40 })] })
    const full = dailyNorm(eater())
    expect(foodNorm(eater(), h, 0).kcal).toBe(Math.round(full.kcal * MIN_FOOD_SHARE))
    expect(drinksOvershoot(eater(), h, 0)).toBe(true)
  })

  it('и об этом говорится вслух', () => {
    const h = household({ drinks: [habit({ kind: 'latte', volumeMl: 500, perDay: 5, syrupMl: 40 })] })
    const { warnings } = buildWeekMenu(h, 5)
    expect(warnings.some((w) => /напитки/i.test(w))).toBe(true)
  })

  it('меню становится легче, а не остаётся прежним', () => {
    const dry = household()
    const withDrinks = household({ drinks: [habit({ perDay: 2 })] })
    // считаем именно калории, а не сумму долей: доля порции зависит ещё и от
    // того, какое блюдо выпало, и как мера «сколько еды» она врёт
    const kcal = (h: Household) => {
      const { menu } = buildWeekMenu(h, 9)
      return menu.entries.reduce(
        (sum, e) =>
          sum +
          recipeStats(RECIPE_BY_ID[e.recipeId]).kcal *
            e.portions.reduce((s, p) => s + p.factor, 0),
        0,
      )
    }
    expect(kcal(withDrinks)).toBeLessThan(kcal(dry))
  })
})

describe('продукты для напитков попадают в закупку', () => {
  it('молоко на неделю капучино — это литр с лишним', () => {
    const h = household({ drinks: [habit({ perDay: 2 })] })
    const need = drinkShopping(h)
    expect(need.get('milk')).toBeCloseTo(150 * 2 * 7, 5)
  })

  it('и список покупок его видит', () => {
    const h = household({ drinks: [habit({ perDay: 2 })] })
    const { menu } = buildWeekMenu(h, 3)
    const without = buildShoppingList(menu)
    const withDrinks = buildShoppingList(menu, h)
    const milkOf = (list: { lines: { ingredientId: string; buy: number }[] }) =>
      list.lines.find((l) => l.ingredientId === 'milk')?.buy ?? 0
    expect(milkOf(withDrinks)).toBeGreaterThan(milkOf(without))
    expect(withDrinks.lines.some((l) => l.ingredientId === 'coffee')).toBe(true)
  })

  it('кофе продаётся пачками, и список это учитывает', () => {
    expect(INGREDIENT_BY_ID['coffee'].pack).toBe(250)
  })
})
