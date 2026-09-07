import type { Kitchen } from '../types'
import { Stepper, Switch } from './ui'

/**
 * Что есть на кухне. Это не анкетная формальность: каждый прибор — ресурс
 * расписания. Две духовки реально запекают параллельно, один блендер не
 * может одновременно пюрировать два супа.
 */
const APPLIANCES: { key: keyof Kitchen; label: string; hint: string }[] = [
  { key: 'hasAirfryer', label: 'Аэрогриль', hint: 'заменяет духовку в подборе блюд' },
  { key: 'hasMulticooker', label: 'Мультиварка', hint: 'готовит без присмотра' },
  { key: 'hasBlender', label: 'Блендер', hint: 'супы-пюре и смузи' },
  { key: 'hasProcessor', label: 'Кухонный комбайн', hint: 'нарезка и шинковка' },
  { key: 'hasMicrowave', label: 'Микроволновка', hint: 'разогрев и разморозка' },
  { key: 'hasDishwasher', label: 'Посудомоечная машина', hint: 'меньше уборки после готовки' },
  { key: 'hasFreezer', label: 'Морозилка', hint: 'без неё блюда не доживают до конца недели' },
]

export function KitchenEditor({
  kitchen,
  onChange,
}: {
  kitchen: Kitchen
  onChange: (patch: Partial<Kitchen>) => void
}) {
  return (
    <div className="stack">
      <div className="row row--between">
        <span>Конфорки</span>
        <Stepper
          value={kitchen.burners}
          min={1}
          max={6}
          onChange={(burners) => onChange({ burners })}
        />
      </div>
      <div className="row row--between">
        <div>
          <div>Духовки</div>
          <div className="muted small">две духовки запекают параллельно</div>
        </div>
        <Stepper value={kitchen.ovens} min={0} max={2} onChange={(ovens) => onChange({ ovens })} />
      </div>

      {APPLIANCES.map((a) => (
        <div className="row row--between" key={a.key}>
          <div>
            <div>{a.label}</div>
            <div className="muted small">{a.hint}</div>
          </div>
          <Switch
            on={Boolean(kitchen[a.key])}
            onChange={(on) => onChange({ [a.key]: on } as Partial<Kitchen>)}
          />
        </div>
      ))}

      <div className="row row--between">
        <span>Контейнеры</span>
        <Stepper
          value={kitchen.containers}
          min={0}
          max={30}
          onChange={(containers) => onChange({ containers })}
        />
      </div>

      <p className="hint" style={{ marginBottom: 0 }}>
        План готовки считает приборы ресурсом: два блюда не встанут в один блендер, а с двумя
        духовками запекание пойдёт параллельно.
      </p>
    </div>
  )
}
