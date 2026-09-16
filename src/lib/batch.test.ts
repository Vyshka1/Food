import { describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { INGREDIENTS, INGREDIENT_BY_ID } from '../data/ingredients'
import { buildOption, planBatch, yieldLabel } from './batch'
import { leftoverAdvice, packPlan, purchaseInfo } from './purchase'
import { cookedGrams, cookedYieldPerServing, recipeStats } from './nutrition'

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
    // берём целую пачку и с неё же готовим, а не отрезаем под потребность
    expect(anchor.packs).toBe(1)
    expect(anchor.leftover).toBeLessThan(anchor.packSize / 4)
  })

  it('пачка чаще всего уходит в ноль', () => {
    /*
     * Обещание правила «под упаковку» проверяем по всей базе, а не на одном
     * блюде: на отдельном сочетании блюда и потребности выгоднее бывает
     * оставить сто граммов сырого фарша, чем сварить лишние двести готового.
     * Важно, чтобы это оставалось исключением.
     */
    let cases = 0
    let whole = 0
    let leftover = 0
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch || batch.reason !== 'anchor-pack' || !batch.anchorIngredientId) continue
      for (const portions of [2, 3, 4, 6]) {
        for (const freezerRoomGrams of [0, 1200, 4000]) {
          const neededGrams = cookedGrams(recipe, portions)
          const plan = planBatch(recipe, { neededGrams, hasFreezer: true, freezerRoomGrams })
          const line = plan?.chosen.packs.find((l) => l.ingredientId === batch.anchorIngredientId)
          if (!line) continue
          cases++
          leftover += line.leftover
          if (line.leftover < 40) whole++
        }
      }
    }
    expect(cases).toBeGreaterThan(100)
    /*
     * Измерено: пачка в ноль в 48.3% случаев (240 сочетаний), средний остаток
     * 57 г. Было 45% и 79 г — улучшилось оттого, что в список блюд под упаковку
     * добавился бефстроганов, а прочие изменения расчёта сдвинули выбор доли.
     *
     * Ещё раньше было 54% и 72 г, пока потребность считалась в сыром весе: она
     * была завышена, партия чаще дотягивала до целой пачки, и «хорошая» цифра
     * держалась на лишней готовке.
     *
     * Здесь же видно, почему у блюд под упаковку нет варианта «ровно под
     * потребность», который есть у кастрюли: с ним пачка уходит в ноль только
     * в 39.9% случаев, а средний сырой остаток растёт. Кастрюлю можно
     * налить на три четверти, пачку нельзя вскрыть на три четверти.
     *
     * Вес сырого остатка в модели стоимости с тех пор не перемерялся: это
     * последний шаг переработки, после того как расчёт станет единым.
     */
    expect(whole / cases).toBeGreaterThan(0.4)
    expect(leftover / cases).toBeLessThan(100)
  })

  it('приготовленное всё куда-то девается', () => {
    /*
     * Тарелки, морозилка, добавка к тем же тарелкам и то, чему места не
     * нашлось, — в сумме ровно то, что приготовили. Пока добавку не отделяли
     * от лишнего, порог заморозки толкал партию вверх: лишь бы остаток дотянул
     * до контейнера.
     */
    for (const recipe of RECIPES) {
      for (const portions of [2, 4, 6]) {
        for (const freezerRoomGrams of [0, 1200, 4000]) {
          const neededGrams = cookedGrams(recipe, portions)
          const plan = planBatch(recipe, { neededGrams, hasFreezer: true, freezerRoomGrams })
          if (!plan) continue
          const o = plan.chosen
          const sum = o.servedGrams + o.freezeGrams + o.tailGrams + o.unplacedGrams
          expect(Math.abs(sum - o.yieldGrams), `${recipe.title} ×${portions}`).toBeLessThanOrEqual(2)
          // в морозилку не кладут того, чему там нет места
          expect(o.freezeGrams, recipe.title).toBeLessThanOrEqual(freezerRoomGrams)
        }
      }
    }
  })

  it('излишек уходит в морозилку, а не в никуда', () => {
    const recipe = RECIPE_BY_ID['lazy_cabbage_rolls']
    const batch = recipe.batch!
    const ctx = { ...CONTEXT, neededGrams: 700 }
    // двойная партия при половинной потребности: излишку деваться некуда,
    // кроме морозилки, — и он должен там оказаться, а не исчезнуть
    const big = buildOption(recipe, batch, 2, ctx)
    expect(big.servedGrams).toBe(700)
    expect(big.freezeGrams).toBeGreaterThan(1000)
    expect(big.unplacedGrams).toBe(0)
    // а если морозилки нет — то же самое честно считается непристроенным
    const nowhere = buildOption(recipe, batch, 2, { ...ctx, freezerRoomGrams: 0 })
    expect(nowhere.freezeGrams).toBe(0)
    expect(nowhere.unplacedGrams).toBeGreaterThan(1000)
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

  it('штучное без типовой упаковки всё равно считается штуками', () => {
    // у банана нет фасовки, и план ушёл в весовую ветку: 0,3 банана
    // превращались в «10» — округление до десятков граммов на штучном продукте
    const banana = INGREDIENT_BY_ID['banana']
    expect(packPlan(banana, 0.3).buy).toBe(1)
    expect(packPlan(banana, 1.5).buy).toBe(2)
    expect(packPlan(banana, 3).buy).toBe(3)
  })

  it('у штучного нет остатка, о котором стоит говорить', () => {
    // «0 шт — использовать за 5 дн» человеку сказать нечего: меньше штуки —
    // это остаток округления, а не продукт в холодильнике
    expect(leftoverAdvice(INGREDIENT_BY_ID['banana'], 0.5)).toBeNull()
    expect(leftoverAdvice(INGREDIENT_BY_ID['minced_turkey'], 120)).toContain('120 г')
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

  it('размер упаковки больше не диктует размер готовки', () => {
    /*
     * С этого начался разбор. Два завтрака по 285 г превращались в закладку ×4:
     * «приготовим примерно 1,0 кг, нужно по меню 570 г, останется 468 г».
     * Гранола в этом килограмме размокнет, а яблоко потемнеет — собирать блюдо
     * надо перед едой.
     *
     * Четыре блюда здесь неспроста: закладку им задавали разные правила — трём
     * кастрюля, одному упаковка, — а лечится это одним: партия бывает только
     * подтверждённая. Проверяем не заголовок, а число: сколько нужно по меню,
     * столько и сделаем, и ничего не останется.
     *
     * Пятого из разбора — «Боула с курицей и киноа» — здесь нет намеренно: его
     * партию подтвердили, она про компоненты. Курицу и киноа варят пачкой филе,
     * а собирают боул перед едой — это вторая ось, и проверяется она отдельно.
     */
    for (const id of ['yogurt_granola', 'chia_pudding', 'buckwheat_egg', 'nuts_dates']) {
      const recipe = RECIPE_BY_ID[id]
      for (const neededGrams of [285, 570, 855, 1200]) {
        const plan = planBatch(recipe, { neededGrams, hasFreezer: true, freezerRoomGrams: 4000 })!
        expect(plan.chosen.yieldGrams, `${recipe.title}: нужно ${neededGrams} г`).toBe(neededGrams)
        expect(plan.chosen.servedGrams, recipe.title).toBe(neededGrams)
        expect(plan.chosen.tailGrams, recipe.title).toBe(0)
        expect(plan.chosen.unplacedGrams, recipe.title).toBe(0)
        expect(plan.chosen.shortfallGrams, recipe.title).toBe(0)
      }
    }
  })

  it('и остаток упаковки остаётся в запасах, а не в блюде', () => {
    /*
     * Обратная сторона того же: сделать ровно потребность не значит купить
     * ровно потребность. Пачку йогурта покупают целой — просто лишнее из неё
     * не уходит в блюдо. Значит, сырой остаток у такого блюда есть, а готового
     * излишка нет.
     */
    const plan = planBatch(RECIPE_BY_ID['yogurt_granola'], {
      neededGrams: 570,
      hasFreezer: true,
      freezerRoomGrams: 4000,
    })!
    const yogurt = plan.chosen.packs.find((l) => l.ingredientId === 'greek_yogurt')!
    expect(yogurt.buy).toBeGreaterThan(yogurt.buy - yogurt.leftover)
    expect(yogurt.leftover).toBeGreaterThan(0)
    expect(plan.chosen.unplacedGrams).toBe(0)
  })
})

describe('у каждого приготовленного грамма есть адрес', () => {
  /*
   * Адресов ровно четыре: тарелка запланированного приёма пищи, добавка к тем
   * же тарелкам, морозилка и явное «некуда». Пятого — «доесть в ближайшие
   * дни» — быть не должно: у таких граммов нет ни человека, ни дня, ни приёма
   * пищи, и именно под этой формулировкой прятались 468 г йогурта.
   */
  const NEEDS = [1, 1.5, 2, 3, 4, 6, 8]
  const ROOMS = [0, 600, 1200, 4000]

  it('добавка не дорастает до отдельного приёма пищи', () => {
    for (const recipe of RECIPES) {
      const serving = Math.round(cookedYieldPerServing(recipe).grams)
      for (const portions of NEEDS) {
        for (const freezerRoomGrams of ROOMS) {
          const neededGrams = cookedGrams(recipe, portions)
          const plan = planBatch(recipe, { neededGrams, hasFreezer: true, freezerRoomGrams })
          if (!plan) continue
          // порция плюс грамм на округление: больше — это уже чей-то обед
          expect(
            plan.chosen.tailGrams,
            `${recipe.title} ×${portions}: добавка ${plan.chosen.tailGrams} г при порции ${serving} г`,
          ).toBeLessThanOrEqual(serving + 1)
        }
      }
    }
  })

  it('кастрюлю наливают сколько нужно, а не по сетке', () => {
    /*
     * «Меньше кастрюли непрактично» — ограничение снизу, а не требование варить
     * строго кратно кастрюле: налить её на три четверти можно, и это обычное
     * дело. Пока варианты брались только из сетки 1/1¼/1½, потребность почти
     * никогда не попадала в её узел, и разница оседала добавкой: замер по 60
     * неделям — 715 г/нед, из них 683 г у блюд, которые варят объёмом.
     *
     * Проверяем там, где потребность и так не меньше кастрюли: 144 сочетания
     * блюда и потребности, все до одного — ровно под потребность.
     */
    let cases = 0
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (!batch || (batch.reason !== 'pot' && batch.reason !== 'form') || batch.piece) continue
      for (const portions of [4, 5, 6, 7, 8]) {
        for (const freezerRoomGrams of [0, 1200]) {
          const neededGrams = cookedGrams(recipe, portions)
          if (neededGrams < batch.yieldGrams * batch.minScale) continue
          const plan = planBatch(recipe, { neededGrams, hasFreezer: true, freezerRoomGrams })!
          cases++
          expect(
            plan.chosen.yieldGrams,
            `${recipe.title} ×${portions}, место ${freezerRoomGrams}`,
          ).toBe(neededGrams)
          expect(plan.chosen.tailGrams, recipe.title).toBe(0)
        }
      }
    }
    expect(cases).toBe(144)
  })

  it('а пачку не вскрывают на три четверти', () => {
    /*
     * Обратная сторона: у блюд под упаковку такого варианта нет и быть не
     * должно. Отрезать от пачки фарша ровно под потребность значит оставить
     * сырой остаток, который надо куда-то девать сегодня же. Замер по всей
     * базе (228 случаев): с непрерывным вариантом пачка уходила в ноль в 39.9%
     * случаев вместо 48.2%, а средний сырой остаток рос с 57 до 66 г.
     */
    for (const recipe of RECIPES) {
      const batch = recipe.batch
      if (batch?.reason !== 'anchor-pack' || batch.piece) continue
      for (const portions of [3, 4, 5]) {
        const neededGrams = cookedGrams(recipe, portions)
        const plan = planBatch(recipe, {
          neededGrams,
          hasFreezer: true,
          freezerRoomGrams: 1200,
        })!
        // множитель — из сетки закладок, а не любой; сверх сетки допускается
        // только то, что закрывает потребность, когда сетки не хватает
        const fromGrid = batch.scales.includes(plan.chosen.scale)
        const covering = plan.chosen.scale > Math.max(...batch.scales)
        expect(fromGrid || covering, `${recipe.title} ×${portions}: ×${plan.chosen.scale}`).toBe(
          true,
        )
      }
    }
  })

  it('вариант с непристроенным остатком не рекомендуется, если есть другой', () => {
    /*
     * Замер по всей базе: 4368 сочетаний блюда, потребности и свободного
     * места. Рекомендованный вариант оставляет непристроенное в 396 случаях —
     * и почти всегда потому, что деваться некуда: меньше кастрюли не сваришь,
     * а морозилка занята. Ровно в одном случае из 4368 — «Борщ» на полторы
     * доли — есть вариант чище, и проигрывает он на один грамм.
     *
     * Ложка допуска здесь и стоит: ниже пятидесяти граммов карточка об
     * остатке вообще не говорит, потому что это остаток округления, а не еда.
     */
    let cases = 0
    let worse = 0
    for (const recipe of RECIPES) {
      for (const portions of NEEDS) {
        for (const freezerRoomGrams of ROOMS) {
          for (const hasFreezer of [true, false]) {
            const neededGrams = cookedGrams(recipe, portions)
            const plan = planBatch(recipe, { neededGrams, hasFreezer, freezerRoomGrams })
            if (!plan) continue
            cases++
            const clean = [plan.chosen, ...plan.alternatives].filter(
              (o) => o.unplacedGrams === 0 && o.shortfallGrams === 0,
            )
            if (clean.length === 0) continue
            if (plan.chosen.unplacedGrams > 50) {
              worse++
              expect(
                plan.chosen.unplacedGrams,
                `${recipe.title} ×${portions}, место ${freezerRoomGrams}: выбрано ${plan.chosen.yieldGrams} г при нужных ${neededGrams}, некуда ${plan.chosen.unplacedGrams} г — а вариант без остатка был`,
              ).toBe(0)
            }
          }
        }
      }
    }
    expect(cases).toBeGreaterThan(4000)
    expect(worse).toBe(0)
  })

  it('калории сходятся: приготовлено = роздано + заморожено + добавка + списано', () => {
    /*
     * Инвариант, ради которого всё и затевалось. У йогурта вся готовка
     * содержала 1631 ккал, а два запланированных завтрака — 790: 841 ккал
     * оставались без адреса, и карточка называла их «доесть в ближайшие дни».
     *
     * Калории пропорциональны граммам внутри одного блюда, поэтому достаточно
     * проверить граммы — и отдельно то, что доля розданного совпадает с долей
     * калорий, которую карточка показывает людям.
     */
    for (const recipe of RECIPES) {
      const kcalPerServing = recipeStats(recipe).kcal
      for (const portions of NEEDS) {
        for (const freezerRoomGrams of ROOMS) {
          const neededGrams = cookedGrams(recipe, portions)
          const plan = planBatch(recipe, { neededGrams, hasFreezer: true, freezerRoomGrams })
          if (!plan) continue
          const o = plan.chosen
          const cookedKcal = kcalPerServing * o.servings
          const share = (grams: number) => (grams / Math.max(1, o.yieldGrams)) * cookedKcal
          const sum =
            share(o.servedGrams) + share(o.freezeGrams) + share(o.tailGrams) + share(o.unplacedGrams)
          expect(
            Math.abs(sum - cookedKcal),
            `${recipe.title} ×${portions}: ${Math.round(cookedKcal)} ккал готовки против ${Math.round(sum)} розданных`,
          ).toBeLessThan(Math.max(2, cookedKcal * 0.005))
        }
      }
    }
  })

  it('у блюда без партии вся готовка уходит людям', () => {
    /*
     * Сильная половина того же инварианта: там, где партии нет, в морозилку и
     * в списание не уходит ничего вовсе — всё приготовленное лежит на
     * тарелках запланированных приёмов пищи.
     */
    let checked = 0
    for (const recipe of RECIPES) {
      if (recipe.batch?.reason !== 'fresh') continue
      for (const portions of NEEDS) {
        const neededGrams = cookedGrams(recipe, portions)
        const plan = planBatch(recipe, { neededGrams, hasFreezer: true, freezerRoomGrams: 4000 })!
        checked++
        expect(plan.chosen.servedGrams, `${recipe.title} ×${portions}`).toBe(neededGrams)
        expect(plan.chosen.freezeGrams, recipe.title).toBe(0)
        expect(plan.chosen.tailGrams, recipe.title).toBe(0)
        expect(plan.chosen.unplacedGrams, recipe.title).toBe(0)
      }
    }
    // блюд без подтверждённой партии — 38 из 78
    expect(checked).toBe(38 * NEEDS.length)
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

describe('фасовка', () => {
  it('размеры можно смешивать, и берётся наименьший остаток', () => {
    /*
     * В магазине берут пачку 500 и пачку 600, а не четыре по 600 «потому что
     * делится ровнее». Пока выбирался один размер на всю покупку, на мясе и
     * рыбе набегало 65 ₽ в неделю лишнего.
     */
    const tuna = INGREDIENT_BY_ID['tuna_canned']
    const sizes = purchaseInfo(tuna).packSizes
    expect(sizes.length).toBeGreaterThan(1)

    // 740 г — это ровно четыре банки по 185, а не 600 + 185 с остатком 45
    const exact = packPlan(tuna, 740)
    expect(exact.buy).toBe(740)
    expect(exact.leftover).toBe(0)

    // 580 закрывается парой 400 + 185: остаток 5 г вместо 20 у одной пачки 600
    const mixedPlan = packPlan(tuna, 580)
    expect(mixedPlan.buy).toBe(585)
    expect(mixedPlan.parts.map((p) => p.size).sort((a, b) => a - b)).toEqual([185, 400])
  })

  it('покупка складывается из целых упаковок и закрывает потребность', () => {
    for (const ing of INGREDIENTS) {
      for (const needed of [1, 37, 180, 250, 499, 740, 1310]) {
        const plan = packPlan(ing, needed)
        expect(plan.buy, `${ing.name} на ${needed}`).toBeGreaterThanOrEqual(needed)
        const fromParts = plan.parts.reduce((sum, p) => sum + p.count * p.size, 0)
        if (plan.parts.length > 0) expect(fromParts, ing.name).toBe(plan.buy)
        expect(plan.leftover).toBeCloseTo(plan.buy - needed, 6)
      }
    }
  })

  it('весовой продукт упаковками не считается', () => {
    const loose = INGREDIENTS.find((i) => purchaseInfo(i).form === 'weight')!
    const plan = packPlan(loose, 333)
    expect(plan.parts).toEqual([])
    expect(plan.packSize).toBe(0)
    expect(plan.buy).toBe(340)
  })
})
