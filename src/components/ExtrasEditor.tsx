import type { DailyExtra, ExtraKind, MealSlot } from '../types'
import { MEAL_SLOTS } from '../types'
import { EXTRA_KINDS, defaultAmount, extraStats, extraUnit } from '../lib/extras'
import { WEEKDAYS } from '../lib/menu'
import { useStore } from '../store'
import { Stepper } from './ui'

/**
 * Ежедневные дополнения к столу.
 *
 * Овощная тарелка, фрукт, хлеб — не блюда, и рецептом им быть незачем. Но
 * 200 г овощей каждый день это калории, клетчатка и пакет огурцов в закупке:
 * пока их не было в расчёте, они были и в тарелке, и мимо всех цифр сразу.
 */
export function ExtrasEditor() {
  const { household, setExtras } = useStore()
  if (!household) return null
  const extras = household.extras ?? []
  const slots = MEAL_SLOTS.filter((m) => household.meals.includes(m.id))

  const add = (eaterId: string, kind: ExtraKind) => {
    const extra: DailyExtra = {
      id: `x${Date.now().toString(36)}`,
      eaterId,
      kind,
      amount: defaultAmount(kind),
      slot: slots.find((s) => s.id === 'lunch')?.id ?? slots[0].id,
      days: [0, 1, 2, 3, 4, 5, 6],
    }
    setExtras([...extras, extra])
  }
  const patch = (id: string, change: Partial<DailyExtra>) =>
    setExtras(extras.map((x) => (x.id === id ? { ...x, ...change } : x)))

  return (
    <div className="stack">
      {household.eaters.map((eater) => {
        const mine = extras.filter((x) => x.eaterId === eater.id)
        const perDay = mine.reduce((sum, x) => sum + extraStats(x).kcal, 0)
        return (
          <div key={eater.id} className="drinks__person">
            <b>{eater.name}</b>
            <div className="chips" style={{ marginTop: 6 }}>
              {EXTRA_KINDS.map((kind) => (
                <button
                  key={kind.id}
                  className="chip"
                  onClick={() => add(eater.id, kind.id)}
                  title={kind.hint}
                >
                  + {kind.label}
                </button>
              ))}
            </div>

            {mine.map((extra) => {
              const unit = extraUnit(extra.kind) === 'pcs' ? 'шт' : 'г'
              const step = unit === 'шт' ? 1 : 10
              return (
                <div className="drink" key={extra.id}>
                  <div className="drink__body" style={{ paddingTop: 12 }}>
                    <div className="row row--between">
                      <b>{EXTRA_KINDS.find((k) => k.id === extra.kind)?.label}</b>
                      <span className="drink__kcal">{extraStats(extra).kcal} ккал</span>
                    </div>

                    <div className="row row--between">
                      <span>Сколько, {unit}</span>
                      <Stepper
                        value={extra.amount}
                        min={step}
                        max={unit === 'шт' ? 5 : 500}
                        step={step}
                        onChange={(amount) => patch(extra.id, { amount })}
                      />
                    </div>

                    <div className="chips">
                      {slots.map((slot) => (
                        <button
                          key={slot.id}
                          className="chip"
                          data-active={extra.slot === slot.id}
                          onClick={() => patch(extra.id, { slot: slot.id as MealSlot })}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>

                    <div className="days">
                      {WEEKDAYS.map((label, day) => (
                        <button
                          key={label}
                          className="chip"
                          data-active={extra.days.includes(day)}
                          onClick={() =>
                            patch(extra.id, {
                              days: extra.days.includes(day)
                                ? extra.days.filter((d) => d !== day)
                                : [...extra.days, day].sort(),
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <button
                      className="btn btn--ghost"
                      onClick={() => setExtras(extras.filter((x) => x.id !== extra.id))}
                    >
                      Убрать
                    </button>
                  </div>
                </div>
              )
            })}

            {perDay > 0 && (
              <p className="hint" style={{ marginBottom: 0 }}>
                Дополнения — {perDay} ккал в день. Они входят в закупку и в норму, но отдельным
                блюдом не считаются.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
