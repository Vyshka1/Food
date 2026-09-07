import { useMemo, useState } from 'react'
import { recipeById } from '../data/recipeRegistry'
import { ENTRY_STATUS, MEAL_SLOTS } from '../types'
import type { MenuEntry } from '../types'
import { WEEKDAYS, dayNorms, dayTotals, eatersAtHome, portionOf, totalPortions } from '../lib/menu'
import { portionWeight, recipeStats } from '../lib/nutrition'
import { useStore } from '../store'
import { CalorieRing, Card, Warnings } from '../components/ui'
import { RecipeSheet } from '../components/RecipeSheet'
import { Icon } from '../components/icons'
import { DishThumb } from '../components/DishImage'
import { plural } from '../lib/format'
import { MACRO_COLOR } from '../lib/palette'
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
  const { household, menu, warnings, regenerate, swapDish, banRecipe, togglePin, setEntryStatus } =
    useStore()
  const [day, setDay] = useState(() => (menu ? todayIndex(menu.weekStart) : 0))
  const [openEntry, setOpenEntry] = useState<MenuEntry | null>(null)
  const [note, setNote] = useState('')
  const [replacing, setReplacing] = useState<MenuEntry | null>(null)
  /** null — вся семья, иначе тарелка одного едока. */
  const [who, setWho] = useState<string | null>(null)

  const eater = household?.eaters.find((e) => e.id === who) ?? null
  /** Норма считается по тому, что человек ест дома: обед в офисе — не наш недобор. */
  const norms = useMemo(
    () => (household ? dayNorms(household, day, eater?.id) : null),
    [household, day, eater],
  )
  const totals = useMemo(
    () => (menu ? dayTotals(menu, day, eater?.id) : null),
    [menu, day, eater],
  )

  if (!household || !menu || !norms || !totals) return null

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(menu.weekStart)
    d.setDate(d.getDate() + i)
    return d.getDate()
  })

  const monthNames = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ]
  const weekStart = new Date(menu.weekStart)
  const weekEnd = new Date(menu.weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()}–${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()]}`
      : `${weekStart.getDate()} ${monthNames[weekStart.getMonth()]} — ${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()]}`

  // план и факт: пока отметок нет, показываем состав недели, потом — что съели
  const eatenCount = menu.entries.filter((e) => e.status === 'eaten').length
  const skippedCount = menu.entries.filter((e) => e.status === 'skipped').length
  const marked = menu.entries.filter((e) => e.status).length

  const pct = (fact: number, norm: number) => Math.round((fact / Math.max(1, norm)) * 100)
  const percent = pct(totals.kcal, norms.kcal)
  /** Отклонение больше 15% подсвечиваем: «99% нормы» не должно скрывать перекос по БЖУ. */
  const off = (value: number) => (Math.abs(value - 100) > 15 ? { color: 'var(--warn)' } : undefined)
  const macros = [
    { label: 'Белки', color: MACRO_COLOR.protein, fact: totals.protein, norm: norms.protein },
    { label: 'Жиры', color: MACRO_COLOR.fat, fact: totals.fat, norm: norms.fat },
    { label: 'Углеводы', color: MACRO_COLOR.carbs, fact: totals.carbs, norm: norms.carbs },
  ]

  return (
    <div className="app">
      <div className="row row--between" style={{ paddingTop: 10 }}>
        <div>
          <b>{weekLabel}</b>
          <div className="muted small">
            {marked > 0
              ? `съедено ${eatenCount} из ${menu.entries.length}` +
                (skippedCount > 0 ? ` · пропущено ${skippedCount}` : '')
              : `меню на ${household.eaters.length} ${plural(household.eaters.length, ['человек', 'человека', 'человек'])} · ${household.cookingDays.length} ${plural(household.cookingDays.length, ['день', 'дня', 'дней'])} готовки`}
          </div>
        </div>
        <button className="btn btn--soft btn--small" onClick={() => regenerate()}>
          Пересобрать
        </button>
      </div>

      <div className="week-strip">
        {WEEKDAYS.map((label, i) => (
          <button key={label} data-active={i === day} onClick={() => setDay(i)}>
            <span className="wd">{label}</span>
            <span className="dn">{dates[i]}</span>
          </button>
        ))}
      </div>

      {household.eaters.length > 1 && (
        <div className="segmented" style={{ marginBottom: 12 }}>
          <button data-active={who === null} onClick={() => setWho(null)}>
            Семья
          </button>
          {household.eaters.map((e) => (
            <button key={e.id} data-active={who === e.id} onClick={() => setWho(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      <Warnings items={warnings} />

      {note && <div className="shop__note">{note}</div>}

      <Card>
        <div className="ring-row">
          <CalorieRing {...totals} label={`из ${norms.kcal} ккал`} />
          <div style={{ flex: 1 }}>
            {macros.map((m) => (
              <div className="macro" key={m.label}>
                <span>
                  <i className="dot" style={{ background: m.color }} />
                  {m.label}
                </span>
                <b>
                  {m.fact} / {m.norm} г{' '}
                  <span className="small" style={off(pct(m.fact, m.norm))}>
                    {pct(m.fact, m.norm)}%
                  </span>
                </b>
              </div>
            ))}
            <div className="macro muted small">
              <span style={off(percent)}>калории {percent}%</span>
              <span>≈ {totals.price} ₽</span>
            </div>
          </div>
        </div>
      </Card>

      {MEAL_SLOTS.filter((m) => household.meals.includes(m.id)).map((meal) => {
        const entries = menu.entries.filter((e) => e.day === day && e.slot === meal.id)
        const home = eatersAtHome(household, day, meal.id)
        const away = household.eaters.filter((e) => !home.some((h) => h.id === e.id))
        return (
          <div key={meal.id}>
            <div className="meal-head">
              <Icon name={meal.icon} size={18} />
              {meal.label}
              {away.length > 0 && (
                <span className="meal-head__away">
                  {away.map((e) => e.name).join(', ')} не дома
                </span>
              )}
            </div>
            {home.length === 0 && (
              <p className="hint">Все едят не дома — на этот приём ничего не готовим.</p>
            )}
            {home.length > 0 && entries.length === 0 && (
              <p className="hint">Ничего не запланировано.</p>
            )}
            {entries.map((entry) => {
              const recipe = recipeById(entry.recipeId)
              if (!recipe) return null
              const stats = recipeStats(recipe)
              const factor = eater ? portionOf(entry, eater.id) : totalPortions(entry)
              const badge = STORAGE_BADGE[entry.storage]
              return (
                <div
                  className="dish dish--row"
                  key={entry.id}
                  data-pinned={!!entry.pinned}
                  data-status={entry.status ?? ""}
                >
                  <button className="dish__open" onClick={() => setOpenEntry(entry)}>
                    <DishThumb recipe={recipe} />
                    <span style={{ flex: 1 }}>
                      <span className="dish__title">{recipe.title}</span>
                      <span className="dish__meta">
                        {eater && factor === 0
                          ? 'ест не дома'
                          : eater
                            ? `${portionWeight(recipe, factor)} г · ${Math.round(stats.kcal * factor)} ккал`
                            : `на всех: ${Math.round(stats.kcal * factor)} ккал · ≈ ${Math.round(stats.price * factor)} ₽`}
                      </span>
                      <br />
                      {badge && <span className={badge.cls}>{badge.label}</span>}
                      {entry.cookDay !== entry.day && (
                        <span className="badge">готовим {WEEKDAYS[entry.cookDay]}</span>
                      )}
                      {entry.pinned && <span className="badge">оставлено</span>}
                    </span>
                  </button>
                  <button
                    className="dish__pin"
                    data-on={!!entry.pinned}
                    onClick={() => togglePin(entry.id)}
                    aria-label={
                      entry.pinned ? 'снять закрепление блюда' : 'оставить это блюдо при пересборке'
                    }
                    title={
                      entry.pinned
                        ? 'Пересборка меню его не тронет'
                        : 'Оставить это блюдо при пересборке'
                    }
                  >
                    <Icon name="pin" size={18} />
                  </button>
                  <div className="dish__status">
                    {ENTRY_STATUS.map((st) => (
                      <button
                        key={st.id}
                        data-on={entry.status === st.id}
                        onClick={() =>
                          setEntryStatus(entry.id, entry.status === st.id ? null : st.id)
                        }
                        title={st.label}
                        aria-label={`${recipe.title}: ${st.label.toLowerCase()}`}
                        aria-pressed={entry.status === st.id}
                      >
                        <Icon name={st.icon} size={15} />
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

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
