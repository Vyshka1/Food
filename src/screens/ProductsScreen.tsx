import { useMemo } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../data/ingredients'
import type { IngredientCategory, ShoppingLine } from '../types'
import { buildShoppingList, formatQty } from '../lib/shopping'
import { useStore } from '../store'
import { Card } from '../components/ui'
import { Icon } from '../components/icons'

/**
 * Сколько останется от вскрытой упаковки. Пачка фарша 500 г при нужных 275 г
 * — это не «купить 500», а «275 в дело и 225 куда-то деть». Молчать об этом
 * значит перекладывать на человека вопрос, который создало приложение.
 */
function leftover(line: ShoppingLine): string | null {
  const rest = line.buy - line.needed
  if (line.staple || rest <= 0) return null
  // мелочь в пределах округления остатком не считается
  const share = rest / Math.max(1, line.buy)
  if (share < 0.15 || (line.unit !== 'pcs' && rest < 40)) return null
  return formatQty(rest, line.unit)
}

export function ProductsScreen({ onShoppingMode }: { onShoppingMode: () => void }) {
  const { menu, household, atHome, bought, toggleAtHome, toggleBought } = useStore()
  const list = useMemo(() => (menu ? buildShoppingList(menu) : null), [menu])

  if (!menu || !list || !household) return null

  const active = list.lines.filter((l) => !atHome.includes(l.ingredientId) && !l.staple)
  const total = active.reduce((s, l) => s + l.price, 0)
  const left = active.filter((l) => !bought.includes(l.ingredientId))
  // сколько мы сэкономили, отметив «есть дома» — иначе непонятно, что даёт отметка
  const atHomeSum = list.lines
    .filter((l) => !l.staple && atHome.includes(l.ingredientId))
    .reduce((s, l) => s + l.price, 0)

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
        <span className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <Icon name="cart" size={20} />
          Иду в магазин
        </span>
      </button>

      <Card variant="green">
        <div className="row row--between">
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>≈ {total} ₽</div>
            <div className="muted small">
              оценка по средним ценам · осталось купить {left.length} из {active.length}
            </div>
            {atHomeSum > 0 && (
              <div className="muted small">
                {total + atHomeSum} ₽ по меню, {atHomeSum} ₽ уже есть дома
              </div>
            )}
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
                  <Icon name="check" size={17} />
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
                    {leftover(line) && (
                      <>
                        {' · '}
                        <span className="product__left">останется {leftover(line)}</span>
                      </>
                    )}
                  </span>
                </span>
                <button
                  className="home-pill"
                  data-on={home}
                  disabled={line.staple}
                  onClick={() => toggleAtHome(line.ingredientId)}
                >
                  {home ? 'есть дома' : 'нужно купить'}
                </button>
                <span className="product__price" style={home ? { opacity: 0.35 } : undefined}>
                  {home ? '—' : `≈ ${line.price} ₽`}
                </span>
              </div>
            )
          })}
        </Card>
      ))}

      <p className="hint">
        Специи, соль и масло всегда считаются домашними и в сумму не входят. Цены —
        ориентировочные, по средним значениям, а не по конкретному магазину.
      </p>
    </div>
  )
}
