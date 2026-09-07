import { useMemo, useState } from 'react'
import type { MenuEntry } from '../types'
import { REPLACE_REASONS, WEEKDAYS_FULL, replacementOptions } from '../lib/menu'
import type { ReplaceReason, ReplacementOption } from '../lib/menu'
import { recipeById } from '../data/recipeRegistry'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Sheet } from './ui'
import { DishThumb } from './DishImage'

const STORAGE_HINT: Record<string, string> = {
  fresh: '',
  fridge: 'из холодильника',
  freezer: 'из морозилки',
}

/** «−120 ₽», «+15 мин» — знак важнее числа, поэтому пишем его явно. */
function delta(value: number, unit: string): { text: string; good: boolean } | null {
  if (value === 0) return null
  const sign = value > 0 ? '+' : '−'
  return { text: `${sign}${Math.abs(value)} ${unit}`, good: value < 0 }
}

function OptionRow({
  option,
  onPick,
}: {
  option: ReplacementOption
  onPick: () => void
}) {
  const price = delta(option.deltaPrice, '₽')
  const minutes = delta(option.deltaMinutes, 'мин')
  const hint = STORAGE_HINT[option.storage]
  return (
    <button className="dish" onClick={onPick}>
      <DishThumb recipe={option.recipe} />
      <span style={{ flex: 1 }}>
        <span className="dish__title">{option.recipe.title}</span>
        <span className="dish__meta">
          {option.kcal} ккал · ≈ {option.price} ₽ порция · {option.minutes} мин
        </span>
        <span className="dish__deltas">
          {price && <span data-good={price.good}>{price.text}</span>}
          {minutes && <span data-good={minutes.good}>{minutes.text}</span>}
          {option.reuseShare >= 0.8 && <span data-good="true">без новых продуктов</span>}
          {option.recipe.custom && <span className="badge">свой рецепт</span>}
          {hint && <span className={`badge badge--${option.storage}`}>{hint}</span>}
        </span>
      </span>
    </button>
  )
}

/** Выбор блюда на замену: сначала причина, потом варианты — она меняет подбор. */
export function ReplacePicker({
  entry,
  onClose,
  onPick,
}: {
  entry: MenuEntry
  onClose: () => void
  onPick: (recipeId: string) => void
}) {
  const { menu, household } = useStore()
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState<ReplaceReason | undefined>()

  const options = useMemo(
    () => (menu && household ? replacementOptions(menu, household, entry.id, reason, 40) : []),
    [menu, household, entry.id, reason],
  )

  if (!menu || !household) return null
  const current = recipeById(entry.recipeId)

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? options.filter((o) => o.recipe.title.toLowerCase().includes(needle))
    : options
  const activeReason = REPLACE_REASONS.find((r) => r.id === reason)

  return (
    <Sheet onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Чем заменить</div>
        <div className="muted small">
          {WEEKDAYS_FULL[entry.day]}
          {current ? ` · вместо «${current.title}»` : ''}
        </div>
      </div>

      <div className="section-title" style={{ marginBottom: 8 }}>
        Что не так с блюдом
      </div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {REPLACE_REASONS.map((r) => (
          <button
            key={r.id}
            className="chip"
            data-active={reason === r.id}
            onClick={() => setReason(reason === r.id ? undefined : r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        {activeReason
          ? `${activeReason.hint}. Калорийность, БЖУ и бюджет держим прежними.`
          : 'Необязательно — но с причиной подбор точнее. Норму дня и бюджет держим в любом случае.'}
      </p>

      <div className="field" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Поиск по названию"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {shown.length === 0 && (
        <p className="hint">
          {options.length === 0
            ? 'Замены нет: другие блюда не проходят по аллергиям, технике или срокам хранения.'
            : 'Ничего не нашлось — попробуйте другое слово.'}
        </p>
      )}

      {shown.map((option) => (
        <OptionRow
          key={option.recipe.id}
          option={option}
          onPick={() => onPick(option.recipe.id)}
        />
      ))}

      {options.length > 0 && (
        <p className="hint">
          {options.length} {plural(options.length, ['вариант', 'варианта', 'вариантов'])} на этот
          приём пищи.
        </p>
      )}
    </Sheet>
  )
}
