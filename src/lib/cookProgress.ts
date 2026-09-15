import type { PlannedStep } from '../types'

/** За сколько минут до конца пассивного шага предупреждать. */
export const ALERT_BEFORE = 3

/**
 * Ключ шага в плане. Один рецепт может дать два одинаковых по тексту шага,
 * поэтому в ключ входит и его позиция во времени.
 */
export function stepKey(step: PlannedStep): string {
  return `${step.recipeId}-${step.stepIndex}-${step.start}`
}

/**
 * Пауза: в какую минуту плана её нажали и сколько простояли.
 *
 * Хранится не одним числом «всего простояли», а списком, потому что пауза
 * действует не на всё сразу: см. `secondsLeft`.
 */
export interface CookPause {
  /** Момент плана, в который нажали паузу, сек от старта готовки. */
  at: number
  /** Сколько простояли, сек. */
  seconds: number
}

/**
 * Сколько секунд осталось шагу; отрицательное — просрочен.
 *
 * Пауза сдвигает не всё. Повар отошёл — вместе с ним отошла и его работа:
 * ручной шаг честно сдвигается на время паузы. А духовка на паузу не встаёт:
 * противень, который в ней уже стоит, печётся по настоящим часам и сгорит
 * ровно по ним. Поэтому у пассивного шага, который успел начаться, из остатка
 * вычитается всё время пауз, случившихся после его начала.
 *
 * Пассивного шага, который ещё не начался, это не касается само собой: пауз
 * позже его начала к тому моменту не бывает, и он сдвигается вместе с планом —
 * в кастрюле пока пусто.
 */
export function secondsLeft(
  step: PlannedStep,
  elapsedSeconds: number,
  pauses: readonly CookPause[] = [],
): number {
  return step.end * 60 - elapsedSeconds - pausedUnder(step, pauses)
}

function pausedUnder(step: PlannedStep, pauses: readonly CookPause[]): number {
  if (!step.unattended) return 0
  let total = 0
  for (const pause of pauses) {
    if (pause.at >= step.start * 60) total += pause.seconds
  }
  return total
}

/**
 * Предыдущие шаги этого же блюда отмечены.
 *
 * Внутри одного блюда шаги строго последовательны: расписание ставит их по
 * очереди, и пока не нарезано, варить нечего. Отметка предшественника —
 * единственное, что у экрана есть вместо датчика на плите.
 */
function predecessorsDone(
  step: PlannedStep,
  steps: readonly PlannedStep[],
  done: ReadonlySet<string>,
): boolean {
  return !steps.some(
    (s) =>
      s.recipeId === step.recipeId && s.stepIndex < step.stepIndex && !done.has(stepKey(s)),
  )
}

export interface CookProgress {
  /** Что делать прямо сейчас. */
  current: PlannedStep | null
  /** Текущий шаг уже должен был начаться (а не «начнётся через N минут»). */
  started: boolean
  /** Пассивные шаги, которые идут сами и которые нельзя пропустить. */
  running: PlannedStep[]
  /** Из них те, что вот-вот закончатся или уже просрочены; срочные — первыми. */
  alerts: PlannedStep[]
  /** Следующее дело — не то, что уже кипит на плите. */
  next: PlannedStep | null
  /** На сколько минут отстаём от плана; 0 — идём вовремя. */
  driftMinutes: number
  doneCount: number
  totalCount: number
  allDone: boolean
}

/**
 * Состояние готовки в конкретный момент.
 *
 * Расписание строится заранее и в реальной кухне неизбежно плывёт, поэтому
 * прогресс считается от двух вещей: сколько прошло времени и что человек уже
 * отметил сделанным. Никакого «пересчёта расписания на лету» здесь нет —
 * пересчёт делает пауза, останавливая часы, а честное отставание мы просто
 * показываем, а не прячем.
 */
export function cookProgress(
  steps: PlannedStep[],
  doneKeys: readonly string[],
  elapsedSeconds: number,
  pauses: readonly CookPause[] = [],
): CookProgress {
  const done = new Set(doneKeys)
  const pending = steps.filter((s) => !done.has(stepKey(s)))

  // Крупной операцией должно быть то, что требует рук. Пока в духовке стоит
  // запеканка, «сейчас» — это не она: духовка идёт сама и её место в «идёт
  // само». Иначе экран советует смотреть на духовку, вместо того чтобы
  // подсказать, чем занять руки, — а ради этого режим и нужен.
  const availableNow = pending.filter((s) => s.start * 60 <= elapsedSeconds)
  const current =
    availableNow.find((s) => !s.unattended) ?? availableNow[0] ?? pending[0] ?? null
  const started = current !== null && current.start * 60 <= elapsedSeconds

  /*
   * «Идёт само» — утверждение о факте: это стоит на плите прямо сейчас.
   * Поэтому два условия сверх времени.
   *
   * Первое: предшественники отмечены. Часы идут сами по себе, и стоит на
   * двадцать минут отстать — экран начинал уверять, что овощи варятся, хотя
   * их ещё не нарезали. Хуже того, рядом с такой строкой стоит кнопка «Снял»,
   * и шаг, которого не было, уходил из плана насовсем.
   *
   * Второе: срок шага не выбрасывает его отсюда. Раньше строка жила ровно до
   * своей последней секунды и на следующем тике исчезала — из «идёт само», из
   * тревог, из всего. Тесто, которое «постоит ещё 20 секунд», молча пропадало
   * именно в тот момент, ради которого этот режим и включают.
   */
  const running = pending.filter(
    (s) =>
      s !== current &&
      s.unattended &&
      s.start * 60 <= elapsedSeconds &&
      predecessorsDone(s, steps, done),
  )
  const alerts = running
    .filter((s) => secondsLeft(s, elapsedSeconds, pauses) <= ALERT_BEFORE * 60)
    // просроченное — первым: оно кричит громче, чем «через три минуты»
    .sort((a, b) => secondsLeft(a, elapsedSeconds, pauses) - secondsLeft(b, elapsedSeconds, pauses))

  // «дальше» не должно повторять то, что уже показано в «идёт само»
  const next = pending.find((s) => s !== current && !running.includes(s)) ?? null

  // отстаём настолько, насколько просрочен самый ранний незакрытый шаг.
  // Считаем по плановым часам, без поправки на паузы: отставание — это
  // расхождение с планом, а пауза его как раз и не создаёт.
  const overdue = pending.filter((s) => secondsLeft(s, elapsedSeconds) < 0)
  const driftMinutes = overdue.length > 0 ? Math.round(elapsedSeconds / 60 - overdue[0].end) : 0

  return {
    current,
    started,
    running,
    alerts,
    next,
    driftMinutes,
    doneCount: steps.length - pending.length,
    totalCount: steps.length,
    allDone: pending.length === 0,
  }
}

/**
 * Блюда, у которых закрыты все шаги.
 *
 * Отмечать готовку по блюду, а не по всему дню, — решение не косметическое.
 * Ключ готовки (`cookTaskId`) и кнопка «Приготовлено» в плане тоже живут на
 * блюде; факт готовки списывает продукты этого блюда и кладёт его заготовки в
 * морозилку. Если ждать конца дня, то повар, закрывший суп и ушедший по делам,
 * остаётся с супом в кастрюле, продуктами, которые числятся в кладовой, и
 * контейнерами, которых нет в морозилке.
 */
export function cookedDishes(steps: PlannedStep[], doneKeys: readonly string[]): string[] {
  const done = new Set(doneKeys)
  const byDish = new Map<string, boolean>()
  for (const step of steps) {
    const all = byDish.get(step.recipeId) ?? true
    byDish.set(step.recipeId, all && done.has(stepKey(step)))
  }
  return [...byDish].filter(([, all]) => all).map(([recipeId]) => recipeId)
}

/**
 * Ход готовки: то, что нельзя потерять от случайного крестика или F5.
 *
 * Лежит в своём ключе localStorage, а не в общем состоянии приложения. Причин
 * две. Во-первых, это данные другого срока жизни: анкета, кладовая и история
 * недель живут месяцами, а ход готовки — часы, и после неё он мусор. Во-вторых,
 * писать его в общий ключ значит переписывать всё состояние при каждой отметке
 * шага — ради заметки на полдня рисковать тем, что восстановить неоткуда.
 */
export const COOK_RUN_KEY = 'menu-nedelya.cook.v1'

export interface CookRun {
  /** Какая это готовка: неделя и день. Чужой ход мы не подхватываем. */
  id: string
  /** Момент старта, мс эпохи: после перезагрузки таймер продолжает идти. */
  startedAt: number
  /** Когда нажали паузу, мс эпохи; null — идём. */
  pausedAt: number | null
  /** Сколько миллисекунд всего простояли на паузе. */
  pausedTotal: number
  pauses: CookPause[]
  /** Ключи закрытых шагов. */
  done: string[]
}

/**
 * Сколько ход готовки считается живым.
 *
 * Замер на 280 планах (семья из двух едоков, наборы дней готовки [0,3] [1,4]
 * [2,6] [0,2,4] [3] [0], зёрна 1..20, один повар): медиана 179 минут, 90% —
 * 266, максимум 478, то есть восемь часов. Сутки — вдвое с лишним больше
 * самого длинного плана: то, что началось раньше, точно уже не готовится, и
 * поднимать такой таймер значит встретить человека отставанием на 900 минут.
 */
const RUN_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function newCookRun(id: string, now: number, done: string[] = []): CookRun {
  return { id, startedAt: now, pausedAt: null, pausedTotal: 0, pauses: [], done }
}

/** Секунды от старта готовки с вычетом пауз. */
export function runElapsed(run: CookRun, now: number): number {
  const at = run.pausedAt ?? now
  return Math.max(0, (at - run.startedAt - run.pausedTotal) / 1000)
}

/**
 * Паузы вместе с той, на которой стоим прямо сейчас: духовка печёт и во время
 * паузы, поэтому незакрытая пауза обязана считаться сразу, а не задним числом
 * при нажатии «Продолжить».
 */
export function runPauses(run: CookRun, now: number): CookPause[] {
  if (run.pausedAt === null) return run.pauses
  return [...run.pauses, { at: runElapsed(run, now), seconds: Math.max(0, (now - run.pausedAt) / 1000) }]
}

const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Разбор сохранённого хода.
 *
 * Читаем чужое и старое: в ключе может лежать ход другого дня, запись от
 * будущей версии или обломок от вкладки, закрытой посреди записи. Ни один из
 * этих случаев не должен кончаться белым экраном, поэтому любое сомнение —
 * «хода нет», и готовка начинается заново.
 */
export function parseCookRun(raw: string | null, id: string, now: number): CookRun | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const run = value as Partial<CookRun>
  if (run.id !== id) return null
  if (!isNum(run.startedAt) || !isNum(run.pausedTotal) || run.pausedTotal < 0) return null
  if (run.startedAt > now || now - run.startedAt > RUN_MAX_AGE_MS) return null
  if (run.pausedAt !== null && !isNum(run.pausedAt)) return null
  if (!Array.isArray(run.done) || run.done.some((key) => typeof key !== 'string')) return null
  if (!Array.isArray(run.pauses)) return null
  const pauses: CookPause[] = []
  for (const pause of run.pauses) {
    if (typeof pause !== 'object' || pause === null) return null
    const { at, seconds } = pause as Partial<CookPause>
    if (!isNum(at) || !isNum(seconds) || at < 0 || seconds < 0) return null
    pauses.push({ at, seconds })
  }
  return {
    id,
    startedAt: run.startedAt,
    pausedAt: run.pausedAt ?? null,
    pausedTotal: run.pausedTotal,
    pauses,
    done: [...run.done],
  }
}

export function loadCookRun(id: string, now: number): CookRun | null {
  try {
    return parseCookRun(localStorage.getItem(COOK_RUN_KEY), id, now)
  } catch {
    // localStorage бывает запрещён целиком — это не повод не дать готовить
    return null
  }
}

export function saveCookRun(run: CookRun): void {
  try {
    localStorage.setItem(COOK_RUN_KEY, JSON.stringify(run))
  } catch {
    // места нет или запись запрещена: готовку это не останавливает
  }
}

export function clearCookRun(): void {
  try {
    localStorage.removeItem(COOK_RUN_KEY)
  } catch {
    // см. saveCookRun
  }
}
