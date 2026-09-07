import { useState } from 'react'
import type { MenuGoal } from '../types'
import { MEAL_SLOTS, MENU_GOALS } from '../types'
import { WEEKDAYS_FULL } from '../lib/menu'
import { useStore } from '../store'
import type { RegenerateScope } from '../store'
import { Sheet } from './ui'

/**
 * Управляемая пересборка.
 *
 * «Новое меню» — слишком грубая кнопка: чаще человеку не нужно всё новое, ему
 * нужно дешевле, быстрее или из того, что уже лежит дома. И нужно это обычно
 * не на всю неделю, а на один день или один ужин.
 */
export function RebuildSheet({ day, onClose }: { day: number; onClose: () => void }) {
  const { household, regenerate } = useStore()
  const [goal, setGoal] = useState<MenuGoal>('balanced')
  const [scope, setScope] = useState<RegenerateScope>({ kind: 'week' })
  if (!household) return null
  const slots = MEAL_SLOTS.filter((m) => household.meals.includes(m.id))

  const scopes: { key: string; label: string; value: RegenerateScope }[] = [
    { key: 'week', label: 'Всю неделю', value: { kind: 'week' } },
    { key: 'day', label: WEEKDAYS_FULL[day], value: { kind: 'day', day } },
    ...slots.map((slot) => ({
      key: slot.id,
      label: slot.label,
      value: { kind: 'meal', day, slot: slot.id } as RegenerateScope,
    })),
  ]
  const same = (a: RegenerateScope, b: RegenerateScope) => JSON.stringify(a) === JSON.stringify(b)

  return (
    <Sheet onClose={onClose}>
      <div className="sheet__title">Пересобрать</div>

      <div className="section-title">Что меняем</div>
      <div className="chips">
        {scopes.map((s) => (
          <button
            key={s.key}
            className="chip"
            data-active={same(scope, s.value)}
            onClick={() => setScope(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: 14 }}>
        Чего хочется
      </div>
      <div className="chips">
        {MENU_GOALS.map((g) => (
          <button
            key={g.id}
            className="chip"
            data-active={goal === g.id}
            onClick={() => setGoal(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="hint">{MENU_GOALS.find((g) => g.id === goal)?.hint}</p>

      <p className="hint">
        Закреплённые блюда останутся на месте — пересобирается только то, что не закреплено.
      </p>

      <button
        className="btn"
        onClick={() => {
          regenerate({ scope, goal })
          onClose()
        }}
      >
        Пересобрать
      </button>
    </Sheet>
  )
}
