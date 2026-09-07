import { useMemo, useState } from 'react'
import { WEEKDAYS, WEEKDAYS_FULL } from '../lib/menu'
import { buildCookingPlans, formatDuration } from '../lib/cookingPlan'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Card, Warnings } from '../components/ui'
import { Icon, recipeIcon } from '../components/icons'
import { recipeById } from '../data/recipeRegistry'
import { APPLIANCE_LABEL } from '../types'
import type { CookingPlan, Kitchen } from '../types'

/** «4 конфорки, духовка и блендер» — перечисляем то, что реально есть. */
function kitchenSummary(kitchen: Kitchen): string {
  const parts = [`${kitchen.burners} ${plural(kitchen.burners, ['конфорка', 'конфорки', 'конфорок'])}`]
  if (kitchen.ovens === 1) parts.push('духовка')
  if (kitchen.ovens >= 2) parts.push(`${kitchen.ovens} духовки`)
  if (kitchen.hasAirfryer) parts.push('аэрогриль')
  if (kitchen.hasMulticooker) parts.push('мультиварка')
  if (kitchen.hasBlender) parts.push('блендер')
  if (kitchen.hasProcessor) parts.push('комбайн')
  if (kitchen.hasMicrowave) parts.push('микроволновка')
  if (parts.length === 1) return `${parts[0]} и больше ничего`
  return `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`
}

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

export function PlanScreen({
  onCookNow,
}: {
  onCookNow: (plan: CookingPlan, cookNames: string[]) => void
}) {
  const { household, menu } = useStore()
  const [startHour, setStartHour] = useState(11)
  const [activeDay, setActiveDay] = useState<number | null>(null)
  /** Готовим одна или вдвоём — это второй повар в расписании, а не оформление. */
  const [cooks, setCooks] = useState(1)
  const plans = useMemo(
    () => (menu && household ? buildCookingPlans(menu, household, cooks) : []),
    [menu, household, cooks],
  )

  if (!household || !menu) return null
  const current = plans.find((p) => p.cookDay === activeDay) ?? plans[0]
  if (!current) return <div className="app">Меню пока пустое.</div>

  const cookNames =
    cooks === 1
      ? [household.eaters[0]?.name ?? 'Повар']
      : household.eaters.slice(0, 2).map((e) => e.name)


  return (
    <div className="app">
      <div className="screen-title">План готовки</div>
      <div className="screen-sub">
        Что делать одновременно и в каком порядке — с учётом того, что стоит у вас на кухне:{' '}
        {kitchenSummary(household.kitchen)}.
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

      {household.eaters.length > 1 && (
        <div className="segmented" style={{ marginBottom: 12 }}>
          <button data-active={cooks === 1} onClick={() => setCooks(1)}>
            Готовлю одна
          </button>
          <button data-active={cooks === 2} onClick={() => setCooks(2)}>
            Готовим вдвоём
          </button>
        </div>
      )}

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
            <Icon name="people" size={16} /> {household.eaters.map((e) => e.name).join(' + ')}
          </span>
        </div>
      </Card>

      <div className="plan-stats">
        <div className="plan-stat">
          <b>{formatDuration(current.makespan)}</b>
          <span>от начала до конца</span>
        </div>
        <div className="plan-stat">
          <b>{formatDuration(current.handsOnMinutes)}</b>
          <span>руки заняты</span>
        </div>
        <div className="plan-stat">
          <b>{formatDuration(current.attentionMinutes)}</b>
          <span>присмотр</span>
        </div>
      </div>
      {cooks > 1 && (
        <p className="hint" style={{ marginTop: -4 }}>
          Вдвоём:{' '}
          {current.perCookMinutes
            .map((minutes, i) => `${cookNames[i] ?? `повар ${i + 1}`} — ${formatDuration(minutes)}`)
            .join(', ')}
          . Работы меньше не становится, она делится: духовку вторая пара рук не ускоряет.
        </p>
      )}
      <p className="hint" style={{ marginTop: -4 }}>
        Одновременно в работе до {current.maxParallel}{' '}
        {plural(current.maxParallel, ['блюда', 'блюд', 'блюд'])}. «Присмотр» идёт поверх занятых
        рук — помешать, перевернуть, заглянуть в кастрюлю.{' '}
        {current.makespan - current.handsOnMinutes > 0
          ? `Свободного времени остаётся ${formatDuration(current.makespan - current.handsOnMinutes)}.`
          : 'Свободных минут в этот день не остаётся — стоит добавить второй день готовки.'}
      </p>

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

      <button
        className="btn"
        style={{ marginBottom: 6 }}
        onClick={() => onCookNow(current, cookNames)}
      >
        Готовлю сейчас
      </button>
      <p className="hint">
        Пошаговый режим с таймерами: экран не гаснет, предупредит за три минуты до духовки,
        паузу можно поставить — всё, что дальше, сдвинется ровно на это время.
      </p>

      <div className="meal-head">Обзор</div>
      <div className="timeline">
        {current.steps.map((step, i) => (
          <div
            className="tl-step"
            key={`${step.recipeId}-${step.stepIndex}-${i}`}
            data-passive={!step.handsOn}
          >
            <span className="tl-step__time">{clockFrom(startHour, step.start)}</span>
            <div className="tl-step__dish">
              {step.title}
            </div>
            <div className="tl-step__text">{step.text}</div>
            <div className="tl-step__tag">
              {step.end - step.start} мин
              {step.activeMinutes > 0 && step.activeMinutes < step.end - step.start
                ? ` (руки заняты ${step.activeMinutes})`
                : ''}{' '}
              · {step.appliance ? APPLIANCE_LABEL[step.appliance] : STATION_LABEL[step.station]}
              {step.tempC ? `, ${step.tempC}°` : ''}
              {step.unattended ? ' · можно отойти' : ''}
            </div>
          </div>
        ))}
      </div>

      {current.freeze.length > 0 && (
        <Card>
          <div className="section-title">
            <Icon name="snowflake" size={16} />В морозилку
          </div>
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
            <span className="row" style={{ gap: 8 }}>
              {recipeById(d.recipeId) && (
                <Icon name={recipeIcon(recipeById(d.recipeId)!)} size={18} />
              )}
              {d.title}
            </span>
            <b className="small muted">
              {d.portions.toFixed(1).replace('.0', '')}{' '}
              {plural(Math.round(d.portions), ['порция', 'порции', 'порций'])}
            </b>
          </div>
        ))}
      </Card>
    </div>
  )
}
