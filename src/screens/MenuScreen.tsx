import { useMemo, useState } from 'react'
import { recipeById } from '../data/recipeRegistry'
import { ENTRY_STATUS, MEAL_SLOTS } from '../types'
import type { MenuEntry } from '../types'
import { WEEKDAYS, cookTaskId, dayNorms, dayTotals, fedEaters, portionOf, takeawayEaters, totalPortions } from '../lib/menu'
import { drinkNorms } from '../lib/drinks'
import { extraNorms, extraStats, extraSummary, extrasAt } from '../lib/extras'
import { cookedGrams, recipeStats } from '../lib/nutrition'
import { cookedStats, planWeek } from '../lib/weekPlan'
import { useStore } from '../store'
import { CalorieRing, Card, Warnings } from '../components/ui'
import { RecipeSheet } from '../components/RecipeSheet'
import { RebuildSheet } from '../components/RebuildSheet'
import { WeekOverview } from '../components/WeekOverview'
import { TodayCard } from '../components/TodayCard'
import { Icon } from '../components/icons'
import { DishThumb } from '../components/DishImage'
import { plural } from '../lib/format'
import { MACRO_COLOR } from '../lib/palette'
import { ReplacePicker } from '../components/ReplacePicker'
import { daysBetween, parseIso, today } from '../lib/day'

const STORAGE_BADGE: Record<string, { label: string; cls: string } | null> = {
  fresh: null,
  fridge: { label: 'из холодильника', cls: 'badge badge--fridge' },
  freezer: { label: 'из морозилки', cls: 'badge badge--freezer' },
}

function todayIndex(weekStart: string): number {
  // разность считаем по календарю: в ночь перевода часов сутки не 24 часа, и
  // деление миллисекунд в последний час недели давало седьмой день — то есть
  // выход за пределы недели и откат на понедельник
  const diff = daysBetween(weekStart, today())
  return diff >= 0 && diff <= 6 ? diff : 0
}

export function MenuScreen() {
  const {
    household,
    menu,
    warnings,
    pantry,
    cookEvents,
    swapDish,
    banRecipe,
    togglePin,
    setEntryStatus,
    completeCookTask,
    undoCookTask,
  } =
    useStore()
  const [day, setDay] = useState(() => (menu ? todayIndex(menu.weekStart) : 0))
  const [openEntry, setOpenEntry] = useState<MenuEntry | null>(null)
  const [note, setNote] = useState('')
  const [replacing, setReplacing] = useState<MenuEntry | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  /** «День» и «Неделя» — один и тот же экран, разный масштаб. */
  const [weekView, setWeekView] = useState(false)
  /** null — вся семья, иначе тарелка одного едока. */
  const [who, setWho] = useState<string | null>(null)

  const eater = household?.eaters.find((e) => e.id === who) ?? null
  /** Норма считается по тому, что человек ест дома: обед в офисе — не наш недобор. */
  const norms = useMemo(
    () => (household ? dayNorms(household, day, eater?.id) : null),
    [household, day, eater],
  )
  // калории дня считаются по фактически приготовленным партиям: досыпанный в
  // блюдо остаток упаковки — это съеденные калории, и прятать их нечестно
  const actual = useMemo(
    () => (menu && household ? cookedStats(planWeek(menu, household, { pantry }), pantry) : undefined),
    [menu, household, pantry],
  )
  const totals = useMemo(
    () => (menu ? dayTotals(menu, day, eater?.id, actual) : null),
    [menu, day, eater, actual],
  )
  /**
   * Напитки показываем отдельной строкой, а не подмешиваем в еду: человек
   * должен видеть, что 140 ккал ушли в капучино, а не гадать, почему обед
   * стал меньше.
   */
  /** Дополнения к столу — их человек тоже съест, и они тоже считаются. */
  const extras = useMemo(() => {
    if (!household) return { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
    const who = eater ? [eater] : household.eaters
    return who.reduce(
      (acc, e) => {
        const x = extraNorms(household, e.id, day)
        return {
          kcal: acc.kcal + x.kcal,
          protein: acc.protein + x.protein,
          fat: acc.fat + x.fat,
          carbs: acc.carbs + x.carbs,
          fiber: acc.fiber + x.fiber,
        }
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    )
  }, [household, day, eater])

  const drinks = useMemo(() => {
    if (!household) return { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    const who = eater ? [eater] : household.eaters
    return who.reduce(
      (acc, e) => {
        const d = drinkNorms(household, e.id, day)
        return {
          kcal: acc.kcal + d.kcal,
          protein: acc.protein + d.protein,
          fat: acc.fat + d.fat,
          carbs: acc.carbs + d.carbs,
        }
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    )
  }, [household, day, eater])

  if (!household || !menu || !norms || !totals) return null

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = parseIso(menu.weekStart)
    d.setDate(d.getDate() + i)
    return d.getDate()
  })

  const monthNames = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ]
  const weekStart = parseIso(menu.weekStart)
  const weekEnd = parseIso(menu.weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()}–${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()]}`
      : `${weekStart.getDate()} ${monthNames[weekStart.getMonth()]} — ${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()]}`

  // план и факт: пока отметок нет, показываем состав недели, потом — что съели
  const eatenCount = menu.entries.filter((e) => e.status === 'eaten').length
  const skippedCount = menu.entries.filter((e) => e.status === 'skipped').length
  const marked = menu.entries.filter((e) => e.status).length

  const pct = (fact: number, norm: number) => Math.round((fact / Math.max(1, norm)) * 100)
  const percent = pct(totals.kcal, norms.kcal)
  /** Отклонение больше 15% подсвечиваем: «99% нормы» не должно скрывать перекос по БЖУ. */
  const off = (value: number) => (Math.abs(value - 100) > 15 ? { color: 'var(--warn)' } : undefined)
  const macros = [
    { label: 'Белки', color: MACRO_COLOR.protein, fact: totals.protein, norm: norms.protein },
    { label: 'Жиры', color: MACRO_COLOR.fat, fact: totals.fat, norm: norms.fat },
    { label: 'Углеводы', color: MACRO_COLOR.carbs, fact: totals.carbs, norm: norms.carbs },
  ]

  return (
    <div className="app">
      <div className="row row--between" style={{ paddingTop: 10 }}>
        <div>
          <b>{weekLabel}</b>
          <div className="muted small">
            {marked > 0
              ? `съедено ${eatenCount} из ${menu.entries.length}` +
                (skippedCount > 0 ? ` · пропущено ${skippedCount}` : '')
              : `меню на ${household.eaters.length} ${plural(household.eaters.length, ['человек', 'человека', 'человек'])} · ${household.cookingDays.length} ${plural(household.cookingDays.length, ['день', 'дня', 'дней'])} готовки`}
          </div>
        </div>
        <button className="btn btn--soft btn--small" onClick={() => setRebuilding(true)}>
          Пересобрать
        </button>
      </div>

      <div className="segmented" style={{ marginBottom: 10 }}>
        <button data-active={!weekView} onClick={() => setWeekView(false)}>
          День
        </button>
        <button data-active={weekView} onClick={() => setWeekView(true)}>
          Неделя
        </button>
      </div>

      {weekView && (
        <WeekOverview
          onOpenDay={(d) => {
            setDay(d)
            setWeekView(false)
          }}
        />
      )}

      {!weekView && (
      <>
      <div className="week-strip">
        {WEEKDAYS.map((label, i) => (
          <button key={label} data-active={i === day} onClick={() => setDay(i)}>
            <span className="wd">{label}</span>
            <span className="dn">{dates[i]}</span>
          </button>
        ))}
      </div>

      {household.eaters.length > 1 && (
        <div className="segmented" style={{ marginBottom: 12 }}>
          <button data-active={who === null} onClick={() => setWho(null)}>
            Семья
          </button>
          {household.eaters.map((e) => (
            <button key={e.id} data-active={who === e.id} onClick={() => setWho(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      <Warnings items={warnings} />

      {/*
        * Две колонки на мониторе и одна на телефоне — одна и та же разметка.
        * Порядок блоков на телефоне менять нельзя, а в двух колонках он другой,
        * поэтому решает размещение, а не перестановка: на узком экране рейка
        * встаёт первой через `order`, на широком — уходит вправо.
        */}
      <div className="day-layout">
        <aside className="day-rail">
          <TodayCard day={day} />

          {note && <div className="shop__note">{note}</div>}

          <Card>
        <div className="ring-row">
          <CalorieRing {...totals} label={`из ${norms.kcal} ккал`} />
          <div style={{ flex: 1 }}>
            {macros.map((m) => (
              <div className="macro" key={m.label}>
                <span>
                  <i className="dot" style={{ background: m.color }} />
                  {m.label}
                </span>
                <b>
                  {m.fact} / {m.norm} г{' '}
                  <span className="small" style={off(pct(m.fact, m.norm))}>
                    {pct(m.fact, m.norm)}%
                  </span>
                </b>
              </div>
            ))}
            <div className="macro muted small">
              <span style={off(percent)}>калории {percent}%</span>
              <span>≈ {totals.price} ₽</span>
            </div>
            {drinks.kcal > 0 && (
              <div className="macro muted small">
                <span>напитки {drinks.kcal} ккал</span>
                <span>всего {totals.kcal + drinks.kcal}</span>
              </div>
            )}
            {extras.kcal > 0 && (
              <div className="macro muted small">
                <span>дополнения {extras.kcal} ккал</span>
                <span>всего {totals.kcal + drinks.kcal + extras.kcal}</span>
              </div>
            )}
            {/* Клетчатка без четвёртого кольца: она важна, но не настолько,
                чтобы спорить за место с калориями. */}
            <div className="macro muted small">
              <span>клетчатка</span>
              <span
                style={
                  totals.fiber + extras.fiber < norms.fiber + extras.fiber
                    ? { color: 'var(--warn)' }
                    : undefined
                }
              >
                {Math.round(totals.fiber + extras.fiber)} из{' '}
                {Math.round(norms.fiber + extras.fiber)} г
              </span>
            </div>
          </div>
        </div>
          </Card>
        </aside>

        <div className="day-main">
      {MEAL_SLOTS.filter((m) => household.meals.includes(m.id)).map((meal) => {
        const entries = menu.entries.filter((e) => e.day === day && e.slot === meal.id)
        const fed = fedEaters(household, day, meal.id)
        const away = household.eaters.filter((e) => !fed.some((h) => h.id === e.id))
        const withMe = takeawayEaters(household, day, meal.id)
        return (
          <div key={meal.id}>
            <div className="meal-head">
              <Icon name={meal.icon} size={18} />
              {meal.label}
              {withMe.length > 0 && (
                <span className="meal-head__take">
                  {withMe.map((e) => e.name).join(', ')} — с собой
                </span>
              )}
              {away.length > 0 && (
                <span className="meal-head__away">
                  {away.map((e) => e.name).join(', ')} не дома
                </span>
              )}
            </div>
            {fed.length === 0 && (
              <p className="hint">Все едят не дома — на этот приём ничего не готовим.</p>
            )}
            {fed.length > 0 && entries.length === 0 && (
              <p className="hint">Ничего не запланировано.</p>
            )}
            {entries.map((entry) => {
              const recipe = recipeById(entry.recipeId)
              if (!recipe) return null
              const stats = recipeStats(recipe)
              const factor = eater ? portionOf(entry, eater.id) : totalPortions(entry)
              // заготовка с прошлых недель — это не «доедаем приготовленное»,
              // а «сегодня не готовим вовсе»
              const badge = entry.fromFreezer
                ? { label: 'готово, из морозилки', cls: 'badge badge--freezer' }
                : STORAGE_BADGE[entry.storage]
              // отметка о готовке — свойство всей готовки, а не этой записи
              const taskId = cookTaskId(menu.weekStart, entry.recipeId, entry.cookDay)
              const cooked = cookEvents.some((e) => e.taskId === taskId)
              return (
                <div
                  className="dish dish--row"
                  key={entry.id}
                  data-pinned={!!entry.pinned}
                  data-status={entry.status ?? ""}
                >
                  <button className="dish__open" onClick={() => setOpenEntry(entry)}>
                    <DishThumb recipe={recipe} />
                    <span style={{ flex: 1 }}>
                      <span className="dish__title">{recipe.title}</span>
                      <span className="dish__meta">
                        {eater && factor === 0
                          ? 'ест не дома'
                          : eater
                            ? `${cookedGrams(recipe, factor)} г · ${Math.round(stats.kcal * factor)} ккал`
                            : `на всех: ${Math.round(stats.kcal * factor)} ккал · ≈ ${Math.round(stats.price * factor)} ₽`}
                      </span>
                      <br />
                      {badge && <span className={badge.cls}>{badge.label}</span>}
                      {entry.cookDay !== entry.day && (
                        <span className="badge">готовим {WEEKDAYS[entry.cookDay]}</span>
                      )}
                      {entry.pinned && <span className="badge">оставлено</span>}
                    </span>
                  </button>
                  <button
                    className="dish__pin"
                    data-on={!!entry.pinned}
                    onClick={() => togglePin(entry.id)}
                    aria-label={
                      entry.pinned ? 'снять закрепление блюда' : 'оставить это блюдо при пересборке'
                    }
                    title={
                      entry.pinned
                        ? 'Пересборка меню его не тронет'
                        : 'Оставить это блюдо при пересборке'
                    }
                  >
                    <Icon name="pin" size={18} />
                  </button>
                  <div className="dish__status">
                    {/*
                      «Приготовлено» — про всю готовку сразу: одно блюдо
                      закрывает несколько приёмов, а продукты списываются один
                      раз. «Съедено» и «пропущено» — про эту тарелку.
                    */}
                    {!entry.fromFreezer && (
                      <button
                        data-on={cooked}
                        onClick={() => (cooked ? undoCookTask(taskId) : completeCookTask(taskId))}
                        title="Приготовлено"
                        aria-label={`${recipe.title}: приготовлено`}
                        aria-pressed={cooked}
                      >
                        <Icon name="pot" size={15} />
                        <span>Приготовлено</span>
                      </button>
                    )}
                    {ENTRY_STATUS.map((st) => (
                      <button
                        key={st.id}
                        data-on={entry.status === st.id}
                        onClick={() =>
                          setEntryStatus(entry.id, entry.status === st.id ? null : st.id)
                        }
                        title={st.label}
                        aria-label={`${recipe.title}: ${st.label.toLowerCase()}`}
                        aria-pressed={entry.status === st.id}
                      >
                        <Icon name={st.icon} size={15} />
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {/* Дополнения к этому приёму: не блюда, но на столе они есть, и
                человек должен видеть их там же, где еду. */}
            {extrasAt(household, day, meal.id)
              .filter((x) => !eater || x.eaterId === eater.id)
              .map((extra) => {
                const owner = household.eaters.find((e) => e.id === extra.eaterId)
                return (
                  <div className="extra-line" key={extra.id}>
                    <Icon name="salad" size={16} />
                    <span>
                      {extraSummary(extra)}
                      {household.eaters.length > 1 && owner ? ` · ${owner.name}` : ''}
                    </span>
                    <b>{extraStats(extra).kcal} ккал</b>
                  </div>
                )
              })}
          </div>
        )
      })}
        </div>
      </div>
      </>
      )}

      {rebuilding && <RebuildSheet day={day} onClose={() => setRebuilding(false)} />}

      {openEntry && (
        <RecipeSheet
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
          onSwap={() => {
            setReplacing(openEntry)
            setOpenEntry(null)
          }}
          onBan={() => {
            const title = recipeById(openEntry.recipeId)?.title ?? 'Блюдо'
            household.eaters.forEach((e) => banRecipe(e.id, openEntry.recipeId))
            setOpenEntry(null)
            setNote(`«${title}» больше не появится. Вернуть можно в профиле.`)
            setTimeout(() => setNote(''), 5000)
          }}
        />
      )}

      {replacing && (
        <ReplacePicker
          entry={replacing}
          onClose={() => setReplacing(null)}
          onPick={(recipeId) => {
            const title = recipeById(recipeId)?.title ?? 'Блюдо'
            swapDish(replacing.id, recipeId)
            setReplacing(null)
            setNote(`Поставили «${title}».`)
            setTimeout(() => setNote(''), 3000)
          }}
        />
      )}
    </div>
  )
}
