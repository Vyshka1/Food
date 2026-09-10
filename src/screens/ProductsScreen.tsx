import { useMemo, useState } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../data/ingredients'
import type { IngredientCategory, ShoppingLine } from '../types'
import { buildShoppingList, formatQty, weekSpending } from '../lib/shopping'
import { leftoverWorthTelling } from '../lib/purchase'
import { shoppingByStore, type StoreKind } from '../lib/stores'
import { plural } from '../lib/format'
import { weekLabel } from '../lib/day'
import { useStore } from '../store'
import { Card, Segmented } from '../components/ui'
import { Icon, type IconName } from '../components/icons'
import { PantryCard } from '../components/PantryCard'

/**
 * Сколько останется от вскрытой упаковки. Пачка фарша 500 г при нужных 275 г
 * — это не «купить 500», а «275 в дело и 225 куда-то деть». Молчать об этом
 * значит перекладывать на человека вопрос, который создало приложение.
 */
function leftover(line: ShoppingLine): string | null {
  const rest = line.buy - line.needed
  if (line.staple) return null
  // правило одно на всё приложение — то же, что в карточке блюда
  if (!leftoverWorthTelling(rest, line.buy, line.unit)) return null
  return formatQty(rest, line.unit)
}

/**
 * «7 825 ₽» вместо «7825 ₽»: без разделителя четырёхзначная сумма читается
 * как год, и взгляд спотыкается ровно на главном числе экрана.
 */
function money(value: number): string {
  return value.toLocaleString('ru-RU')
}

const CATEGORY_ICON: Record<IngredientCategory, IconName> = {
  veg: 'leaf',
  fruit: 'apple',
  meat: 'meat',
  fish: 'fish',
  dairy: 'yogurt',
  // своей иконки у яиц и бобовых в наборе нет, нейтральный пакет честнее
  // случайного блюда: см. отчёт
  egg: 'bag',
  grain: 'porridge',
  legume: 'bag',
  bakery: 'bread',
  nuts: 'nuts',
  pantry: 'bag',
}

const STORE_ICON: Record<StoreKind, IconName> = {
  produce: 'leaf',
  meat: 'meat',
  dairy: 'yogurt',
  bakery: 'bread',
  grocery: 'bag',
}

type Tab = 'buy' | 'stock' | 'freezer'

const TABS: { value: Tab; label: string }[] = [
  { value: 'buy', label: 'Купить' },
  { value: 'stock', label: 'Запасы' },
  { value: 'freezer', label: 'Морозилка' },
]

/**
 * Кольцо «сколько уже собрано»: доля, а не проценты в тексте.
 *
 * Колпачок круглый только у ненулевой дуги: при нулевой длине браузер рисует
 * им точку — тем же приёмом делают пунктир, — и пустое кольцо получало метку
 * на двенадцати часах, читавшуюся как «одно уже куплено».
 */
function BuyRing({ done, total }: { done: number; total: number }) {
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const filled = total > 0 ? (done / total) * circumference : 0
  return (
    <svg className="buy-ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--card-soft)" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        stroke="var(--green)"
        strokeWidth="6"
        strokeLinecap={filled > 0 ? 'round' : 'butt'}
        strokeDasharray={`${filled} ${circumference - filled}`}
        // ноль — сверху, а не справа: круг читается как часы
        transform="rotate(-90 24 24)"
      />
    </svg>
  )
}

export function ProductsScreen({ onShoppingMode }: { onShoppingMode: () => void }) {
  const { menu, household, pantry, atHome, bought, toggleAtHome, toggleBought } = useStore()
  const [tab, setTab] = useState<Tab>('buy')
  const [query, setQuery] = useState('')
  /** `null` — «Все»; иначе набор категорий: чип даёт одну, отдел магазина — несколько. */
  const [cats, setCats] = useState<IngredientCategory[] | null>(null)

  const list = useMemo(
    () => (menu ? buildShoppingList(menu, household ?? undefined, pantry) : null),
    [menu, household, pantry],
  )
  const spending = useMemo(
    () => (menu && household ? weekSpending(menu, household, pantry, atHome) : null),
    [menu, household, pantry, atHome],
  )

  if (!menu || !list || !household || !spending) return null

  const isHome = (line: ShoppingLine) => line.staple || atHome.includes(line.ingredientId)
  /** То, что действительно покупается. Одно определение на весь экран. */
  const active = list.lines.filter((l) => !isHome(l))
  const left = active.filter((l) => !bought.includes(l.ingredientId))
  const home = list.lines.filter(isHome)
  // отмеченное руками — только оно и говорит, что даёт отметка: постоянные
  // продукты не покупают и без неё
  const marked = list.lines.filter((l) => !l.staple && atHome.includes(l.ingredientId))
  const atHomeSum = Math.round(marked.reduce((s, l) => s + l.price, 0))

  /*
   * Чек не пересчитываем: `weekSpending` уже ответил на этот вопрос с тем же
   * набором пропусков. Свой `reduce` рядом с ним — второй ответ, который
   * однажды разойдётся с первым на копейку округления.
   */
  const checkout = spending.checkout
  /*
   * Доли делим один раз и добираем остаток, иначе подписи дают 101%. Потолок
   * не перестраховка: `weekSpending` округляет цены построчно для чека и один
   * раз в конце для «использовано», и на копеечных списках «использовано»
   * выходит на рубль больше чека — тогда без ограничения выходило «-3% в
   * запасы» под строкой «Останется в запасах 0 ₽», а отрицательная ширина
   * молча схлопывала вторую половину полосы.
   */
  const usedPct = checkout > 0 ? Math.min(100, Math.round((spending.used / checkout) * 100)) : 0
  const leftPct = 100 - usedPct

  const stores = shoppingByStore(active)

  const needle = query.trim().toLowerCase()
  const visible = list.lines.filter(
    (l) =>
      (!cats || cats.includes(l.category)) &&
      (!needle || l.name.toLowerCase().includes(needle)),
  )
  const shownCategories = CATEGORY_ORDER.filter((c) => visible.some((l) => l.category === c))
  // чипы показываем только по тем категориям, которые вообще есть в списке,
  // — пустой фильтр обещает результат, которого нет
  const chipCategories = CATEGORY_ORDER.filter((c) => list.lines.some((l) => l.category === c))

  const sameCats = (a: IngredientCategory[]) =>
    !!cats && cats.length === a.length && a.every((c) => cats.includes(c))

  /** «10 позиций · ≈ 1 210 ₽» — по одному правилу и в заголовке, и в рейке. */
  const groupTotals = (lines: ShoppingLine[]) => {
    const buy = lines.filter((l) => !isHome(l))
    return { count: buy.length, price: Math.round(buy.reduce((s, l) => s + l.price, 0)) }
  }

  return (
    <div className="app app--workspace">
      <div className="screen-title">Продукты</div>
      <div className="screen-sub">Список на неделю · {weekLabel(menu.weekStart)}</div>

      <div className="workspace">
        <div className="workspace__main products-main">
          <div className="products-bar">
            <Segmented options={TABS} value={tab} onChange={setTab} />

            {tab === 'buy' && (
              <>
                <div className="products-search">
                  <Icon name="search" size={18} />
                  <input
                    className="input"
                    type="search"
                    placeholder="Найти продукт"
                    aria-label="Найти продукт"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>

                <div className="chips products-cats">
                  <button
                    type="button"
                    className="chip"
                    data-active={cats === null}
                    onClick={() => setCats(null)}
                  >
                    Все
                  </button>
                  {chipCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="chip"
                      // подсветка по вхождению, а не по совпадению набора:
                      // фильтр отдела включает несколько категорий сразу, и
                      // без этого список сужен, а выбранным не помечено ничего
                      data-active={!!cats?.includes(c)}
                      onClick={() => setCats(sameCats([c]) ? null : [c])}
                    >
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {tab === 'buy' && (
            <>
              <div className="buy-progress">
                <BuyRing done={active.length - left.length} total={active.length} />
                <div className="buy-progress__text">
                  <b>
                    Осталось купить {left.length} из {active.length}
                  </b>
                  <span className="muted small">
                    {cats || needle
                      ? 'фильтр включён — показана часть списка'
                      : `на неделю ${weekLabel(menu.weekStart)}`}
                  </span>
                </div>
                <span className="muted small buy-progress__hint">
                  Отмечайте продукты — сумма пересчитается автоматически
                </span>
              </div>

              {shownCategories.length === 0 && (
                <Card>
                  <p className="hint" style={{ margin: 0 }}>
                    Ничего не нашлось. Уберите фильтр или поищите по другому слову.
                  </p>
                </Card>
              )}

              {shownCategories.map((category) => {
                const group = visible.filter((l) => l.category === category)
                const totals = groupTotals(group)
                return (
                  <Card key={category}>
                    <div className="cat-head">
                      <span className="cat-head__icon">
                        <Icon name={CATEGORY_ICON[category]} size={16} />
                      </span>
                      <span className="cat-head__name">{CATEGORY_LABEL[category]}</span>
                      <span className="cat-head__sum muted small">
                        {totals.count === 0
                          ? 'всё есть дома'
                          : `${totals.count} ${plural(totals.count, ['позиция', 'позиции', 'позиций'])} · ≈ ${money(totals.price)} ₽`}
                      </span>
                    </div>
                    {group.map((line) => {
                      const athome = isHome(line)
                      const isBought = bought.includes(line.ingredientId)
                      return (
                        <div className="product" key={line.ingredientId} data-bought={isBought}>
                          <button
                            className="check"
                            data-on={isBought}
                            onClick={() => toggleBought(line.ingredientId)}
                            aria-label={`куплено: ${line.name}`}
                          >
                            <Icon name="check" size={17} />
                          </button>
                          <span className="product__name">
                            <b>
                              {line.name}
                              {line.packs && (
                                <span className="muted small">
                                  {' '}
                                  ×{' '}
                                  {line.packs
                                    .map(
                                      (p) => `${p.count} уп. по ${formatQty(p.size, line.unit)}`,
                                    )
                                    .join(' + ')}
                                </span>
                              )}
                            </b>
                            <span className="muted small">
                              нужно {formatQty(line.needed, line.unit)}
                              {line.fromStock
                                ? ` · ${formatQty(line.fromStock, line.unit)} из запасов`
                                : ''}
                              {line.buy !== line.needed &&
                                ` · купить ${formatQty(line.buy, line.unit)}`}
                              {leftover(line) && (
                                <>
                                  {' · '}
                                  <span className="product__left">
                                    останется {leftover(line)}
                                  </span>
                                </>
                              )}
                            </span>
                          </span>
                          <button
                            className="home-pill"
                            data-on={athome}
                            disabled={line.staple}
                            onClick={() => toggleAtHome(line.ingredientId)}
                          >
                            {athome ? 'есть дома' : 'нужно купить'}
                          </button>
                          <span
                            className="product__price"
                            style={athome ? { opacity: 0.35 } : undefined}
                          >
                            {athome ? '—' : `≈ ${money(line.price)} ₽`}
                          </span>
                        </div>
                      )
                    })}
                  </Card>
                )
              })}

              <p className="hint">
                Упаковки покупаются целиком, поэтому «к оплате» больше, чем «будет
                использовано на этой неделе»: разница остаётся дома и вычитается из
                следующей закупки. Специи, соль и масло считаются домашними и в сумму не
                входят. Цены ориентировочные, по средним значениям, а не по конкретному
                магазину.
              </p>
            </>
          )}

          {tab !== 'buy' && <PantryCard view={tab} />}
        </div>

        <div className="workspace__rail products-rail">
          <div className="rail-cta">
            <div className="rail-cta__head">
              <Icon name="cart" size={26} />
              <div>
                <b>В магазин</b>
                <div className="muted small">
                  {active.length} {plural(active.length, ['позиция', 'позиции', 'позиций'])}
                </div>
              </div>
            </div>
            <button className="btn" onClick={onShoppingMode}>
              Включить режим магазина
            </button>
          </div>

          <div className="rail-card products-rail__money">
            <div className="rail-card__title">
              <span className="rail-card__icon">
                <Icon name="wallet" size={16} />
              </span>
              Финансы на неделю
            </div>
            <div className="rail-money">≈ {money(checkout)} ₽</div>
            <div className="muted small">к оплате в магазине</div>

            {/* Три разных числа вместо одного: рост чека часто означает не
                перерасход, а переезд денег в кладовую. */}
            <div className="rail-line">
              <span>Будет использовано на этой неделе</span>
              <b>{money(spending.used)} ₽</b>
            </div>
            <div className="rail-line">
              <span>Останется в запасах</span>
              <b>{money(spending.leftAtHome)} ₽</b>
            </div>

            <div className="split-bar" aria-hidden="true">
              <span className="split-bar__used" style={{ width: `${usedPct}%` }} />
              <span className="split-bar__left" style={{ width: `${leftPct}%` }} />
            </div>
            <div className="split-legend muted small">
              <span>{usedPct}% на неделю</span>
              <span>{leftPct}% в запасы</span>
            </div>

            {household.budgetPerWeek > 0 && (
              <div className="rail-line">
                <span>Бюджет</span>
                <b>
                  {money(household.budgetPerWeek)} ₽
                  {checkout > household.budgetPerWeek && (
                    <span style={{ color: 'var(--warn)' }}>
                      {' '}
                      +{money(checkout - household.budgetPerWeek)} ₽
                    </span>
                  )}
                </b>
              </div>
            )}
          </div>

          <div className="rail-card">
            <div className="rail-card__title">
              <span className="rail-card__icon">
                <Icon name="home" size={16} />
              </span>
              Уже есть дома
            </div>
            {/*
              * Постоянные продукты здесь есть всегда, поэтому «карточка пуста»
              * не наступает никогда. Настоящий пустой случай другой: человек
              * ещё ничего не отмечал руками, и ему нужно объяснить, зачем эта
              * отметка, а не сообщить, что список пуст.
              */}
            {marked.length > 0 ? (
              <div className="muted small">
                {money(atHomeSum)} ₽ закрыто тем, что уже есть дома
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>
                Отметьте «есть дома» в списке — эти продукты уйдут из чека.
              </p>
            )}
            {home.length > 0 && (
              <ul className="rail-list">
                {home.map((line) => (
                  <li key={line.ingredientId}>
                    <span>{line.name}</span>
                    <span className="muted small">
                      {line.staple ? 'постоянно' : formatQty(line.needed, line.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn btn--soft btn--small" onClick={() => setTab('stock')}>
              Проверить запасы
            </button>
          </div>

          {stores.length > 0 && (
            <div className="rail-card">
              <div className="rail-card__title">
                <span className="rail-card__icon">
                  <Icon name="bag" size={16} />
                </span>
                По магазинам
              </div>
              {stores.map((store) => (
                <button
                  key={store.kind}
                  type="button"
                  className="store-row"
                  data-active={sameCats(store.categories)}
                  onClick={() => {
                    // повторное нажатие снимает фильтр: иначе выйти из отдела
                    // можно только через «Все», а его на телефоне ещё найти надо.
                    // Но только если список и так перед глазами: с вкладки
                    // «Запасы» тот же жест означает «покажи мне этот отдел».
                    const off = tab === 'buy' && sameCats(store.categories)
                    setCats(off ? null : store.categories)
                    setTab('buy')
                    /*
                     * И снимаем поиск. Иначе жест выглядит как «ничего не
                     * произошло»: с набранным «ябл» отдел «Мясо и рыба» даёт
                     * пустой список, хотя в строке отдела написано «2 позиции».
                     */
                    setQuery('')
                  }}
                >
                  <span className="store-row__icon">
                    <Icon name={STORE_ICON[store.kind]} size={16} />
                  </span>
                  <span className="store-row__text">
                    <b>{store.label}</b>
                    <span className="muted small">
                      {store.count} {plural(store.count, ['позиция', 'позиции', 'позиций'])} · ≈{' '}
                      {money(store.price)} ₽
                    </span>
                  </span>
                  <Icon name="forward" size={16} className="store-row__arrow" />
                </button>
              ))}
            </div>
          )}

          <div className="rail-tip">
            <Icon name="pin" size={16} />
            <span>
              <b>Отмечайте продукты</b>
              сумма пересчитается автоматически, а купленные продукты не пропадут из
              списка.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
