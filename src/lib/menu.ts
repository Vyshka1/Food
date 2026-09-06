import { INGREDIENT_BY_ID } from '../data/ingredients'
import { allRecipes, recipeById } from '../data/recipeRegistry'
import type {
  Allergen,
  Eater,
  Household,
  MenuEntry,
  Norms,
  Recipe,
  Storage,
  WeekMenu,
} from '../types'
import { dailyNorm, recipeStats, slotShares, sumNorms } from './nutrition'
import { mulberry32 } from './random'

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const WEEKDAYS_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

export interface CookingSegment {
  cookDay: number
  days: number[]
  /** День готовки не выбран пользователем, добавлен автоматически. */
  implicit?: boolean
}

/** Разбивает неделю на отрезки: каждый день готовки кормит дни до следующей готовки. */
export function cookingSegments(cookingDays: number[]): CookingSegment[] {
  const days = [...new Set(cookingDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (days.length === 0) return [{ cookDay: 0, days: [0, 1, 2, 3, 4, 5, 6], implicit: true }]

  const segments: CookingSegment[] = []
  if (days[0] > 0) {
    // до первого дня готовки тоже нужно чем-то питаться
    segments.push({
      cookDay: 0,
      days: Array.from({ length: days[0] }, (_, i) => i),
      implicit: true,
    })
  }
  days.forEach((cookDay, i) => {
    const end = i + 1 < days.length ? days[i + 1] - 1 : 6
    segments.push({
      cookDay,
      days: Array.from({ length: end - cookDay + 1 }, (_, k) => cookDay + k),
    })
  })
  return segments
}

export function householdNorms(household: Household): Norms {
  return sumNorms(household.eaters.map(dailyNorm))
}

/** Целевая калорийность одного приёма пищи в среднем на едока. */
export function slotTargets(household: Household): Record<string, number> {
  const shares = slotShares(household.meals)
  const eaters = household.eaters.length || 1
  const perEater = householdNorms(household).kcal / eaters
  return Object.fromEntries(household.meals.map((m) => [m, Math.round(perEater * shares[m])]))
}

function recipeAllergens(recipe: Recipe): Set<Allergen> {
  const set = new Set<Allergen>()
  for (const item of recipe.items) {
    for (const a of INGREDIENT_BY_ID[item.ingredientId]?.allergens ?? []) set.add(a)
  }
  return set
}

/** Сколько «не люблю» задевает рецепт для конкретного едока. */
export function dislikeHits(recipe: Recipe, eater: Eater): string[] {
  const hits = new Set<string>()
  for (const dislike of eater.dislikes) {
    const key = dislike.toLowerCase().trim()
    if (!key) continue
    if (recipe.tags.includes(key)) hits.add(dislike)
    for (const item of recipe.items) {
      const ing = INGREDIENT_BY_ID[item.ingredientId]
      if (!ing) continue
      if (ing.tags.includes(key) || ing.name.toLowerCase().includes(key)) hits.add(dislike)
    }
    if (recipe.title.toLowerCase().includes(key)) hits.add(dislike)
  }
  return [...hits]
}

/** Содержит ли рецепт продукт, попадающий под свой аллерген (по названию/тегу). */
function hasCustomAllergen(recipe: Recipe, custom: string[]): boolean {
  for (const raw of custom) {
    const key = raw.toLowerCase().trim()
    if (!key) continue
    for (const item of recipe.items) {
      const ing = INGREDIENT_BY_ID[item.ingredientId]
      if (!ing) continue
      if (ing.name.toLowerCase().includes(key) || ing.tags.includes(key)) return true
    }
    if (recipe.title.toLowerCase().includes(key)) return true
  }
  return false
}

/** Аллергии исключаем строго; кухня без духовки/блендера тоже режет рецепты. */
export function isRecipeAllowed(recipe: Recipe, household: Household): boolean {
  const allergies = new Set<Allergen>(household.eaters.flatMap((e) => e.allergies))
  for (const a of recipeAllergens(recipe)) if (allergies.has(a)) return false
  const custom = household.eaters.flatMap((e) => e.customAllergens)
  if (hasCustomAllergen(recipe, custom)) return false
  if (household.eaters.some((e) => e.bannedRecipes.includes(recipe.id))) return false
  if (recipe.needs?.includes('oven') && !household.kitchen.hasOven) return false
  if (recipe.needs?.includes('blender') && !household.kitchen.hasBlender) return false
  return true
}

export function portionScale(recipe: Recipe, targetKcal: number): number {
  const perServing = recipeStats(recipe).kcal || 1
  return Math.min(1.75, Math.max(0.6, Math.round((targetKcal / perServing) * 20) / 20))
}

interface DayAcc {
  kcal: number
  fat: number
  protein: number
}

interface PickState {
  usedCount: Map<string, number>
  lastDay: Map<string, number>
  /** Что уже набрано в этот день предыдущими приёмами пищи. */
  day: Map<number, DayAcc>
}

function accOf(state: PickState, day: number): DayAcc {
  return state.day.get(day) ?? { kcal: 0, fat: 0, protein: 0 }
}

function addToDay(state: PickState, day: number, recipe: Recipe, scale: number): void {
  const stats = recipeStats(recipe)
  const acc = accOf(state, day)
  state.day.set(day, {
    kcal: acc.kcal + stats.kcal * scale,
    fat: acc.fat + stats.fat * scale,
    protein: acc.protein + stats.protein * scale,
  })
}

interface MacroShares {
  protein: number
  fat: number
  carbs: number
}

/** Доли белков/жиров/углеводов в калорийности. */
function macroShares(n: Norms): MacroShares {
  const total = n.protein * 4 + n.fat * 9 + n.carbs * 4 || 1
  return {
    protein: (n.protein * 4) / total,
    fat: (n.fat * 9) / total,
    carbs: (n.carbs * 4) / total,
  }
}

function scoreRecipe(
  recipe: Recipe,
  opts: {
    household: Household
    targetKcal: number
    targetMacros: MacroShares
    day: number
    state: PickState
    jitter: number
  },
): number {
  const { household, targetKcal, targetMacros, day, state, jitter } = opts
  const stats = recipeStats(recipe)
  const scale = portionScale(recipe, targetKcal)
  let score = 0

  // попадание в норму по калориям
  const achieved = stats.kcal * scale
  score += Math.abs(achieved - targetKcal) / 6
  // недобор хуже перебора: голодное меню не работает
  score += Math.max(0, (targetKcal - achieved) / targetKcal) * 200
  // за сильно скорректированный масштаб — штраф: лучше рецепт «в размер»
  score += Math.abs(1 - scale) * 25

  // баланс БЖУ считаем по всему дню: одно жирное блюдо компенсируем следующими
  const acc = accOf(state, day)
  const projectedKcal = acc.kcal + achieved
  const fatBudget = (projectedKcal * targetMacros.fat) / 9
  const proteinBudget = (projectedKcal * targetMacros.protein) / 4
  score += Math.max(0, acc.fat + stats.fat * scale - fatBudget) * 3
  score += Math.max(0, proteinBudget - (acc.protein + stats.protein * scale)) * 1.5

  // и немного — по самому блюду, чтобы не собирать день из крайностей
  const shares = macroShares(stats)
  score +=
    (Math.abs(shares.protein - targetMacros.protein) +
      Math.abs(shares.fat - targetMacros.fat) +
      Math.abs(shares.carbs - targetMacros.carbs)) *
    20

  // свои рецепты предпочитаем встроенным, но не любой ценой:
  // бонус не перебивает ни аллергии (жёсткий фильтр), ни сильный промах по калориям
  if (recipe.custom) score -= CUSTOM_RECIPE_BONUS

  // «не люблю» — мягкий, но очень заметный штраф
  for (const eater of household.eaters) score += dislikeHits(recipe, eater).length * 60

  // разнообразие
  score += (state.usedCount.get(recipe.id) ?? 0) * 45
  const last = state.lastDay.get(recipe.id)
  if (last !== undefined) score += Math.max(0, 4 - (day - last)) * 20

  // бюджет
  if (household.budgetPerWeek > 0) {
    const mealsPerWeek = household.meals.length * 7 * household.eaters.length
    const budgetPerServing = household.budgetPerWeek / Math.max(1, mealsPerWeek)
    score += Math.max(0, stats.price * scale - budgetPerServing) * 0.6
  }

  return score + jitter * 30
}

function storageFor(recipe: Recipe, ageDays: number, hasFreezer: boolean): Storage | null {
  if (ageDays <= 0) return 'fresh'
  if (ageDays <= recipe.fridgeDays) return 'fridge'
  if (recipe.freezable && hasFreezer) return 'freezer'
  return null
}

export interface MenuBuildResult {
  menu: WeekMenu
  warnings: string[]
}

/** Максимум дней подряд с одним и тем же блюдом в одном приёме пищи. */
const MAX_RUN = 2

/** Насколько кандидат может уступать лучшему, чтобы всё ещё попасть в жеребьёвку. */
const NEAR_SCORE_MARGIN = 50

/** Свои рецепты добавляют не просто так — при прочих равных они идут первыми. */
const CUSTOM_RECIPE_BONUS = 100

export function buildWeekMenu(household: Household, seed: number): MenuBuildResult {
  const rnd = mulberry32(seed)
  const warnings: string[] = []
  const segments = cookingSegments(household.cookingDays)
  const targets = slotTargets(household)
  const targetMacros = macroShares(householdNorms(household))
  const entries: MenuEntry[] = []
  const state: PickState = { usedCount: new Map(), lastDay: new Map(), day: new Map() }

  const implicit = segments.find((s) => s.implicit && household.cookingDays.length > 0)
  if (implicit) {
    warnings.push(
      `${WEEKDAYS_FULL[0]} не отмечен днём готовки — добавили короткую готовку, чтобы закрыть начало недели.`,
    )
  }

  const pool = allRecipes().filter((r) => isRecipeAllowed(r, household))
  const servings = Math.max(1, household.eaters.length)

  for (const slot of household.meals) {
    const slotPool = pool.filter((r) => r.slots.includes(slot))
    if (slotPool.length === 0) {
      warnings.push(`Для приёма «${slot}» не осталось подходящих рецептов — ослабьте ограничения.`)
      continue
    }
    for (const segment of segments) {
      let cursor = 0
      let guard = 0
      while (cursor < segment.days.length && guard++ < 50) {
        const day = segment.days[cursor]
        const target = targets[slot] ?? 500
        const ranked = slotPool
          .map((recipe) => ({
            recipe,
            score: scoreRecipe(recipe, {
              household,
              targetKcal: target,
              targetMacros,
              day,
              state,
              jitter: rnd(),
            }),
          }))
          .sort((a, b) => a.score - b.score)

        // среди почти одинаковых по качеству вариантов выбираем случайный:
        // иначе каждую неделю выпадают одни и те же «лучшие» блюда
        const near = ranked.filter((c) => c.score <= ranked[0].score + NEAR_SCORE_MARGIN)
        const best = near[Math.floor(rnd() * near.length)].recipe
        const scale = portionScale(best, target)
        let produced = 0
        for (let k = 0; k < MAX_RUN && cursor + k < segment.days.length; k++) {
          const eatDay = segment.days[cursor + k]
          const storage = storageFor(best, eatDay - segment.cookDay, household.kitchen.hasFreezer)
          if (!storage) break
          entries.push({
            id: `${slot}-${eatDay}-${best.id}`,
            recipeId: best.id,
            slot,
            day: eatDay,
            cookDay: segment.cookDay,
            servings,
            scale,
            storage,
          })
          produced++
        }
        if (produced === 0) {
          // блюдо не доживает до этого дня — берём следующее по рангу, готовое дольше
          const fallback = ranked.find(
            (c) =>
              storageFor(c.recipe, day - segment.cookDay, household.kitchen.hasFreezer) !== null,
          )
          if (!fallback) {
            warnings.push(
              `${WEEKDAYS_FULL[day]}: нет блюда, которое доживёт до этого дня. Добавьте день готовки или морозилку.`,
            )
            cursor++
            continue
          }
          const fbScale = portionScale(fallback.recipe, target)
          entries.push({
            id: `${slot}-${day}-${fallback.recipe.id}`,
            recipeId: fallback.recipe.id,
            slot,
            day,
            cookDay: segment.cookDay,
            servings,
            scale: fbScale,
            storage: storageFor(
              fallback.recipe,
              day - segment.cookDay,
              household.kitchen.hasFreezer,
            )!,
          })
          state.usedCount.set(
            fallback.recipe.id,
            (state.usedCount.get(fallback.recipe.id) ?? 0) + 1,
          )
          state.lastDay.set(fallback.recipe.id, day)
          addToDay(state, day, fallback.recipe, fbScale)
          cursor++
          continue
        }
        state.usedCount.set(best.id, (state.usedCount.get(best.id) ?? 0) + 1)
        state.lastDay.set(best.id, segment.days[cursor + produced - 1])
        for (let k = 0; k < produced; k++) addToDay(state, segment.days[cursor + k], best, scale)
        cursor += produced
      }
    }
  }

  entries.sort(
    (a, b) =>
      a.day - b.day || household.meals.indexOf(a.slot) - household.meals.indexOf(b.slot),
  )
  return { menu: { weekStart: household.weekStart, seed, entries }, warnings }
}

/** Заменяет одно блюдо в меню на следующее по рангу, сохраняя остальное. */
export function replaceEntry(
  menu: WeekMenu,
  household: Household,
  entryId: string,
  seed: number,
): WeekMenu {
  const entry = menu.entries.find((e) => e.id === entryId)
  if (!entry) return menu
  const targets = slotTargets(household)
  const target = targets[entry.slot] ?? 500
  const usedToday = new Set(menu.entries.filter((e) => e.day === entry.day).map((e) => e.recipeId))
  const rnd = mulberry32(seed)
  const state: PickState = { usedCount: new Map(), lastDay: new Map(), day: new Map() }
  for (const e of menu.entries) {
    if (e.id === entryId) continue
    state.usedCount.set(e.recipeId, (state.usedCount.get(e.recipeId) ?? 0) + 1)
    state.lastDay.set(e.recipeId, e.day)
  }

  const candidate = allRecipes().filter(
    (r) =>
      r.slots.includes(entry.slot) &&
      isRecipeAllowed(r, household) &&
      r.id !== entry.recipeId &&
      !usedToday.has(r.id) &&
      storageFor(r, entry.day - entry.cookDay, household.kitchen.hasFreezer) !== null,
  )
    .map((recipe) => ({
      recipe,
      score: scoreRecipe(recipe, {
        household,
        targetKcal: target,
        targetMacros: macroShares(householdNorms(household)),
        day: entry.day,
        state,
        jitter: rnd(),
      }),
    }))
    .sort((a, b) => a.score - b.score)[0]

  if (!candidate) return menu

  const replaced: MenuEntry = {
    ...entry,
    id: `${entry.slot}-${entry.day}-${candidate.recipe.id}`,
    recipeId: candidate.recipe.id,
    scale: portionScale(candidate.recipe, target),
    storage: storageFor(
      candidate.recipe,
      entry.day - entry.cookDay,
      household.kitchen.hasFreezer,
    )!,
  }
  return { ...menu, entries: menu.entries.map((e) => (e.id === entryId ? replaced : e)) }
}

export interface DayTotals extends Norms {
  price: number
}

/** Итоги дня по всей семье: порция × количество едоков. */
export function dayTotals(menu: WeekMenu, day: number): DayTotals {
  const acc: DayTotals = { kcal: 0, protein: 0, fat: 0, carbs: 0, price: 0 }
  for (const entry of menu.entries) {
    if (entry.day !== day) continue
    const recipe = recipeById(entry.recipeId)
    if (!recipe) continue
    const s = recipeStats(recipe)
    const factor = entry.scale * entry.servings
    acc.kcal += s.kcal * factor
    acc.protein += s.protein * factor
    acc.fat += s.fat * factor
    acc.carbs += s.carbs * factor
    acc.price += s.price * factor
  }
  return {
    kcal: Math.round(acc.kcal),
    protein: Math.round(acc.protein),
    fat: Math.round(acc.fat),
    carbs: Math.round(acc.carbs),
    price: Math.round(acc.price),
  }
}

export interface CookTask {
  key: string
  recipeId: string
  cookDay: number
  /** Суммарно порций за одну готовку. */
  servings: number
  scale: number
  eatDays: number[]
  freezerPortions: number
}

/** Группирует меню в задачи готовки: одно блюдо — одна готовка на все дни, которые оно закрывает. */
export function cookTasks(menu: WeekMenu): CookTask[] {
  const map = new Map<string, CookTask>()
  for (const entry of menu.entries) {
    const key = `${entry.recipeId}|${entry.cookDay}`
    const task = map.get(key)
    if (task) {
      task.servings += entry.servings
      task.eatDays.push(entry.day)
      if (entry.storage === 'freezer') task.freezerPortions += entry.servings
    } else {
      map.set(key, {
        key,
        recipeId: entry.recipeId,
        cookDay: entry.cookDay,
        servings: entry.servings,
        scale: entry.scale,
        eatDays: [entry.day],
        freezerPortions: entry.storage === 'freezer' ? entry.servings : 0,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.cookDay - b.cookDay)
}
