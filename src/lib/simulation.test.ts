import { describe, expect, it } from 'vitest'
import type { Eater, Household, Kitchen } from '../types'
import { defaultRepeats } from './menu'
import { defaultOils } from './oil'
import { simulate } from './simulation'
import { RECIPES } from '../data/recipes'
import { planBatch } from './batch'
import { portionWeight } from './nutrition'

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
  weekStart: '2026-01-05',
}

describe('симуляция сходится сама с собой', () => {
  const result = simulate(household, { weeks: 6 })

  it('деньги не появляются и не исчезают', () => {
    // касса + запас на начало = ушло в готовку + испортилось + запас на конец
    for (const w of result.weeks) {
      const left = w.checkout + w.stockStart
      const right = w.used + w.wastedRaw + w.stockEnd
      expect(Math.abs(left - right), `неделя ${w.week}: ${left} против ${right}`).toBeLessThanOrEqual(
        Math.max(5, left * 0.02),
      )
    }
  })

  it('еде некуда деться редко: не влезает меньше двухсот граммов в неделю', () => {
    /*
     * Переполнение — самая дорогая из измеренных потерь: готовая еда, которой
     * некуда деться. Брали её не из физики, а из арифметики: каждое блюдо
     * планировало партию так, будто вся свободная полка достанется ему одному,
     * и шесть готовок за неделю обещали морозилку вшестеро больше настоящей.
     *
     * Замер до и после общего места на неделю (12 недель × 12 прогонов):
     * не влезало 1.00 кг/нед → 0.09 кг/нед, выброшено 1176 → 699 ₽/нед.
     */
    const avg =
      result.weeks.reduce((sum, w) => sum + w.overflowGrams, 0) / result.weeks.length
    expect(avg).toBeLessThan(200)
  })

  it('еда тоже: приготовили = съели + заморозили + не влезло', () => {
    // «не влезло» появилось не сразу: пока модель клала в морозилку любой
    // излишек, она вмещала в восемь контейнеров двадцать килограммов
    for (const w of result.weeks) {
      // съеденное уже включает хвосты — добавку, которую доедают за пару дней
      const rest = w.cookedGrams - w.eatenGrams - w.frozenGrams - w.overflowGrams
      expect(Math.abs(rest), `неделя ${w.week}`).toBeLessThanOrEqual(
        Math.max(50, w.cookedGrams * 0.02),
      )
    }
  })

  it('в морозилку не помещается больше, чем в неё влезает', () => {
    const capacity = kitchen.containers * 400
    for (const w of result.weeks) {
      // стоимость запаса пересчитываем в еду грубо, поэтому проверяем сам факт:
      // морозилка не растёт бесконечно
      expect(w.freezerEnd, `неделя ${w.week}`).toBeLessThan(capacity * 2)
    }
  })

  it('кладовая переходит между неделями, а не обнуляется', () => {
    for (let i = 1; i < result.weeks.length; i++) {
      expect(result.weeks[i].stockStart).toBe(result.weeks[i - 1].stockEnd)
    }
  })

  it('а в режиме независимых недель — обнуляется', () => {
    // так считался прежний замер, и это отдельный, гораздо более грубый вопрос
    const separate = simulate(household, { weeks: 4, independent: true })
    for (const w of separate.weeks) expect(w.stockStart).toBe(0)
  })

  it('запасы дома делают следующие недели дешевле', () => {
    const first = result.weeks[0].checkout
    const later = result.weeks.slice(3).reduce((s, w) => s + w.checkout, 0) / 3
    expect(later).toBeLessThan(first)
  })

  it('без переноса кладовой чек выше', () => {
    const carry = simulate(household, { weeks: 6 })
    const separate = simulate(household, { weeks: 6, independent: true })
    expect(carry.totalCheckout).toBeLessThan(separate.totalCheckout)
  })
})

describe('стратегии выбирают из одного и того же', () => {
  it('в трёх случаях из четырёх партия одна и та же', () => {
    /*
     * Размер партии задаёт физика: упаковка, кастрюля, форма, сетка изделий.
     * Стратегии выбирают из того, что физика оставила.
     *
     * Оставила она немного, но и не ничего. Пока шаг кастрюли и формы был в
     * целую кастрюлю, стратегии совпадали в девяти случаях из десяти и
     * расходились в среднем выходе на проценты. С мелким шагом (кастрюлю
     * можно налить на три четверти) рычаг стал настоящим: совпадение
     * 75%, «поменьше» варит на 7% меньше, «впрок» — на 11% больше.
     * Это по-прежнему проценты, а не разы: полторы кастрюли вместо двух —
     * не смена образа жизни.
     */
    let same = 0
    let total = 0
    let costGrams = 0
    let minGrams = 0
    let maxGrams = 0
    for (const recipe of RECIPES) {
      for (const portions of [2, 3, 4, 6]) {
        const neededGrams = portionWeight(recipe, portions)
        const ctx = { neededGrams, hasFreezer: true, freezerRoomGrams: 1200 }
        const cost = planBatch(recipe, ctx)
        const min = planBatch(recipe, { ...ctx, prefer: 'min' })
        const max = planBatch(recipe, { ...ctx, prefer: 'max' })
        if (!cost || !min || !max) continue
        total++
        costGrams += cost.chosen.yieldGrams
        minGrams += min.chosen.yieldGrams
        maxGrams += max.chosen.yieldGrams
        if (cost.chosen.yieldGrams === min.chosen.yieldGrams) same++
      }
    }
    expect(total).toBeGreaterThan(100)
    expect(same / total).toBeGreaterThan(0.7)
    // «поменьше» действительно меньше — но в пределах десятой части
    expect(minGrams).toBeLessThan(costGrams)
    expect(costGrams / minGrams).toBeLessThan(1.1)
    // «впрок» больше — и тоже не в разы
    expect(maxGrams).toBeGreaterThan(costGrams)
    expect(maxGrams / costGrams).toBeLessThan(1.25)
  })

  it('«минимальная» никогда не оставляет стол голодным', () => {
    for (const recipe of RECIPES) {
      const neededGrams = portionWeight(recipe, 4)
      const ctx = { neededGrams, hasFreezer: true, freezerRoomGrams: 1200 }
      const cost = planBatch(recipe, ctx)
      const min = planBatch(recipe, { ...ctx, prefer: 'min' })
      if (!cost || !min) continue
      // если хоть один вариант закрывает потребность, «минимальная» его возьмёт
      const covers = min.chosen.shortfallGrams === 0
      const anyCovers = [min.chosen, ...min.alternatives].some((o) => o.shortfallGrams === 0)
      expect(covers, recipe.title).toBe(anyCovers)
    }
  })

  it('«впрок» не берёт того, что некуда деть', () => {
    for (const recipe of RECIPES) {
      const neededGrams = portionWeight(recipe, 3)
      // морозилки нет: складывать излишек некуда
      const max = planBatch(recipe, {
        neededGrams,
        hasFreezer: false,
        freezerRoomGrams: 0,
        prefer: 'max',
      })
      if (!max) continue
      const anyPlaced = [max.chosen, ...max.alternatives].some((o) => o.unplacedGrams === 0)
      if (anyPlaced) expect(max.chosen.unplacedGrams, recipe.title).toBe(0)
    }
  })
})
