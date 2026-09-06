import { useMemo, useState } from 'react'
import type { MenuEntry } from '../types'
import { WEEKDAYS_FULL, replacementOptions } from '../lib/menu'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Sheet } from './ui'

const STORAGE_HINT: Record<string, string> = {
  fresh: '',
  fridge: 'из холодильника',
  freezer: 'из морозилки',
}

/** Выбор блюда на замену: показываем варианты, а не решаем за человека. */
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

  const options = useMemo(
    () => (menu && household ? replacementOptions(menu, household, entry.id, 40) : []),
    [menu, household, entry.id],
  )

  if (!menu || !household) return null

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? options.filter((o) => o.recipe.title.toLowerCase().includes(needle))
    : options

  return (
    <Sheet onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Чем заменить</div>
        <div className="muted small">
          {WEEKDAYS_FULL[entry.day]} · подходит по норме и ограничениям. Сверху — то, что ложится
          в день лучше всего.
        </div>
      </div>

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
        <button className="dish" key={option.recipe.id} onClick={() => onPick(option.recipe.id)}>
          <span className="dish__emoji">{option.recipe.emoji}</span>
          <span style={{ flex: 1 }}>
            <span className="dish__title">{option.recipe.title}</span>
            <span className="dish__meta">
              {option.kcal} ккал · {option.price} ₽ порция · {option.minutes} мин
            </span>
            {(option.recipe.custom || STORAGE_HINT[option.storage]) && (
              <span>
                {option.recipe.custom && <span className="badge">свой рецепт</span>}
                {STORAGE_HINT[option.storage] && (
                  <span className={`badge badge--${option.storage}`}>
                    {STORAGE_HINT[option.storage]}
                  </span>
                )}
              </span>
            )}
          </span>
        </button>
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
