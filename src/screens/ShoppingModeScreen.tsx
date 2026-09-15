import { Fragment, useMemo, useState } from 'react'
import { CATEGORY_LABEL } from '../data/ingredients'
import type { IngredientCategory, ShoppingLine } from '../types'
import { buildShoppingList, formatQty, shoppingListText } from '../lib/shopping'
import { shoppingByStore } from '../lib/stores'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Icon } from '../components/icons'
import { useKeepAwake } from '../hooks/useKeepAwake'

/**
 * С какого размера отдела внутри него нужны подзаголовки категорий.
 *
 * Замер на десяти неделях (семья из двух едоков, пустая кладовая, зёрна 1–10):
 * в списке 34,5 строки и 4 непустых отдела, в отделе 8,6 строки и 2,4
 * категории. Среднее здесь обманывает — отделы разошлись на два вида. «Овощи и
 * фрукты» — 13,2 строки (до 16), «Бакалея» — 13,8 (до 16); «Мясо и рыба» — 3,3,
 * «Молочное» — 4,2. Строка в этом режиме высотой 68 px, на телефон их помещается
 * около восьми: большой отдел целиком не видно, и без подзаголовков в нём
 * теряешь место; маленький виден весь сразу, и делить его нечего.
 *
 * Если ставить подзаголовки везде, их выходит 9,5 на неделю и 40% из них стоят
 * над одной-двумя строками — то есть заголовков столько же, сколько было при
 * группировке по категориям, только теперь ещё и отделы сверху. С порогом их
 * 5,7, под каждым 4,7 строки, над одной-двумя — 21%.
 */
export const CATEGORY_HEADS_FROM = 8

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

  const skip = new Set(atHome)
  const toBuy = list.lines.filter((l) => !l.staple && !skip.has(l.ingredientId))
  const left = toBuy.filter((l) => !bought.includes(l.ingredientId))
  const leftSum = left.reduce((s, l) => s + l.price, 0)

  /*
   * В зале ходят не по категориям, а по отделам: за яйцами идут к молочному
   * холодильнику, а не в бакалею. Отделы, их порядок и состав берём из
   * `lib/stores` — там же, откуда их берёт экран «Продукты»; здесь только
   * раскладка строк по категориям, чтобы внутри отдела они шли в том же
   * порядке, что и в списке.
   */
  const visible = toBuy.filter((l) => !(hideBought && bought.includes(l.ingredientId)))
  const grouped = new Map<IngredientCategory, ShoppingLine[]>()
  for (const line of visible) {
    const arr = grouped.get(line.category) ?? []
    arr.push(line)
    grouped.set(line.category, arr)
  }
  const stores = shoppingByStore(visible)

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
          <Icon name="close" size={18} />
        </button>
        <div className="shop__counter">
          <b>{left.length}</b> {plural(left.length, ['позиция', 'позиции', 'позиций'])} · ≈{' '}
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
      )}

      {stores.map((store) => {
        const categories = store.categories.filter((c) => grouped.get(c)?.length)
        /*
         * Подзаголовок ставим только там, где он делит отдел на части: в отделе
         * из одной категории он повторил бы его заголовок другими словами
         * («Хлеб» под «Хлебом»), а в коротком — отнял бы строку экрана у самих
         * продуктов.
         */
        const withCategories = store.count >= CATEGORY_HEADS_FROM && categories.length > 1
        return (
          <section key={store.kind}>
            <h2 className="shop__store">{store.label}</h2>
            {categories.map((category) => (
              <Fragment key={category}>
                {withCategories && <h3 className="shop__cat">{CATEGORY_LABEL[category]}</h3>}
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
