import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { MenuEntry } from '../types'
import { pieceLabel, recipeStats } from '../lib/nutrition'
import { formatQty } from '../lib/shopping'
import { formatDuration } from '../lib/cookingPlan'
import { WEEKDAYS_FULL, portionOf, totalPortions } from '../lib/menu'
import { portionsLabel } from '../lib/format'
import { useStore } from '../store'
import { Sheet } from './ui'
import { Icon, recipeIcon } from './icons'

const STORAGE_LABEL: Record<string, string> = {
  fresh: 'Готовим в этот день',
  fridge: 'Из холодильника',
  freezer: 'Из морозилки — достать заранее',
}

export function RecipeSheet({
  entry,
  onClose,
  onSwap,
  onBan,
}: {
  entry: MenuEntry
  onClose: () => void
  onSwap: () => void
  onBan: () => void
}) {
  const { household, menu } = useStore()
  const recipe = recipeById(entry.recipeId)
  if (!recipe || !household || !menu) return null
  const stats = recipeStats(recipe)
  const total = totalPortions(entry)
  const totalMinutes = recipe.steps.reduce((s, st) => s + st.minutes, 0)
  /** Одна готовка кормит несколько дней — покажем, сколько уйдёт в остаток. */
  const sameCook = menu.entries.filter(
    (e) => e.recipeId === entry.recipeId && e.cookDay === entry.cookDay,
  )
  const cookedTotal = sameCook.reduce((sum, e) => sum + totalPortions(e), 0)
  const laterDays = sameCook.filter((e) => e.day > entry.day).map((e) => e.day)
  const leftover = sameCook
    .filter((e) => e.day > entry.day)
    .reduce((sum, e) => sum + totalPortions(e), 0)

  return (
    <Sheet onClose={onClose}>
      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <div className="dish__emoji" style={{ width: 56, height: 56 }}>
          <Icon name={recipeIcon(recipe)} size={30} />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
          <div className="muted small">
            {formatDuration(totalMinutes)} · {Math.round(stats.price * total)} ₽ на всех ·{' '}
            {WEEKDAYS_FULL[entry.day]}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          Кому сколько · готовим {pieceLabel(recipe, cookedTotal)}
        </div>
        {household.eaters.map((eater) => {
          const factor = portionOf(entry, eater.id)
          return (
            <div className="ing-line" key={eater.id}>
              <span>{eater.name}</span>
              {factor === 0 ? (
                <b className="muted">ест не дома</b>
              ) : (
                <b>
                  {pieceLabel(recipe, factor)} · {Math.round(stats.kcal * factor)} ккал
                </b>
              )}
            </div>
          )
        })}
        {leftover > 0 && (
          <div className="ing-line">
            <span className="muted">Остаток</span>
            <b>
              {pieceLabel(recipe, leftover)} на{' '}
              {laterDays.map((d) => WEEKDAYS_FULL[d].toLowerCase()).join(', ')}
            </b>
          </div>
        )}
        <p className="hint" style={{ marginBottom: 0 }}>
          Одно блюдо, разные порции: каждому столько, сколько нужно по его норме.
        </p>
      </div>

      <div className="card card--soft">
        <div className="row row--between small">
          <span className="muted">Белки · жиры · углеводы на всё блюдо</span>
          <b>
            {Math.round(stats.protein * total)} · {Math.round(stats.fat * total)} ·{' '}
            {Math.round(stats.carbs * total)} г
          </b>
        </div>
        <div className="row row--between small" style={{ marginTop: 6 }}>
          <span className="muted">Хранение</span>
          <b>{STORAGE_LABEL[entry.storage]}</b>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Продукты · {portionsLabel(total)}</div>
        {recipe.items.map((item) => {
          const ing = INGREDIENT_BY_ID[item.ingredientId]
          if (!ing) return null
          const qty = item.qty * total
          return (
            <div className="ing-line" key={item.ingredientId}>
              <span>{ing.name}</span>
              <b>{formatQty(ing.unit === 'pcs' ? Math.round(qty * 2) / 2 : qty, ing.unit)}</b>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="section-title">Шаги</div>
        {recipe.steps.map((step, i) => (
          <div className="step-line" key={i}>
            <span className="step-line__n">{i + 1}</span>
            <div>
              <div>{step.text}</div>
              <div className="muted small">
                {step.minutes} мин ·{' '}
                {step.station === 'oven'
                  ? 'духовка'
                  : step.station === 'stove'
                    ? 'плита'
                    : step.station === 'wait'
                      ? 'без участия'
                      : 'руками'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--soft" onClick={onSwap}>
          Заменить блюдо
        </button>
        <button className="btn btn--ghost" onClick={onBan}>
          Больше не показывать
        </button>
      </div>
    </Sheet>
  )
}
