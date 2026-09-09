import type { Household, MealSlot, Recipe } from '../types'
import { allRecipes } from '../data/recipeRegistry'
import { isRecipeAllowed } from './menu'
import { recipeIcon } from '../components/icons'
import { recipeStats } from './nutrition'

/**
 * Колода блюд для быстрой примерки вкусов.
 *
 * Приложение узнаёт вкусы поздно: только когда человек отверг что-то в уже
 * собранном меню. Первая неделя выходит вслепую, и именно она решает, останется
 * ли человек. Колода спрашивает заранее — пролистал два десятка карточек и
 * получил меню, собранное под себя.
 *
 * Оценки здесь не декоративные: подбор считает их с измеренным весом
 * (`ratingScore` в lib/menu), «нравится» поднимает блюдо, «не нравится»
 * опускает. Поэтому важно, чтобы в колоду попадало то, что подбор и правда
 * может выбрать, — иначе свайпы уходят в пустоту.
 */

/** Сколько карточек показываем по умолчанию. */
export const DECK_SIZE = 24

/**
 * Разнообразие важнее популярности.
 *
 * Двадцать четыре карточки из одного угла базы — двадцать четыре ответа на один
 * и тот же вопрос. Колода раскладывается по видам блюд (суп, выпечка, рыба,
 * мясо…) и по приёмам пищи: так каждый свайп говорит что-то новое, а не
 * повторяет предыдущий.
 */
function groupKey(recipe: Recipe): string {
  const slot: MealSlot = recipe.slots[0] ?? 'dinner'
  return `${slot}:${recipeIcon(recipe)}`
}

/** Тот же генератор, что и в подборе меню: одна анкета — одна колода. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DeckOptions {
  /** Сколько карточек. */
  size?: number
  /** Зерно: одна и та же анкета даёт одну и ту же колоду. */
  seed?: number
  /** Чью колоду собираем: уже оценённое этим человеком не показываем снова. */
  eaterId?: string
  /** Свой список блюд — для проверок. */
  recipes?: Recipe[]
}

/**
 * Колода для примерки вкусов.
 *
 * Из неё выброшено то, чего человеку нельзя (аллергии, приборы, скрытые блюда),
 * и то, что он уже оценил: спрашивать дважды об одном — терять его время.
 */
export function tastingDeck(household: Household, options: DeckOptions = {}): Recipe[] {
  const size = options.size ?? DECK_SIZE
  const random = mulberry32(options.seed ?? 1)
  const eater = options.eaterId
    ? household.eaters.find((e) => e.id === options.eaterId)
    : undefined

  const pool = (options.recipes ?? allRecipes())
    .filter((recipe) => isRecipeAllowed(recipe, household))
    // уже оценённое этим человеком не показываем: ответ у нас есть
    .filter((recipe) => !eater || eater.ratings?.[recipe.id] === undefined)
    // блюдо без состава оценивать нечего, а на карточке оно выйдет пустым
    .filter((recipe) => recipe.items.length > 0 && recipeStats(recipe).kcal > 0)

  // раскладываем по видам, каждый вид перемешиваем своим порядком
  const groups = new Map<string, Recipe[]>()
  for (const recipe of pool) {
    const key = groupKey(recipe)
    const list = groups.get(key) ?? []
    list.push(recipe)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
  }

  /*
   * Берём по кругу: сначала по одному из каждого вида, потом по второму. Так
   * первые карточки покрывают всю базу, и даже брошенная на половине колода
   * успевает сказать о вкусах больше, чем полная из одного угла.
   */
  const order = [...groups.keys()].sort(() => random() - 0.5)
  const deck: Recipe[] = []
  for (let round = 0; deck.length < size; round += 1) {
    let added = 0
    for (const key of order) {
      const list = groups.get(key)!
      if (round >= list.length) continue
      deck.push(list[round])
      added += 1
      if (deck.length >= size) break
    }
    if (added === 0) break
  }
  return deck
}

/** Что человек сказал о блюде. */
export type Verdict = 'like' | 'dislike' | 'ban' | 'skip'

export interface TasteResult {
  recipeId: string
  verdict: Verdict
}

/**
 * Применить решения к анкете.
 *
 * Три исхода дают три разных результата, и это не оттенки одного: «нравится» и
 * «не нравится» двигают подбор, «больше не показывать» убирает блюдо совсем.
 * Пропуск не значит ничего — и не должен: молчание не мнение.
 */
export function applyTastes(household: Household, eaterId: string, results: TasteResult[]): Household {
  const eaters = household.eaters.map((eater) => {
    if (eater.id !== eaterId) return eater
    const ratings = { ...eater.ratings }
    const banned = new Set(eater.bannedRecipes)
    for (const { recipeId, verdict } of results) {
      if (verdict === 'like') ratings[recipeId] = 1
      else if (verdict === 'dislike') ratings[recipeId] = -1
      else if (verdict === 'ban') {
        banned.add(recipeId)
        delete ratings[recipeId]
      }
    }
    return { ...eater, ratings, bannedRecipes: [...banned] }
  })
  return { ...household, eaters }
}
