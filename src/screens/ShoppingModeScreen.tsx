import { Fragment, useMemo, useState } from 'react'
import { CATEGORY_LABEL } from '../data/ingredients'
import type { IngredientCategory, ShoppingLine } from '../types'
import {
  buildShoppingList,
  categoryHeads,
  formatQty,
  remainingToBuy,
  shoppingListText,
} from '../lib/shopping'
import { shoppingByStore } from '../lib/stores'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Icon } from '../components/icons'
import { useKeepAwake } from '../hooks/useKeepAwake'

export function ShoppingModeScreen({ onExit }: { onExit: () => void }) {
  const { menu, household, pantry, atHome, bought, toggleBought, storeBought } = useStore()
  const [hideBought, setHideBought] = useState(false)
  const [shareNote, setShareNote] = useState('')
  useKeepAwake()

  // pantry в зависимостях обязателен: без него режим магазина показывал
  // количества, посчитанные до того, как покупки разложили по кладовой
  const list = useMemo(
    () => (menu ? buildShoppingList(menu, household ?? undefined, pantry) : null),
    [menu, household, pantry],
  )
  if (!menu || !list) return null

  /*
   * Оба числа экрана — из одного расчёта, того же, что уходит в отправленный
   * список. `toBuy` — весь поход, включая уже отмеченное (его показываем
   * вычеркнутым), `left` — что ещё не в тележке. Разница между ними только в
   * `bought`, и она видна прямо здесь, а не прячется в двух разных фильтрах.
   */
  const toBuy = remainingToBuy(list, { atHome, bought: [] }).lines
  const left = remainingToBuy(list, { atHome, bought })

  /*
   * В зале ходят не по категориям, а по отделам: за яйцами идут к молочному
   * холодильнику, а не в бакалею. Отделы, их порядок и состав берём из
   * `lib/stores` — там же, откуда их берёт экран «Продукты»; здесь только
   * раскладка строк по категориям, чтобы внутри отдела они шли в том же
   * порядке, что и в списке.
   */
  const visible = toBuy.filter((l) => !(hideBought && bought.includes(l.ingredientId)))
  const byCategory = (lines: ShoppingLine[]) => {
    const out = new Map<IngredientCategory, ShoppingLine[]>()
    for (const line of lines) {
      const arr = out.get(line.category) ?? []
      arr.push(line)
      out.set(line.category, arr)
    }
    return out
  }
  const grouped = byCategory(visible)
  const stores = shoppingByStore(visible)
  /*
   * Размер отдела для порога подзаголовков — за весь поход, а не по видимым
   * строкам: почему так, сказано у `CATEGORY_HEADS_FROM`. Считает тот же
   * `shoppingByStore`, что и отделы на экране, — второго счёта строк в отделе
   * в этом файле нет.
   */
  const wholeStore = new Map(shoppingByStore(toBuy).map((s) => [s.kind, s]))
  const wholeCategories = byCategory(toBuy)

  const share = async () => {
    // отправляем ровно то, что написано над кнопкой: отмеченное в зале в
    // список не идёт, иначе мужу уезжает то, что уже лежит в тележке
    const text = shoppingListText(list, { atHome, bought, weekStart: menu.weekStart })
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
          <Icon name="close" size={18} />
        </button>
        <div className="shop__counter">
          <b>{left.lines.length}</b>{' '}
          {plural(left.lines.length, ['позиция', 'позиции', 'позиций'])} · ≈ {left.total} ₽
        </div>
        <button className="shop__share" onClick={share}>
          Отправить
        </button>
      </div>

      {shareNote && <div className="shop__note">{shareNote}</div>}

      {/* прятать нечего, пока покупать нечего: пустой список с фильтром над
          ним обещает, что под фильтром что-то есть */}
      {toBuy.length > 0 && (
        <label className="shop__filter">
          <input
            type="checkbox"
            checked={hideBought}
            onChange={(e) => setHideBought(e.target.checked)}
          />
          Прятать купленное
        </label>
      )}

      {/*
        * Пустой поход и собранный поход — разные новости, и поздравлять за
        * первый не за что. «Всё собрано» с кнопкой «Разложить покупки»
        * появлялось и на неделе, где вся семья ест не дома: список пуст,
        * покупок не было, раскладывать нечего — кнопка ничего не делала.
        * Причину пустоты называем тем же словом, что и «Готовка»: меню пустое.
        */}
      {list.lines.length === 0 ? (
        <div className="shop__empty">
          <Icon name="bag" size={30} />
          <div>Меню пока пустое</div>
          <p className="hint">Покупать нечего: на этой неделе дома ничего не готовим.</p>
          <button className="btn btn--soft" style={{ marginTop: 10 }} onClick={onExit}>
            Готово
          </button>
        </div>
      ) : toBuy.length === 0 ? (
        <div className="shop__empty">
          <Icon name="home" size={30} />
          <div>Всё есть дома</div>
          <p className="hint">
            Всё, что нужно на эту неделю, отмечено как домашнее — в магазин идти не за чем.
          </p>
          <button className="btn btn--soft" style={{ marginTop: 10 }} onClick={onExit}>
            Готово
          </button>
        </div>
      ) : (
        left.lines.length === 0 && (
          <div className="shop__done">
            <Icon name="party" size={30} />
            <div>Всё собрано</div>
            {/* Излишек упаковок — это продукты, которые останутся дома. Раньше
                приложение писало «останется 225 г» и на этом о них забывало. */}
            <button
              className="btn"
              style={{ marginTop: 16 }}
              onClick={() => {
                storeBought()
                onExit()
              }}
            >
              Разложить покупки
            </button>
            <button className="btn btn--soft" style={{ marginTop: 10 }} onClick={onExit}>
              Готово
            </button>
          </div>
        )
      )}

      {stores.map((store) => {
        const categories = store.categories.filter((c) => grouped.get(c)?.length)
        /*
         * Решаем по всему походу, а рисуем только над видимыми строками:
         * иначе «прятать купленное» перестраивало бы отдел под рукой, а
         * подзаголовок над спрятанной категорией оказался бы пустым.
         */
        const whole = wholeStore.get(store.kind)
        const wholeShown = (whole?.categories ?? []).filter((c) => wholeCategories.get(c)?.length)
        const heads = categoryHeads(
          store.label,
          wholeShown.map((c) => CATEGORY_LABEL[c]),
          whole?.count ?? 0,
        )
        return (
          <section key={store.kind}>
            <h2 className="shop__store">{store.label}</h2>
            {categories.map((category) => (
              <Fragment key={category}>
                {heads.includes(CATEGORY_LABEL[category]) && (
                  <h3 className="shop__cat">{CATEGORY_LABEL[category]}</h3>
                )}
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
                        {done && <Icon name="check" size={20} />}
                      </span>
                      <span className="shop__name">{line.name}</span>
                      <span className="shop__qty">{formatQty(line.buy, line.unit)}</span>
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </section>
        )
      })}

      <div style={{ height: 40 }} />
    </div>
  )
}
