import { INGREDIENT_BY_ID } from '../data/ingredients'
import { RECIPE_BY_ID } from '../data/recipes'
import type { MenuEntry } from '../types'
import { recipeStats } from '../lib/nutrition'
import { formatQty } from '../lib/shopping'
import { formatDuration } from '../lib/cookingPlan'
import { WEEKDAYS_FULL } from '../lib/menu'
import { plural } from '../lib/format'
import { Sheet } from './ui'

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
  const recipe = RECIPE_BY_ID[entry.recipeId]
  if (!recipe) return null
  const stats = recipeStats(recipe)
  const scale = entry.scale
  const totalMinutes = recipe.steps.reduce((s, st) => s + st.minutes, 0)

  return (
    <Sheet onClose={onClose}>
      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <div className="dish__emoji" style={{ width: 56, height: 56, fontSize: 34 }}>
          {recipe.emoji}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
          <div className="muted small">
            {Math.round(stats.kcal * scale)} ккал · {formatDuration(totalMinutes)} ·{' '}
            {Math.round(stats.price * scale)} ₽ порция
          </div>
        </div>
      </div>

      <div className="card card--soft">
        <div className="row row--between small">
          <span className="muted">Белки</span>
          <b>{Math.round(stats.protein * scale)} г</b>
        </div>
        <div className="row row--between small">
          <span className="muted">Жиры</span>
          <b>{Math.round(stats.fat * scale)} г</b>
        </div>
        <div className="row row--between small">
          <span className="muted">Углеводы</span>
          <b>{Math.round(stats.carbs * scale)} г</b>
        </div>
        <div className="row row--between small" style={{ marginTop: 8 }}>
          <span className="muted">{WEEKDAYS_FULL[entry.day]}</span>
          <b>{STORAGE_LABEL[entry.storage]}</b>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          Ингредиенты · {entry.servings} {plural(entry.servings, ['порция', 'порции', 'порций'])}
        </div>
        {recipe.items.map((item) => {
          const ing = INGREDIENT_BY_ID[item.ingredientId]
          if (!ing) return null
          const qty = item.qty * scale * entry.servings
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
