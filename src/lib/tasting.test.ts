import { describe, expect, it } from 'vitest'
import { DECK_SIZE, applyTastes, tastingDeck } from './tasting'
import { recipeIcon } from '../components/icons'
import { defaultHousehold, newEater } from '../store'
import { buildWeekMenu } from './menu'
import type { Household } from '../types'
import { RECIPES } from '../data/recipes'

function family(extra: Partial<Household> = {}): Household {
  return { ...defaultHousehold(), ...extra }
}

describe('колода для примерки вкусов', () => {
  it('набирается полностью и без повторов', () => {
    const deck = tastingDeck(family())
    expect(deck).toHaveLength(DECK_SIZE)
    expect(new Set(deck.map((r) => r.id)).size).toBe(DECK_SIZE)
  })

  it('одна анкета — одна колода, разные зёрна — разные', () => {
    const a = tastingDeck(family(), { seed: 7 })
    const b = tastingDeck(family(), { seed: 7 })
    const c = tastingDeck(family(), { seed: 8 })
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id))
    expect(a.map((r) => r.id)).not.toEqual(c.map((r) => r.id))
  })

  it('покрывает разные виды блюд, а не один угол базы', () => {
    /*
     * Двадцать четыре карточки из одного угла — двадцать четыре ответа на один
     * и тот же вопрос. Ради этого колода и раскладывается по видам.
     */
    const deck = tastingDeck(family())
    const kinds = new Set(deck.map(recipeIcon))
    expect(kinds.size).toBeGreaterThanOrEqual(6)
  })

  it('и первая половина колоды тоже покрывает', () => {
    // колоду бросают на середине, и брошенная должна успеть сказать о вкусах
    const half = tastingDeck(family()).slice(0, DECK_SIZE / 2)
    expect(new Set(half.map(recipeIcon)).size).toBeGreaterThanOrEqual(5)
  })

  it('не показывает того, чего человеку нельзя', () => {
    const nuts = family({ eaters: [newEater({ id: 'e1', allergies: ['nuts'] })] })
    const deck = tastingDeck(nuts)
    expect(deck.length).toBeGreaterThan(0)
    for (const recipe of deck) {
      const ids = recipe.items.map((i) => i.ingredientId)
      expect(ids, recipe.title).not.toContain('walnuts')
      expect(ids, recipe.title).not.toContain('almonds')
    }
  })

  it('кунжут исключается — он прячется в хумусе и посыпках', () => {
    /*
     * Кунжут — один из основных регулируемых аллергенов и в ЕС, и в США, а до
     * недавнего времени исключить его в приложении было нечем: продукт в базе
     * есть, а аллергена не было вовсе.
     */
    const withAllergy = family({ eaters: [newEater({ id: 'e1', allergies: ['sesame'] })] })
    const deck = tastingDeck(withAllergy, { size: 200, recipes: RECIPES })
    for (const recipe of deck) {
      expect(
        recipe.items.map((i) => i.ingredientId),
        recipe.title,
      ).not.toContain('sesame')
    }
    // и без аллергии кунжутные блюда никуда не деваются
    const all = tastingDeck(family(), { size: 200, recipes: RECIPES })
    expect(all.some((r) => r.items.some((i) => i.ingredientId === 'sesame'))).toBe(true)
  })

  it('арахис — отдельная аллергия, и это не описка в базе', () => {
    /*
     * Выглядит как дыра, но верно: арахис бобовое, и аллергия на него — не то
     * же самое, что на орехи. Многие с одной спокойно едят другое. Поэтому
     * «орехи» не убирают арахисовую пасту, а «арахис» — убирает.
     */
    const treeNuts = family({ eaters: [newEater({ id: 'e1', allergies: ['nuts'] })] })
    const peanut = family({ eaters: [newEater({ id: 'e2', allergies: ['peanut'] })] })
    const hasPeanut = (h: Household) =>
      tastingDeck(h, { size: 200, recipes: RECIPES }).some((r) =>
        r.items.some((i) => i.ingredientId === 'peanut_butter'),
      )
    expect(hasPeanut(treeNuts)).toBe(true)
    expect(hasPeanut(peanut)).toBe(false)
  })

  it('не спрашивает дважды об одном и том же', () => {
    const first = tastingDeck(family(), { seed: 3 })
    const rated = Object.fromEntries(first.map((r) => [r.id, 1 as const]))
    const after = family({ eaters: [newEater({ id: 'e1', ratings: rated })] })
    const second = tastingDeck(after, { seed: 3, eaterId: 'e1' })
    const known = new Set(first.map((r) => r.id))
    expect(second.some((r) => known.has(r.id))).toBe(false)
  })

  it('на исчерпанной базе отдаёт что осталось, а не зацикливается', () => {
    const deck = tastingDeck(family(), { recipes: RECIPES.slice(0, 5) })
    expect(deck.length).toBeLessThanOrEqual(5)
    expect(new Set(deck.map((r) => r.id)).size).toBe(deck.length)
  })

  it('и на пустой базе просто пуста', () => {
    expect(tastingDeck(family(), { recipes: [] })).toEqual([])
  })
})

describe('решения человека', () => {
  const base = family({ eaters: [newEater({ id: 'e1' })] })

  it('три исхода дают три разных результата', () => {
    const after = applyTastes(base, 'e1', [
      { recipeId: 'omlet', verdict: 'like' },
      { recipeId: 'borsch', verdict: 'dislike' },
      { recipeId: 'lentil_soup', verdict: 'ban' },
    ])
    const eater = after.eaters[0]
    expect(eater.ratings['omlet']).toBe(1)
    expect(eater.ratings['borsch']).toBe(-1)
    // «больше не показывать» убирает блюдо совсем, а не опускает его
    expect(eater.bannedRecipes).toContain('lentil_soup')
    expect(eater.ratings['lentil_soup']).toBeUndefined()
  })

  it('пропуск не значит ничего: молчание не мнение', () => {
    const after = applyTastes(base, 'e1', [{ recipeId: 'omlet', verdict: 'skip' }])
    expect(after.eaters[0].ratings).toEqual({})
    expect(after.eaters[0].bannedRecipes).toEqual([])
  })

  it('трогает только своего едока', () => {
    const two = family({ eaters: [newEater({ id: 'e1' }), newEater({ id: 'e2' })] })
    const after = applyTastes(two, 'e1', [{ recipeId: 'omlet', verdict: 'like' }])
    expect(after.eaters[1].ratings).toEqual({})
  })

  /*
   * Ради этого всё и затевалось. Если бы оценки никуда не шли, карточки были бы
   * красивым театром — и заметить это было бы нечем: меню и так каждую неделю
   * разное.
   *
   * Замер на тридцати неделях, доля записей меню:
   *   понравившиеся   4.4% → 18.3%   (вчетверо чаще)
   *   отвергнутые    16.5% →  7.6%   (вдвое реже)
   * Пороги ниже взяты с запасом от этих чисел.
   */
  it('свайпы правда меняют меню, а не только анкету', () => {
    const family = { ...base, weekStart: '2026-09-07' }
    const deck = tastingDeck(family, { seed: 11, eaterId: 'e1' })
    const liked = deck.slice(0, 8)
    const disliked = deck.slice(8, 16)
    const after = applyTastes(family, 'e1', [
      ...liked.map((r) => ({ recipeId: r.id, verdict: 'like' as const })),
      ...disliked.map((r) => ({ recipeId: r.id, verdict: 'dislike' as const })),
    ])

    const share = (household: Household, ids: Set<string>) => {
      let hits = 0
      let total = 0
      for (let seed = 1; seed <= 30; seed += 1) {
        const { menu } = buildWeekMenu(household, seed, [], { freezer: [], today: '2026-09-07' })
        for (const entry of menu.entries) {
          total += 1
          if (ids.has(entry.recipeId)) hits += 1
        }
      }
      return (hits / total) * 100
    }
    const likedIds = new Set(liked.map((r) => r.id))
    const dislikedIds = new Set(disliked.map((r) => r.id))

    expect(share(after, likedIds)).toBeGreaterThan(share(family, likedIds) * 2)
    expect(share(after, dislikedIds)).toBeLessThan(share(family, dislikedIds) * 0.75)
  })
})
