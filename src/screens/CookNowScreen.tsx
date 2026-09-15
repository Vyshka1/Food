import { useEffect, useMemo, useRef, useState } from 'react'
import type { CookingPlan, PlannedStep } from '../types'
import { APPLIANCE_LABEL, STATION_LABEL } from '../types'
import { formatDuration } from '../lib/cookingPlan'
import { cookTaskId } from '../lib/menu'
import {
  cookProgress,
  cookedDishes,
  loadCookRun,
  newCookRun,
  runElapsed,
  runPauses,
  saveCookRun,
  secondsLeft,
  stepKey,
  type CookRun,
} from '../lib/cookProgress'
import { useKeepAwake } from '../hooks/useKeepAwake'
import { useStore } from '../store'
import { Icon } from '../components/icons'

function where(step: PlannedStep): string {
  const place = step.appliance ? APPLIANCE_LABEL[step.appliance] : STATION_LABEL[step.station]
  return step.tempC ? `${place}, ${step.tempC}°` : place
}

/** «5:00» — таймер читается одним взглядом, поэтому всегда с секундами. */
function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Голос: проговорить шаг, когда руки в тесте и смотреть на экран неудобно. */
function speak(text: string): void {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ru-RU'
    synth.speak(utterance)
  } catch {
    // синтез речи не обязателен — экран работает и без него
  }
}

export function CookNowScreen({
  plan,
  cookNames,
  onExit,
}: {
  plan: CookingPlan
  cookNames: string[]
  onExit: () => void
}) {
  const { menu, cookEvents, completeCookTask } = useStore()
  /** Ключ готовки — тот же, что у плана: неделя, блюдо, день готовки. */
  const taskId = (recipeId: string) =>
    cookTaskId(menu?.weekStart ?? '', recipeId, plan.cookDay)
  const cookedTasks = useMemo(() => new Set(cookEvents.map((e) => e.taskId)), [cookEvents])

  /**
   * Шаги блюд, уже отмеченных приготовленными в плане, сразу считаются
   * закрытыми. Продукты на них списаны, заготовки лежат в морозилке —
   * предлагать их первым шагом значит звать готовить второй раз.
   *
   * Именно закрытыми, а не выброшенными из плана: счётчик «3 из 14» должен
   * говорить про весь день готовки, а не про его остаток, и не обязан прыгать
   * назад, когда блюдо закрывается прямо сейчас.
   */
  const alreadyCooked = () =>
    plan.steps.filter((s) => cookedTasks.has(taskId(s.recipeId))).map(stepKey)

  /** Какая это готовка: чужой ход (другая неделя, другой день) не подхватываем. */
  const runId = `${menu?.weekStart ?? 'без-недели'}|${plan.cookDay}`
  const [run, setRun] = useState<CookRun>(
    () =>
      loadCookRun(runId, Date.now()) ??
      // сколько поваров — запоминаем: иначе вернуться в эту же готовку нельзя
      newCookRun(runId, Date.now(), alreadyCooked(), cookNames.length),
  )
  const [voice, setVoice] = useState(false)
  const [tick, setTick] = useState(0)
  /** Нажатие на «Начать заново» ждёт подтверждения: см. кнопку внизу. */
  const [askRestart, setAskRestart] = useState(false)
  const spokenRef = useRef<string | null>(null)

  useKeepAwake(true)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Ход готовки переживает и крестик, и перезагрузку: пишем при каждом
  // изменении, а не по выходу — выхода может и не быть.
  useEffect(() => {
    saveCookRun(run)
  }, [run])

  const elapsed = useMemo(
    () => runElapsed(run, Date.now()),
    // tick нужен, чтобы значение пересчитывалось каждую секунду
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, tick],
  )
  const pauses = useMemo(
    () => runPauses(run, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, tick],
  )
  /** Сколько осталось шагу — один расчёт на весь экран, вместе с паузами. */
  const left = (step: PlannedStep) => secondsLeft(step, elapsed, pauses)

  const { current, started, running, alerts, next, driftMinutes, doneCount, totalCount, allDone } =
    cookProgress(plan.steps, run.done, elapsed, pauses)

  useEffect(() => {
    if (!voice || !current) return
    const key = stepKey(current)
    if (spokenRef.current === key) return
    spokenRef.current = key
    speak(`${current.title}. ${current.text}`)
  }, [voice, current])

  /*
   * Блюдо, у которого закрыты все шаги, — приготовлено. Отмечаем его сразу, не
   * дожидаясь конца дня: см. `cookedDishes`. Отметка идёт через ту же
   * операцию, что и кнопка «Приготовлено» в плане, и дважды не сработает —
   * здесь её не пускает `cookedTasks`, а внутри неё самой стоит проверка по
   * ключу готовки.
   */
  useEffect(() => {
    if (!menu) return
    for (const recipeId of cookedDishes(plan.steps, run.done)) {
      const id = cookTaskId(menu.weekStart, recipeId, plan.cookDay)
      if (cookedTasks.has(id)) continue
      completeCookTask(id)
    }
  }, [menu, plan, run.done, cookedTasks, completeCookTask])

  const finish = (step: PlannedStep) => {
    const key = stepKey(step)
    setRun((prev) => (prev.done.includes(key) ? prev : { ...prev, done: [...prev.done, key] }))
  }

  const togglePause = () => {
    setRun((prev) => {
      const now = Date.now()
      if (prev.pausedAt === null) return { ...prev, pausedAt: now }
      const stood = Math.max(0, now - prev.pausedAt)
      return {
        ...prev,
        pausedAt: null,
        pausedTotal: prev.pausedTotal + stood,
        // минуту плана запоминаем вместе с паузой: по ней видно, что к этому
        // моменту уже стояло в духовке и на паузу не вставало
        pauses: [...prev.pauses, { at: runElapsed(prev, now), seconds: stood / 1000 }],
      }
    })
  }

  const restart = () => {
    // блюда, уже отмеченные приготовленными, заново не готовятся: продукты на
    // них списаны, и обнулять их отметку экран не вправе
    setRun(newCookRun(runId, Date.now(), alreadyCooked()))
    spokenRef.current = null
    setAskRestart(false)
  }

  return (
    <div className="cook">
      <div className="cook__bar">
        <button className="cook__exit" onClick={onExit} aria-label="выйти из режима готовки">
          <Icon name="close" size={18} />
        </button>
        <div className="cook__elapsed">
          <b>{clock(elapsed)}</b>
          <span className="muted small">
            {doneCount} из {totalCount}
          </span>
        </div>
        <button className="cook__pause" onClick={togglePause}>
          {run.pausedAt === null ? 'Пауза' : 'Продолжить'}
        </button>
      </div>

      {run.pausedAt !== null && (
        <div className="cook__paused">
          На паузе: подождёт всё, что делается руками. Духовка и плита на паузу не встают — то,
          что уже стоит в них, идёт своим ходом.
        </div>
      )}

      {alerts.map((step) => (
        <div
          className="cook__alert"
          data-over={left(step) < 0}
          key={stepKey(step)}
        >
          <Icon name="alert" size={16} />
          <span>
            {left(step) < 0
              ? // просрочено: молчать об этом нельзя — ради этой минуты режим и включают
                `Пора! ${step.text} — уже +${clock(-left(step))} (${step.title})`
              : `Через ${clock(left(step))} — ${step.text.toLowerCase()} (${step.title})`}
          </span>
        </div>
      ))}

      {driftMinutes > 0 && (
        <div className="cook__drift">
          Отстаём примерно на {formatDuration(driftMinutes)}. Это не страшно: то, что идёт само,
          подождёт.
        </div>
      )}

      {allDone && (
        <div className="cook__done">
          <Icon name="party" size={34} />
          <div>Готово, всё сделано</div>
          <button className="btn btn--soft" style={{ marginTop: 16 }} onClick={onExit}>
            Закрыть
          </button>
        </div>
      )}

      {current && (
        <div className="cook__now">
          <div className="cook__label">
            {started ? 'сейчас' : 'скоро'}
            {current.cook !== null && cookNames.length > 1 && (
              <span className="cook__who">{cookNames[current.cook] ?? `Повар ${current.cook + 1}`}</span>
            )}
          </div>
          <div className="cook__dish">{current.title}</div>
          <div className="cook__text">{current.text}</div>
          <div className="cook__meta">
            {where(current)} · {current.end - current.start} мин
            {current.unattended ? ' · можно отойти' : ''}
          </div>
          <div className="cook__timer" data-over={left(current) < 0}>
            {current.start * 60 > elapsed
              ? `начать через ${clock(current.start * 60 - elapsed)}`
              : left(current) < 0
                ? // просрочено: «0:00» здесь висел мёртвым числом и не говорил
                  // ничего, а на кухне важно именно насколько ушли за срок
                  `+${clock(-left(current))}`
                : clock(left(current))}
          </div>
          <button className="btn" onClick={() => finish(current)}>
            {started ? 'Готово' : 'Уже сделала'}
          </button>
        </div>
      )}

      {running.length > 0 && (
        <div className="cook__parallel">
          <div className="cook__label">идёт само</div>
          {running.map((step) => (
            <div className="cook__parallel-row" key={stepKey(step)}>
              <div>
                <div className="cook__parallel-text">{step.text}</div>
                <div className="muted small">
                  {step.title} · {where(step)}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <b className="cook__parallel-timer" data-over={left(step) < 0}>
                  {left(step) < 0 ? `+${clock(-left(step))}` : clock(left(step))}
                </b>
                <button className="btn btn--soft btn--small" onClick={() => finish(step)}>
                  Снял
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {next && (
        <div className="cook__next">
          <div className="cook__label">дальше</div>
          <div className="cook__next-text">{next.text}</div>
          <div className="muted small">
            {next.title} · {where(next)} · {next.end - next.start} мин
            {next.cook !== null && cookNames.length > 1
              ? ` · ${cookNames[next.cook] ?? `Повар ${next.cook + 1}`}`
              : ''}
          </div>
        </div>
      )}

      <div className="cook__footer">
        <label className="shop__filter" style={{ padding: 0 }}>
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
          Проговаривать шаги вслух
        </label>
        {/*
          * «Начать заново» обнуляет таймер и все отметки, а стоит рядом с
          * галкой голоса — мокрым пальцем такое задевается на раз. Поэтому
          * шага два, и оба названы словами: что именно пропадёт, видно до
          * нажатия, а не после.
          */}
        {!askRestart && (
          <button className="btn btn--ghost btn--small" onClick={() => setAskRestart(true)}>
            Начать заново
          </button>
        )}
      </div>

      {askRestart && (
        <div className="cook__restart">
          <span className="cook__restart-text">
            Сбросить таймер и все отметки? Блюда, уже отмеченные приготовленными, останутся
            отмеченными.
          </span>
          <div className="cook__restart-buttons">
            <button className="btn btn--soft btn--small" onClick={() => setAskRestart(false)}>
              Нет, продолжаем
            </button>
            <button className="btn btn--small" onClick={restart}>
              Да, заново
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
