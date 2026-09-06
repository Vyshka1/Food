import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Eater, Household, WeekMenu } from './types'
import { buildWeekMenu, replaceEntry } from './lib/menu'

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
}

const emptyState: AppState = { household: null, menu: null, atHome: [], bought: [], warnings: [] }

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
  swapDish: (entryId: string) => void
  toggleAtHome: (ingredientId: string) => void
  toggleBought: (ingredientId: string) => void
  banRecipe: (eaterId: string, recipeId: string) => void
  reset: () => void
}

const StoreContext = createContext<Store | null>(null)

function load(): AppState {
  if (typeof localStorage === 'undefined') return emptyState
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw) as Partial<AppState>
    return { ...emptyState, ...parsed }
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

  const generateFor = useCallback((household: Household, seed: number): AppState => {
    const { menu, warnings } = buildWeekMenu(household, seed)
    return { household, menu, atHome: [], bought: [], warnings }
  }, [])

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

  const regenerate = useCallback(
    (seed?: number) => {
      setState((prev) => {
        if (!prev.household) return prev
        return {
          ...prev,
          ...generateFor(prev.household, seed ?? Math.floor(Math.random() * 1e9)),
          atHome: prev.atHome,
          bought: [],
        }
      })
    },
    [generateFor],
  )

  const swapDish = useCallback((entryId: string) => {
    setState((prev) => {
      if (!prev.household || !prev.menu) return prev
      const menu: WeekMenu = replaceEntry(
        prev.menu,
        prev.household,
        entryId,
        Math.floor(Math.random() * 1e9),
      )
      return { ...prev, menu }
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

  const reset = useCallback(() => {
    setState(emptyState)
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
      toggleAtHome,
      toggleBought,
      banRecipe,
      reset,
    }),
    [state, saveHousehold, regenerate, swapDish, toggleAtHome, toggleBought, banRecipe, reset],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore вне StoreProvider')
  return store
}
