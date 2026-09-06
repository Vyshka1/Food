import { useMemo } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../data/ingredients'
import type { IngredientCategory } from '../types'
import { buildShoppingList, formatQty } from '../lib/shopping'
import { useStore } from '../store'
import { Card } from '../components/ui'

export function ProductsScreen({ onShoppingMode }: { onShoppingMode: () => void }) {
  const { menu, household, atHome, bought, toggleAtHome, toggleBought } = useStore()
  const list = useMemo(() => (menu ? buildShoppingList(menu) : null), [menu])

  if (!menu || !list || !household) return null

  const active = list.lines.filter((l) => !atHome.includes(l.ingredientId) && !l.staple)
  const total = active.reduce((s, l) => s + l.price, 0)
  const left = active.filter((l) => !bought.includes(l.ingredientId))

  const grouped = new Map<IngredientCategory, typeof list.lines>()
  for (const line of list.lines) {
    const arr = grouped.get(line.category) ?? []
    arr.push(line)
    grouped.set(line.category, arr)
  }

  return (
    <div className="app">
      <div className="screen-title">Продукты</div>
      <div className="screen-sub">
        Собрано по меню на неделю. Отметь, что уже есть дома — пересчитаем сумму.
      </div>

      <button className="btn" style={{ marginBottom: 14 }} onClick={onShoppingMode}>
        🛒 Иду в магазин
      </button>

      <Card variant="green">
        <div className="row row--between">
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{total} ₽</div>
            <div className="muted small">
              осталось купить {left.length} из {active.length}
            </div>
          </div>
          {household.budgetPerWeek > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div className="small muted">бюджет</div>
              <b>{household.budgetPerWeek} ₽</b>
              {total > household.budgetPerWeek && (
                <div className="small" style={{ color: 'var(--warn)' }}>
                  +{total - household.budgetPerWeek} ₽
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
        <Card key={category}>
          <div className="section-title">{CATEGORY_LABEL[category]}</div>
          {grouped.get(category)!.map((line) => {
            const home = atHome.includes(line.ingredientId) || line.staple
            const isBought = bought.includes(line.ingredientId)
            return (
              <div className="product" key={line.ingredientId} data-bought={isBought}>
                <button
                  className="check"
                  data-on={isBought}
                  onClick={() => toggleBought(line.ingredientId)}
                  aria-label="куплено"
                >
                  ✓
                </button>
                <span className="product__name">
                  <b>
                    {line.name}
                    {line.packs && (
                      <span className="muted small">
                        {' '}
                        × {line.packs.count} уп. по {formatQty(line.packs.size, line.unit)}
                      </span>
                    )}
                  </b>
                  <span className="muted small">
                    нужно {formatQty(line.needed, line.unit)}
                    {line.buy !== line.needed && ` · купить ${formatQty(line.buy, line.unit)}`}
                  </span>
                </span>
                <button
                  className="home-pill"
                  data-on={home}
                  onClick={() => toggleAtHome(line.ingredientId)}
                >
                  {home ? 'есть дома' : 'дома'}
                </button>
                <span className="product__price" style={home ? { opacity: 0.35 } : undefined}>
                  {line.price} ₽
                </span>
              </div>
            )
          })}
        </Card>
      ))}

      <p className="hint">
        Специи, соль и масло помечены как «есть дома» — сними отметку, если нужно докупить.
      </p>
    </div>
  )
}
