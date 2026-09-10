import { useEffect, useMemo, useRef, useState } from 'react'
import type { CookingPlan, PlannedStep } from '../types'
import { APPLIANCE_LABEL, STATION_LABEL } from '../types'
import { formatDuration } from '../lib/cookingPlan'
import { cookProgress, stepKey } from '../lib/cookProgress'
import { useKeepAwake } from '../hooks/useKeepAwake'
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
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  /** Сколько миллисекунд простояли на паузе — на столько сдвигается весь план. */
  const [pausedTotal, setPausedTotal] = useState(0)
  const [done, setDone] = useState<string[]>([])
  const [voice, setVoice] = useState(false)
  const [tick, setTick] = useState(0)
  const spokenRef = useRef<string | null>(null)

  useKeepAwake(true)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // секунды от старта готовки с вычетом пауз
  const elapsed = useMemo(() => {
    const now = pausedAt ?? Date.now()
    return Math.max(0, (now - startedAt - pausedTotal) / 1000)
    // tick нужен, чтобы значение пересчитывалось каждую секунду
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, pausedAt, pausedTotal, tick])

  const { current, started, running, alerts, next, driftMinutes, doneCount, totalCount, allDone } =
    cookProgress(plan.steps, done, elapsed)

  useEffect(() => {
    if (!voice || !current) return
    const key = stepKey(current)
    if (spokenRef.current === key) return
    spokenRef.current = key
    speak(`${current.title}. ${current.text}`)
  }, [voice, current])

  const finish = (step: PlannedStep) => {
    setDone((prev) => [...prev, stepKey(step)])
  }

  const togglePause = () => {
    if (pausedAt === null) {
      setPausedAt(Date.now())
      return
    }
    setPausedTotal((total) => total + (Date.now() - pausedAt))
    setPausedAt(null)
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
          {pausedAt === null ? 'Пауза' : 'Продолжить'}
        </button>
      </div>

      {pausedAt !== null && (
        <div className="cook__paused">
          На паузе. Всё, что дальше, сдвинется ровно на это время.
        </div>
      )}

      {alerts.map((step) => (
        <div className="cook__alert" key={stepKey(step)}>
          <Icon name="alert" size={16} />
          <span>
            Через {clock(step.end * 60 - elapsed)} — {step.text.toLowerCase()} ({step.title})
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
          <div className="cook__timer" data-over={current.end * 60 < elapsed}>
            {current.start * 60 > elapsed
              ? `начать через ${clock(current.start * 60 - elapsed)}`
              : current.end * 60 < elapsed
                ? // просрочено: «0:00» здесь висел мёртвым числом и не говорил
                  // ничего, а на кухне важно именно насколько ушли за срок
                  `+${clock(elapsed - current.end * 60)}`
                : clock(current.end * 60 - elapsed)}
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
                <b className="cook__parallel-timer">{clock(step.end * 60 - elapsed)}</b>
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
        <button
          className="btn btn--ghost btn--small"
          onClick={() => {
            setStartedAt(Date.now())
            setPausedAt(null)
            setPausedTotal(0)
            setDone([])
            spokenRef.current = null
          }}
        >
          Начать заново
        </button>
      </div>
    </div>
  )
}
