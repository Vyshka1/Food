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

export interface CookProgress {
  /** Что делать прямо сейчас. */
  current: PlannedStep | null
  /** Текущий шаг уже должен был начаться (а не «начнётся через N минут»). */
  started: boolean
  /** Пассивные шаги, которые идут сами и которые нельзя пропустить. */
  running: PlannedStep[]
  /** Из них те, что вот-вот закончатся: «через 3 минуты достать из духовки». */
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

  const running = pending.filter(
    (s) =>
      s !== current &&
      s.unattended &&
      s.start * 60 <= elapsedSeconds &&
      elapsedSeconds < s.end * 60,
  )
  const alerts = running.filter((s) => s.end * 60 - elapsedSeconds <= ALERT_BEFORE * 60)

  // «дальше» не должно повторять то, что уже показано в «идёт само»
  const next = pending.find((s) => s !== current && !running.includes(s)) ?? null

  // отстаём настолько, насколько просрочен самый ранний незакрытый шаг
  const overdue = pending.filter((s) => s.end * 60 < elapsedSeconds)
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
