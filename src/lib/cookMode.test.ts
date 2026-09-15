import { describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { VERIFIED_BATCHES } from '../data/verifiedBatches'
import type { BatchPolicy, PreparationMode } from '../types'
import {
  BATCH_POLICY_HINT,
  PREPARATION_HINT,
  batchPolicyOf,
  cooksToOrder,
  looksBatchableRecipe,
  preparationOf,
  suggestedPreparation,
} from './cookMode'
import { planBatch } from './batch'

const POLICIES: BatchPolicy[] = ['exactForMenu', 'fixedBatch', 'discretePieces']
const PREPARATIONS: PreparationMode[] = [
  'cookComplete',
  'prepareComponents',
  'assembleBeforeEating',
  'portionOnly',
]

describe('количество и подготовка — две независимые оси', () => {
  it('у каждого блюда есть обе, и только из своих словарей', () => {
    for (const recipe of RECIPES) {
      expect(POLICIES, recipe.title).toContain(batchPolicyOf(recipe.batch))
      expect(PREPARATIONS, recipe.title).toContain(preparationOf(recipe))
      expect(BATCH_POLICY_HINT[batchPolicyOf(recipe.batch)], recipe.title).toBeTruthy()
      expect(PREPARATION_HINT[preparationOf(recipe)], recipe.title).toBeTruthy()
    }
  })

  it('оси не совпадают: одна и та же подготовка при разном количестве', () => {
    /*
     * Главная проверка независимости, и лучший пример — два блюда, которые в
     * тексте пишутся одинаково, а обращения требуют разного.
     *
     * Боул с курицей и киноа: курицу и киноа варят пачкой филе — партия
     * настоящая, — а собирают боул перед едой, с лимоном и сырым перцем.
     * Йогурт с гранолой: собирают точно так же перед едой, но партии нет
     * никакой: два завтрака по 285 г, и пачка йогурта 600 г тут ни при чём.
     *
     * Пока ось была одна, эти два блюда попадали в одну клетку — и либо оба
     * варились под упаковку, либо оба её теряли.
     */
    const bowl = RECIPE_BY_ID['chicken_quinoa_bowl']
    const yogurt = RECIPE_BY_ID['yogurt_granola']
    expect(preparationOf(bowl)).toBe('assembleBeforeEating')
    expect(preparationOf(yogurt)).toBe('assembleBeforeEating')
    expect(batchPolicyOf(bowl.batch)).toBe('fixedBatch')
    expect(batchPolicyOf(yogurt.batch)).toBe('exactForMenu')
  })

  it('и одно и то же количество при разной подготовке', () => {
    // обратная половина: обоим готовят ровно по меню, а делают по-разному
    const chia = RECIPE_BY_ID['chia_pudding']
    const nuts = RECIPE_BY_ID['nuts_dates']
    expect(batchPolicyOf(chia.batch)).toBe('exactForMenu')
    expect(batchPolicyOf(nuts.batch)).toBe('exactForMenu')
    expect(preparationOf(chia)).toBe('cookComplete')
    expect(preparationOf(nuts)).toBe('portionOnly')
  })

  it('все пять блюд из разбора получили своё обращение', () => {
    /*
     * Таблица из задания, слово в слово. Три из пяти теперь готовятся ровно по
     * меню, боулу партия оставлена — она про компоненты, а не про блюдо, — и
     * все пять перестали быть одним и тем же случаем.
     */
    const cases: [string, BatchPolicy, PreparationMode][] = [
      ['yogurt_granola', 'exactForMenu', 'assembleBeforeEating'],
      ['chia_pudding', 'exactForMenu', 'cookComplete'],
      ['buckwheat_egg', 'exactForMenu', 'assembleBeforeEating'],
      ['chicken_quinoa_bowl', 'fixedBatch', 'assembleBeforeEating'],
      ['nuts_dates', 'exactForMenu', 'portionOnly'],
    ]
    for (const [id, policy, prep] of cases) {
      const recipe = RECIPE_BY_ID[id]
      expect(batchPolicyOf(recipe.batch), id).toBe(policy)
      expect(preparationOf(recipe), id).toBe(prep)
    }
  })
})

describe('партия — то, что подтвердили, а не то, что вывелось', () => {
  it('партия есть ровно у тех блюд, которые есть в списке подтверждённых', () => {
    /*
     * Безопасное умолчание: нет проверенной производственной модели — готовим
     * ровно по меню. Раньше партию выводило правило по составу и шагам, и она
     * доставалась 44 блюдам из 78, пяти из них — зря.
     */
    for (const recipe of RECIPES) {
      const confirmed = Boolean(VERIFIED_BATCHES[recipe.id])
      expect(recipe.batch?.source === 'verified', recipe.title).toBe(confirmed)
      expect(cooksToOrder(batchPolicyOf(recipe.batch)), recipe.title).toBe(!confirmed)
    }
  })

  it('и раскладка по осям остаётся такой, какой её замерили', () => {
    const policy = (p: BatchPolicy) => RECIPES.filter((r) => batchPolicyOf(r.batch) === p).length
    const prep = (p: PreparationMode) => RECIPES.filter((r) => preparationOf(r) === p).length
    // 78 блюд: 40 с подтверждённой партией, 38 — ровно по меню
    expect(policy('fixedBatch')).toBe(29)
    expect(policy('discretePieces')).toBe(11)
    expect(policy('exactForMenu')).toBe(38)
    expect(prep('cookComplete')).toBe(59)
    expect(prep('assembleBeforeEating')).toBe(9)
    expect(prep('portionOnly')).toBe(7)
    expect(prep('prepareComponents')).toBe(3)
  })

  it('39 блюд, которым партия нужна по делу, её сохранили', () => {
    for (const id of [
      'borsch', 'lentil_soup', 'chicken_noodle_soup', 'bean_veg_stew', 'cottage_casserole',
      'oat_apple_bake', 'lazy_cabbage_rolls', 'chicken_cutlets_veg', 'cottage_pancakes',
      'draniki', 'egg_muffins', 'oat_cocoa_balls', 'chickpea_curry', 'pumpkin_soup',
      'zucchini_casserole', 'tofu_stirfry', 'potato_tortilla', 'cauliflower_bake',
      'beef_stroganoff', 'baked_apple', 'hummus_classic', 'beet_hummus',
    ]) {
      expect(cooksToOrder(batchPolicyOf(RECIPE_BY_ID[id].batch)), id).toBe(false)
    }
  })

  it('своё блюдо пользователя партию молча не получает', () => {
    /*
     * Тот же безопасный путь для рецепта, которого нет ни в одном списке:
     * готовим ровно потребность. Проверяем через planBatch, а не через флаг:
     * важно не как называется поле, а сколько окажется на плите.
     */
    const own = { ...RECIPE_BY_ID['borsch'], id: 'my_own_soup', batch: undefined }
    const normalized = { ...own, batch: RECIPE_BY_ID['yogurt_granola'].batch }
    const plan = planBatch(normalized, {
      neededGrams: 640,
      hasFreezer: true,
      freezerRoomGrams: 4000,
    })!
    expect(plan.chosen.yieldGrams).toBe(640)
    expect(plan.chosen.unplacedGrams).toBe(0)
    expect(plan.chosen.tailGrams).toBe(0)
  })
})

describe('правило по тексту шагов — аудит, а не источник истины', () => {
  it('подсказывает ровно ту разметку подготовки, что стоит руками', () => {
    /*
     * Замер по всей базе: правило совпадает с разметкой у 77 блюд из 78.
     * Расходится одно — «Яйцо с авокадо»: сборка там стоит в середине строки,
     * «Размять авокадо с лимоном, собрать», и правило её не видит.
     *
     * Это и есть причина, по которой разметка стоит руками: правило хорошее,
     * но не безупречное, а цена его ошибки — неверный совет на кухне.
     */
    const differ = RECIPES.filter((r) => suggestedPreparation(r) !== preparationOf(r))
    expect(differ.map((r) => r.id)).toEqual(['egg_avocado_snack'])
  })

  it('и не зовёт к партии никого, кроме подтверждённых', () => {
    /*
     * Аудит списка подтверждённых партий: если в базу добавят суп, правило
     * скажет, что ему партию стоит подтвердить, — и этот тест упадёт, а не
     * назначит её молча. Замер: расхождений в сторону «правило за партию, а
     * подтверждения нет» — ноль.
     *
     * В обратную сторону остаются два: оба хумуса. Их партию задаёт объём
     * блендера — 100 г нута он размажет по стенкам, — а в тексте шагов этого
     * нет и взяться ему неоткуда.
     */
    const unconfirmed = RECIPES.filter(
      (r) => looksBatchableRecipe(r) && !VERIFIED_BATCHES[r.id],
    )
    expect(unconfirmed.map((r) => r.id)).toEqual([])
    const unexplained = RECIPES.filter(
      (r) => !looksBatchableRecipe(r) && VERIFIED_BATCHES[r.id],
    )
    expect(unexplained.map((r) => r.id).sort()).toEqual(['beet_hummus', 'hummus_classic'])
  })

  it('признак «последний шаг начинается со слова Собрать» ловит сборку и только её', () => {
    /*
     * Тот самый признак из разбора, замеренный отдельно. Он есть у восьми блюд
     * из 78 и все восемь действительно собирают перед едой. Но сам по себе он
     * не отвечает на вопрос о количестве: под него попадают и боул с курицей,
     * у которого партия компонентов настоящая, и йогурт, у которого её нет.
     */
    const assembles = RECIPES.filter((r) =>
      /^соб(рать|ери)/i.test(r.steps[r.steps.length - 1]?.text ?? ''),
    )
    expect(assembles.length).toBe(8)
    for (const recipe of assembles) {
      expect(preparationOf(recipe), recipe.title).toBe('assembleBeforeEating')
    }
    // и обе политики количества среди них встречаются
    const policies = new Set(assembles.map((r) => batchPolicyOf(r.batch)))
    expect([...policies].sort()).toEqual(['exactForMenu', 'fixedBatch'])
  })
})

describe('запас впрок у блюда без партии', () => {
  it('либо сварен и заморожен, либо не обещан вовсе', () => {
    /*
     * `planAhead` выбирает блюдо впрок по `freezeCooked`. Если бы такой выбор
     * не доходил до размера готовки, обещание «в понедельник не готовим»
     * осталось бы невыполненным: сварено было бы ровно на стол этой недели.
     */
    const recipe = RECIPE_BY_ID['chia_pudding']
    const withFreezer = planBatch(recipe, {
      neededGrams: 570,
      aheadGrams: 285,
      hasFreezer: true,
      freezerRoomGrams: 4000,
    })!
    // чиа-пудинг не морозят — запаса и не обещаем
    expect(recipe.batch?.freezeCooked).toBe(false)
    expect(withFreezer.chosen.yieldGrams).toBe(570)
    expect(withFreezer.chosen.unplacedGrams).toBe(0)
    expect(withFreezer.chosen.aheadShortGrams).toBe(0)
  })
})
