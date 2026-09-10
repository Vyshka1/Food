import type { ReactNode } from 'react'
import { ALLERGENS } from '../types'
import type { ProfileTab } from '../screens/ProfileScreen'
import { WEEKDAYS, householdNorms } from '../lib/menu'
import { GOAL_LABEL, dailyNorm } from '../lib/nutrition'
import { cupStats, habitLabel } from '../lib/drinks'
import { extraLabel, extraStats, extraUnit } from '../lib/extras'
import { useStore } from '../store'
import { RECIPES } from '../data/recipes'
import { plural } from '../lib/format'
import { CalorieRing } from './ui'
import { Icon, drinkIcon, extraIcon } from './icons'
import type { IconName } from './icons'
import { AttendanceGrid } from './AttendanceGrid'
import { TransferCard } from './TransferCard'
import { MACRO_COLOR } from '../lib/palette'

/**
 * Обзор профиля: то, что человек хочет увидеть, не открывая ничего.
 *
 * Правило раскладки одно и оно про частоту, а не про важность. Расписание
 * готовки правится прямо здесь — это самая часто меняемая настройка, и
 * прятать её за вкладку значит добавлять два нажатия к тому, что делают
 * каждую неделю. Всё остальное — сводка со ссылкой: напитки и дополнения
 * собираются конструктором, которому нужно место, и в карточке ему тесно.
 */
export function ProfileOverview({
  onOpen,
  onRecipes,
}: {
  onOpen: (tab: ProfileTab) => void
  onRecipes: () => void
}) {
  const { household, saveHousehold, history } = useStore()
  if (!household) return null
  const norms = householdNorms(household)

  const toggleCookingDay = (day: number) => {
    const cookingDays = household.cookingDays.includes(day)
      ? household.cookingDays.filter((d) => d !== day)
      : [...household.cookingDays, day].sort((a, b) => a - b)
    // без единого дня готовки меню собрать не из чего
    if (cookingDays.length === 0) return
    saveHousehold({ ...household, cookingDays })
  }

  const kitchen = household.kitchen
  const tiles: { icon: IconName; label: string; value: string }[] = [
    { icon: 'kitchen', label: 'Конфорки', value: String(kitchen.burners) },
    { icon: 'bake', label: 'Духовка', value: String(kitchen.ovens) },
    { icon: 'pan', label: 'Аэрогриль', value: kitchen.hasAirfryer ? 'Да' : 'Нет' },
    { icon: 'pot', label: 'Мультиварка', value: kitchen.hasMulticooker ? 'Да' : 'Нет' },
    { icon: 'drink', label: 'Блендер', value: kitchen.hasBlender ? 'Да' : 'Нет' },
    { icon: 'fridge', label: 'Морозилка', value: kitchen.hasFreezer ? 'Да' : 'Нет' },
    { icon: 'snowflake', label: 'Контейнеры', value: String(kitchen.containers) },
  ]

  return (
    <div className="pgrid">
      <PCard icon="shield" title="Суточная норма семьи" onOpen={() => onOpen('family')}>
        <div className="ring-row">
          <CalorieRing {...norms} />
          <div style={{ flex: 1 }}>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: MACRO_COLOR.protein }} />
                Белки
              </span>
              <b>{norms.protein} г</b>
            </div>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: MACRO_COLOR.fat }} />
                Жиры
              </span>
              <b>{norms.fat} г</b>
            </div>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: MACRO_COLOR.carbs }} />
                Углеводы
              </span>
              <b>{norms.carbs} г</b>
            </div>
          </div>
        </div>
        <div className="pcard__split" />
        <div className="stack">
          {household.eaters.map((e) => (
            <div className="row" key={e.id} style={{ gap: 12 }}>
              <div className="avatar">{e.name.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <b>{e.name}</b>
                <div className="muted small">
                  {dailyNorm(e).kcal} ккал · {GOAL_LABEL[e.goal].toLowerCase()}
                </div>
              </div>
            </div>
          ))}
        </div>
        <PLink label="Настроить семью" onClick={() => onOpen('family')} />
      </PCard>

      <PCard icon="history" title="Дни готовки" onOpen={() => onOpen('schedule')}>
        {/*
          * Единственная настройка, которую можно менять прямо в обзоре:
          * её трогают каждую неделю, и лишние два нажатия здесь заметны.
          */}
        <div className="day-toggle">
          {WEEKDAYS.map((label, i) => (
            <button
              key={label}
              data-active={household.cookingDays.includes(i)}
              onClick={() => toggleCookingDay(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <b className="pcard__lead">
          {household.cookingDays.length}{' '}
          {plural(household.cookingDays.length, ['день готовки', 'дня готовки', 'дней готовки'])} в
          неделю
        </b>
        <p className="hint" style={{ marginBottom: 0 }}>
          Меняешь дни — меню и план готовки пересобираются сразу.
        </p>
        <PLink label="Расписание целиком" onClick={() => onOpen('schedule')} />
      </PCard>

      <PCard icon="cup" title="Питание и привычки" onOpen={() => onOpen('food')}>
        <div className="muted small">
          {household.drinks.length}{' '}
          {plural(household.drinks.length, ['напиток', 'напитка', 'напитков'])} ·{' '}
          {household.extras.length}{' '}
          {plural(household.extras.length, ['дополнение', 'дополнения', 'дополнений'])}
        </div>
        {household.drinks.length === 0 && household.extras.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Кофе и овощная тарелка — это тоже калории и продукты в корзине.
          </p>
        ) : (
          <div className="plist">
            {household.drinks.map((d) => (
              <div className="plist__row" key={d.id}>
                <span className="plist__icon">
                  <Icon name={drinkIcon(d.kind)} size={18} />
                </span>
                <span className="plist__name">{habitLabel(d)}</span>
                <span className="plist__value">
                  {Math.round(cupStats(d).kcal * d.perDay)} ккал · {d.perDay} × в день
                </span>
              </div>
            ))}
            {household.extras.map((x) => (
              <div className="plist__row" key={x.id}>
                <span className="plist__icon">
                  <Icon name={extraIcon(x.kind)} size={18} />
                </span>
                <span className="plist__name">
                  {extraLabel(x.kind)} {x.amount} {extraUnit(x.kind) === 'pcs' ? 'шт' : 'г'}
                </span>
                <span className="plist__value">
                  {extraStats(x).kcal} ккал · {x.days.length} дн. в неделю
                </span>
              </div>
            ))}
          </div>
        )}
        <PLink label="Открыть" onClick={() => onOpen('food')} />
      </PCard>

      <PCard icon="clock" title="Кто где ест" wide onOpen={() => onOpen('schedule')}>
        <AttendanceGrid />
      </PCard>

      <PCard icon="kitchen" title="Кухня" action="Настроить" onOpen={() => onOpen('kitchen')}>
        <div className="muted small">
          {kitchen.burners} {plural(kitchen.burners, ['конфорка', 'конфорки', 'конфорок'])} ·{' '}
          {kitchen.ovens} {plural(kitchen.ovens, ['духовка', 'духовки', 'духовок'])} ·{' '}
          {kitchen.containers}{' '}
          {plural(kitchen.containers, ['контейнер', 'контейнера', 'контейнеров'])}
        </div>
        <div className="ktiles">
          {tiles.map((t) => (
            <div className="ktile" key={t.label}>
              <Icon name={t.icon} size={22} />
              <span className="ktile__label">{t.label}</span>
              <b>{t.value}</b>
            </div>
          ))}
        </div>
      </PCard>

      <PCard icon="history" title="История недель" onOpen={() => onOpen('schedule')}>
        {history.length === 0 ? (
          <div className="pempty">
            <Icon name="history" size={26} />
            <div>
              <b>Пока пусто</b>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                Прошлая неделя попадёт сюда сама, когда начнётся новая — вместе с отметками
                «приготовлено» и «съедено».
              </p>
            </div>
          </div>
        ) : (
          <div className="muted small">
            {history.length}{' '}
            {plural(history.length, ['неделя', 'недели', 'недель'])} в истории
          </div>
        )}
      </PCard>

      <PCard icon="book" title="Мои рецепты" onOpen={onRecipes}>
        <div className="muted small">Встроенная коллекция: {RECIPES.length} блюд</div>
        <div className="pempty">
          <Icon name="book" size={26} />
          <div>
            <p className="hint" style={{ margin: 0 }}>
              Сохраняйте любимые рецепты и добавляйте свои.
            </p>
          </div>
        </div>
        <PLink label="Добавить свой рецепт" onClick={onRecipes} />
      </PCard>

      <PCard icon="link" title="Перенос данных на другое устройство" onOpen={() => onOpen('data')}>
        <TransferCard compact />
      </PCard>

      <div className="pgrid__allergies">
        {household.eaters
          .filter((e) => e.allergies.length + e.customAllergens.length > 0)
          .map((e) => (
            <span key={e.id} className="small" style={{ color: 'var(--warn)' }}>
              {e.name}: аллергии —{' '}
              {[
                ...e.allergies.map((a) => ALLERGENS.find((x) => x.id === a)?.label ?? a),
                ...e.customAllergens,
              ].join(', ')}
            </span>
          ))}
      </div>
    </div>
  )
}

function PCard({
  icon,
  title,
  children,
  wide,
  action,
  onOpen,
}: {
  icon: IconName
  title: string
  children: ReactNode
  wide?: boolean
  action?: string
  onOpen?: () => void
}) {
  return (
    <section className={`pcard${wide ? ' pcard--wide' : ''}`}>
      <header className="pcard__head">
        <span className="pcard__icon">
          <Icon name={icon} size={18} />
        </span>
        <h3>{title}</h3>
        {onOpen &&
          (action ? (
            <button className="btn btn--soft btn--small" onClick={onOpen}>
              {action}
            </button>
          ) : (
            <button className="pcard__more" onClick={onOpen} aria-label={`Открыть: ${title}`}>
              <Icon name="forward" size={16} />
            </button>
          ))}
      </header>
      {children}
    </section>
  )
}

function PLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="btn btn--soft btn--small pcard__link" onClick={onClick}>
      {label}
      <Icon name="forward" size={14} />
    </button>
  )
}
