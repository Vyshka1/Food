import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AppState,
  DailyExtra,
  Eater,
  EntryStatus,
  Household,
  DrinkHabit,
  MealSlot,
  MenuEntry,
  MenuGoal,
  OilChoice,
  Pantry,
  RepeatRules,
  Recipe,
  WeekMenu,
} from './types'
import {
  buildWeekMenu,
  defaultRepeats,
  replaceEntryWith,
  totalPortions,
} from './lib/menu'
import type { BuildOptions } from './lib/menu'
import { defaultOils } from './lib/oil'
import { storePurchase, takeFreezer } from './lib/pantry'
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
import { addDays, mondayOf, today as todayIso } from './lib/day'
import { weekSeed } from './lib/weekSeed'
import {
  MAX_HISTORY,
  blankState,
  makeRecord,
  migrateEater,
  needsRebuild,
  parseState,
  rotateWeek,
  serialize,
} from './lib/persist'
import type { LoadResult } from './lib/persist'

const STORAGE_KEY = 'menu-nedelya.v1'
/** Ключ до переименования проекта: читаем один раз, чтобы не потерять анкету. */
const LEGACY_STORAGE_KEY = 'ufff.food.v1'
/** Оба ключа: под старым может лежать всё, что человек накопил до переименования. */
export const STORAGE_KEYS = [STORAGE_KEY, LEGACY_STORAGE_KEY] as const



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
    // «сегодня» по умолчанию — сегодня; но неделю, которая ещё не наступила,
    // считать от сегодняшнего числа нельзя: сроки годности в морозилке нужно
    // мерить от того дня, когда эту еду собираются съесть
    today: todayIso(),
    ...options,
    freezer: pantry.freezer,
  })
}

/**
 * Состояние сохранения — то, что человек обязан узнать, а не то, о чём код
 * молчит. Не сохраняется в браузер: это про текущую сессию.
 */
export interface StorageStatus {
  /** Запись выключена, чтобы не затереть данные, которые не удалось прочитать. */
  blocked: boolean
  /** Что не прочиталось при запуске. */
  readProblem: string | null
  /**
   * Данные сохранены более новой сборкой приложения. Чинить и стирать нечего:
   * поможет обновление страницы, а «начать заново» уничтожит целые данные.
   */
  newer: boolean
  /** Данные прочитались, а меню не собралось. Это не потеря, и путать нельзя. */
  menuProblem: string | null
  /** Что не записалось только что: кончилось место или частный режим. */
  saveProblem: string | null
}

/**
 * Следующая неделя.
 *
 * Её нет в сохранённых данных и не будет: неделя появляется в понедельник,
 * когда `boot` убирает прошлую в историю и собирает новую. Здесь она —
 * вычисляемое значение, а не второе меню в состоянии. Хранить её отдельно
 * значило бы завести второй ответ на вопрос «что мы едим на неделе с 15-го»:
 * один — сохранённый в воскресенье, другой — собранный в понедельник, и
 * расходиться они начали бы с первой же покупки.
 *
 * Совпадать с понедельничной сборкой ей позволяет зерно из даты (см.
 * `lib/weekSeed`): предпросмотр и настоящая сборка — один и тот же вызов.
 * Но входные данные к понедельнику могут измениться, и об этом человеку
 * говорят на экране, а не умалчивают.
 */
export interface WeekPreview {
  menu: WeekMenu
  warnings: string[]
}

interface Store extends AppState {
  /** Сохраняется ли всё это вообще. */
  storage: StorageStatus
  /**
   * Предпросмотр следующей недели. `null`, пока нет анкеты или меню, а также
   * если собрать её не удалось: без следующей недели приложение работает, а
   * без экрана — нет.
   */
  nextWeek: WeekPreview | null
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
 * Прочитать сохранённое и довести до состояния, в котором приложение работает.
 *
 * Разбор и починка данных — чистая работа, она живёт в `lib/persist` и
 * проверяется без экрана. Здесь остаётся только то, чего чистой функцией не
 * сделать: часы, случайный seed и сборщик меню.
 *
 * Что бы тут ни случилось, прочитанная анкета не теряется: результат разбора
 * возвращается как есть, а `broken` говорит вызывающему, что сохранять поверх
 * исходных байтов нельзя.
 */
/** Что `boot` узнал о сохранённых данных: разбор плюс сборка меню. */
interface BootResult extends LoadResult {
  /** Данные прочитались, а меню на эту неделю не собралось. Разные вещи. */
  menuProblem: string | null
}

function boot(): BootResult {
  const clean = (state: AppState): BootResult => ({
    state,
    broken: false,
    problem: null,
    newer: false,
    menuProblem: null,
  })

  if (typeof localStorage === 'undefined') return clean(blankState())

  const read = (key: string): string | null => {
    try {
      const value = localStorage.getItem(key)
      // пустая строка — это не запись, а её отсутствие: под старым ключом
      // может лежать всё, что человек накопил до переименования
      return value ? value : null
    } catch {
      // хранилище запрещено политикой браузера
      return null
    }
  }

  const result = parseState(read(STORAGE_KEY) ?? read(LEGACY_STORAGE_KEY))
  if (result.broken) return { ...result, menuProblem: null }
  const state = result.state

  /*
   * Реестр должен знать о своих рецептах и о выбранном масле до первой сборки
   * меню: масло входит в состав, а значит и в калории, и в закупку. Поэтому не
   * эффектом после первого кадра, а здесь, до него; вызов идемпотентен.
   *
   * И обязательно внутри `try`. `boot` работает инициализатором состояния, то
   * есть исключение отсюда уносит с собой весь провайдер — вместе с
   * сообщением об ошибке и кнопкой «скачать копию», которые живут внутри него.
   * Человек получил бы белый экран без единого способа что-то сделать.
   */
  try {
    if (state.household) setOilChoice(state.household.oils)
    setCustomRecipes(state.customRecipes)
  } catch (error) {
    return {
      state: blankState(),
      broken: true,
      problem: reason(error, 'свои рецепты не читаются'),
      newer: false,
      menuProblem: null,
    }
  }

  try {
    /*
     * Порядок важен: сначала неделя, потом формат.
     *
     * Пока пересборка старого меню шла первой, она возвращалась раньше
     * проверки понедельника — и неделя не крутилась. На экране это выглядело
     * так: меню августовской недели считалось «текущим», а настоящая текущая
     * неделя получала подпись «предпросмотр — неделя ещё не наступила», и
     * отметить в ней было нельзя ничего.
     */
    const monday = mondayOf()
    if (state.household && state.menu && state.menu.weekStart !== monday) {
      const household = { ...state.household, weekStart: monday }
      /*
       * Зерно выводим из даты, а не бросаем кубик: ровно это меню человек мог
       * видеть предпросмотром всю прошлую неделю, и оно обязано совпасть.
       *
       * `today` — понедельник этой недели, а не сегодняшнее число, по той же
       * причине: предпросмотр считался от понедельника, и если приложение
       * открыть во вторник, сроки в морозилке померялись бы на день позже —
       * обещанное меню тихо разошлось бы с собранным. Замерено: на 756
       * сочетаниях блюд и сроков сдвиг «сегодня» на день менял состав меню в
       * 4.8% случаев. Это и семантически вернее: срок контейнера меряется от
       * дня, когда его собираются съесть.
       */
      const { menu, warnings } = menuFor(household, weekSeed(monday), [], state.pantry, {
        today: monday,
      })
      return {
        ...result,
        menuProblem: null,
        state: rotateWeek(state, monday, menu, warnings, new Date().toISOString()),
      }
    }
    // меню, собранные до появления личных порций, пересобираем на том же seed
    if (state.household && state.menu && needsRebuild(state)) {
      const { menu, warnings } = menuFor(state.household, state.menu.seed, [], state.pantry)
      return { ...result, menuProblem: null, state: { ...state, menu, warnings } }
    }
  } catch (error) {
    /*
     * Сборка меню упала — но анкета, кладовая, история и факты готовки уже
     * прочитаны и целы. Отдаём их как есть и разрешаем сохранять: без меню
     * приложение неполно, а без анкеты его нет вовсе. И говорим об этом
     * отдельно от ошибок чтения: данные-то прочитались.
     */
    return {
      ...result,
      state,
      menuProblem: reason(error, 'не удалось собрать меню на эту неделю'),
    }
  }
  return { ...result, menuProblem: null }
}

function reason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? `${fallback}: ${error.message}` : fallback
}

/**
 * Почему не сохранилось. Место кончается только у тех, кто пользуется
 * приложением давно, и молчать об этом нельзя: человек продолжит планировать
 * неделю, а из браузера всё исчезнет при закрытии вкладки.
 */
function saveReason(error: unknown): string {
  const quota =
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  if (quota) return 'в браузере кончилось место — удалите старые недели в истории'
  return reason(error, 'браузер не разрешает сохранение (частный режим?)')
}


export function StoreProvider({ children }: { children: ReactNode }) {
  const [start] = useState(boot)
  const [state, setState] = useState<AppState>(start.state)
  /**
   * Сохранение выключено.
   *
   * Прочитать сохранённое не удалось, а значит лежащие в браузере байты —
   * единственное, что осталось от анкеты, кладовой, морозилки и истории
   * недель. Записать поверх них пустое состояние — потерять всё; ссылка-профиль
   * вернула бы только анкету и свои рецепты. Пусть лучше человек поработает
   * сессию без сохранения, чем лишится данных за первый же кадр.
   */
  const [blocked, setBlocked] = useState(start.broken)
  const [readProblem, setReadProblem] = useState<string | null>(start.problem)
  const [newer, setNewer] = useState(start.newer)
  const [menuProblem, setMenuProblem] = useState<string | null>(start.menuProblem)
  const [saveProblem, setSaveProblem] = useState<string | null>(null)

  useEffect(() => {
    if (blocked) return
    try {
      localStorage.setItem(STORAGE_KEY, serialize(state))
      setSaveProblem((prev) => (prev === null ? prev : null))
    } catch (error) {
      setSaveProblem(saveReason(error))
    }
  }, [state, blocked])

  const saveHousehold = useCallback(
    (household: Household) => {
      // анкету поправили — прошлая жалоба на сборку меню больше не про эти данные
      setMenuProblem(null)
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
      // через menuFor, как и все остальные пересборки: без морозилки заготовки
      // исчезли бы из плана, а cookTasks выписал бы готовку и покупку на еду,
      // которая уже сварена и лежит в контейнере
      const { menu, warnings } = menuFor(household, prev.menu.seed, [], prev.pantry)
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
      const { menu, warnings } = menuFor(household, prev.menu.seed, [], prev.pantry)
      return { ...prev, household, menu, warnings }
    })
  }, [])

  /** Профиль из ссылки или кода: анкета и свои рецепты, меню собирается заново. */
  const importProfile = useCallback((input: string): boolean => {
    const payload = decodeProfile(input)
    if (!payload) return false
    setOilChoice(payload.household.oils ?? defaultOils())
    setCustomRecipes(payload.customRecipes)
    // неделя берётся своя: в профиле лежит понедельник того, кто им поделился,
    // и с чужой датой первая же перезагрузка убрала бы новое меню в историю
    //
    // Едоки проходят ту же починку, что и при чтении из хранилища: ссылка
    // приходит извне, а нечисло в возрасте, росте или весе делает нормой NaN
    // и роняет сборку меню на любом зерне — прямо здесь, без всякого catch.
    const household: Household = {
      ...payload.household,
      eaters: payload.household.eaters.map(migrateEater),
      weekStart: mondayOf(),
    }
    setState((prev) => {
      /*
       * Меню собирается той же функцией и с тем же зерном, что и при обычной
       * смене недели: анкета в ссылке чужая, а морозилка своя — она осталась в
       * этом браузере. Раньше сборка шла с пустой морозилкой, и заготовки
       * пропадали из плана: cookTasks выписывал готовку и покупку на еду,
       * которая уже сварена и лежит в контейнере.
       */
      const { menu, warnings } = menuFor(
        household,
        weekSeed(household.weekStart),
        [],
        prev.pantry,
      )
      return {
        ...prev,
        household,
        customRecipes: payload.customRecipes,
        menu,
        warnings,
        atHome: [],
        bought: [],
      }
    })
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
        history: [makeRecord(prev.menu, prev.cookEvents, new Date().toISOString()), ...prev.history]
          .slice(0, MAX_HISTORY),
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

  /**
   * Начать заново — единственное место, где стирать данные можно: это выбор
   * человека, а не следствие ошибки разбора. Заодно снимаем запрет на запись:
   * терять больше нечего.
   */
  const reset = useCallback(() => {
    setState(blankState())
    setCustomRecipes([])
    setBlocked(false)
    setReadProblem(null)
    setNewer(false)
    setMenuProblem(null)
    setSaveProblem(null)
    for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
      try {
        localStorage.removeItem(key)
      } catch {
        // хранилище недоступно — стирать нечего
      }
    }
  }, [])

  /**
   * Понедельник следующей недели.
   *
   * Отдельным значением, чтобы дорогая сборка ниже пересчитывалась от смены
   * недели, а не от каждой отметки «съедено». И в `try`: дата недели приходит
   * из сохранённых данных, а разбор дат нарочно строгий и на мусоре бросает.
   * Провайдер обязан устоять и в этом случае — внутри него живут и сообщение
   * об ошибке, и кнопка «скачать копию».
   */
  const nextWeekStart = useMemo(() => {
    if (!state.menu) return null
    try {
      return addDays(state.menu.weekStart, 7)
    } catch {
      return null
    }
  }, [state.menu])

  const nextWeek = useMemo<WeekPreview | null>(() => {
    if (!state.household || !nextWeekStart) return null
    try {
      /*
       * Ровно тот же вызов, что сделает `boot` в понедельник: та же анкета с
       * подставленной датой, то же зерно из этой даты, та же морозилка. И
       * `today` — понедельник самой недели: срок годности контейнера меряется
       * от того дня, когда его собираются съесть, а не от сегодняшнего.
       */
      const household = { ...state.household, weekStart: nextWeekStart }
      const { menu, warnings } = menuFor(household, weekSeed(nextWeekStart), [], state.pantry, {
        today: nextWeekStart,
      })
      return { menu, warnings }
    } catch {
      /*
       * Сборка следующей недели не должна стоить человеку текущей. Здесь она
       * идёт при отрисовке, и исключение отсюда унесло бы весь экран — а
       * потерять при этом можно только предпросмотр, которого и так нет в
       * данных. Молчим и не показываем его.
       */
      return null
    }
  }, [state.household, state.pantry, nextWeekStart])

  const storage = useMemo<StorageStatus>(
    () => ({ blocked, readProblem, newer, menuProblem, saveProblem }),
    [blocked, readProblem, newer, menuProblem, saveProblem],
  )

  const value = useMemo<Store>(
    () => ({
      ...state,
      storage,
      nextWeek,
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
      storage,
      nextWeek,
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
