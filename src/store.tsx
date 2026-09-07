import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Eater, EntryStatus, Household, MealSlot, Recipe, WeekMenu, WeekRecord } from './types'
import { awayKey, buildWeekMenu, replaceEntryWith } from './lib/menu'
import { setCustomRecipes } from './data/recipeRegistry'
import { decodeProfile } from './lib/transfer'

const STORAGE_KEY = 'menu-nedelya.v1'
/** Ключ до переименования проекта: читаем один раз, чтобы не потерять анкету. */
const LEGACY_STORAGE_KEY = 'ufff.food.v1'

export interface AppState {
  household: Household | null
  menu: WeekMenu | null
  /** Ингредиенты, которые уже есть дома — не считаем в сумму покупок. */
  atHome: string[]
  bought: string[]
  warnings: string[]
  /** Рецепты, добавленные вручную. */
  customRecipes: Recipe[]
  /** Прошлые недели: удачную можно повторить, не собирая заново. */
  history: WeekRecord[]
}

const emptyState: AppState = {
  household: null,
  menu: null,
  atHome: [],
  bought: [],
  warnings: [],
  customRecipes: [],
  history: [],
}

export function mondayOf(date = new Date()): string {
  const d = new Date(date)
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function newEater(partial: Partial<Eater> = {}): Eater {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: 'Взрослый',
    sex: 'female',
    age: 30,
    heightCm: 168,
    weightKg: 62,
    activity: 'light',
    goal: 'keep',
    allergies: [],
    customAllergens: [],
    dislikes: [],
    bannedRecipes: [],
    awayMeals: [],
    ratings: {},
    ...partial,
  }
}

export function defaultHousehold(): Household {
  return {
    eaters: [newEater({ name: 'Я' })],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, hasOven: true, hasBlender: true, containers: 8, hasFreezer: true },
    budgetPerWeek: 0,
    weekStart: mondayOf(),
  }
}

interface Store extends AppState {
  saveHousehold: (household: Household) => void
  regenerate: (seed?: number) => void
  swapDish: (entryId: string, recipeId: string) => void
  togglePin: (entryId: string) => void
  toggleAway: (eaterId: string, day: number, slot: MealSlot) => void
  setEntryStatus: (entryId: string, status: EntryStatus | null) => void
  rateRecipe: (eaterId: string, recipeId: string, value: 1 | -1 | 0) => void
  archiveWeek: () => void
  repeatWeek: (recordId: string) => void
  removeWeek: (recordId: string) => void
  toggleAtHome: (ingredientId: string) => void
  toggleBought: (ingredientId: string) => void
  banRecipe: (eaterId: string, recipeId: string) => void
  unbanRecipe: (recipeId: string) => void
  importProfile: (input: string) => boolean
  saveCustomRecipe: (recipe: Recipe) => void
  deleteCustomRecipe: (recipeId: string) => void
  reset: () => void
}

const StoreContext = createContext<Store | null>(null)

/** Сколько недель храним: localStorage не резиновый, а меню весит немало. */
const MAX_HISTORY = 12

function makeRecord(menu: WeekMenu): WeekRecord {
  const count = (status: string) => menu.entries.filter((e) => e.status === status).length
  return {
    id: `${menu.weekStart}-${menu.seed}`,
    weekStart: menu.weekStart,
    savedAt: new Date().toISOString(),
    menu,
    cooked: count('cooked'),
    eaten: count('eaten'),
    skipped: count('skipped'),
    total: menu.entries.length,
  }
}

function load(): AppState {
  if (typeof localStorage === 'undefined') return emptyState
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw) as Partial<AppState>
    const state = { ...emptyState, ...parsed }
    // анкеты, сохранённые до появления «ест не дома», читаем как «ест всё дома»
    if (state.household) {
      state.household = {
        ...state.household,
        eaters: state.household.eaters.map((e) => ({
          ...e,
          awayMeals: e.awayMeals ?? [],
          ratings: e.ratings ?? {},
        })),
      }
    }
    // реестр должен знать о своих рецептах до первой сборки меню
    setCustomRecipes(state.customRecipes)
    // меню, собранные до появления личных порций, пересобираем на том же seed
    const outdated = state.menu?.entries.some((e) => !Array.isArray(e.portions))
    if (state.household && state.menu && outdated) {
      const { menu, warnings } = buildWeekMenu(state.household, state.menu.seed)
      return { ...state, menu, warnings }
    }
    // наступила новая неделя: прошлую убираем в историю вместе с отметками
    // «приготовлено / съедено», а не затираем молча
    const monday = mondayOf()
    if (state.household && state.menu && state.menu.weekStart !== monday) {
      const household = { ...state.household, weekStart: monday }
      const { menu, warnings } = buildWeekMenu(household, Math.floor(Math.random() * 1e9))
      const history = [makeRecord(state.menu), ...state.history]
        .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
        .slice(0, MAX_HISTORY)
      return { ...state, household, menu, warnings, history, bought: [] }
    }
    return state
  } catch {
    return emptyState
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // приватный режим — просто работаем без сохранения
    }
  }, [state])

  const saveHousehold = useCallback(
    (household: Household) => {
      setState((prev) => {
        const seed = prev.menu?.seed ?? Math.floor(Math.random() * 1e9)
        const { menu, warnings } = buildWeekMenu(household, seed)
        return { ...prev, household, menu, warnings }
      })
    },
    [],
  )

  /** Пересборка недели: закреплённые блюда переживают её без изменений. */
  const regenerate = useCallback((seed?: number) => {
    setState((prev) => {
      if (!prev.household) return prev
      const keep = prev.menu?.entries.filter((e) => e.pinned) ?? []
      const { menu, warnings } = buildWeekMenu(
        prev.household,
        seed ?? Math.floor(Math.random() * 1e9),
        keep,
      )
      return { ...prev, menu, warnings, atHome: prev.atHome, bought: [] }
    })
  }, [])

  const swapDish = useCallback((entryId: string, recipeId: string) => {
    setState((prev) => {
      if (!prev.household || !prev.menu) return prev
      const menu: WeekMenu = replaceEntryWith(prev.menu, prev.household, entryId, recipeId)
      return { ...prev, menu }
    })
  }, [])

  /** «Оставить это блюдо» — чтобы одна неудачная пересборка не унесла удачное. */
  const togglePin = useCallback((entryId: string) => {
    setState((prev) => {
      if (!prev.menu) return prev
      return {
        ...prev,
        menu: {
          ...prev.menu,
          entries: prev.menu.entries.map((e) =>
            e.id === entryId ? { ...e, pinned: !e.pinned } : e,
          ),
        },
      }
    })
  }, [])

  /**
   * «Кирилл обедает в офисе»: меню пересобирается, потому что меняются и
   * порции, и состав закупки.
   */
  const toggleAway = useCallback((eaterId: string, day: number, slot: MealSlot) => {
    setState((prev) => {
      if (!prev.household) return prev
      const key = awayKey(day, slot)
      const household: Household = {
        ...prev.household,
        eaters: prev.household.eaters.map((e) =>
          e.id === eaterId
            ? {
                ...e,
                awayMeals: e.awayMeals.includes(key)
                  ? e.awayMeals.filter((k) => k !== key)
                  : [...e.awayMeals, key],
              }
            : e,
        ),
      }
      const seed = prev.menu?.seed ?? Math.floor(Math.random() * 1e9)
      const keep = prev.menu?.entries.filter((e) => e.pinned) ?? []
      const { menu, warnings } = buildWeekMenu(household, seed, keep)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /** План и факт: «приготовлено», «съедено», «пропущено» или снять отметку. */
  const setEntryStatus = useCallback((entryId: string, status: EntryStatus | null) => {
    setState((prev) => {
      if (!prev.menu) return prev
      return {
        ...prev,
        menu: {
          ...prev.menu,
          entries: prev.menu.entries.map((e) =>
            e.id === entryId ? { ...e, status: status ?? undefined } : e,
          ),
        },
      }
    })
  }, [])

  /**
   * Оценка блюда конкретным едоком. 0 снимает оценку. Меню не пересобираем:
   * оценка должна влиять на следующий подбор, а не переставлять тарелки
   * прямо сейчас.
   */
  const rateRecipe = useCallback((eaterId: string, recipeId: string, value: 1 | -1 | 0) => {
    setState((prev) => {
      if (!prev.household) return prev
      return {
        ...prev,
        household: {
          ...prev.household,
          eaters: prev.household.eaters.map((e) => {
            if (e.id !== eaterId) return e
            const ratings = { ...e.ratings }
            if (value === 0) delete ratings[recipeId]
            else ratings[recipeId] = value
            return { ...e, ratings }
          }),
        },
      }
    })
  }, [])

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const toggleAtHome = useCallback((ingredientId: string) => {
    setState((prev) => ({ ...prev, atHome: toggle(prev.atHome, ingredientId) }))
  }, [])

  const toggleBought = useCallback((ingredientId: string) => {
    setState((prev) => ({ ...prev, bought: toggle(prev.bought, ingredientId) }))
  }, [])

  const banRecipe = useCallback((eaterId: string, recipeId: string) => {
    setState((prev) => {
      if (!prev.household || !prev.menu) return prev
      const household: Household = {
        ...prev.household,
        eaters: prev.household.eaters.map((e) =>
          e.id === eaterId ? { ...e, bannedRecipes: [...new Set([...e.bannedRecipes, recipeId])] } : e,
        ),
      }
      const { menu, warnings } = buildWeekMenu(household, prev.menu.seed)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /** Вернуть скрытое блюдо всем едокам сразу. */
  const unbanRecipe = useCallback((recipeId: string) => {
    setState((prev) => {
      if (!prev.household || !prev.menu) return prev
      const household: Household = {
        ...prev.household,
        eaters: prev.household.eaters.map((e) => ({
          ...e,
          bannedRecipes: e.bannedRecipes.filter((id) => id !== recipeId),
        })),
      }
      const { menu, warnings } = buildWeekMenu(household, prev.menu.seed)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /** Профиль из ссылки или кода: анкета и свои рецепты, меню собирается заново. */
  const importProfile = useCallback((input: string): boolean => {
    const payload = decodeProfile(input)
    if (!payload) return false
    setCustomRecipes(payload.customRecipes)
    const { menu, warnings } = buildWeekMenu(payload.household, Math.floor(Math.random() * 1e9))
    setState((prev) => ({
      ...prev,
      household: payload.household,
      customRecipes: payload.customRecipes,
      menu,
      warnings,
      atHome: [],
      bought: [],
    }))
    return true
  }, [])

  /** Свой рецепт меняет пул блюд, поэтому меню пересобирается на том же seed. */
  const saveCustomRecipe = useCallback((recipe: Recipe) => {
    setState((prev) => {
      const exists = prev.customRecipes.some((r) => r.id === recipe.id)
      const customRecipes = exists
        ? prev.customRecipes.map((r) => (r.id === recipe.id ? recipe : r))
        : [...prev.customRecipes, recipe]
      setCustomRecipes(customRecipes)
      if (!prev.household || !prev.menu) return { ...prev, customRecipes }
      const { menu, warnings } = buildWeekMenu(prev.household, prev.menu.seed)
      return { ...prev, customRecipes, menu, warnings }
    })
  }, [])

  const deleteCustomRecipe = useCallback((recipeId: string) => {
    setState((prev) => {
      const customRecipes = prev.customRecipes.filter((r) => r.id !== recipeId)
      setCustomRecipes(customRecipes)
      if (!prev.household || !prev.menu) return { ...prev, customRecipes }
      const { menu, warnings } = buildWeekMenu(prev.household, prev.menu.seed)
      return { ...prev, customRecipes, menu, warnings }
    })
  }, [])

  /** Сохранить текущую неделю в историю — до того, как её пересоберут. */
  const archiveWeek = useCallback(() => {
    setState((prev) => {
      if (!prev.menu || prev.menu.entries.length === 0) return prev
      return { ...prev, history: [makeRecord(prev.menu), ...prev.history].slice(0, MAX_HISTORY) }
    })
  }, [])

  /**
   * Повторить неделю: переносим блюда на текущую неделю, но пересчитываем
   * порции и хранение — состав семьи и дни готовки могли измениться.
   */
  const repeatWeek = useCallback((recordId: string) => {
    setState((prev) => {
      const record = prev.history.find((r) => r.id === recordId)
      if (!record || !prev.household) return prev
      const kept = record.menu.entries.map((e) => ({ ...e, pinned: true, status: undefined }))
      const { menu, warnings } = buildWeekMenu(prev.household, record.menu.seed, kept)
      return {
        ...prev,
        menu: { ...menu, weekStart: prev.household.weekStart },
        warnings,
        bought: [],
      }
    })
  }, [])

  const removeWeek = useCallback((recordId: string) => {
    setState((prev) => ({ ...prev, history: prev.history.filter((r) => r.id !== recordId) }))
  }, [])

  const reset = useCallback(() => {
    setState(emptyState)
    setCustomRecipes([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<Store>(
    () => ({
      ...state,
      saveHousehold,
      regenerate,
      swapDish,
      togglePin,
      toggleAway,
      setEntryStatus,
      rateRecipe,
      archiveWeek,
      repeatWeek,
      removeWeek,
      toggleAtHome,
      toggleBought,
      banRecipe,
      unbanRecipe,
      importProfile,
      saveCustomRecipe,
      deleteCustomRecipe,
      reset,
    }),
    [
      state,
      saveHousehold,
      regenerate,
      swapDish,
      togglePin,
      toggleAway,
      setEntryStatus,
      rateRecipe,
      archiveWeek,
      repeatWeek,
      removeWeek,
      toggleAtHome,
      toggleBought,
      banRecipe,
      unbanRecipe,
      importProfile,
      saveCustomRecipe,
      deleteCustomRecipe,
      reset,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore вне StoreProvider')
  return store
}
