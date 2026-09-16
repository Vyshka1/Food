import { describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { anchorIngredient, baseScaleOf, batchInfoOf, looksBatchable, potBatchOf } from './batchInfo'
import { purchaseInfo } from './purchase'

describe('умолчание безопасно: партии нет, пока её не подтвердили', () => {
  it('выведенная партия всегда одна и та же — ровно потребность меню', () => {
    /*
     * Раньше здесь работало правило: якорный продукт задавал закладку по
     * упаковке, а если якоря не было — кастрюля в четыре доли. Оно назначало
     * партию 44 блюдам из 78 и пяти из них — зря.
     *
     * Теперь ответ один на всех: партии нет. Партия бывает только у блюд,
     * которые есть в data/verifiedBatches, и туда её кладут руками.
     */
    for (const recipe of RECIPES) {
      const batch = batchInfoOf(recipe)
      expect(batch.source, recipe.title).toBe('derived')
      expect(batch.reason, recipe.title).toBe('fresh')
      expect(batch.baseScale, recipe.title).toBe(1)
      expect(batch.scales, recipe.title).toEqual([1])
      expect(batch.minScale, recipe.title).toBe(1)
      expect(batch.freezeCooked, recipe.title).toBe(false)
      // и никаких выдуманных изделий: «8 голубцов» без проверки — выдумка
      expect(batch.yieldPieces, recipe.title).toBeUndefined()
    }
  })

  it('выход одной доли всё равно посчитан честно', () => {
    // «партии нет» не значит «неизвестно, сколько выйдет»: доля считается по
    // составу минус ужарка, и от неё пляшет весь расчёт готовки
    for (const recipe of RECIPES) {
      expect(batchInfoOf(recipe).yieldGrams, recipe.title).toBeGreaterThan(0)
    }
  })
})

describe('правило вывода осталось аудитом', () => {
  it('упаковка йогурта и кастрюля больше не доходят до закладки', () => {
    /*
     * Замер по каждому из пяти разобранных блюд: откуда бралась закладка.
     * Причины разные — и это важно, лечить их по отдельности было бы напрасно.
     *
     * Йогурт с гранолой якоря не имеет вовсе: пачка греческого йогурта 130 г
     * при 150 г на долю. Четыре доли он получал от кастрюли — карточка так и
     * писала, «меньше кастрюли готовить непрактично», над блюдом, которое
     * собирают в банку.
     *
     * У чиа-пудинга якорь был настоящий: литр овсяного молока на 180 г в долю.
     * Он ушёл вместе с порогом: вскрытый пакет живёт четыре дня и уходит в чай
     * и кашу, а готовку под себя подгонять заставляет только то, что портится
     * за сутки.
     */
    const yogurt = RECIPE_BY_ID['yogurt_granola']
    expect(baseScaleOf(yogurt, anchorIngredient(yogurt))).toBe(1)
    expect(potBatchOf(yogurt)).toBeGreaterThan(1)

    const chia = RECIPE_BY_ID['chia_pudding']
    expect(anchorIngredient(chia)).toBeUndefined()
    expect(baseScaleOf(chia, 'oat_milk')).toBe(5.5)

    for (const recipe of [yogurt, chia, RECIPE_BY_ID['buckwheat_egg']]) {
      expect(batchInfoOf(recipe).baseScale, recipe.title).toBe(1)
      expect(recipe.batch?.baseScale, recipe.title).toBe(1)
    }
  })

  it('якорем остаётся только то, что портится за сутки', () => {
    /*
     * Вскрытая пачка фарша — это сегодняшний ужин или морозилка, третьего нет,
     * и под неё размер готовки подгонять честно. Молоко, йогурт и сметана живут
     * четыре дня и расходятся по неделе. Порог стоял на семи днях, и правило
     * звало к партии овсянку на молоке и творог с ягодами.
     */
    for (const recipe of RECIPES) {
      const anchor = anchorIngredient(recipe)
      if (!anchor) continue
      const info = purchaseInfo(INGREDIENT_BY_ID[anchor])
      expect(info.openedFridgeDays, `${recipe.title}: ${anchor}`).toBeLessThanOrEqual(1)
    }
  })

  it('«доживает ли до второго дня» — нижнее условие любой партии', () => {
    // треска с картофелем печётся в форме, но живёт два дня: партии у неё быть
    // не может, сколько ни пеки
    expect(looksBatchable(RECIPE_BY_ID['cod_potato_oven'])).toBe(false)
    expect(looksBatchable(RECIPE_BY_ID['salmon_broccoli'])).toBe(false)
    expect(looksBatchable(RECIPE_BY_ID['lentil_soup'])).toBe(true)
    expect(looksBatchable(RECIPE_BY_ID['oat_apple_bake'])).toBe(true)
  })

  it('форма ограничивает сильнее кастрюли — и это видно в подсказке размера', () => {
    /*
     * Овсяная запеканка получала ×6.75 — три килограмма теста, потому что
     * овсяное молоко продаётся литром. В форму столько не входит, и подсказка
     * аудита это по-прежнему знает, хотя партию больше не назначает.
     */
    expect(potBatchOf(RECIPE_BY_ID['oat_apple_bake'])).toBeLessThanOrEqual(3.5)
    expect(potBatchOf(RECIPE_BY_ID['lentil_soup'])).toBe(4)
  })
})
