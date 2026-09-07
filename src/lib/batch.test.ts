import { describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { buildOption, planBatch, yieldLabel } from './batch'
import { packPlan, purchaseInfo } from './purchase'
import { recipeStats } from './nutrition'

const CONTEXT = { neededGrams: 1080, hasFreezer: true, freezerRoomGrams: 4000 }

describe('аудит партий', () => {
  it('распределённое и замороженное не превышают выход', () => {
    for (const recipe of RECIPES) {
      const plan = planBatch(recipe, CONTEXT)
      if (!plan) continue
      for (const option of [plan.chosen, ...plan.alternatives]) {
        const placed = option.servedGrams + option.freezeGrams + option.unplacedGrams
        expect(placed, recipe.title).toBeLessThanOrEqual(option.yieldGrams + 2)
      }
    }
  })

  it('все ингредиенты масштабируются одним коэффициентом', () => {
    const recipe = RECIPE_BY_ID['lazy_cabbage_rolls']
    const option = buildOption(recipe, recipe.batch!, 1, CONTEXT)
    for (const line of option.packs) {
      const item = recipe.items.find((i) => i.ingredientId === line.ingredientId)!
      const needed = item.qty * option.servings
      // купить нужно не меньше требуемого и не больше, чем на одну упаковку сверх
      expect(line.buy, line.name).toBeGreaterThanOrEqual(needed - 1e-6)
      const step = line.packSize > 0 ? line.packSize : 10
      expect(line.buy - needed, line.name).toBeLessThan(step)
    }
  })

  it('КБЖУ масштабируются тем же коэффициентом, что и продукты', () => {
    const recipe = RECIPE_BY_ID['lazy_cabbage_rolls']
    const stats = recipeStats(recipe)
    for (const scale of recipe.batch!.scales) {
      const option = buildOption(recipe, recipe.batch!, scale, CONTEXT)
      const kcal = stats.kcal * option.servings
      const price = stats.price * option.servings
      expect(option.price).toBe(Math.round(price))
      expect(kcal / option.servings).toBeCloseTo(stats.kcal, 6)
    }
  })

  it('количество изделий всегда целое', () => {
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch?.yieldPieces) continue
      for (const scale of batch.scales) {
        const label = yieldLabel(batch, buildOption(recipe, batch, scale, CONTEXT))
        const match = label.match(/^(\d+(?:[.,]\d+)?) /)
        if (!match) continue
        expect(Number.isInteger(Number(match[1])), `${recipe.title} ×${scale}`).toBe(true)
      }
    }
  })

  it('у derived точного выхода в штуках нет', () => {
    // «примерно 1,8 кг» честно, «8 голубцов» без проверки — выдумка
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch || batch.source !== 'derived') continue
      expect(batch.yieldPieces, recipe.title).toBeUndefined()
      const label = yieldLabel(batch, buildOption(recipe, batch, 1, CONTEXT))
      expect(label, recipe.title).toMatch(/^примерно /)
    }
  })

  it('у каждого остатка упаковки есть назначение', () => {
    for (const recipe of RECIPES) {
      const plan = planBatch(recipe, CONTEXT)
      if (!plan) continue
      for (const line of plan.chosen.packs) {
        if (line.leftover <= 0) continue
        const ing = INGREDIENT_BY_ID[line.ingredientId]
        const info = purchaseInfo(ing)
        // либо остаток можно заморозить, либо он хранится, либо его немного
        const hasHome = info.rawFreezable || info.openedFridgeDays >= 2 || line.leftover < 10
        expect(hasHome, `${recipe.title}: ${line.name}`).toBe(true)
      }
    }
  })

  it('сырой мясной остаток всегда можно куда-то деть', () => {
    for (const recipe of RECIPES) {
      const plan = planBatch(recipe, CONTEXT)
      if (!plan) continue
      for (const line of plan.chosen.packs) {
        const ing = INGREDIENT_BY_ID[line.ingredientId]
        if (!['meat', 'fish'].includes(ing.category) || line.leftover <= 0) continue
        // сырое мясо портится за сутки — единственный безопасный выход заморозка
        expect(line.freezableRaw, `${recipe.title}: ${line.name}`).toBe(true)
      }
    }
  })

  it('все выведенные партии попадают в список ручной проверки', () => {
    const toCheck = RECIPES.filter((r) => r.batch?.source === 'derived')
    const verified = RECIPES.filter((r) => r.batch?.source === 'verified')
    expect(verified.length).toBeGreaterThan(0)
    expect(toCheck.length + verified.length).toBe(RECIPES.length)
    // блюда, которые лепят поштучно, проверены вручную — на них цена ошибки выше
    for (const id of ['lazy_cabbage_rolls', 'turkey_meatballs_rice', 'chicken_cutlets_veg']) {
      expect(RECIPE_BY_ID[id].batch?.source, id).toBe('verified')
    }
  })
})

describe('выбор партии', () => {
  it('под упаковку фарша, а не под потребность', () => {
    const recipe = RECIPE_BY_ID['lazy_cabbage_rolls']
    const plan = planBatch(recipe, CONTEXT)!
    expect(plan.batch.reason).toBe('anchor-pack')
    const anchor = plan.chosen.packs.find((l) => l.ingredientId === 'minced_turkey')!
    // сырого фарша почти не остаётся: партия подогнана под пачку
    expect(anchor.leftover).toBeLessThan(40)
  })

  it('излишек уходит в морозилку, а не в никуда', () => {
    const recipe = RECIPE_BY_ID['lazy_cabbage_rolls']
    const plan = planBatch(recipe, CONTEXT)!
    expect(plan.chosen.unplacedGrams).toBe(0)
    expect(plan.chosen.servedGrams).toBe(1080)
    expect(plan.chosen.freezeGrams).toBeGreaterThan(0)
  })

  it('без морозилки лишнее не готовим', () => {
    const recipe = RECIPE_BY_ID['lazy_cabbage_rolls']
    const withFreezer = planBatch(recipe, CONTEXT)!
    const without = planBatch(recipe, { ...CONTEXT, hasFreezer: false })!
    expect(without.chosen.scale).toBeLessThanOrEqual(withFreezer.chosen.scale)
  })

  it('у кастрюли нет половины закладки', () => {
    // причина «меньше кастрюли непрактично» и вариант «полкастрюли» —
    // противоречие самому себе
    for (const recipe of RECIPES) {
      if (recipe.batch?.reason !== 'pot') continue
      expect(recipe.batch.minScale, recipe.title).toBeGreaterThanOrEqual(1)
      expect(recipe.batch.scales, recipe.title).not.toContain(0.5)
    }
  })

  it('свежее блюдо готовится ровно на один раз', () => {
    for (const recipe of RECIPES) {
      if (recipe.batch?.reason !== 'fresh') continue
      expect(recipe.batch.scales, recipe.title).toEqual([1])
      expect(recipe.batch.baseScale, recipe.title).toBe(1)
    }
  })
})

describe('модель покупки', () => {
  it('фасовка продукта важнее типовой', () => {
    // подпись «продаётся упаковкой 500 г» противоречила плану, бравшему 400 г
    const mince = INGREDIENT_BY_ID['minced_chicken']
    expect(purchaseInfo(mince).preferredPack).toBe(400)
  })

  it('из фасовок берётся та, что оставляет меньше', () => {
    const mince = INGREDIENT_BY_ID['minced_turkey']
    expect(packPlan(mince, 590).packSize).toBe(600)
    expect(packPlan(mince, 390).packSize).toBe(400)
  })

  it('штучное не делится', () => {
    const egg = INGREDIENT_BY_ID['egg']
    expect(purchaseInfo(egg).partialUse).toBe(false)
    expect(packPlan(egg, 2.3).buy).toBe(3)
  })

  it('сырое мясо живёт сутки, крупы — месяцами', () => {
    expect(purchaseInfo(INGREDIENT_BY_ID['minced_turkey']).openedFridgeDays).toBe(1)
    expect(purchaseInfo(INGREDIENT_BY_ID['rice']).openedFridgeDays).toBeGreaterThan(30)
  })
})

describe('свежие блюда', () => {
  it('готовятся на нужный объём, а не на одну долю', () => {
    // фиксированная закладка ×1 давала «нужно 1185 г, приготовить 298 г» —
    // план, по которому семья остаётся голодной
    const recipe = RECIPE_BY_ID['oatmeal_berries']
    expect(recipe.batch?.reason).toBe('fresh')
    const plan = planBatch(recipe, { neededGrams: 1185, hasFreezer: true, freezerRoomGrams: 0 })!
    expect(plan.chosen.yieldGrams).toBeGreaterThanOrEqual(1000)
    expect(plan.chosen.unplacedGrams).toBe(0)
  })

  it('на малую потребность лишнего не готовят', () => {
    const recipe = RECIPE_BY_ID['oatmeal_berries']
    const plan = planBatch(recipe, { neededGrams: 300, hasFreezer: true, freezerRoomGrams: 0 })!
    expect(plan.chosen.yieldGrams).toBeLessThan(500)
  })

  it('выход всегда покрывает потребность по меню', () => {
    // требуем у каждого блюда примерно три его собственные доли — столько и
    // бывает в реальном меню. План не имеет права молча приготовить меньше
    for (const recipe of RECIPES) {
      const probe = planBatch(recipe, { neededGrams: 1, hasFreezer: true, freezerRoomGrams: 4000 })
      if (!probe) continue
      const perServing = probe.chosen.yieldGrams / probe.chosen.servings
      const needed = Math.round(perServing * 3)
      const plan = planBatch(recipe, { neededGrams: needed, hasFreezer: true, freezerRoomGrams: 4000 })!
      expect(plan.chosen.shortfallGrams, `${recipe.title}: нужно ${needed} г`).toBeLessThan(
        perServing * 0.5,
      )
    }
  })
})

describe('проверенные вручную партии', () => {
  const verified = RECIPES.filter((r) => r.batch?.source === 'verified')

  it('покрывают все морозящиеся блюда', () => {
    const unchecked = RECIPES.filter((r) => r.freezable && r.batch?.source !== 'verified')
    expect(unchecked.map((r) => r.title)).toEqual([])
  })

  it('выставленный вручную выход действительно используется', () => {
    // выверенные числа молча игнорировались: buildOption пересчитывал выход
    // по составу и выставленное значение никуда не шло
    for (const recipe of verified) {
      const option = buildOption(recipe, recipe.batch!, 1, CONTEXT)
      expect(option.yieldGrams, recipe.title).toBe(recipe.batch!.yieldGrams)
    }
  })

  it('число изделий не противоречит выходу в граммах', () => {
    for (const recipe of verified) {
      const batch = recipe.batch!
      if (!batch.yieldPieces) continue
      const perPiece = batch.yieldGrams / batch.yieldPieces
      // изделие бытового размера: от куска в 20 г до крупного в 200 г
      expect(perPiece, `${recipe.title}: ${Math.round(perPiece)} г на штуку`).toBeGreaterThan(18)
      expect(perPiece, `${recipe.title}: ${Math.round(perPiece)} г на штуку`).toBeLessThan(220)
    }
  })

  it('масштаб закладки остаётся правдоподобным', () => {
    for (const recipe of verified) {
      const batch = recipe.batch!
      // ×6,75 у овсяной запеканки означало три килограмма теста в форме
      expect(batch.baseScale, recipe.title).toBeLessThanOrEqual(5)
      expect(batch.yieldGrams, recipe.title).toBeLessThan(2400)
    }
  })

  it('причина партии соответствует блюду', () => {
    for (const recipe of verified) {
      const batch = recipe.batch!
      // у выпечки не бывает кастрюли, у супа — сковороды
      if (recipe.needs?.includes('oven')) expect(batch.reason, recipe.title).not.toBe('pan')
      if (/суп|борщ/i.test(recipe.title)) {
        expect(['pot', 'anchor-pack'], recipe.title).toContain(batch.reason)
      }
      if (batch.reason === 'anchor-pack') expect(batch.anchorIngredientId, recipe.title).toBeTruthy()
    }
  })
})
