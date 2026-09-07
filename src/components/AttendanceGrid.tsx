import { useState } from 'react'
import { MEAL_SLOTS } from '../types'
import { WEEKDAYS, eatsAtHome } from '../lib/menu'
import { useStore } from '../store'
import { plural } from '../lib/format'

/**
 * Кто где ест. Без этого семейный расчёт покупает лишнее: Кирилл обедает в
 * офисе пять дней в неделю, а закупка всё равно считает пять обедов.
 */
export function AttendanceGrid() {
  const { household, toggleAway } = useStore()
  const [who, setWho] = useState(0)
  if (!household) return null

  const eater = household.eaters[Math.min(who, household.eaters.length - 1)]
  const slots = MEAL_SLOTS.filter((m) => household.meals.includes(m.id))
  const awayCount = eater.awayMeals.filter((key) =>
    slots.some((s) => key.endsWith(`:${s.id}`)),
  ).length

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

      <div className="attend">
        <div className="attend__row attend__row--head">
          <span className="attend__label" />
          {WEEKDAYS.map((label) => (
            <span key={label} className="attend__day">
              {label}
            </span>
          ))}
        </div>
        {slots.map((slot) => (
          <div className="attend__row" key={slot.id}>
            <span className="attend__label">{slot.label}</span>
            {WEEKDAYS.map((label, day) => {
              const home = eatsAtHome(eater, day, slot.id)
              return (
                <button
                  key={label}
                  className="attend__cell"
                  data-home={home}
                  onClick={() => toggleAway(eater.id, day, slot.id)}
                  aria-label={`${label}, ${slot.label.toLowerCase()}: ${home ? 'дома' : 'не дома'}`}
                  aria-pressed={home}
                />
              )
            })}
          </div>
        ))}
      </div>

      <p className="hint" style={{ marginBottom: 0 }}>
        {awayCount === 0
          ? `${eater.name} ест дома всю неделю. Нажмите на клетку, если приём пищи будет вне дома.`
          : `${awayCount} ${plural(awayCount, ['приём', 'приёма', 'приёмов'])} вне дома — эти порции не готовим и не покупаем.`}
      </p>
    </>
  )
}
