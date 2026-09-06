import { useMemo, useState } from 'react'
import { recipeById } from '../data/recipeRegistry'
import { MEAL_SLOTS } from '../types'
import type { MenuEntry } from '../types'
import { WEEKDAYS, dayTotals, householdNorms } from '../lib/menu'
import { recipeStats } from '../lib/nutrition'
import { useStore } from '../store'
import { CalorieRing, Card, Warnings } from '../components/ui'
import { RecipeSheet } from '../components/RecipeSheet'
import { ReplacePicker } from '../components/ReplacePicker'

const STORAGE_BADGE: Record<string, { label: string; cls: string } | null> = {
  fresh: null,
  fridge: { label: 'из холодильника', cls: 'badge badge--fridge' },
  freezer: { label: 'из морозилки', cls: 'badge badge--freezer' },
}

function todayIndex(weekStart: string): number {
  const start = new Date(weekStart)
  const diff = Math.floor((Date.now() - start.getTime()) / 86_400_000)
  return diff >= 0 && diff <= 6 ? diff : 0
}

export function MenuScreen() {
  const { household, menu, warnings, regenerate, swapDish, banRecipe } = useStore()
  const [day, setDay] = useState(() => (menu ? todayIndex(menu.weekStart) : 0))
  const [openEntry, setOpenEntry] = useState<MenuEntry | null>(null)
  const [note, setNote] = useState('')
  const [replacing, setReplacing] = useState<MenuEntry | null>(null)

  const norms = useMemo(() => (household ? householdNorms(household) : null), [household])
  const totals = useMemo(() => (menu ? dayTotals(menu, day) : null), [menu, day])

  if (!household || !menu || !norms || !totals) return null

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(menu.weekStart)
    d.setDate(d.getDate() + i)
    return d.getDate()
  })

  const percent = Math.round((totals.kcal / Math.max(1, norms.kcal)) * 100)

  return (
    <div className="app">
      <div className="week-strip">
        {WEEKDAYS.map((label, i) => (
          <button key={label} data-active={i === day} onClick={() => setDay(i)}>
            <span className="wd">{label}</span>
            <span className="dn">{dates[i]}</span>
          </button>
        ))}
      </div>

      <Warnings items={warnings} />

      {note && <div className="shop__note">{note}</div>}

      <Card>
        <div className="ring-row">
          <CalorieRing {...totals} label={`из ${norms.kcal} ккал`} />
          <div style={{ flex: 1 }}>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: '#8ec06c' }} />
                Белки
              </span>
              <b>
                {totals.protein} / {norms.protein} г
              </b>
            </div>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: '#e0b352' }} />
                Жиры
              </span>
              <b>
                {totals.fat} / {norms.fat} г
              </b>
            </div>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: '#3f7233' }} />
                Углеводы
              </span>
              <b>
                {totals.carbs} / {norms.carbs} г
              </b>
            </div>
            <div className="macro muted small">
              <span>{percent}% нормы на день</span>
              <span>{totals.price} ₽</span>
            </div>
          </div>
        </div>
      </Card>

      {MEAL_SLOTS.filter((m) => household.meals.includes(m.id)).map((meal) => {
        const entries = menu.entries.filter((e) => e.day === day && e.slot === meal.id)
        return (
          <div key={meal.id}>
            <div className="meal-head">
              <span>{meal.emoji}</span>
              {meal.label}
            </div>
            {entries.length === 0 && <p className="hint">Ничего не запланировано.</p>}
            {entries.map((entry) => {
              const recipe = recipeById(entry.recipeId)
              if (!recipe) return null
              const stats = recipeStats(recipe)
              const badge = STORAGE_BADGE[entry.storage]
              return (
                <button className="dish" key={entry.id} onClick={() => setOpenEntry(entry)}>
                  <span className="dish__emoji">{recipe.emoji}</span>
                  <span style={{ flex: 1 }}>
                    <span className="dish__title">{recipe.title}</span>
                    <span className="dish__meta">
                      {Math.round(stats.kcal * entry.scale)} ккал ·{' '}
                      {Math.round(stats.price * entry.scale)} ₽ порция
                    </span>
                    <br />
                    {badge && <span className={badge.cls}>{badge.label}</span>}
                    {entry.cookDay !== entry.day && (
                      <span className="badge">готовим {WEEKDAYS[entry.cookDay]}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}

      <button className="btn btn--soft" style={{ marginTop: 16 }} onClick={() => regenerate()}>
        Пересобрать меню на неделю
      </button>

      {openEntry && (
        <RecipeSheet
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
          onSwap={() => {
            setReplacing(openEntry)
            setOpenEntry(null)
          }}
          onBan={() => {
            const title = recipeById(openEntry.recipeId)?.title ?? 'Блюдо'
            household.eaters.forEach((e) => banRecipe(e.id, openEntry.recipeId))
            setOpenEntry(null)
            setNote(`«${title}» больше не появится. Вернуть можно в профиле.`)
            setTimeout(() => setNote(''), 5000)
          }}
        />
      )}

      {replacing && (
        <ReplacePicker
          entry={replacing}
          onClose={() => setReplacing(null)}
          onPick={(recipeId) => {
            const title = recipeById(recipeId)?.title ?? 'Блюдо'
            swapDish(replacing.id, recipeId)
            setReplacing(null)
            setNote(`Поставили «${title}».`)
            setTimeout(() => setNote(''), 3000)
          }}
        />
      )}
    </div>
  )
}
