import { afterEach, describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { allRecipes, recipeById, setOilChoice } from '../data/recipeRegistry'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeStats } from './nutrition'
import {
  GREASE_ML,
  OILS,
  affectedRecipes,
  applyOils,
  defaultOils,
  isOil,
  oilFor,
  oilsInUse,
} from './oil'

const OIL_IDS = OILS.map((o) => o.id)

afterEach(() => setOilChoice(defaultOils()))

describe('масло везде стоит числом', () => {
  it('нет блюда, которое жарят без жира в составе', () => {
    // «обжарить на масле» без числа — это калории, которых нет в расчёте
    const bad: string[] = []
    for (const recipe of RECIPES) {
      const fries = recipe.steps.some((s) => /обжар|пожар|жарить|поджар/i.test(s.text))
      if (!fries) continue
      const hasFat = recipe.items.some((i) => {
        const ing = INGREDIENT_BY_ID[i.ingredientId]
        return Boolean(ing) && (isOil(i.ingredientId) || ing.fat >= 20)
      })
      if (!hasFat) bad.push(recipe.title)
    }
    expect(bad).toEqual([])
  })

  it('и количества бытовые: не капля и не полстакана', () => {
    for (const recipe of RECIPES) {
      for (const item of recipe.items) {
        if (!isOil(item.ingredientId)) continue
        expect(item.qty, `${recipe.title}: ${item.qty}`).toBeGreaterThanOrEqual(3)
        expect(item.qty, `${recipe.title}: ${item.qty}`).toBeLessThanOrEqual(20)
      }
    }
  })
})

describe('выбор масла', () => {
  it('основное масло подставляется вместо написанного в рецепте', () => {
    const choice = { mainId: 'olive_oil', alternatives: [], greaseForms: false }
    const fried = RECIPES.find((r) => r.items.some((i) => i.ingredientId === 'sunflower_oil'))!
    const adapted = applyOils(fried, choice)
    expect(adapted.items.some((i) => i.ingredientId === 'sunflower_oil')).toBe(false)
    expect(adapted.items.some((i) => i.ingredientId === 'olive_oil')).toBe(true)
  })

  it('сливочное не отправляется на сковороду', () => {
    // оно горит; выбор человека здесь не спорит с физикой, а дополняется
    const choice = { mainId: 'butter', alternatives: ['ghee'], greaseForms: false }
    const fried = RECIPES.find(
      (r) =>
        r.steps.some((s) => /обжар|пожар/i.test(s.text)) &&
        r.items.some((i) => isOil(i.ingredientId)),
    )!
    expect(oilFor(fried, 'sunflower_oil', choice)).toBe('ghee')
  })

  it('а если альтернативы нет — рецепт остаётся как написан', () => {
    const choice = { mainId: 'butter', alternatives: [], greaseForms: false }
    const fried = RECIPES.find((r) => r.steps.some((s) => /обжар/i.test(s.text)))!
    expect(oilFor(fried, 'sunflower_oil', choice)).toBe('sunflower_oil')
  })

  it('в блюде без жарки сливочное допустимо', () => {
    const choice = { mainId: 'butter', alternatives: [], greaseForms: false }
    const noFry = RECIPES.find(
      (r) =>
        !r.steps.some((s) => /обжар|пожар|жарить|поджар/i.test(s.text)) &&
        r.items.some((i) => isOil(i.ingredientId)),
    )!
    expect(oilFor(noFry, 'olive_oil', choice)).toBe('butter')
  })

  it('смена масла меняет и калории, и цену', () => {
    const baked = RECIPES.find((r) => r.needs?.includes('oven'))!
    setOilChoice({ mainId: 'sunflower_oil', alternatives: [], greaseForms: false })
    const cheap = recipeStats(recipeById(baked.id)!)
    setOilChoice({ mainId: 'ghee', alternatives: [], greaseForms: false })
    const rich = recipeStats(recipeById(baked.id)!)
    expect(rich.price).toBeGreaterThan(cheap.price)
  })

  it('кэш калорий не переживает смену масла', () => {
    // именно здесь легко получить карточку с одними числами и закупку с другими
    const withOil = RECIPES.find((r) => r.items.some((i) => i.ingredientId === 'sunflower_oil'))!
    setOilChoice({ mainId: 'sunflower_oil', alternatives: [], greaseForms: false })
    const before = recipeStats(recipeById(withOil.id)!).price
    setOilChoice({ mainId: 'coconut_oil', alternatives: [], greaseForms: false })
    const after = recipeStats(recipeById(withOil.id)!).price
    expect(after).not.toBe(before)
  })
})

describe('масло для формы', () => {
  const baked = () => RECIPES.find((r) => r.needs?.includes('oven'))!

  it('добавляется в состав, а не остаётся словом в шаге', () => {
    const off = applyOils(baked(), { mainId: 'olive_oil', alternatives: [], greaseForms: false })
    const on = applyOils(baked(), { mainId: 'olive_oil', alternatives: [], greaseForms: true })
    const oilOf = (r: typeof off) =>
      r.items.filter((i) => isOil(i.ingredientId)).reduce((s, i) => s + i.qty, 0)
    expect(oilOf(on) - oilOf(off)).toBeCloseTo(GREASE_ML / 4, 5)
    expect(recipeStats(on).kcal).toBeGreaterThan(recipeStats(off).kcal)
  })

  it('и не добавляется там, где формы нет', () => {
    const pan = RECIPES.find((r) => !r.needs?.includes('oven') && !/смаз|в форм/i.test(JSON.stringify(r.steps)))!
    const off = applyOils(pan, { mainId: 'olive_oil', alternatives: [], greaseForms: false })
    const on = applyOils(pan, { mainId: 'olive_oil', alternatives: [], greaseForms: true })
    expect(on.items).toEqual(off.items)
  })
})

describe('по умолчанию ничего не подменяется', () => {
  it('«как в рецепте» оставляет и оливковое, и подсолнечное', () => {
    // выбирать за человека, чем заправлять салат, приложение не должно
    const choice = defaultOils()
    expect(affectedRecipes(RECIPES, choice)).toBe(0)
    const ids = new Set(oilsInUse(RECIPES, choice))
    expect(ids.has('olive_oil')).toBe(true)
    expect(ids.has('sunflower_oil')).toBe(true)
  })

  it('но масло для формы считается и без выбора', () => {
    const baked = RECIPES.find((r) => r.needs?.includes('oven'))!
    const on = applyOils(baked, defaultOils())
    const off = applyOils(baked, { ...defaultOils(), greaseForms: false })
    expect(recipeStats(on).kcal).toBeGreaterThan(recipeStats(off).kcal)
  })
})

describe('что показываем человеку', () => {
  it('сколько блюд затронет замена', () => {
    expect(affectedRecipes(RECIPES, { mainId: 'sunflower_oil', alternatives: [], greaseForms: false })).toBeGreaterThan(20)
    // при выборе «как в рецепте» менять нечего только если оба масла основные
    expect(affectedRecipes(RECIPES, { mainId: 'ghee', alternatives: [], greaseForms: false })).toBeGreaterThan(30)
  })

  it('какие масла реально нужно купить', () => {
    const list = oilsInUse(RECIPES, { mainId: 'ghee', alternatives: [], greaseForms: false })
    expect(list).toEqual(['ghee'])
    const mixed = oilsInUse(RECIPES, { mainId: 'butter', alternatives: ['olive_oil'], greaseForms: false })
    expect(mixed.sort()).toEqual(['butter', 'olive_oil'])
  })
})

describe('реестр отдаёт рецепты уже с выбранным маслом', () => {
  it('и карточка, и подбор видят одно и то же', () => {
    setOilChoice({ mainId: 'olive_oil', alternatives: [], greaseForms: false })
    const sunflower = allRecipes().filter((r) =>
      r.items.some((i) => i.ingredientId === 'sunflower_oil'),
    )
    expect(sunflower).toHaveLength(0)
    // исходные данные при этом не тронуты: там по-прежнему то, что написал автор
    expect(RECIPE_BY_ID['borsch'].items.some((i) => OIL_IDS.includes(i.ingredientId))).toBe(true)
  })
})
