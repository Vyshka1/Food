import { useEffect, useMemo, useState } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../data/ingredients'
import type { ShoppingLine } from '../types'
import { buildShoppingList, formatQty, shoppingListText } from '../lib/shopping'
import { plural } from '../lib/format'
import { useStore } from '../store'

/** В магазине экран не должен гаснуть; где API нет — просто работаем как обычно. */
function useKeepAwake(): void {
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null
    let cancelled = false
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    nav.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (cancelled) void lock.release()
        else sentinel = lock
      })
      .catch(() => {
        // отказ в блокировке экрана — не повод ломать экран покупок
      })
    return () => {
      cancelled = true
      void sentinel?.release().catch(() => {})
    }
  }, [])
}

export function ShoppingModeScreen({ onExit }: { onExit: () => void }) {
  const { menu, atHome, bought, toggleBought } = useStore()
  const [hideBought, setHideBought] = useState(false)
  const [shareNote, setShareNote] = useState('')
  useKeepAwake()

  const list = useMemo(() => (menu ? buildShoppingList(menu) : null), [menu])
  if (!menu || !list) return null

  const skip = new Set(atHome)
  const toBuy = list.lines.filter((l) => !l.staple && !skip.has(l.ingredientId))
  const left = toBuy.filter((l) => !bought.includes(l.ingredientId))
  const leftSum = left.reduce((s, l) => s + l.price, 0)

  const grouped = new Map<string, ShoppingLine[]>()
  for (const line of toBuy) {
    if (hideBought && bought.includes(line.ingredientId)) continue
    const arr = grouped.get(line.category) ?? []
    arr.push(line)
    grouped.set(line.category, arr)
  }

  const share = async () => {
    const text = shoppingListText(list, { atHome, weekStart: menu.weekStart })
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> }
    try {
      if (nav.share) {
        await nav.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setShareNote('Список скопирован — вставьте в мессенджер')
    } catch {
      setShareNote('Не удалось поделиться списком')
    }
    setTimeout(() => setShareNote(''), 4000)
  }

  return (
    <div className="shop">
      <div className="shop__bar">
        <button className="shop__back" onClick={onExit} aria-label="выйти из режима магазина">
          ✕
        </button>
        <div className="shop__counter">
          <b>{left.length}</b> {plural(left.length, ['позиция', 'позиции', 'позиций'])} ·{' '}
          {leftSum} ₽
        </div>
        <button className="shop__share" onClick={share}>
          Отправить
        </button>
      </div>

      {shareNote && <div className="shop__note">{shareNote}</div>}

      <label className="shop__filter">
        <input
          type="checkbox"
          checked={hideBought}
          onChange={(e) => setHideBought(e.target.checked)}
        />
        Прятать купленное
      </label>

      {left.length === 0 && (
        <div className="shop__done">
          Всё собрано 🎉
          <button className="btn btn--soft" style={{ marginTop: 16 }} onClick={onExit}>
            Готово
          </button>
        </div>
      )}

      {CATEGORY_ORDER.filter((c) => grouped.get(c)?.length).map((category) => (
        <section key={category}>
          <h2 className="shop__cat">{CATEGORY_LABEL[category]}</h2>
          {grouped.get(category)!.map((line) => {
            const done = bought.includes(line.ingredientId)
            return (
              <button
                key={line.ingredientId}
                className="shop__row"
                data-done={done}
                onClick={() => toggleBought(line.ingredientId)}
              >
                <span className="shop__check" aria-hidden>
                  {done ? '✓' : ''}
                </span>
                <span className="shop__name">{line.name}</span>
                <span className="shop__qty">{formatQty(line.buy, line.unit)}</span>
              </button>
            )
          })}
        </section>
      ))}

      <div style={{ height: 40 }} />
    </div>
  )
}
