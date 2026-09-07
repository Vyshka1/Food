import type { MenuEntry } from '../types'
import { MEAL_SLOTS } from '../types'
import { WEEKDAYS_FULL, cookTasks, dayNorms, dayTotals, fedEaters, takeawayEaters } from '../lib/menu'
import { recipeById } from '../data/recipeRegistry'
import { extrasAt } from '../lib/extras'
import { useStore } from '../store'
import { Icon } from './icons'

/**
 * Неделя целиком.
 *
 * Дневной экран удобен, когда готовишь сегодня. Но вопросы «что повторяется»,
 * «в какие дни готовка» и «где дыры» на нём не видны вообще: чтобы их
 * заметить, нужно семь раз переключить день и всё это удержать в голове.
 *
 * На телефоне это не таблица, а семь карточек: в каждой — блюда, цена дня,
 * отметки готовки и заморозки и то, кого в этот день нет.
 */
export function WeekOverview({ onOpenDay }: { onOpenDay: (day: number) => void }) {
  const { household, menu } = useStore()
  if (!household || !menu) return null

  const slots = MEAL_SLOTS.filter((m) => household.meals.includes(m.id))
  const tasks = cookTasks(menu)
  // сколько раз блюдо встречается за неделю — отсюда и отметка повтора
  const counts = new Map<string, number>()
  for (const entry of menu.entries) {
    counts.set(entry.recipeId, (counts.get(entry.recipeId) ?? 0) + 1)
  }

  return (
    <div className="week-view">
      {WEEKDAYS_FULL.map((label, day) => {
        const totals = dayTotals(menu, day)
        const norms = dayNorms(household, day)
        const cooking = tasks.some((t) => t.cookDay === day)
        const freezing = tasks.some((t) => t.cookDay === day && t.freezerPortions > 0)
        const away = household.eaters.filter((e) =>
          slots.some((s) => !fedEaters(household, day, s.id).some((x) => x.id === e.id)),
        )
        const withMe = household.eaters.filter((e) =>
          slots.some((s) => takeawayEaters(household, day, s.id).some((x) => x.id === e.id)),
        )
        const percent = Math.round((totals.kcal / Math.max(1, norms.kcal)) * 100)

        return (
          <button className="week-day" key={label} onClick={() => onOpenDay(day)}>
            <div className="week-day__head">
              <b>{label}</b>
              <span className="week-day__marks">
                {cooking && (
                  <span className="badge" title="день готовки">
                    <Icon name="pan" size={13} /> готовка
                  </span>
                )}
                {freezing && (
                  <span className="badge badge--freezer" title="часть уходит в морозилку">
                    <Icon name="snowflake" size={13} /> в морозилку
                  </span>
                )}
              </span>
            </div>

            {slots.map((slot) => {
              const entries = menu.entries.filter(
                (e: MenuEntry) => e.day === day && e.slot === slot.id,
              )
              const fed = fedEaters(household, day, slot.id)
              return (
                <div className="week-day__row" key={slot.id}>
                  <span className="week-day__slot">{slot.label}</span>
                  <span className="week-day__dishes">
                    {fed.length === 0 ? (
                      <span className="muted">никого нет дома</span>
                    ) : entries.length === 0 ? (
                      <span className="week-day__gap">не запланировано</span>
                    ) : (
                      entries.map((entry) => {
                        const recipe = recipeById(entry.recipeId)
                        const repeated = (counts.get(entry.recipeId) ?? 0) > 1
                        return (
                          <span key={entry.id} className="week-day__dish" data-repeat={repeated}>
                            {recipe?.title ?? entry.recipeId}
                            {entry.storage === 'freezer' && ' ❄'}
                          </span>
                        )
                      })
                    )}
                    {extrasAt(household, day, slot.id).length > 0 && (
                      <span className="week-day__extra">+ к столу</span>
                    )}
                  </span>
                </div>
              )
            })}

            <div className="week-day__foot">
              <span>≈ {totals.price} ₽</span>
              <span>{percent}% нормы</span>
              {withMe.length > 0 && <span>с собой: {withMe.map((e) => e.name).join(', ')}</span>}
              {away.length > 0 && <span>не дома: {away.map((e) => e.name).join(', ')}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
