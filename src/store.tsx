import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  DailyExtra,
  Eater,
  EntryStatus,
  Household,
  DrinkHabit,
  Kitchen,
  MealPlace,
  MealSlot,
  MenuEntry,
  MenuGoal,
  OilChoice,
  CookEvent,
  Pantry,
  RepeatRules,
  Recipe,
  WeekMenu,
  WeekRecord,
} from './types'
import {
  buildWeekMenu,
  cookTaskId,
  defaultRepeats,
  replaceEntryWith,
  totalPortions,
} from './lib/menu'
import type { BuildOptions } from './lib/menu'
import { defaultOils } from './lib/oil'
import { emptyPantry, storePurchase, takeFreezer } from './lib/pantry'
import {
  completeCookTask as completeFact,
  undoCookTask as undoFact,
} from './lib/cookFact'
import { buildShoppingList } from './lib/shopping'
import {
  ATTENDANCE_TEMPLATES,
  copyDayToWorkdays,
  mealKey,
  mealPlaceOf,
  nextPlace,
} from './lib/attendance'
import { setCustomRecipes, setOilChoice } from './data/recipeRegistry'
import { decodeProfile } from './lib/transfer'

/** Сегодняшняя дата одной строкой: одно место вместо пяти одинаковых выражений. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const STORAGE_KEY = 'menu-nedelya.v1'
/** Ключ до переименования проекта: читаем один раз, чтобы не потерять анкету. */
const LEGACY_STORAGE_KEY = 'ufff.food.v1'

export interface AppState {
  household: Household | null
  menu: WeekMenu | null
  /** Ингредиенты, которые уже есть дома — не считаем в сумму покупок. */
  atHome: string[]
  /** Что есть дома: постоянные продукты, запасы и морозилка. */
  pantry: Pantry
  /** Дублировать ли напоминания системными уведомлениями. */
  notifications: boolean
  bought: string[]
  warnings: string[]
  /** Рецепты, добавленные вручную. */
  customRecipes: Recipe[]
  /** Прошлые недели: удачную можно повторить, не собирая заново. */
  history: WeekRecord[]
  /** Что уже приготовлено: снимок списанного, а не производная от плана. */
  cookEvents: CookEvent[]
}

const emptyState: AppState = {
  household: null,
  menu: null,
  atHome: [],
  pantry: emptyPantry(),
  notifications: false,
  bought: [],
  warnings: [],
  customRecipes: [],
  history: [],
  cookEvents: [],
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
    mealPlaces: {},
    ratings: {},
    ...partial,
  }
}

export function defaultHousehold(): Household {
  return {
    eaters: [newEater({ name: 'Я' })],
    cookingDays: [2, 6],
    meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: {
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
    },
    budgetPerWeek: 0,
    drinks: [],
    oils: defaultOils(),
    repeats: defaultRepeats(),
    extras: [],
    weekStart: mondayOf(),
  }
}

/** Что именно пересобрать и ради чего. */
export type RegenerateScope =
  | { kind: 'week' }
  | { kind: 'day'; day: number }
  | { kind: 'meal'; day: number; slot: MealSlot }

export interface RegenerateRequest {
  scope?: RegenerateScope
  goal?: MenuGoal
  seed?: number
}

/**
 * Меню всегда собирается с оглядкой на морозилку: то, что там лежит, — тоже
 * еда, и планировать неделю, не заглянув туда, значит покупать второй раз то,
 * что уже куплено и приготовлено.
 */
function menuFor(
  household: Household,
  seed: number,
  keep: MenuEntry[],
  pantry: Pantry,
  options: BuildOptions = {},
): ReturnType<typeof buildWeekMenu> {
  return buildWeekMenu(household, seed, keep, {
    ...options,
    freezer: pantry.freezer,
    today: todayIso(),
  })
}

interface Store extends AppState {
  saveHousehold: (household: Household) => void
  regenerate: (request?: RegenerateRequest) => void
  swapDish: (entryId: string, recipeId: string) => void
  togglePin: (entryId: string) => void
  cycleMealPlace: (eaterId: string, day: number, slot: MealSlot) => void
  setDrinks: (drinks: DrinkHabit[]) => void
  setOils: (oils: OilChoice) => void
  setRepeats: (repeats: RepeatRules) => void
  setExtras: (extras: DailyExtra[]) => void
  setPantry: (change: (pantry: Pantry) => Pantry) => void
  storeBought: () => void
  setNotifications: (on: boolean) => void
  applyAttendanceTemplate: (eaterId: string, templateId: string) => void
  copyAttendanceDay: (eaterId: string, day: number) => void
  setEntryStatus: (entryId: string, status: EntryStatus | null) => void
  /** Отметить готовку сделанной. Идемпотентно: второе нажатие ничего не меняет. */
  completeCookTask: (taskId: string) => void
  /** Снять отметку о готовке и вернуть продукты по снимку. */
  undoCookTask: (taskId: string) => void
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

/**
 * Кухни, сохранённые до появления списка приборов: hasOven превращаем в одну
 * духовку, остального просто не было — считаем, что прибора нет.
 */
/**
 * Анкеты, сохранённые до появления трёх мест приёма пищи. Старый список
 * `awayMeals` — это ровно «не дома»; «с собой» тогда сказать было нельзя,
 * и придумывать за человека, какие из его отлучек были обедом в контейнере,
 * мы не станем.
 */
function migrateEater(eater: Eater & { awayMeals?: string[] }): Eater {
  const mealPlaces: Record<string, MealPlace> = { ...(eater.mealPlaces ?? {}) }
  for (const key of eater.awayMeals ?? []) mealPlaces[key] = 'away'
  const migrated: Eater = { ...eater, mealPlaces, ratings: eater.ratings ?? {} }
  delete (migrated as Eater & { awayMeals?: string[] }).awayMeals
  return migrated
}

function migrateKitchen(kitchen: Kitchen & { hasOven?: boolean }): Kitchen {
  return {
    burners: kitchen.burners ?? 4,
    ovens: kitchen.ovens ?? (kitchen.hasOven === false ? 0 : 1),
    hasAirfryer: kitchen.hasAirfryer ?? false,
    hasMulticooker: kitchen.hasMulticooker ?? false,
    hasBlender: kitchen.hasBlender ?? true,
    hasProcessor: kitchen.hasProcessor ?? false,
    hasMicrowave: kitchen.hasMicrowave ?? true,
    hasDishwasher: kitchen.hasDishwasher ?? false,
    containers: kitchen.containers ?? 8,
    hasFreezer: kitchen.hasFreezer ?? true,
  }
}

/** Сколько недель храним: localStorage не резиновый, а меню весит немало. */
const MAX_HISTORY = 12

function makeRecord(menu: WeekMenu, cookEvents: CookEvent[] = []): WeekRecord {
  const count = (status: string) => menu.entries.filter((e) => e.status === status).length
  return {
    id: `${menu.weekStart}-${menu.seed}`,
    weekStart: menu.weekStart,
    savedAt: new Date().toISOString(),
    menu,
    // приготовленное считаем по фактам готовки этой недели, а не по отметкам
    cooked: cookEvents.filter((e) => e.taskId.startsWith(`${menu.weekStart}|`)).length,
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
    // анкеты, сохранённые до появления мест приёма пищи, читаем как «всё дома»;
    // старый список awayMeals переносим в новую матрицу как «не дома»
    if (state.household) {
      state.household = {
        ...state.household,
        kitchen: migrateKitchen(state.household.kitchen),
        // напитков в старых анкетах не было — это пустой список, а не «не знаем»
        drinks: state.household.drinks ?? [],
        // а масло раньше было тем, что стоит в рецепте: подсолнечное с оливковым
        oils: state.household.oils ?? defaultOils(),
        // а повторы раньше были жёстко зашиты: до двух дней подряд из партии
        repeats: state.household.repeats ?? defaultRepeats(),
        extras: state.household.extras ?? [],
        eaters: state.household.eaters.map(migrateEater),
      }
    }
    // реестр должен знать о своих рецептах и о выбранном масле до первой
    // сборки меню: масло входит в состав, а значит и в калории, и в закупку
    if (state.household) setOilChoice(state.household.oils)
    setCustomRecipes(state.customRecipes)
    // кладовой раньше не было: заводим её из базовых продуктов
    if (!state.pantry) state.pantry = emptyPantry()
    /*
     * Раньше «приготовлено» было отметкой на записи меню, а продукты
     * списывались тут же. Восстановить снимок списанного задним числом нельзя,
     * но и списывать второй раз нельзя тем более: заводим факт готовки с
     * пустым списком — он говорит «это уже сделано», и повторное нажатие
     * ничего не спишет.
     */
    if (state.menu) {
      const legacy = state.menu.entries.filter(
        (e) => (e.status as string | undefined) === 'cooked',
      )
      if (legacy.length > 0) {
        const known = new Set(state.cookEvents.map((e) => e.taskId))
        const restored: CookEvent[] = []
        for (const entry of legacy) {
          const taskId = cookTaskId(state.menu.weekStart, entry.recipeId, entry.cookDay)
          if (known.has(taskId)) continue
          known.add(taskId)
          restored.push({
            taskId,
            at: state.menu.weekStart,
            recipeId: entry.recipeId,
            servings: 0,
            cookedGrams: 0,
            used: [],
          })
        }
        state.cookEvents = [...state.cookEvents, ...restored]
        state.menu = {
          ...state.menu,
          entries: state.menu.entries.map((e) =>
            (e.status as string | undefined) === 'cooked' ? { ...e, status: undefined } : e,
          ),
        }
      }
    }
    // меню, собранные до появления личных порций, пересобираем на том же seed
    const outdated = state.menu?.entries.some((e) => !Array.isArray(e.portions))
    if (state.household && state.menu && outdated) {
      const { menu, warnings } = menuFor(state.household, state.menu.seed, [], state.pantry)
      return { ...state, menu, warnings }
    }
    // наступила новая неделя: прошлую убираем в историю вместе с отметками
    // «приготовлено / съедено», а не затираем молча
    const monday = mondayOf()
    if (state.household && state.menu && state.menu.weekStart !== monday) {
      const household = { ...state.household, weekStart: monday }
      const { menu, warnings } = menuFor(household, Math.floor(Math.random() * 1e9), [], state.pantry)
      const history = [makeRecord(state.menu, state.cookEvents), ...state.history]
        .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
        .slice(0, MAX_HISTORY)
      // факты готовки живут столько же, сколько недели, к которым относятся
      const weeks = new Set([menu.weekStart, ...history.map((r) => r.weekStart)])
      const cookEvents = state.cookEvents.filter((e) => weeks.has(e.taskId.split('|')[0]))
      return { ...state, household, menu, warnings, history, cookEvents, bought: [] }
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
        const { menu, warnings } = menuFor(household, seed, [], prev.pantry)
        return { ...prev, household, menu, warnings }
      })
    },
    [],
  )

  const setNotifications = useCallback((notifications: boolean) => {
    setState((prev) => ({ ...prev, notifications }))
  }, [])

  /** Правка кладовой: что есть всегда, сколько чего лежит, что в морозилке. */
  const setPantry = useCallback((change: (pantry: Pantry) => Pantry) => {
    setState((prev) => ({ ...prev, pantry: change(prev.pantry) }))
  }, [])

  /**
   * Разложить покупки: излишек упаковок уходит в запасы. До сих пор
   * приложение честно писало «останется 225 г» и на этом о них забывало.
   */
  const storeBought = useCallback(() => {
    setState((prev) => {
      if (!prev.menu) return prev
      const today = todayIso()
      const list = buildShoppingList(prev.menu, prev.household ?? undefined, prev.pantry)
      const lines = list.lines.filter(
        (l) => !l.staple && prev.bought.includes(l.ingredientId),
      )
      return { ...prev, pantry: storePurchase(prev.pantry, lines, today), bought: [] }
    })
  }, [])

  /** Ежедневные дополнения: их калории тоже резервируются до раскладки. */
  const setExtras = useCallback((extras: DailyExtra[]) => {
    setState((prev) => {
      if (!prev.household) return prev
      const household: Household = { ...prev.household, extras }
      const seed = prev.menu?.seed ?? Math.floor(Math.random() * 1e9)
      const keep = prev.menu?.entries.filter((e) => e.pinned) ?? []
      const { menu, warnings } = menuFor(household, seed, keep, prev.pantry)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /** Насколько человек готов есть одно и то же. */
  const setRepeats = useCallback((repeats: RepeatRules) => {
    setState((prev) => {
      if (!prev.household) return prev
      const household: Household = { ...prev.household, repeats }
      const seed = prev.menu?.seed ?? Math.floor(Math.random() * 1e9)
      const keep = prev.menu?.entries.filter((e) => e.pinned) ?? []
      const { menu, warnings } = menuFor(household, seed, keep, prev.pantry)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /** На чём готовим. Масло входит в состав блюд, поэтому меню пересобирается. */
  const setOils = useCallback((oils: OilChoice) => {
    setState((prev) => {
      if (!prev.household) return prev
      const household: Household = { ...prev.household, oils }
      setOilChoice(oils)
      const seed = prev.menu?.seed ?? Math.floor(Math.random() * 1e9)
      const keep = prev.menu?.entries.filter((e) => e.pinned) ?? []
      const { menu, warnings } = menuFor(household, seed, keep, prev.pantry)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /** Привычные напитки: их калории резервируются, поэтому меню пересобирается. */
  const setDrinks = useCallback((drinks: DrinkHabit[]) => {
    setState((prev) => {
      if (!prev.household) return prev
      const household: Household = { ...prev.household, drinks }
      const seed = prev.menu?.seed ?? Math.floor(Math.random() * 1e9)
      const keep = prev.menu?.entries.filter((e) => e.pinned) ?? []
      const { menu, warnings } = menuFor(household, seed, keep, prev.pantry)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /**
   * Пересборка. Закреплённые блюда переживают её без изменений, а всё
   * остальное зависит от того, что человек попросил: пересобрать неделю, один
   * день или один приём пищи — и с какой целью.
   *
   * Частичная пересборка устроена через то же закрепление: всё, что человек
   * не просил менять, на время сборки считается закреплённым. Отдельного
   * алгоритма «пересобрать день» нет и не нужно — иначе он разошёлся бы с
   * основным на первом же изменении правил.
   */
  const regenerate = useCallback((request: RegenerateRequest = {}) => {
    setState((prev) => {
      if (!prev.household) return prev
      const entries = prev.menu?.entries ?? []
      const scope = request.scope ?? { kind: 'week' }
      const keep = entries
        .filter((e) => {
          if (e.pinned) return true
          if (scope.kind === 'day') return e.day !== scope.day
          if (scope.kind === 'meal') return e.day !== scope.day || e.slot !== scope.slot
          return false
        })
        .map((e) => ({ ...e, pinned: true }))
      const { menu, warnings } = menuFor(
        prev.household,
        request.seed ?? Math.floor(Math.random() * 1e9),
        keep,
        prev.pantry,
        { goal: request.goal, atHome: prev.atHome },
      )
      // Закрепление на время сборки — приём, а не решение человека: возвращаем
      // отметки такими, какими они были, иначе после пересборки дня вся
      // неделя оказалась бы закреплённой.
      const pinned = new Set(entries.filter((e) => e.pinned).map((e) => e.id))
      const restored = menu.entries.map((e) => ({ ...e, pinned: pinned.has(e.id) || undefined }))
      return {
        ...prev,
        menu: { ...menu, entries: restored },
        warnings,
        atHome: prev.atHome,
        bought: scope.kind === 'week' ? [] : prev.bought,
      }
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
  const withEaters = (
    prev: AppState,
    eaterId: string,
    change: (eater: Eater) => Eater,
  ): AppState => {
    if (!prev.household) return prev
    const household: Household = {
      ...prev.household,
      eaters: prev.household.eaters.map((e) => (e.id === eaterId ? change(e) : e)),
    }
    const seed = prev.menu?.seed ?? Math.floor(Math.random() * 1e9)
    const keep = prev.menu?.entries.filter((e) => e.pinned) ?? []
    const { menu, warnings } = menuFor(household, seed, keep, prev.pantry)
    return { ...prev, household, menu, warnings }
  }

  /** Клик по клетке матрицы: дома → с собой → не дома → дома. */
  const cycleMealPlace = useCallback((eaterId: string, day: number, slot: MealSlot) => {
    setState((prev) =>
      withEaters(prev, eaterId, (eater) => {
        const key = mealKey(day, slot)
        const place = nextPlace(mealPlaceOf(eater, day, slot))
        const mealPlaces = { ...eater.mealPlaces }
        // «дома» — состояние по умолчанию: храним только отличия от него
        if (place === 'home') delete mealPlaces[key]
        else mealPlaces[key] = place
        return { ...eater, mealPlaces }
      }),
    )
  }, [])

  /** Готовый расклад недели: «рабочая неделя», «все дома», «командировка». */
  const applyAttendanceTemplate = useCallback((eaterId: string, templateId: string) => {
    setState((prev) => {
      const template = ATTENDANCE_TEMPLATES.find((t) => t.id === templateId)
      if (!template || !prev.household) return prev
      const meals = prev.household.meals
      return withEaters(prev, eaterId, (eater) => ({ ...eater, mealPlaces: template.build(meals) }))
    })
  }, [])

  /** «Каждый будний день одно и то же» — скопировать день на всю рабочую неделю. */
  const copyAttendanceDay = useCallback((eaterId: string, day: number) => {
    setState((prev) => {
      if (!prev.household) return prev
      const meals = prev.household.meals
      return withEaters(prev, eaterId, (eater) => ({
        ...eater,
        mealPlaces: copyDayToWorkdays(eater.mealPlaces, meals, day),
      }))
    })
  }, [])

  /**
   * Состояние приёма пищи: съедено, пропущено или отметка снята.
   *
   * Про готовку здесь ничего нет. Одна готовка закрывает несколько приёмов, и
   * продукты списываются один раз на всю готовку — см. completeCookTask.
   */
  const setEntryStatus = useCallback((entryId: string, status: EntryStatus | null) => {
    setState((prev) => {
      if (!prev.menu) return prev
      const entry = prev.menu.entries.find((e) => e.id === entryId)
      if (!entry) return prev
      const menu: WeekMenu = {
        ...prev.menu,
        entries: prev.menu.entries.map((e) =>
          e.id === entryId ? { ...e, status: status ?? undefined } : e,
        ),
      }
      let pantry = prev.pantry
      /*
       * Единственное, что этот вызов делает с кладовой: достали заготовку с
       * прошлой недели и съели — контейнера больше нет. Это свойство именно
       * этого приёма пищи, а не готовки: у записи из морозилки готовки нет
       * вовсе. Блюдо, приготовленное в понедельник и доедаемое в среду, тоже
       * помечено морозилкой, но в кладовой его никогда не было.
       */
      if (status === 'eaten' && entry.status !== 'eaten' && entry.fromFreezer) {
        // контейнеров ровно столько, сколько ушло на стол: обед на двоих —
        // это чаще два контейнера, и списывать один значит держать в кладовой
        // еду, которой там уже нет
        const lot = pantry.freezer.find((f) => f.recipeId === entry.recipeId)
        const need = totalPortions(entry)
        const containers = Math.max(1, Math.ceil(need / Math.max(0.1, lot?.portionsEach ?? 1)))
        pantry = takeFreezer(pantry, entry.recipeId, containers)
      }
      return { ...prev, menu, pantry }
    })
  }, [])

  /**
   * Отметить готовку сделанной. Вся арифметика — в lib/cookFact: она меняет
   * запасы, и проверять её надо без экрана.
   */
  const completeCookTask = useCallback((taskId: string) => {
    setState((prev) => {
      if (!prev.menu || !prev.household) return prev
      const facts = completeFact(prev, prev.menu, prev.household, taskId, todayIso())
      return facts === prev ? prev : { ...prev, ...facts }
    })
  }, [])

  /** Снять отметку о готовке и вернуть продукты по снимку. */
  const undoCookTask = useCallback((taskId: string) => {
    setState((prev) => {
      const facts = undoFact(prev, taskId, todayIso())
      return facts === prev ? prev : { ...prev, ...facts }
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
    setOilChoice(payload.household.oils ?? defaultOils())
    setCustomRecipes(payload.customRecipes)
    const { menu, warnings } = buildWeekMenu(payload.household, Math.floor(Math.random() * 1e9), [], {
      freezer: [],
      today: todayIso(),
    })
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
      const { menu, warnings } = menuFor(prev.household, prev.menu.seed, [], prev.pantry)
      return { ...prev, customRecipes, menu, warnings }
    })
  }, [])

  const deleteCustomRecipe = useCallback((recipeId: string) => {
    setState((prev) => {
      const customRecipes = prev.customRecipes.filter((r) => r.id !== recipeId)
      setCustomRecipes(customRecipes)
      if (!prev.household || !prev.menu) return { ...prev, customRecipes }
      const { menu, warnings } = menuFor(prev.household, prev.menu.seed, [], prev.pantry)
      return { ...prev, customRecipes, menu, warnings }
    })
  }, [])

  /** Сохранить текущую неделю в историю — до того, как её пересоберут. */
  const archiveWeek = useCallback(() => {
    setState((prev) => {
      if (!prev.menu || prev.menu.entries.length === 0) return prev
      return {
        ...prev,
        history: [makeRecord(prev.menu, prev.cookEvents), ...prev.history].slice(0, MAX_HISTORY),
      }
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
      const { menu, warnings } = menuFor(prev.household, record.menu.seed, kept, prev.pantry)
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
      cycleMealPlace,
      setDrinks,
      setOils,
      setRepeats,
      setExtras,
      setPantry,
      storeBought,
      setNotifications,
      applyAttendanceTemplate,
      copyAttendanceDay,
      setEntryStatus,
      completeCookTask,
      undoCookTask,
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
      cycleMealPlace,
      setDrinks,
      setOils,
      setRepeats,
      setExtras,
      setPantry,
      storeBought,
      setNotifications,
      applyAttendanceTemplate,
      copyAttendanceDay,
      setEntryStatus,
      completeCookTask,
      undoCookTask,
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
