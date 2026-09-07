import { useState } from 'react'
import { INGREDIENTS } from '../data/ingredients'
import { formatQty } from '../lib/shopping'
import {
  addStock,
  daysLeft,
  freezerLabel,
  freezerPortions,
  ingredientName,
  isAlways,
  setStock,
  takeFreezer,
  useByDate,
} from '../lib/pantry'
import { plural, shortDate } from '../lib/format'
import { useStore } from '../store'
import { Card } from './ui'
import { Icon } from './icons'

/**
 * Что есть дома.
 *
 * Три разных списка, которые до сих пор были одной галочкой на неделю:
 * постоянные продукты (соль, специи, масло — их не покупают вообще), текущие
 * запасы с количеством (700 г риса, полпачки фарша) и морозилка с датами.
 */
export function PantryCard() {
  const { pantry, setPantry, menu } = useStore()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  const candidates = INGREDIENTS.filter(
    (i) =>
      !isAlways(pantry, i.id) &&
      i.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      !pantry.stock.some((s) => s.ingredientId === i.id),
  ).slice(0, 8)

  const totalPortions = freezerPortions(pantry)

  return (
    <>
      <Card>
        <div className="section-title">Постоянно есть</div>
        <p className="hint" style={{ marginTop: 0 }}>
          Эти продукты не попадают в закупку и не считаются в сумму. Отметка живёт всегда, а не
          одну неделю.
        </p>
        <div className="chips">
          {INGREDIENTS.filter((i) => i.staple || isAlways(pantry, i.id)).map((ing) => (
            <button
              key={ing.id}
              className="chip"
              data-active={isAlways(pantry, ing.id)}
              onClick={() =>
                setPantry((p) => ({
                  ...p,
                  always: isAlways(p, ing.id)
                    ? p.always.filter((id) => id !== ing.id)
                    : [...p.always, ing.id],
                }))
              }
            >
              {ing.name}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="row row--between">
          <div className="section-title" style={{ marginBottom: 0 }}>
            Запасы дома
          </div>
          <button className="chip" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Готово' : '+ Добавить'}
          </button>
        </div>

        {adding && (
          <div className="stack" style={{ marginTop: 10 }}>
            <input
              className="input"
              placeholder="Название продукта"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="chips">
              {candidates.map((ing) => (
                <button
                  key={ing.id}
                  className="chip"
                  onClick={() => {
                    setPantry((p) => addStock(p, ing.id, ing.unit === 'pcs' ? 1 : 100, today))
                    setQuery('')
                  }}
                >
                  {ing.name}
                </button>
              ))}
              {candidates.length === 0 && <span className="muted small">ничего не нашлось</span>}
            </div>
          </div>
        )}

        {pantry.stock.length === 0 && (
          <p className="hint" style={{ marginBottom: 0 }}>
            Пусто. Сюда попадают остатки после покупок и то, что вы добавите руками, — и всё это
            вычитается из следующей закупки.
          </p>
        )}

        {pantry.stock.map((item) => {
          const ing = INGREDIENTS.find((i) => i.id === item.ingredientId)
          const step = ing?.unit === 'pcs' ? 1 : 50
          return (
            <div className="stock-row" key={item.ingredientId}>
              <span className="stock-row__name">{ingredientName(item.ingredientId)}</span>
              <div className="stepper">
                <button
                  onClick={() =>
                    setPantry((p) =>
                      setStock(p, item.ingredientId, Math.max(0, item.qty - step), today),
                    )
                  }
                  aria-label="меньше"
                >
                  −
                </button>
                <span>{formatQty(item.qty, ing?.unit ?? 'g')}</span>
                <button
                  onClick={() => setPantry((p) => addStock(p, item.ingredientId, step, today))}
                  aria-label="больше"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </Card>

      <Card>
        <div className="section-title">Морозилка</div>
        {pantry.freezer.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Пусто. Контейнеры появятся здесь сами, когда отметите блюдо приготовленным — план
            готовки знает, что уходит в морозилку.
          </p>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {totalPortions.toFixed(0)}{' '}
              {plural(Math.round(totalPortions), ['порция', 'порции', 'порций'])} готовой еды.
            </p>
            {pantry.freezer.map((item) => {
              const left = daysLeft(item, today)
              const planned = menu?.entries.some((e) => e.recipeId === item.recipeId)
              return (
                <div className="freezer-row" key={item.id}>
                  <Icon name="snowflake" size={16} />
                  <span className="freezer-row__name">
                    <b>{freezerLabel(item)}</b>
                    <span className="muted small">
                      {item.containers}{' '}
                      {plural(item.containers, ['контейнер', 'контейнера', 'контейнеров'])} ·
                      приготовлено {shortDate(item.cookedAt)} · до {shortDate(useByDate(item))}
                      {planned ? ' · есть в меню' : ''}
                    </span>
                  </span>
                  <span
                    className="freezer-row__left"
                    data-warn={left <= 14}
                    title="сколько дней хранится"
                  >
                    {left > 0 ? `${left} дн` : 'пора'}
                  </span>
                  <button
                    className="chip"
                    onClick={() => setPantry((p) => takeFreezer(p, item.recipeId, 1))}
                  >
                    Достала
                  </button>
                </div>
              )
            })}
          </>
        )}
      </Card>
    </>
  )
}
