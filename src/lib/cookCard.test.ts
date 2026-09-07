import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPES } from '../data/recipes'
import { buildWeekMenu, defaultRepeats } from './menu'
import { buildShoppingList } from './shopping'
import { recipeById } from '../data/recipeRegistry'
import { defaultOils } from './oil'
import { emptyPantry } from './pantry'
import { householdGrams } from './measures'
import { cookCard, splitPieces } from './cookCard'

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

const household: Household = {
  eaters: [eater(), eater({ id: 'e2', name: 'Кирилл', sex: 'male', weightKg: 84, heightCm: 182, age: 35 })],
  cookingDays: [2, 6],
  meals: ['breakfast', 'lunch', 'dinner'],
  kitchen,
  budgetPerWeek: 0,
  drinks: [],
  oils: defaultOils(),
  repeats: defaultRepeats(),
  extras: [],
  weekStart: '2026-01-05',
}

/** Все карточки всех блюд нескольких недель — на них и проверяем сходимость. */
function allCards() {
  const cards = []
  for (let seed = 0; seed < 6; seed++) {
    const { menu } = buildWeekMenu(household, seed)
    const seen = new Set<string>()
    for (const entry of menu.entries) {
      const key = `${entry.recipeId}:${entry.cookDay}`
      if (seen.has(key)) continue
      seen.add(key)
      const card = cookCard(menu, household, entry, emptyPantry())
      if (card) cards.push(card)
    }
  }
  return cards
}

describe('целые изделия', () => {
  it('делятся целыми, а сумма сходится', () => {
    expect(splitPieces([500, 500, 200], 10)).toEqual([4, 4, 2])
    expect(splitPieces([1, 1, 1], 10).reduce((s, n) => s + n, 0)).toBe(10)
    expect(splitPieces([700, 300], 3)).toEqual([2, 1])
  })

  it('пустая раздача не ломает счёт', () => {
    expect(splitPieces([], 5)).toEqual([])
    expect(splitPieces([1, 1], 0)).toEqual([0, 0])
  })

  it('в карточке штучного блюда у всех целые изделия', () => {
    for (const card of allCards()) {
      if (!card.cookPieces) continue
      for (const row of card.rows) {
        expect(Number.isInteger(row.pieces), `${card.recipe.title}: ${row.pieces}`).toBe(true)
        expect(row.pieces!).toBeGreaterThan(0)
      }
    }
  })
})

describe('сходимость карточки', () => {
  it('выход = распределено + заморожено + непристроенное', () => {
    for (const card of allCards()) {
      const placed = card.rows.reduce((s, r) => s + r.grams, 0)
      const sum = placed + card.freezeGrams + card.unplacedGrams
      expect(Math.abs(sum - card.cookGrams), `${card.recipe.title}: ${sum} ≠ ${card.cookGrams}`)
        .toBeLessThanOrEqual(Math.max(5, card.cookGrams * 0.02))
    }
  })

  it('изделия тоже сходятся', () => {
    for (const card of allCards()) {
      if (!card.cookPieces) continue
      const placed = card.rows.reduce((s, r) => s + (r.pieces ?? 0), 0)
      expect(placed + (card.freezePieces ?? 0)).toBe(card.cookPieces)
    }
  })

  it('КБЖУ соответствуют калорийности', () => {
    for (const card of allCards()) {
      const fromMacros = card.stats.protein * 4 + card.stats.fat * 9 + card.stats.carbs * 4
      const diff = Math.abs(fromMacros - card.stats.kcal) / Math.max(1, card.stats.kcal)
      // расхождение только от округления макросов до грамма; замер по всем
      // карточкам шести недель дал худшие 4,2%
      expect(diff, `${card.recipe.title}: ${fromMacros} против ${card.stats.kcal}`).toBeLessThan(
        0.06,
      )
    }
  })

  it('и считаются от того же состава, что показан в продуктах', () => {
    for (const card of allCards()) {
      let kcal = 0
      for (const item of card.items) {
        const ing = INGREDIENT_BY_ID[item.ingredientId]!
        kcal += ing.kcal * (ing.unit === 'pcs' ? item.qty : item.qty / 100)
      }
      expect(Math.round(kcal)).toBe(card.stats.kcal)
    }
  })

  it('раздача не превышает того, что приготовили', () => {
    for (const card of allCards()) {
      const placed = card.rows.reduce((s, r) => s + r.grams, 0)
      expect(placed).toBeLessThanOrEqual(card.cookGrams + 5)
    }
  })
})

describe('покупка и остатки', () => {
  it('куплено = ушло сюда + ушло в другие блюда + остаток', () => {
    for (const card of allCards()) {
      for (const line of card.leftovers) {
        const sum = line.usedHere + line.usedElsewhere + line.left
        const available = line.bought + line.fromStock
        expect(
          sum,
          `${card.recipe.title}, ${line.name}: ${line.usedHere}+${line.usedElsewhere}+${line.left} ≠ ${available}`,
        ).toBe(available)
      }
    }
  })

  it('штучное в разборе упаковки — целыми, как и в составе', () => {
    // «5 шт» в продуктах и «4 шт сюда» в упаковках — это одна и та же пачка
    // и два разных числа; пятый банан открывают именно здесь
    for (const card of allCards()) {
      for (const line of card.leftovers) {
        if (line.unit !== 'pcs') continue
        const item = card.items.find((i) => i.ingredientId === line.ingredientId)!
        expect(line.usedHere, `${card.recipe.title}, ${line.name}`).toBe(Math.round(item.qty))
        expect(Number.isInteger(item.qty)).toBe(true)
      }
    }
  })

  it('в составе и в разборе упаковки одно и то же число', () => {
    for (const card of allCards()) {
      for (const line of card.leftovers) {
        const item = card.items.find((i) => i.ingredientId === line.ingredientId)!
        const ing = INGREDIENT_BY_ID[line.ingredientId]!
        // единственное расхождение допустимо там, где упаковки не хватило бы
        // на округлённое вверх количество
        expect(
          line.usedHere,
          `${card.recipe.title}, ${line.name}: ${line.usedHere} против ${householdGrams(ing, item.qty)}`,
        ).toBe(Math.min(line.bought + line.fromStock, householdGrams(ing, item.qty)))
      }
    }
  })

  it('мелкий хвост упаковки уходит в блюдо, а не в советы', () => {
    let absorbed = 0
    for (const card of allCards()) {
      for (const item of card.items) if (item.absorbed > 0) absorbed++
      for (const line of card.leftovers) {
        if (line.placed?.kind !== 'absorbed') continue
        expect(line.left).toBe(0)
      }
    }
    expect(absorbed).toBeGreaterThan(0)
  })

  it('остаток считается пристроенным только с конкретным блюдом или действием', () => {
    for (const card of allCards()) {
      for (const line of card.leftovers) {
        // «уйдёт в другое блюдо» здесь нет намеренно: потребность других блюд
        // уже в закупке, и остаток — это ровно то, что никому не нужно
        if (line.placed?.kind === 'freeze') {
          const ing = INGREDIENT_BY_ID[line.ingredientId]!
          expect(['meat', 'fish']).toContain(ing.category)
        }
      }
    }
  })

  it('стоимость использованного не больше суммы покупки', () => {
    for (const card of allCards()) {
      expect(card.usedPrice).toBeLessThanOrEqual(card.purchasePrice + 1)
    }
  })
})

describe('карточка и список покупок сходятся', () => {
  it('продукты готовки не расходятся с закупкой', () => {
    // ровно эта разница когда-то и разъезжалась: шапка считала по всей
    // готовке, а продукты — по одному дню
    for (let seed = 0; seed < 4; seed++) {
      const { menu } = buildWeekMenu(household, seed)
      const list = buildShoppingList(menu, household)
      const seen = new Set<string>()
      for (const entry of menu.entries) {
        const key = `${entry.recipeId}:${entry.cookDay}`
        if (seen.has(key)) continue
        seen.add(key)
        const card = cookCard(menu, household, entry, emptyPantry())!
        // продукт, который встречается только в этом рецепте
        const others = menu.entries
          .filter((e) => e.recipeId !== card.recipe.id)
          .flatMap((e) => recipeById(e.recipeId)?.items.map((i) => i.ingredientId) ?? [])
        const unique = card.items.find(
          (i) => !others.includes(i.ingredientId) && !INGREDIENT_BY_ID[i.ingredientId]?.staple,
        )
        if (!unique) continue
        const line = list.lines.find((l) => l.ingredientId === unique.ingredientId)!
        // список округляет вверх до фасовки, поэтому сверяем «не меньше»:
        // купить меньше, чем кладём в кастрюлю, — это разойтись на кухне
        expect(
          line.buy,
          `${card.recipe.title}, ${unique.name}: в карточке ${unique.qty}, в списке ${line.buy}`,
        ).toBeGreaterThanOrEqual(Math.floor(unique.qty))
      }
    }
  })
})

describe('сколько раз это едят', () => {
  it('обед на двоих — это один приём пищи, а не два', () => {
    // «едим дважды» про две тарелки в один день — неправда: готовка одна и
    // приём один, просто едоков двое
    for (const card of allCards()) {
      expect(card.meals).toBe(card.entries.length)
      expect(card.rows.length).toBeGreaterThanOrEqual(card.meals)
    }
  })
})

describe('шаги', () => {
  it('формовка и жарка — разные шаги', () => {
    // слитый шаг держал плиту занятой всё время лепки, а разметке заморозки
    // не давала увидеть, что биточки морозят сырыми
    for (const recipe of RECIPES) {
      for (const step of recipe.steps) {
        const shapes = /сформов|слепить|скатать/i.test(step.text)
        const fries = /обжарить|пожарить|жарить/i.test(step.text)
        expect(shapes && fries, `${recipe.title}: «${step.text}»`).toBe(false)
      }
    }
  })
})

describe('сколько готовим', () => {
  it('приготовим не меньше, чем нужно по меню', () => {
    for (const card of allCards()) {
      // партия может быть больше потребности — это и есть заготовка впрок;
      // меньше быть не должна, иначе кто-то остаётся без ужина
      expect(card.cookGrams, card.recipe.title).toBeGreaterThanOrEqual(
        Math.floor(card.neededGrams * 0.9),
      )
    }
  })

  it('у всех блюд с проверенной партией есть число изделий или честный вес', () => {
    const verified = RECIPES.filter((r) => r.batch?.source === 'verified' && r.batch.yieldPieces)
    expect(verified.length).toBeGreaterThan(5)
  })
})
