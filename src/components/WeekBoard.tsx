import type { MenuEntry, WeekMenu } from '../types'
import { MEAL_SLOTS } from '../types'
import { WEEKDAYS, cookTasks, dayNorms, dayTotals, fedEaters } from '../lib/menu'
import { recipeById } from '../data/recipeRegistry'
import { cookedStats, planWeek } from '../lib/weekPlan'
import { addDays, parseIso } from '../lib/day'
import { useStore } from '../store'
import { DishTile } from './DishTile'
import { Icon } from './icons'

/**
 * Неделя доской: дни по столбцам, приёмы пищи по строкам.
 *
 * Это то, чего не даёт ни телефон, ни дневной экран: повторы, дни готовки и
 * дыры видны разом, без семи переключений и удержания всего в голове. Раскладка
 * ровно для широкого экрана — на телефоне такая таблица нечитаема, там остаются
 * семь карточек.
 *
 * Считает она не сама: те же функции библиотеки, что и дневной экран и
 * карточка блюда. Вторая раскладка не должна означать второй арифметики.
 *
 * Меню приходит извне, а не из хранилища: недель теперь две — текущая и
 * предпросмотр следующей, — и выбирает между ними экран. Доска берёт то, что
 * ей дали, и не может показать не ту неделю, которую человек открыл.
 */
export function WeekBoard({
  menu,
  onOpenDay,
  onOpenEntry,
  day,
}: {
  menu: WeekMenu
  onOpenDay: (day: number) => void
  /**
   * Нажали на блюдо — открываем его карточку, как и на дневном экране.
   * Необязателен: в предпросмотре следующей недели карточку показать нечем —
   * она считает партию по сохранённому меню, а не по показанному.
   */
  onOpenEntry?: (entry: MenuEntry) => void
  day: number
}) {
  const { household, pantry } = useStore()
  if (!household) return null

  // калории дня — от фактически приготовленных партий, как и везде
  const actual = cookedStats(planWeek(menu, household, { pantry }), pantry)
  const slots = MEAL_SLOTS.filter((m) => household.meals.includes(m.id))
  const tasks = cookTasks(menu)
  // числа месяца — по местному календарю, как и везде в приложении
  const dates = WEEKDAYS.map((_, i) => parseIso(addDays(menu.weekStart, i)).getDate())

  return (
    <div className="board" role="table" aria-label="Меню на неделю">
      <div className="board__row board__row--head" role="row">
        <div className="board__corner" role="columnheader" />
        {WEEKDAYS.map((label, index) => {
          const cooking = tasks.some((t) => t.cookDay === index)
          const totals = dayTotals(menu, index, undefined, actual)
          const norms = dayNorms(household, index)
          return (
            <button
              key={label}
              role="columnheader"
              className="board__day"
              data-active={index === day}
              onClick={() => onOpenDay(index)}
            >
              <span className="board__day-name">{label}</span>
              <span className="board__day-num">{dates[index]}</span>
              {cooking && (
                <span className="board__cook" title="день готовки">
                  <Icon name="pan" size={12} /> готовка
                </span>
              )}
              <span className="board__day-kcal">
                {totals.kcal} / {norms.kcal}
              </span>
            </button>
          )
        })}
      </div>

      {slots.map((slot) => (
        <div className="board__row" key={slot.id} role="row">
          <div className="board__slot" role="rowheader">
            <Icon name={slot.icon} size={16} />
            <span>{slot.label}</span>
          </div>
          {WEEKDAYS.map((label, index) => {
            const entries = menu.entries.filter((e) => e.day === index && e.slot === slot.id)
            const fed = fedEaters(household, index, slot.id)
            return (
              <div
                className="board__cell"
                key={label}
                role="cell"
                data-active={index === day}
              >
                {fed.length === 0 && <span className="board__empty">не дома</span>}
                {fed.length > 0 && entries.length === 0 && (
                  <span className="board__empty">—</span>
                )}
                {entries.map((entry) => {
                  const recipe = recipeById(entry.recipeId)
                  if (!recipe) return null
                  return (
                    <button
                      className="board__dish"
                      key={entry.id}
                      disabled={!onOpenEntry}
                      onClick={onOpenEntry ? () => onOpenEntry(entry) : undefined}
                      title={onOpenEntry ? `${recipe.title} — открыть карточку` : recipe.title}
                      data-eaten={entry.status === 'eaten'}
                      data-skipped={entry.status === 'skipped'}
                    >
                      <DishTile recipe={recipe} size={64} />
                      <span className="board__dish-title">{recipe.title}</span>
                      {entry.fromFreezer && (
                        <span className="board__from-freezer" title="из морозилки">
                          <Icon name="snowflake" size={12} /> из морозилки
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
