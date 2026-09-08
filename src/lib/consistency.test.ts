import { describe, expect, it } from 'vitest'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPES } from '../data/recipes'
import type { Eater, Household, Kitchen, Pantry } from '../types'
import { buildWeekMenu, cookTaskId, defaultRepeats } from './menu'
import { completeCookTask } from './cookFact'
import { buildCookingPlans } from './cookingPlan'
import { cookCard } from './cookCard'
import { defaultOils } from './oil'
import { COOK_LOSS, cookedGrams, cookedYieldPerServing, rawGrams } from './nutrition'
import { INGREDIENTS, pieceWeight } from '../data/ingredients'
import { addFreezer, emptyPantry, setStock } from './pantry'
import { packPlan, purchaseInfo } from './purchase'
import { buildShoppingList } from './shopping'
import { cookedStats, planWeek } from './weekPlan'

/*
 * Сквозная согласованность: одно и то же число, посчитанное разными модулями.
 *
 * Файл заведён перед переработкой расчётов как измерительная сетка. Тогда это
 * были снимки: они печатали, насколько модули расходятся, и стерегли порядок
 * величины. С чего начинали — упаковки расходились в 5.6% строк, расписание
 * считало готовку на 24% меньше карточки, столько же не досчитывало списание
 * из кладовой, калории карточки уходили от дневного итога на 8.6%.
 *
 * Теперь все четыре равны нулю, и это проверяется, а не печатается. Числа в
 * логе оставлены: если расхождение вернётся, видно будет сразу, какое именно.
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
  it('вес штуки не выдумывается', () => {
    /*
     * Раньше запасной вес штуки стоял в двух модулях и был разным: ноль в
     * расчёте веса порции и пятьдесят граммов в расчёте закладки. Один и тот же
     * банан весил по-разному в зависимости от того, кто спрашивал.
     */
    for (const ing of INGREDIENTS) {
      if (ing.unit !== 'pcs') continue
      expect(() => pieceWeight(ing), ing.id).not.toThrow()
      expect(pieceWeight(ing), ing.id).toBeGreaterThan(0)
    }
    expect(() => pieceWeight({ ...INGREDIENTS[0], unit: 'pcs', pieceGrams: undefined })).toThrow()
  })

  it('потребность и выход партии считаются в одной шкале', () => {
    /*
     * Главный инвариант этой переработки. Состав рецепта задан в сыром весе, а
     * партия — в готовом; пока `place()` сравнивал одно с другим напрямую,
     * потребность была завышена примерно на восьмую часть, и система честно
     * доготавливала лишнее.
     */
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch || batch.source !== 'verified') continue
      const fromDemandSide = cookedGrams(recipe, batch.baseScale)
      expect(
        Math.abs(fromDemandSide - batch.yieldGrams),
        `${recipe.title}: потребность ${fromDemandSide} против выхода ${batch.yieldGrams}`,
      ).toBeLessThanOrEqual(5)
    }
  })

  it('готовое легче сырого, и разница берётся из выверенных данных', () => {
    let verified = 0
    let derived = 0
    let sum = 0
    for (const recipe of RECIPES) {
      const cooked = cookedYieldPerServing(recipe)
      const raw = rawGrams(recipe, 1)
      if (raw <= 0) continue
      if (cooked.source === 'verified') verified++
      else derived++
      sum += cooked.grams / raw
    }
    console.log(
      `выход к сырью: ${(sum / (verified + derived)).toFixed(3)}; ` +
        `выверено ${verified} рецептов, оценено ${derived}`,
    )
    // выверенных данных должно быть больше, чем оценок «по умолчанию»
    expect(verified).toBeGreaterThan(30)
    // общее предположение не должно расходиться с выверенными данными в разы
    expect(sum / (verified + derived)).toBeGreaterThan(1 - COOK_LOSS - 0.05)
    expect(sum / (verified + derived)).toBeLessThan(1 - COOK_LOSS + 0.05)
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

      const cardFirst = planWeek(menu, household, { pantry }).tasks.map((t) => t.servings)
      const planFirst = (() => {
        buildCookingPlans(menu, household, 1, pantry)
        buildShoppingList(menu, household, pantry)
        return planWeek(menu, household, { pantry }).tasks.map((t) => t.servings)
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

describe('модули считают одно и то же одинаково', () => {
  it('и это проверяется, а не печатается', () => {
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
      const week = planWeek(menu, household, { pantry })
      const list = buildShoppingList(menu, household, pantry)

      // (1) упаковки: список округляет по ing.pack, карточка выбирает фасовку
      const perIngredient = week.demand
      for (const line of list.lines) {
        const ing = INGREDIENT_BY_ID[line.ingredientId]
        const needed = perIngredient.get(line.ingredientId) ?? 0
        if (!ing || needed <= 0 || purchaseInfo(ing).form === 'weight') continue
        packLines++
        if (Math.abs(packPlan(ing, needed).buy - line.buy) > 0.5) packDiff++
      }

      // (2) масштаб: расписание и карточка должны говорить об одной готовке
      for (const plan of buildCookingPlans(menu, household, 1, pantry)) {
        for (const dish of plan.dishes) {
          const cooking = week.tasks.find(
            (t) => t.task.recipeId === dish.recipeId && t.task.cookDay === plan.cookDay,
          )
          if (!cooking) continue
          scaleTasks++
          scaleDiffSum += Math.abs(dish.portions - cooking.servings)
        }
      }

      // (3) калории карточки против тех, что уходят в дневной итог
      const actual = cookedStats(week)
      for (const entry of menu.entries) {
        if (entry.fromFreezer) continue
        const card = cookCard(menu, household, entry, pantry)
        if (!card) continue
        const cooked = actual.get(
          cookTaskId(menu.weekStart, entry.recipeId, entry.cookDay),
        )
        if (!cooked || cooked.stats.kcal <= 0) continue
        cards++
        const diff = Math.abs(card.stats.kcal - cooked.stats.kcal) / cooked.stats.kcal
        kcalDiffSum += diff
        kcalWorst = Math.max(kcalWorst, diff)
      }

      // (4) факт готовки списывает партию, а не потребность одной записи меню
      for (const cooking of week.tasks) {
        const facts = completeCookTask(
          { pantry: emptyPantry(), cookEvents: [] },
          menu,
          household,
          cooking.task.key,
          '2026-01-07',
        )
        const used = facts.cookEvents[0]?.used ?? []
        storeTasks++
        for (const { ingredientId, qty } of used) {
          storeDiffSum += Math.abs(qty - (cooking.ingredients.get(ingredientId) ?? 0))
        }
      }
    }

    console.log(
      [
        `упаковки: расходятся ${((packDiff / packLines) * 100).toFixed(1)}% строк (${packDiff} из ${packLines})`,
        `масштаб готовки: расписание против карточки — расхождение ${scaleDiffSum.toFixed(3)} доли на ${scaleTasks} готовок`,
        `калории карточки против дневного итога: худшее расхождение ${(kcalWorst * 100).toFixed(2)}% на ${cards} карточках`,
        `списание в кладовой против партии: расхождение ${storeDiffSum.toFixed(3)} на ${storeTasks} готовок`,
      ].join('\n  '),
    )

    // Пороги стерегут порядок величины: расхождения не должны расти, пока
    // расчёт не станет единым. Ноль здесь появится по мере переработки.
    // расписание и факт готовки считают ту же партию, что и карточка
    expect(scaleTasks).toBeGreaterThan(100)
    expect(scaleDiffSum).toBeLessThan(0.001)
    expect(storeTasks).toBeGreaterThan(100)
    expect(storeDiffSum).toBeLessThan(0.001)
    expect(packLines).toBeGreaterThan(300)
    // список покупок и карточка решают про упаковки одним расчётом на неделю
    expect(packDiff).toBe(0)
    // карточка и дневной итог считают одну и ту же приготовленную партию
    expect(cards).toBeGreaterThan(300)
    expect(kcalWorst).toBe(0)
  })
})
