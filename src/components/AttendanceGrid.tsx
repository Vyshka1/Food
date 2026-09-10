import { useState } from 'react'
import { MEAL_PLACE, MEAL_PLACE_LABEL, MEAL_SLOTS } from '../types'
import type { MealPlace } from '../types'
import { WEEKDAYS } from '../lib/menu'
import {
  ATTENDANCE_TEMPLATES,
  attendanceSummary,
  containersOn,
  mealPlaceOf,
} from '../lib/attendance'
import { useStore } from '../store'
import { plural } from '../lib/format'
import { Icon } from './icons'

/**
 * Значок места: дома, с собой, не дома.
 *
 * Раньше здесь стояли типографские знаки — точка и стрелка вверх. Точка не
 * говорит «дома» ничего, стрелка не говорит «в контейнере», а рисуются они
 * шрифтом системы, то есть в каждой ОС по-своему. Теперь тот же набор
 * контуров, что и во всём приложении. «Не дома» остаётся пустым намеренно:
 * это единственное состояние, в котором ничего не происходит.
 */
function PlaceMark({ place }: { place: MealPlace }) {
  if (place === 'away') return null
  return <Icon name={place === 'takeaway' ? 'bag' : 'home'} size={15} />
}

/**
 * Кто где ест. Три состояния, а не два: обед, взятый с собой, нужно
 * приготовить и купить — но не поставить на стол и не забыть контейнер.
 * Пока «с собой» и «не дома» были одним состоянием, закупка ошибалась в
 * обе стороны сразу.
 */
export function AttendanceGrid() {
  const { household, cycleMealPlace, applyAttendanceTemplate, copyAttendanceDay } = useStore()
  const [who, setWho] = useState(0)
  if (!household) return null

  const eater = household.eaters[Math.min(who, household.eaters.length - 1)]
  const slots = MEAL_SLOTS.filter((m) => household.meals.includes(m.id))
  const containers = Array.from({ length: 7 }, (_, day) => containersOn(household, day))
  const maxContainers = Math.max(...containers)

  return (
    <>
      {household.eaters.length > 1 && (
        <div className="eater-tabs">
          {household.eaters.map((e, i) => (
            <button
              key={e.id}
              className="eater-tab"
              data-active={e.id === eater.id}
              onClick={() => setWho(i)}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      <div className="templates">
        {ATTENDANCE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            className="chip"
            onClick={() => applyAttendanceTemplate(eater.id, t.id)}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="attend">
        <div className="attend__row attend__row--head">
          <span className="attend__label" />
          {WEEKDAYS.map((label, day) => (
            <button
              key={label}
              className="attend__day"
              onClick={() => copyAttendanceDay(eater.id, day)}
              title="Скопировать этот день на все будни"
            >
              {label}
            </button>
          ))}
        </div>
        {slots.map((slot) => (
          <div className="attend__row" key={slot.id}>
            <span className="attend__label">{slot.label}</span>
            {WEEKDAYS.map((label, day) => {
              const place = mealPlaceOf(eater, day, slot.id)
              return (
                <button
                  key={label}
                  className="attend__cell"
                  data-place={place}
                  onClick={() => cycleMealPlace(eater.id, day, slot.id)}
                  aria-label={`${label}, ${slot.label.toLowerCase()}: ${MEAL_PLACE_LABEL[place]}`}
                >
                  <PlaceMark place={place} />
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="legend">
        {MEAL_PLACE.map((p) => (
          <span key={p.id} className="legend__item">
            <i className="legend__dot" data-place={p.id}>
              <PlaceMark place={p.id} />
            </i>
            {p.label} — {p.hint}
          </span>
        ))}
      </div>

      <p className="hint" style={{ marginBottom: 0 }}>
        {eater.name}: {attendanceSummary(eater, household.meals)}.
        {maxContainers > 0 &&
          ` Нужно до ${maxContainers} ${plural(maxContainers, ['контейнера', 'контейнеров', 'контейнеров'])} в день, на кухне их ${household.kitchen.containers}.`}
      </p>
    </>
  )
}
