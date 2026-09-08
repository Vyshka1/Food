import type {
  AppState,
  CookEvent,
  Eater,
  Kitchen,
  MealPlace,
  Pantry,
  Recipe,
  WeekMenu,
  WeekRecord,
} from '../types'
import { cookTaskId } from './menu'
import { defaultOils } from './oil'
import { defaultRepeats } from './menu'
import { emptyPantry } from './pantry'

/**
 * Чтение и починка сохранённых данных.
 *
 * Вынесено из React намеренно: здесь живёт всё, что может потерять анкету,
 * кладовую и историю недель. Такое проверяют без экрана, на строках, которые
 * действительно лежали у людей в браузере.
 *
 * Главное правило этого файла: не удалось прочитать — не значит «начинаем с
 * чистого листа». Раньше любое исключение внутри разбора превращалось в пустое
 * состояние, а эффект записи в первом же кадре затирал им исходные байты.
 * Данные исчезали до того, как человек успевал что-то увидеть, и восстановить
 * их было неоткуда: ссылка-профиль хранит только анкету и свои рецепты, а
 * кладовая, морозилка и история недель не выгружаются никуда.
 */

/**
 * Версия схемы.
 *
 * До сих пор её не было: `.v1` в имени ключа никто не читал, а форма данных с
 * тех пор менялась шесть раз. Все прежние формы отличимы по признакам —
 * `awayMeals`, `hasOven`, отсутствие `portions`, `status: 'cooked'`, — и код
 * их уже так и распознаёт. Номер нужен для другого: чтобы новая сборка могла
 * узнать данные от будущей версии и отказаться их трогать, а не переписать.
 */
export const SCHEMA_VERSION = 7

/**
 * Пустое состояние — функцией, а не общей константой: у него внутри кладовая и
 * шесть списков, и один случайный `push` по общему объекту испортил бы его для
 * всех, кто получит его следующим.
 */
export function blankState(): AppState {
  return {
    version: SCHEMA_VERSION,
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
}

/** Сколько недель храним: localStorage не резиновый, а меню весит немало. */
export const MAX_HISTORY = 12

export interface LoadResult {
  state: AppState
  /**
   * Данные были, но прочитать их не удалось.
   *
   * Тогда состояние пустое, но перезаписывать хранилище нельзя: исходные байты
   * — единственное, что осталось от анкеты и кладовой.
   */
  broken: boolean
  /** Что именно не прочиталось — человеку и в отчёт об ошибке. */
  problem: string | null
}

/**
 * Анкеты, сохранённые до появления трёх мест приёма пищи. Старый список
 * `awayMeals` — это ровно «не дома»; «с собой» тогда сказать было нельзя,
 * и придумывать за человека, какие из его отлучек были обедом в контейнере,
 * мы не станем.
 */
export function migrateEater(eater: Eater & { awayMeals?: string[] }): Eater {
  const mealPlaces: Record<string, MealPlace> = { ...(eater.mealPlaces ?? {}) }
  const away = Array.isArray(eater.awayMeals) ? eater.awayMeals : []
  for (const key of away) mealPlaces[key] = 'away'
  const migrated: Eater = { ...eater, mealPlaces, ratings: eater.ratings ?? {} }
  delete (migrated as Eater & { awayMeals?: string[] }).awayMeals
  return migrated
}

/**
 * Кухни, сохранённые до появления списка приборов: hasOven превращаем в одну
 * духовку, остального просто не было — считаем, что прибора нет.
 */
export function migrateKitchen(kitchen: (Kitchen & { hasOven?: boolean }) | undefined): Kitchen {
  const k = kitchen ?? ({} as Kitchen & { hasOven?: boolean })
  return {
    burners: k.burners ?? 4,
    ovens: k.ovens ?? (k.hasOven === false ? 0 : 1),
    hasAirfryer: k.hasAirfryer ?? false,
    hasMulticooker: k.hasMulticooker ?? false,
    hasBlender: k.hasBlender ?? true,
    hasProcessor: k.hasProcessor ?? false,
    hasMicrowave: k.hasMicrowave ?? true,
    hasDishwasher: k.hasDishwasher ?? false,
    containers: k.containers ?? 8,
    hasFreezer: k.hasFreezer ?? true,
  }
}

export function makeRecord(
  menu: WeekMenu,
  cookEvents: CookEvent[],
  savedAt: string,
): WeekRecord {
  const count = (status: string) => menu.entries.filter((e) => e.status === status).length
  return {
    id: `${menu.weekStart}-${menu.seed}`,
    weekStart: menu.weekStart,
    savedAt,
    menu,
    // приготовленное считаем по фактам готовки этой недели, а не по отметкам
    cooked: cookEvents.filter((e) => e.taskId.startsWith(`${menu.weekStart}|`)).length,
    eaten: count('eaten'),
    skipped: count('skipped'),
    total: menu.entries.length,
  }
}

/** Список, который должен быть списком. Сохранённый null — это не «пусто». */
function listOf<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback
}

/**
 * Кладовая целиком: раньше чинился только сам объект, но не его части.
 * Пропавший `pantry.freezer` переживал загрузку и падал уже при отрисовке.
 */
function repairPantry(pantry: Pantry | undefined): Pantry {
  const empty = emptyPantry()
  if (!pantry) return empty
  return {
    always: listOf<string>(pantry.always, empty.always),
    stock: listOf(pantry.stock),
    freezer: listOf(pantry.freezer),
  }
}

/**
 * Отметка «приготовлено» была свойством записи меню, и продукты списывались
 * тут же. Снимок списанного восстановить задним числом нельзя, но и списывать
 * второй раз нельзя тем более: заводим факт готовки с пустым списком — он
 * говорит «это уже сделано», и повторное нажатие ничего не спишет.
 */
function migrateCookedMarks(state: AppState): AppState {
  if (!state.menu) return state
  const legacy = state.menu.entries.filter((e) => (e.status as string | undefined) === 'cooked')
  if (legacy.length === 0) return state
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
  return {
    ...state,
    cookEvents: [...state.cookEvents, ...restored],
    menu: {
      ...state.menu,
      entries: state.menu.entries.map((e) =>
        (e.status as string | undefined) === 'cooked' ? { ...e, status: undefined } : e,
      ),
    },
  }
}

/**
 * Разобрать сохранённую строку.
 *
 * Никогда не бросает и никогда не молчит: если прочитать не удалось, это видно
 * в `broken`, и вызывающий обязан решить, что делать, — а не получить пустое
 * состояние под видом успеха.
 */
export function parseState(raw: string | null): LoadResult {
  if (!raw) return { state: blankState(), broken: false, problem: null }
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { state: blankState(), broken: true, problem: 'сохранённые данные не похожи на анкету' }
    }
    /*
     * Данные новее, чем эта сборка, читать нельзя: мы не знаем, что в них
     * значат поля, которых у нас ещё нет. Открытая из кэша старая версия
     * приложения не должна переписывать то, что записала новая.
     */
    if (typeof parsed.version === 'number' && parsed.version > SCHEMA_VERSION) {
      return {
        state: blankState(),
        broken: true,
        problem: `данные сохранены более новой версией приложения (${parsed.version})`,
      }
    }

    // Присутствующий null перекрывает значение по умолчанию — чиним каждое поле
    const state: AppState = {
      ...blankState(),
      ...parsed,
      version: SCHEMA_VERSION,
      atHome: listOf<string>(parsed.atHome),
      bought: listOf<string>(parsed.bought),
      warnings: listOf<string>(parsed.warnings),
      customRecipes: listOf<Recipe>(parsed.customRecipes),
      history: listOf<WeekRecord>(parsed.history),
      cookEvents: listOf<CookEvent>(parsed.cookEvents),
      pantry: repairPantry(parsed.pantry),
    }

    if (state.household) {
      state.household = {
        ...state.household,
        kitchen: migrateKitchen(state.household.kitchen),
        // напитков в старых анкетах не было — это пустой список, а не «не знаем»
        drinks: listOf(state.household.drinks),
        // а масло раньше было тем, что стоит в рецепте: подсолнечное с оливковым
        oils: state.household.oils ?? defaultOils(),
        // а повторы раньше были жёстко зашиты: до двух дней подряд из партии
        repeats: state.household.repeats ?? defaultRepeats(),
        extras: listOf(state.household.extras),
        eaters: listOf<Eater>(state.household.eaters).map(migrateEater),
      }
      if (state.household.eaters.length === 0) {
        return { state: blankState(), broken: true, problem: 'в анкете не осталось едоков' }
      }
    }
    if (state.menu && !Array.isArray(state.menu.entries)) {
      return { state: blankState(), broken: true, problem: 'меню сохранено не полностью' }
    }

    return { state: migrateCookedMarks(state), broken: false, problem: null }
  } catch {
    /*
     * Сообщение разборщика тут не годится: человеку показывают «Expected ',' or
     * '}' after property value in JSON at position 47», и это ни о чём ему не
     * говорит. Для разбирательства есть сами байты — их можно скачать, пока
     * запись выключена.
     */
    return { state: blankState(), broken: true, problem: 'запись оборвана или испорчена' }
  }
}

export function serialize(state: AppState): string {
  return JSON.stringify({ ...state, version: SCHEMA_VERSION })
}

/** Нужно ли пересобрать меню: оно из времён, когда личных порций не было. */
export function needsRebuild(state: AppState): boolean {
  return Boolean(state.menu?.entries.some((e) => !Array.isArray(e.portions)))
}

/**
 * Наступила новая неделя: прошлую убираем в историю вместе с отметками, а не
 * затираем молча. Меню и дата приходят снаружи — здесь ни часов, ни случайности.
 */
export function rotateWeek(
  state: AppState,
  monday: string,
  menu: WeekMenu,
  warnings: string[],
  savedAt: string,
): AppState {
  if (!state.household || !state.menu) return state
  const household = { ...state.household, weekStart: monday }
  const history = [makeRecord(state.menu, state.cookEvents, savedAt), ...state.history]
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    .slice(0, MAX_HISTORY)
  // факты готовки живут столько же, сколько недели, к которым они относятся
  const weeks = new Set([menu.weekStart, ...history.map((r) => r.weekStart)])
  const cookEvents = state.cookEvents.filter((e) => weeks.has(e.taskId.split('|')[0]))
  return { ...state, household, menu, warnings, history, cookEvents, bought: [] }
}
