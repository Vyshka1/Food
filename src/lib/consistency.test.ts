import { describe, expect, it } from 'vitest'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPES } from '../data/recipes'
import { recipeById } from '../data/recipeRegistry'
import type { Eater, Household, Kitchen, Pantry } from '../types'
import { buildWeekMenu, cookTasks, defaultRepeats, totalPortions } from './menu'
import { buildCookingPlans } from './cookingPlan'
import { cookCard } from './cookCard'
import { defaultOils } from './oil'
import { portionWeight, recipeStats } from './nutrition'
import { rawGramsPerServing } from './batchInfo'
import { addFreezer, emptyPantry, setStock } from './pantry'
import { packPlan, purchaseInfo } from './purchase'
import { buildShoppingList } from './shopping'
import { planWeekBatches, weekServings } from './weekBatch'

/*
 * Сквозная согласованность: одно и то же число, посчитанное разными модулями.
 *
 * Файл заведён перед переработкой расчётов как измерительная сетка. Часть
 * проверок здесь пока не инварианты, а снимок: они печатают, насколько модули
 * расходятся сегодня, и стерегут порядок величины, чтобы расхождение не выросло
 * незамеченным. По мере того как расчёт становится единым, каждая такая
 * проверка превращается в строгий инвариант — это последний шаг переработки,
 * а не первый.
 */

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

const eater = (id: string, patch: Partial<Eater> = {}): Eater => ({
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
})

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

/*
 * Исходники экранов читаем как текст: у экранов нет ни одного теста, а забытый
 * аргумент кладовой уже один раз развёл расписание и карточку. Через glob, а не
 * через fs, чтобы не тянуть типы Node ради четырёх строк.
 */
const SOURCES = import.meta.glob('../{screens,components}/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function source(path: string): string {
  const key = Object.keys(SOURCES).find((k) => k.endsWith(path))
  if (!key) throw new Error(`не найден исходник ${path}`)
  return SOURCES[key]
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

/** Полная кладовая: чтобы было видно, что расчёт вообще на неё смотрит. */
function stockedPantry(): Pantry {
  let pantry = emptyPantry()
  pantry = setStock(pantry, 'rice', 800, '2026-01-01')
  pantry = setStock(pantry, 'buckwheat', 600, '2026-01-01')
  pantry = addFreezer(pantry, RECIPES.find((r) => r.freezable)!, 4, 2, '2026-01-01')
  return pantry
}

describe('шкала граммов', () => {
  it('«вес порции» и «сырьё на долю» — это одно и то же число', () => {
    /*
     * portionWeight и rawGramsPerServing складывают одно и то же: сырые
     * количества состава. Отличаются только запасным весом штуки (0 против 50).
     * Пока это два имени одной величины, их легко перепутать со третьей —
     * выходом готового блюда.
     */
    let worst = 0
    for (const recipe of RECIPES) {
      const raw = rawGramsPerServing(recipe)
      if (raw <= 0) continue
      worst = Math.max(worst, Math.abs(portionWeight(recipe, 1) - raw) / raw)
    }
    expect(worst).toBeLessThan(0.05)
  })

  it('снимок: потребность считается в сыром весе, а выход — в готовом', () => {
    /*
     * Здесь и находится корень расхождений. `place()` сравнивает выход партии
     * (готовое) с потребностью по меню (сырьё), поэтому потребность завышена
     * примерно на восьмую часть. Проверка держит замер, а не одобряет его:
     * когда потребность переедет в готовый вес, отношение станет единицей.
     */
    let sum = 0
    let n = 0
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch || batch.source !== 'verified') continue
      const cookedPerServing = batch.yieldGrams / (batch.baseScale || 1)
      const raw = portionWeight(recipe, 1)
      if (raw <= 0) continue
      sum += cookedPerServing / raw
      n++
    }
    const ratio = sum / n
    console.log(
      `выход готового к сырью: ${ratio.toFixed(3)} по ${n} рецептам с выверенным выходом`,
    )
    expect(n).toBeGreaterThan(20)
    expect(ratio).toBeGreaterThan(0.8)
    expect(ratio).toBeLessThan(0.95)
  })
})

describe('одинаковые входы — одинаковый расчёт', () => {
  it('порядок построения экранов не влияет на числа', () => {
    /*
     * Карточка, закупка и расписание спрашивают партии у одного кэша. Если
     * кто-то из них спросит с другими входами, кэш будет вытесняться, а числа
     * на экранах — расходиться. Проверяем оба порядка вызова.
     */
    const pantry = stockedPantry()
    for (const seed of SEEDS.slice(0, 8)) {
      const { menu } = buildWeekMenu(household, seed)

      const cardFirst = cookTasks(menu).map((t) => {
        const plans = planWeekBatches(menu, household, { pantry })
        return weekServings(plans, t)
      })
      const planFirst = (() => {
        buildCookingPlans(menu, household, 1, pantry)
        buildShoppingList(menu, household, pantry)
        const plans = planWeekBatches(menu, household, { pantry })
        return cookTasks(menu).map((t) => weekServings(plans, t))
      })()
      expect(planFirst, `неделя ${seed}`).toEqual(cardFirst)
    }
  })

  it('кладовая меняет расчёт, а не игнорируется', () => {
    // если бы кладовая не доходила до расчёта, эти два плана совпали бы
    const full = stockedPantry()
    let differs = 0
    for (const seed of SEEDS) {
      const { menu } = buildWeekMenu(household, seed)
      const a = buildShoppingList(menu, household, emptyPantry())
      const b = buildShoppingList(menu, household, full)
      if (a.total !== b.total) differs++
    }
    expect(differs).toBeGreaterThan(SEEDS.length / 2)
  })

  it('экраны не считают по пустой кладовой', () => {
    /*
     * Единственная проверка в проекте, которая смотрит в код экрана. Причина:
     * тестов у экранов нет вовсе, а забытый аргумент кладовой уже один раз
     * развёл расписание и карточку. Когда расчёт станет единым и кладовая
     * войдёт в тип входа, эту проверку заменит компилятор.
     */
    const calls: [string, RegExp][] = [
      ['PlanScreen.tsx', /buildCookingPlans\([^)]*pantry[^)]*\)/],
      ['ProductsScreen.tsx', /buildShoppingList\([^)]*pantry[^)]*\)/],
      ['ShoppingModeScreen.tsx', /buildShoppingList\([^)]*pantry[^)]*\)/],
      ['RecipeSheet.tsx', /cookCard\([^)]*pantry[^)]*\)/],
    ]
    for (const [file, re] of calls) {
      expect(source(file), file).toMatch(re)
    }
  })

  it('и пересчитывают, когда кладовая изменилась', () => {
    // тот же список useMemo должен зависеть от pantry, иначе экран покажет
    // вчерашние количества
    for (const file of ['ProductsScreen.tsx', 'ShoppingModeScreen.tsx']) {
      const text = source(file)
      const memo = text.match(/buildShoppingList\([\s\S]{0,120}?\[[^\]]*\]/)
      expect(memo?.[0], file).toMatch(/pantry/)
    }
  })
})

describe('снимок расхождений между модулями', () => {
  it('печатает, насколько модули считают одно и то же по-разному', () => {
    const pantry = emptyPantry()
    let packLines = 0
    let packDiff = 0
    let scaleTasks = 0
    let scaleDiffSum = 0
    let cards = 0
    let kcalDiffSum = 0
    let kcalWorst = 0
    let storeTasks = 0
    let storeDiffSum = 0

    for (const seed of SEEDS) {
      const { menu } = buildWeekMenu(household, seed)
      const plans = planWeekBatches(menu, household, { pantry })
      const list = buildShoppingList(menu, household, pantry)

      // (1) упаковки: список округляет по ing.pack, карточка выбирает фасовку
      const perIngredient = new Map<string, number>()
      for (const task of cookTasks(menu)) {
        const recipe = recipeById(task.recipeId)
        if (!recipe) continue
        const servings = weekServings(plans, task)
        for (const item of recipe.items) {
          perIngredient.set(
            item.ingredientId,
            (perIngredient.get(item.ingredientId) ?? 0) + item.qty * servings,
          )
        }
      }
      for (const line of list.lines) {
        const ing = INGREDIENT_BY_ID[line.ingredientId]
        const needed = perIngredient.get(line.ingredientId) ?? 0
        if (!ing || needed <= 0 || purchaseInfo(ing).form === 'weight') continue
        packLines++
        if (Math.abs(packPlan(ing, needed).buy - line.buy) > 0.5) packDiff++
      }

      // (2) масштаб: расписание считает шаги от потребности, карточка от партии
      for (const task of cookTasks(menu)) {
        const servings = weekServings(plans, task)
        if (Math.abs(servings - task.portions) < 0.01) continue
        scaleTasks++
        scaleDiffSum += (servings - task.portions) / task.portions
      }

      // (3) калории карточки против тех, что уходят в дневной итог
      for (const entry of menu.entries) {
        if (entry.fromFreezer) continue
        const card = cookCard(menu, household, entry, pantry)
        if (!card) continue
        const fromStats = recipeStats(card.recipe).kcal * card.servings
        if (fromStats <= 0) continue
        const diff = Math.abs(card.stats.kcal - fromStats) / fromStats
        cards++
        kcalDiffSum += diff
        kcalWorst = Math.max(kcalWorst, diff)
      }

      // (4) списание в кладовой: store берёт потребность записи, а не партию
      for (const task of cookTasks(menu)) {
        const entries = menu.entries.filter(
          (e) => e.recipeId === task.recipeId && e.cookDay === task.cookDay && !e.fromFreezer,
        )
        const byEntry = entries.reduce((sum, e) => sum + totalPortions(e), 0)
        const servings = weekServings(plans, task)
        if (Math.abs(byEntry - servings) < 0.01) continue
        storeTasks++
        storeDiffSum += (servings - byEntry) / Math.max(0.1, byEntry)
      }
    }

    console.log(
      [
        `упаковки: расходятся ${((packDiff / packLines) * 100).toFixed(1)}% строк (${packDiff} из ${packLines})`,
        `масштаб готовки: расписание ≠ карточка в ${scaleTasks} готовках, партия больше в среднем на ${((scaleDiffSum / Math.max(1, scaleTasks)) * 100).toFixed(0)}%`,
        `калории карточки против дневного итога: среднее ${((kcalDiffSum / cards) * 100).toFixed(2)}%, худшее ${((kcalWorst) * 100).toFixed(1)}% (${cards} карточек)`,
        `списание в кладовой против партии: ${storeTasks} готовок, в среднем на ${((storeDiffSum / Math.max(1, storeTasks)) * 100).toFixed(0)}% меньше, чем куплено`,
      ].join('\n  '),
    )

    // Пороги стерегут порядок величины: расхождения не должны расти, пока
    // расчёт не станет единым. Ноль здесь появится по мере переработки.
    expect(packLines).toBeGreaterThan(300)
    expect(packDiff / packLines).toBeLessThan(0.1)
    expect(kcalDiffSum / cards).toBeLessThan(0.02)
    expect(kcalWorst).toBeLessThan(0.15)
  })
})
