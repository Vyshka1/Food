import { useMemo, useState } from 'react'
import { WEEKDAYS, WEEKDAYS_FULL } from '../lib/menu'
import { buildCookingPlans, formatDuration } from '../lib/cookingPlan'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Card, Warnings } from '../components/ui'

const STATION_LABEL: Record<string, string> = {
  prep: 'руками',
  stove: 'плита',
  oven: 'духовка',
  wait: 'ждём',
}

function clockFrom(startHour: number, offsetMinutes: number): string {
  const total = startHour * 60 + offsetMinutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export function PlanScreen() {
  const { household, menu } = useStore()
  const [startHour, setStartHour] = useState(11)
  const plans = useMemo(
    () => (menu && household ? buildCookingPlans(menu, household) : []),
    [menu, household],
  )
  const [activeDay, setActiveDay] = useState<number | null>(null)

  if (!household || !menu) return null
  const current = plans.find((p) => p.cookDay === activeDay) ?? plans[0]
  if (!current) return <div className="app">Меню пока пустое.</div>

  return (
    <div className="app">
      <div className="screen-title">План готовки</div>
      <div className="screen-sub">
        Что делать одновременно и в каком порядке — с учётом {household.kitchen.burners} конфорок
        {household.kitchen.hasOven ? ' и духовки' : ' без духовки'}.
      </div>

      <div className="day-toggle" style={{ marginBottom: 14 }}>
        {plans.map((p) => (
          <button
            key={p.cookDay}
            data-active={p.cookDay === current.cookDay}
            onClick={() => setActiveDay(p.cookDay)}
          >
            {WEEKDAYS[p.cookDay]}
          </button>
        ))}
      </div>

      <Warnings items={current.warnings} />

      <Card variant="green">
        <div className="section-title" style={{ color: 'var(--green-dark)' }}>
          твой день готовки
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          {WEEKDAYS_FULL[current.cookDay]}
        </div>
        <div className="chips">
          <span className="chip">
            {current.dishes.length} {plural(current.dishes.length, ['блюдо', 'блюда', 'блюд'])}
          </span>
          <span className="chip">
            на {current.coversDays.length}{' '}
            {plural(current.coversDays.length, ['день', 'дня', 'дней'])}
          </span>
          <span className="chip">
            👥 {household.eaters.map((e) => e.name).join(' + ')}
          </span>
        </div>
      </Card>

      <div className="plan-stats">
        <div className="plan-stat">
          <b>{formatDuration(current.makespan)}</b>
          <span>всего у плиты</span>
        </div>
        <div className="plan-stat">
          <b>{formatDuration(current.handsOnMinutes)}</b>
          <span>руки заняты</span>
        </div>
        <div className="plan-stat">
          <b>{formatDuration(Math.max(0, current.makespan - current.handsOnMinutes))}</b>
          <span>свободно</span>
        </div>
      </div>

      <Card>
        <div className="row row--between">
          <span className="muted small">Начинаю готовить в</span>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn--soft btn--small"
              onClick={() => setStartHour((h) => Math.max(6, h - 1))}
            >
              −
            </button>
            <b>{clockFrom(startHour, 0)}</b>
            <button
              className="btn btn--soft btn--small"
              onClick={() => setStartHour((h) => Math.min(22, h + 1))}
            >
              +
            </button>
          </div>
        </div>
        <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Закончишь в {clockFrom(startHour, current.makespan)}.
        </div>
      </Card>

      <div className="meal-head">Пошагово</div>
      <div className="timeline">
        {current.steps.map((step, i) => (
          <div
            className="tl-step"
            key={`${step.recipeId}-${step.stepIndex}-${i}`}
            data-passive={!step.handsOn}
          >
            <span className="tl-step__time">{clockFrom(startHour, step.start)}</span>
            <div className="tl-step__dish">
              {step.emoji} {step.title}
            </div>
            <div className="tl-step__text">{step.text}</div>
            <div className="tl-step__tag">
              {step.end - step.start} мин · {STATION_LABEL[step.station]}
              {step.handsOn ? '' : ' · можно заняться другим'}
            </div>
          </div>
        ))}
      </div>

      {current.freeze.length > 0 && (
        <Card>
          <div className="section-title">❄️ В морозилку</div>
          {current.freeze.map((f) => (
            <div className="row row--between" key={f.recipeId} style={{ padding: '6px 0' }}>
              <span>{f.title}</span>
              <b>
                {f.portions} {plural(f.portions, ['порция', 'порции', 'порций'])}
              </b>
            </div>
          ))}
          <p className="hint" style={{ marginBottom: 0 }}>
            Разложи по контейнерам и подпиши дату — эти порции ждут конца недели.
          </p>
        </Card>
      )}

      <Card>
        <div className="section-title">Что готовим</div>
        {current.dishes.map((d) => (
          <div className="row row--between" key={d.recipeId} style={{ padding: '6px 0' }}>
            <span>
              {d.emoji} {d.title}
            </span>
            <b className="small muted">
              {d.servings} {plural(d.servings, ['порция', 'порции', 'порций'])}
            </b>
          </div>
        ))}
      </Card>
    </div>
  )
}
