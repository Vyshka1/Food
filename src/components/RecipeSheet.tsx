import { useState } from 'react'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { MenuEntry } from '../types'
import { formatDuration } from '../lib/cookingPlan'
import { WEEKDAYS_FULL } from '../lib/menu'
import { plural } from '../lib/format'
import { cookAmountLabel, cookCard, weightLabel } from '../lib/cookCard'
import type { CardLeftover } from '../lib/cookCard'
import { householdQty } from '../lib/measures'
import { batchReasonText } from '../lib/batch'
import { formatQty } from '../lib/shopping'
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
 * Сколько раз это едят. Считаем приёмы пищи, а не тарелки: обед на двоих —
 * это один приём, и «едим дважды» про него было бы неправдой.
 */
function mealsLabel(meals: number, plates: number): string {
  const head =
    meals <= 1
      ? 'Готовим один раз — на один приём пищи'
      : meals === 2
        ? 'Готовим один раз — едим дважды'
        : `Готовим один раз — на ${meals} ${plural(meals, ['приём', 'приёма', 'приёмов'])} пищи`
  return plates > meals ? `${head}, ${plates} ${plural(plates, ['порция', 'порции', 'порций'])}` : head
}

/**
 * Что стало с упаковкой. Три числа вместо одного совета: сколько ушло сюда,
 * сколько в другие блюда недели и сколько осталось на самом деле. Пристроенным
 * остаток считается только тогда, когда для него есть конкретное блюдо или
 * конкретное действие.
 */
function LeftoverLine({ line }: { line: CardLeftover }) {
  const parts = [`${formatQty(line.usedHere, line.unit)} сюда`]
  if (line.usedElsewhere > 0) parts.push(`${formatQty(line.usedElsewhere, line.unit)} в другие блюда`)
  const source =
    line.fromStock > 0
      ? `дома ${formatQty(line.fromStock, line.unit)}${line.bought > 0 ? `, купить ${formatQty(line.bought, line.unit)}` : ''}`
      : `куплено ${formatQty(line.bought, line.unit)}`
  const placed =
    line.placed?.kind === 'absorbed'
      ? 'без остатка — хвост упаковки ушёл в это блюдо'
      : line.placed?.kind === 'freeze'
        ? `${formatQty(line.left, line.unit)} — заморозить сырым`
        : line.left > 0
          ? line.days > 30
            ? `${formatQty(line.left, line.unit)} останется в запасе`
            : `${formatQty(line.left, line.unit)} останется · использовать за ${line.days} дн`
          : ''
  return (
    <div className="leftover">
      <span className="leftover__name">{line.name}</span>
      <span className="muted small">
        {source}: {parts.join(', ')}
      </span>
      {placed && <span className="leftover__rest small">{placed}</span>}
    </div>
  )
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
  const { household, menu, pantry, rateRecipe } = useStore()
  const [showOther, setShowOther] = useState(false)
  const recipe = recipeById(entry.recipeId)
  if (!recipe || !household || !menu) return null
  const card = cookCard(menu, household, entry, pantry)
  if (!card) return null
  // время этой готовки, а не время рецепта на одну долю
  const totalMinutes = card.cookMinutes
  const pieceName = recipe.batch?.pieceName
  const amount = cookAmountLabel(card, pieceName)
  /** Насколько раздача разошлась с нормой — это стоит сказать вслух. */
  const offRows = card.rows.filter((r) => Math.abs(r.kcal - r.targetKcal) > r.targetKcal * 0.12)

  return (
    <Sheet onClose={onClose}>
      <DishBanner recipe={recipe} />

      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <DishThumb recipe={recipe} size={56} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
          <div className="muted small">
            {formatDuration(totalMinutes)} · продукты в блюде — примерно {card.usedPrice} ₽
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">{mealsLabel(card.meals, card.rows.length)}</div>

        <div className="ing-line">
          <span className="muted">Приготовим</span>
          <b>{amount}</b>
        </div>
        <div className="ing-line">
          <span className="muted">Нужно по меню</span>
          <b>{card.neededGrams} г</b>
        </div>
        {card.freezeGrams > 0 && (
          <div className="ing-line">
            <span className="muted">В морозилку</span>
            <b>
              {card.freezePieces
                ? `${card.freezePieces} ${plural(card.freezePieces, pieceName ?? ['шт', 'шт', 'шт'])} · примерно ${card.freezeGrams} г`
                : `примерно ${card.freezeGrams} г`}
            </b>
          </div>
        )}
        {card.unplacedGrams > 0 && (
          <div className="ing-line">
            <span className="muted">Останется</span>
            <b>{card.unplacedGrams} г — доесть в ближайшие дни</b>
          </div>
        )}

        {card.loads && (
          <div className="ing-line">
            <span className="muted">Жарить</span>
            <b>
              {card.loads.count}{' '}
              {plural(card.loads.count, ['заход', 'захода', 'заходов'])}
              {card.loads.twoPans ? ' на двух сковородах' : ''} по {card.loads.perLoad} шт ·{' '}
              {card.loads.minutes} мин
            </b>
          </div>
        )}

        {card.plan && card.reason !== 'fresh' && (
          <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
            Потому что {batchReasonText(card.plan.batch)}.
          </p>
        )}

        {card.limitedByPractical && (
          <p className="hint" style={{ marginTop: 0, marginBottom: 8, color: 'var(--warn)' }}>
            Больше за раз не делают — на всю неделю понадобится вторая готовка.
          </p>
        )}

        {card.alternatives.length > 0 && (
          <>
            <button className="btn btn--ghost btn--small" onClick={() => setShowOther((v) => !v)}>
              {showOther ? 'Скрыть' : 'Изменить количество'}
            </button>
            {showOther &&
              card.alternatives.map((option) => (
                <div className="ing-line" key={option.scale}>
                  <span>
                    {option.pieces
                      ? `${option.pieces} ${plural(option.pieces, pieceName ?? ['шт', 'шт', 'шт'])} · примерно ${weightLabel(option.grams)}`
                      : `примерно ${weightLabel(option.grams)}`}
                  </span>
                  <b className="small">{option.note}</b>
                </div>
              ))}
          </>
        )}

        {card.plan?.batch.source === 'derived' && (
          <p className="hint" style={{ marginBottom: 0 }}>
            Выход прикинут по составу и не проверен на кухне — поэтому только вес, без числа
            изделий.
          </p>
        )}
      </div>

      <div className="card">
        <div className="section-title">Кому и когда</div>
        {card.rows.map((row, i) => (
          <div className="ing-line" key={`${row.day}-${row.eaterId}-${i}`}>
            <span>
              {WEEKDAYS_FULL[row.day]}
              {household.eaters.length > 1 ? ` · ${row.eaterName}` : ''}
            </span>
            <b>
              {row.pieces
                ? `${row.pieces} ${plural(row.pieces, pieceName ?? ['шт', 'шт', 'шт'])} · ${row.kcal} ккал`
                : `${row.grams} г · ${row.kcal} ккал`}
            </b>
          </div>
        ))}
        <p className="hint" style={{ marginBottom: 0 }}>
          {offRows.length === 0
            ? 'Каждому столько, сколько нужно по его норме.'
            : `Изделия целые, поэтому ровно в норму не попасть: ${offRows
                .map((r) => {
                  const diff = r.kcal - r.targetKcal
                  return `${r.eaterName} — ${diff > 0 ? '+' : '−'}${Math.abs(diff)} ккал`
                })
                .join(', ')}. Недобор проще закрыть овощами или фруктом, чем резать изделие пополам.`}
        </p>
      </div>

      <div className="card card--soft">
        <div className="row row--between small">
          <span className="muted">Калории всей готовки</span>
          <b>{card.stats.kcal} ккал</b>
        </div>
        <div className="row row--between small" style={{ marginTop: 6 }}>
          <span className="muted">Белки · жиры · углеводы</span>
          <b>
            {card.stats.protein} · {card.stats.fat} · {card.stats.carbs} г
          </b>
        </div>
        <div className="row row--between small" style={{ marginTop: 6 }}>
          <span className="muted">Хранение</span>
          <b>{STORAGE_LABEL[entry.storage]}</b>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Продукты на всю готовку</div>
        {card.items.map((item) => {
          const ing = INGREDIENT_BY_ID[item.ingredientId]
          if (!ing) return null
          const measure = householdQty(ing, item.qty)
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
        <p className="hint" style={{ marginBottom: 0 }}>
          Продукты в блюде — примерно {card.usedPrice} ₽. Эти же упаковки в магазине стоят около{' '}
          {card.purchasePrice} ₽: они целые, и часть уйдёт в другие блюда недели и в запас.
        </p>
      </div>

      {card.leftovers.length > 0 && (
        <div className="card">
          <div className="section-title">Что станет с упаковками</div>
          {card.leftovers.map((line) => (
            <LeftoverLine line={line} key={line.ingredientId} />
          ))}
        </div>
      )}

      <div className="card">
        <div className="section-title">Шаги</div>
        {recipe.steps.map((step, i) => (
          <div className="step-line" key={i}>
            <span className="step-line__n">{i + 1}</span>
            <div>
              <div>{step.text}</div>
              <div className="muted small">
                {card.stepMinutes[i]} мин ·{' '}
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
