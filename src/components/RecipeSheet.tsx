import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { MenuEntry } from '../types'
import { recipeStats } from '../lib/nutrition'
import { formatDuration } from '../lib/cookingPlan'
import { WEEKDAYS_FULL } from '../lib/menu'
import { plural } from '../lib/format'
import { cookBatch } from '../lib/servings'
import { householdQty } from '../lib/measures'
import { batchReasonText, planBatch, yieldLabel } from '../lib/batch'
import { leftoverAdvice, purchaseInfo } from '../lib/purchase'
import { useStore } from '../store'
import { Sheet } from './ui'
import { Icon } from './icons'
import { DishBanner, DishThumb } from './DishImage'

const STORAGE_LABEL: Record<string, string> = {
  fresh: 'Готовим в этот день',
  fridge: 'Из холодильника',
  freezer: 'Из морозилки — достать заранее',
}

/**
 * Остаток, с которым надо что-то решать. Мешок риса и банка мёда лежат
 * месяцами и решения не требуют — писать про них «останется в запасе» значит
 * топить важное в шуме.
 */
function needsDecision(ingredientId: string): boolean {
  const ing = INGREDIENT_BY_ID[ingredientId]
  if (!ing) return false
  return purchaseInfo(ing).openedFridgeDays <= 7
}

/** «1 закладку», «полторы закладки» — как это назвать человеку. */
function scaleLabel(scale: number): string {
  if (scale === 0.5) return 'ползакладки'
  if (scale === 1) return '1 закладку'
  if (scale === 1.5) return 'полторы закладки'
  if (scale === 2) return '2 закладки'
  return `${String(scale).replace('.', ',')} закладки`
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
  const { household, menu, rateRecipe } = useStore()
  const recipe = recipeById(entry.recipeId)
  if (!recipe || !household || !menu) return null
  const stats = recipeStats(recipe)
  const totalMinutes = recipe.steps.reduce((s, st) => s + st.minutes, 0)
  /**
   * Всё в карточке считается от одной готовки целиком: и продукты, и КБЖУ,
   * и распределение. Три разных масштаба на одном экране — это рецепт
   * приготовить вдвое меньше, чем купил.
   */
  const batch = cookBatch(menu, recipe, entry, household.eaters)
  const scale = batch.totalFactor
  /** Сколько удобно приготовить за раз — это не то же самое, сколько съедят. */
  const plan = planBatch(recipe, {
    neededGrams: batch.totalGrams,
    hasFreezer: household.kitchen.hasFreezer,
    freezerRoomGrams: household.kitchen.containers * 400,
  })

  return (
    <Sheet onClose={onClose}>
      <DishBanner recipe={recipe} />

      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <DishThumb recipe={recipe} size={56} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
          <div className="muted small">
            {formatDuration(totalMinutes)} · ≈ {Math.round(stats.price * scale)} ₽ за всю готовку
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          Готовим {batch.containers}{' '}
          {plural(batch.containers, ['контейнер', 'контейнера', 'контейнеров'])}
        </div>
        <div className="ing-line">
          <span className="muted">Общий выход</span>
          <b>примерно {batch.totalGrams} г</b>
        </div>
        {batch.rows.map((row, i) => (
          <div className="ing-line" key={`${row.day}-${row.eaterId}-${i}`}>
            <span>
              {WEEKDAYS_FULL[row.day]}
              {household.eaters.length > 1 ? ` · ${row.eaterName}` : ''}
            </span>
            <b>
              {row.grams} г · {row.kcal} ккал
            </b>
          </div>
        ))}
        <p className="hint" style={{ marginBottom: 0 }}>
          Одна готовка — на все эти приёмы пищи сразу. Каждому столько, сколько нужно по его
          норме.
        </p>
      </div>

      {plan && plan.batch.reason !== 'fresh' && (
        <div className="card">
          <div className="section-title">Сколько готовить</div>
          <div className="ing-line">
            <span className="muted">Нужно по меню</span>
            <b>{batch.totalGrams} г</b>
          </div>
          <div className="ing-line">
            <span className="muted">Рекомендуем приготовить</span>
            <b>
              {scaleLabel(plan.chosen.scale)} · {yieldLabel(plan.batch, plan.chosen)}
            </b>
          </div>
          <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
            Потому что {batchReasonText(plan.batch)}.
          </p>
          {plan.chosen.freezeGrams > 0 && (
            <div className="ing-line">
              <span className="muted">В морозилку</span>
              <b>примерно {plan.chosen.freezeGrams} г</b>
            </div>
          )}
          {plan.chosen.packs
            .filter((line) => line.leftover > 0 && needsDecision(line.ingredientId))
            .map((line) => {
              const advice = leftoverAdvice(INGREDIENT_BY_ID[line.ingredientId], line.leftover)
              return advice ? (
                <div className="ing-line" key={line.ingredientId}>
                  <span className="muted">Остаток: {line.name.toLowerCase()}</span>
                  <b className="small">{advice}</b>
                </div>
              ) : null
            })}
          {plan.alternatives.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 12, marginBottom: 6 }}>
                Можно иначе
              </div>
              {plan.alternatives.map((option) => (
                <div className="ing-line" key={option.scale}>
                  <span>{scaleLabel(option.scale)}</span>
                  <b className="small">
                    {yieldLabel(plan.batch, option)}
                    {option.unplacedGrams > 0 && ` · ${option.unplacedGrams} г некуда`}
                    {option.anchorLeftover > 40 &&
                      ` · ${option.anchorLeftover} г сырого остатка`}
                  </b>
                </div>
              ))}
            </>
          )}
          {plan.batch.source === 'derived' && (
            <p className="hint" style={{ marginBottom: 0 }}>
              Выход прикинут по составу и не проверен на кухне — поэтому только вес, без числа
              изделий.
            </p>
          )}
        </div>
      )}

      <div className="card card--soft">
        <div className="row row--between small">
          <span className="muted">Белки · жиры · углеводы на всю готовку</span>
          <b>
            {Math.round(stats.protein * scale)} · {Math.round(stats.fat * scale)} ·{' '}
            {Math.round(stats.carbs * scale)} г
          </b>
        </div>
        <div className="row row--between small" style={{ marginTop: 6 }}>
          <span className="muted">Хранение</span>
          <b>{STORAGE_LABEL[entry.storage]}</b>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Продукты на всю готовку</div>
        {recipe.items.map((item) => {
          const ing = INGREDIENT_BY_ID[item.ingredientId]
          if (!ing) return null
          const measure = householdQty(ing, item.qty * scale)
          return (
            <div className="ing-line" key={item.ingredientId}>
              <span>{ing.name}</span>
              <b>
                {measure.text}
                {measure.approx && <span className="muted small"> · {measure.approx}</span>}
              </b>
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

      <div className="card">
        <div className="section-title">Как вам блюдо</div>
        {household.eaters.map((eater) => {
          const value = eater.ratings?.[recipe.id] ?? 0
          return (
            <div className="rate-line" key={eater.id}>
              <span>{eater.name}</span>
              <div className="rate">
                <button
                  data-on={value === 1}
                  onClick={() => rateRecipe(eater.id, recipe.id, value === 1 ? 0 : 1)}
                  aria-label={`${eater.name}: нравится`}
                  aria-pressed={value === 1}
                >
                  <Icon name="thumbUp" size={16} /> нравится
                </button>
                <button
                  data-on={value === -1}
                  onClick={() => rateRecipe(eater.id, recipe.id, value === -1 ? 0 : -1)}
                  aria-label={`${eater.name}: не нравится`}
                  aria-pressed={value === -1}
                >
                  <Icon name="thumbDown" size={16} /> не нравится
                </button>
              </div>
            </div>
          )
        })}
        <p className="hint" style={{ marginBottom: 0 }}>
          Оценка меняет подбор на следующих неделях. Чтобы блюдо исчезло совсем —
          «Больше не показывать».
        </p>
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
