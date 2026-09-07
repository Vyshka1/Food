import { MEAL_SLOTS } from '../types'
import { repeatsOf } from '../lib/menu'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Stepper, Switch } from './ui'

/**
 * Насколько человек готов есть одно и то же.
 *
 * Повторение — не порок: одно блюдо два дня подряд экономит и время, и
 * продукты, ради этого готовку и собирают партиями. Но граница у каждого
 * своя и разная для разных приёмов: суп можно есть три дня, ужин — вряд ли.
 * Раньше эта граница была зашита в код одним числом на всё меню.
 */
export function RepeatsEditor() {
  const { household, setRepeats } = useStore()
  if (!household) return null
  const repeats = repeatsOf(household)
  const slots = MEAL_SLOTS.filter((m) => household.meals.includes(m.id))

  return (
    <div className="stack">
      {slots.map((slot) => (
        <div className="row row--between" key={slot.id}>
          <div>
            <div>{slot.label}</div>
            <div className="muted small">
              {repeats.maxPerWeek[slot.id] >= 7
                ? 'можно каждый день'
                : `до ${repeats.maxPerWeek[slot.id]} ${plural(repeats.maxPerWeek[slot.id], ['приёма', 'приёмов', 'приёмов'])} одного блюда`}
            </div>
          </div>
          <Stepper
            value={repeats.maxPerWeek[slot.id]}
            min={1}
            max={7}
            onChange={(value) =>
              setRepeats({
                ...repeats,
                maxPerWeek: { ...repeats.maxPerWeek, [slot.id]: value },
              })
            }
          />
        </div>
      ))}

      <div className="row row--between">
        <div>
          <div>Два дня подряд</div>
          <div className="muted small">
            {repeats.backToBack
              ? 'приготовленное можно доесть на следующий день'
              : 'каждый день новое блюдо — готовить придётся чаще'}
          </div>
        </div>
        <Switch
          on={repeats.backToBack}
          onChange={(backToBack) => setRepeats({ ...repeats, backToBack })}
        />
      </div>

      {!repeats.backToBack && (
        <div className="row row--between">
          <div>
            <div>Через сколько дней можно повторить</div>
            <div className="muted small">заморозили — и вернули в меню позже</div>
          </div>
          <Stepper
            value={repeats.gapDays}
            min={2}
            max={6}
            onChange={(gapDays) => setRepeats({ ...repeats, gapDays })}
          />
        </div>
      )}

      <p className="hint" style={{ marginBottom: 0 }}>
        Блюдо, которое вы отметили как «нравится», может выпадать на раз чаще: отдельный список
        «что готов есть чаще» пришлось бы вести дважды.
      </p>
    </div>
  )
}
