import { useMemo, useState } from 'react'
import { WEEKDAYS, WEEKDAYS_ACC, WEEKDAYS_FULL } from '../lib/menu'
import { buildCookingPlans, formatDuration } from '../lib/cookingPlan'
import { dishWorkloads, kitchenLoad } from '../lib/kitchenLoad'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Card, Warnings } from '../components/ui'
import { Icon, recipeIcon } from '../components/icons'
import { CookGantt } from '../components/CookGantt'
import { recipeById } from '../data/recipeRegistry'
import { APPLIANCE_LABEL, THAW_LABEL } from '../types'
import type { Appliance, CookingPlan, Kitchen } from '../types'

/** «4 конфорки, духовка и блендер» — перечисляем то, что реально есть. */
function kitchenSummary(kitchen: Kitchen): string {
  const parts = [`${kitchen.burners} ${plural(kitchen.burners, ['конфорка', 'конфорки', 'конфорок'])}`]
  if (kitchen.ovens === 1) parts.push('духовка')
  if (kitchen.ovens >= 2) parts.push(`${kitchen.ovens} духовки`)
  if (kitchen.hasAirfryer) parts.push('аэрогриль')
  if (kitchen.hasMulticooker) parts.push('мультиварка')
  if (kitchen.hasBlender) parts.push('блендер')
  if (kitchen.hasProcessor) parts.push('комбайн')
  if (kitchen.hasMicrowave) parts.push('микроволновка')
  if (parts.length === 1) return `${parts[0]} и больше ничего`
  return `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`
}

/**
 * Приборы, которых на кухне бывает несколько, — только эти два: остальные
 * либо есть, либо нет (см. `applianceCapacity`). Оба женского рода, поэтому
 * «одна конфорка свободна» и «одна духовка свободна» пишутся одинаково.
 */
const MULTI_FORMS: Partial<Record<Appliance, [string, string, string]>> = {
  stove: ['конфорка', 'конфорки', 'конфорок'],
  oven: ['духовка', 'духовки', 'духовок'],
}

/** Род прибора: от него зависит «свободна» или «свободен». */
const FEMININE: Appliance[] = ['stove', 'oven', 'multicooker', 'microwave']

/*
 * Значки «рука» и «глаз». В общем наборе `icons.tsx` их нет, а сам набор
 * сейчас правит соседний поток — две правки одного файла встретились бы
 * конфликтом. Контур тот же, что у остальных значков: сетка 24, штрих 1.7.
 */
const GLYPH = {
  hand: 'M8 12V5.5a1.5 1.5 0 1 1 3 0V11M11 11V4.5a1.5 1.5 0 1 1 3 0V11M14 11V6.5a1.5 1.5 0 1 1 3 0V14a6 6 0 0 1-6 6h-1.2a4.8 4.8 0 0 1-3.9-2l-2.7-3.4a1.6 1.6 0 0 1 2.5-2L8 14',
  eye: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
}

function Glyph({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}

/** Текст шага, после которого морозят сырым — чтобы этикетка была понятна. */
function stepText(recipeId: string, index: number): string {
  return recipeById(recipeId)?.steps[index]?.text.toLowerCase() ?? ''
}

function clockFrom(startHour: number, offsetMinutes: number): string {
  const total = startHour * 60 + offsetMinutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/*
 * Сколько шагов показать в «Ближайших шагах». Четыре: на 390 px строка занимает
 * 64 px, и карточка из четырёх — 368 px (замеры в Chromium), почти половина
 * экрана в 844 px; пятая довела бы её до 432 px. Дальше это снова весь список
 * шагов, ради отказа от которого и рисовалась диаграмма: что за чем — видно на
 * ней, а по шагам с таймерами ведёт пошаговый режим.
 */
const NEXT_STEPS = 4

export function PlanScreen({
  onCookNow,
}: {
  onCookNow: (plan: CookingPlan, cookNames: string[]) => void
}) {
  const { household, menu, pantry } = useStore()
  const [startHour, setStartHour] = useState(11)
  const [activeDay, setActiveDay] = useState<number | null>(null)
  /** Готовим одна или вдвоём — это второй повар в расписании, а не оформление. */
  const [cooks, setCooks] = useState(1)
  /*
   * Кладовую передаём обязательно. Без неё расписание считало партии по пустой
   * морозилке, а карточка того же блюда — по настоящей: два экрана про одну
   * готовку расходились в числе изделий и во времени.
   */
  const plans = useMemo(
    () => (menu && household ? buildCookingPlans(menu, household, cooks, pantry) : []),
    [menu, household, cooks, pantry],
  )

  const current = plans.find((p) => p.cookDay === activeDay) ?? plans[0]
  const load = useMemo(
    () => (current && household ? kitchenLoad(current.steps, household.kitchen) : []),
    [current, household],
  )
  const workloads = useMemo(() => dishWorkloads(current?.steps ?? []), [current])

  if (!household || !menu) return null
  if (!current) return <div className="app">Меню пока пустое.</div>

  const cookNames =
    cooks === 1
      ? [household.eaters[0]?.name ?? 'Повар']
      : household.eaters.slice(0, 2).map((e) => e.name)

  /*
   * Свободные минуты — одно число на весь экран: и подсказка под плитками, и
   * охристая плашка в рейке говорят про него же. Двух ответов на вопрос
   * «остаётся ли время» быть не должно.
   */
  const freeMinutes = current.makespan - current.handsOnMinutes
  const clock = (offset: number) => clockFrom(startHour, offset)

  return (
    <div className="app app--workspace">
      <div className="screen-title">План готовки</div>
      <div className="screen-sub">
        Что делать одновременно и в каком порядке — с учётом того, что стоит у вас на кухне:{' '}
        {kitchenSummary(household.kitchen)}.
      </div>

      <div className="plan-controls">
        <div className="day-toggle">
          {plans.map((p) => (
            <button
              key={p.cookDay}
              data-active={p.cookDay === current.cookDay}
              onClick={() => setActiveDay(p.cookDay)}
            >
              {WEEKDAYS[p.cookDay]}
            </button>
          ))}
        </div>

        {household.eaters.length > 1 && (
          <div className="segmented">
            <button data-active={cooks === 1} onClick={() => setCooks(1)}>
              Готовлю одна
            </button>
            <button data-active={cooks === 2} onClick={() => setCooks(2)}>
              Готовим вдвоём
            </button>
          </div>
        )}
      </div>

      <Warnings items={current.warnings} />

      <div className="workspace">
        <div className="workspace__main plan-main">
          <Card variant="green">
            <div className="section-title" style={{ color: 'var(--green-dark)' }}>
              твой день готовки
            </div>
            <div className="plan-day">{WEEKDAYS_FULL[current.cookDay]}</div>
            <div className="chips">
              <span className="chip">
                {current.dishes.length} {plural(current.dishes.length, ['блюдо', 'блюда', 'блюд'])}
              </span>
              <span className="chip">
                на {current.coversDays.length}{' '}
                {plural(current.coversDays.length, ['день', 'дня', 'дней'])}
              </span>
              <span className="chip">
                <Icon name="people" size={16} /> {household.eaters.map((e) => e.name).join(' + ')}
              </span>
            </div>
          </Card>

          <div className="plan-stats">
            <div className="plan-stat">
              <i className="plan-stat__icon">
                <Icon name="clock" size={20} />
              </i>
              <b>{formatDuration(current.makespan)}</b>
              <span>от начала до конца</span>
            </div>
            <div className="plan-stat">
              <i className="plan-stat__icon">
                <Glyph d={GLYPH.hand} />
              </i>
              <b>{formatDuration(current.handsOnMinutes)}</b>
              <span>руки заняты</span>
            </div>
            <div className="plan-stat">
              <i className="plan-stat__icon">
                <Glyph d={GLYPH.eye} />
              </i>
              <b>{formatDuration(current.attentionMinutes)}</b>
              <span>присмотр</span>
            </div>
          </div>

          {cooks > 1 && (
            <p className="hint">
              Вдвоём:{' '}
              {current.perCookMinutes
                .map(
                  (minutes, i) => `${cookNames[i] ?? `повар ${i + 1}`} — ${formatDuration(minutes)}`,
                )
                .join(', ')}
              . Работы меньше не становится, она делится: духовку вторая пара рук не ускоряет.
            </p>
          )}
          <p className="hint">
            Одновременно в работе до {current.maxParallel}{' '}
            {plural(current.maxParallel, ['блюда', 'блюд', 'блюд'])}. «Присмотр» идёт поверх
            занятых рук — помешать, перевернуть, заглянуть в кастрюлю.
            {freeMinutes > 0 ? ` Свободного времени остаётся ${formatDuration(freeMinutes)}.` : ''}
          </p>

          <Card>
            <div className="plan-start">
              <span className="muted small">Начинаю в</span>
              <span className="plan-start__set">
                <button
                  className="btn btn--soft btn--small"
                  aria-label="Начать на час раньше"
                  onClick={() => setStartHour((h) => Math.max(6, h - 1))}
                >
                  −
                </button>
                <b>{clock(0)}</b>
                <button
                  className="btn btn--soft btn--small"
                  aria-label="Начать на час позже"
                  onClick={() => setStartHour((h) => Math.min(22, h + 1))}
                >
                  +
                </button>
              </span>
              <span className="plan-start__end muted small">
                Закончу в <b>{clock(current.makespan)}</b>.
              </span>
            </div>
          </Card>

          <Card>
            <CookGantt steps={current.steps} makespan={current.makespan} clock={clock} />
          </Card>

          <Card>
            <div className="section-title">Ближайшие шаги</div>
            {current.steps.slice(0, NEXT_STEPS).map((step, i) => {
              const recipe = recipeById(step.recipeId)
              return (
                <div className="next-step" key={`${step.recipeId}-${step.stepIndex}-${i}`}>
                  <span className="next-step__mark">
                    <Icon name="check" size={12} />
                  </span>
                  <span className="next-step__what">
                    <b>{clock(step.start)}</b> · {step.text}
                  </span>
                  <span className="next-step__dish muted small">
                    {recipe && <Icon name={recipeIcon(recipe)} size={16} />}
                    {step.title}
                  </span>
                </div>
              )
            })}
            <p className="hint" style={{ marginBottom: 0 }}>
              Дальше — по расписанию выше. В пошаговом режиме те же шаги идут с таймерами.
            </p>
          </Card>

          {current.pack.length > 0 && (
            <Card>
              <div className="section-title">
                <Icon name="fridge" size={16} />
                Разложить по контейнерам
              </div>
              {current.pack.map((task) => (
                <div className="ing-line" key={task.recipeId}>
                  <span>{task.title}</span>
                  <b>
                    {task.containers}{' '}
                    {plural(task.containers, ['контейнер', 'контейнера', 'контейнеров'])} ·{' '}
                    {task.forDays.map((d) => WEEKDAYS[d]).join(', ')}
                  </b>
                </div>
              ))}
              <p className="hint" style={{ marginBottom: 0 }}>
                Сегодняшнюю порцию раскладывать незачем — её едят с тарелки.
              </p>
            </Card>
          )}

          {current.freeze.length > 0 && (
            <Card>
              <div className="section-title">
                <Icon name="snowflake" size={16} />В морозилку
              </div>
              {current.freeze.map((f) => (
                <div className="freeze-row" key={f.recipeId}>
                  <div className="freeze-row__label">{f.label}</div>
                  <div className="muted small">
                    {f.stage === 'raw'
                      ? `морозить сырыми${
                          f.afterStep !== undefined
                            ? ` — после «${stepText(f.recipeId, f.afterStep)}»`
                            : ''
                        }`
                      : 'морозить готовыми, дав остыть'}
                    {' · '}
                    {THAW_LABEL[f.thaw]}
                  </div>
                </div>
              ))}
              <p className="hint" style={{ marginBottom: 0 }}>
                Надпись на контейнере уже готова — перепишите её на стикер. Срок считается от
                сегодняшней готовки.
              </p>
            </Card>
          )}

          {current.thaw.length > 0 && (
            <Card>
              <div className="section-title">
                <Icon name="fridge" size={16} />
                Достать из морозилки
              </div>
              {current.thaw.map((r) => (
                <div
                  className="row row--between"
                  key={`${r.recipeId}-${r.day}`}
                  style={{ padding: '6px 0' }}
                >
                  <span>
                    {WEEKDAYS_FULL[r.day]}
                    {r.hours >= 8 ? ' вечером' : ' утром'}
                  </span>
                  <b>
                    {r.title}
                    {r.day !== r.forDay && (
                      <span className="muted small"> — на {WEEKDAYS_ACC[r.forDay]}</span>
                    )}
                  </b>
                </div>
              ))}
              <p className="hint" style={{ marginBottom: 0 }}>
                Иначе в нужный день блюдо придётся размораживать второпях.
              </p>
            </Card>
          )}
        </div>

        <div className="workspace__rail">
          <div className="rail-cta">
            <div className="rail-cta__head">
              <Icon name="pot" size={26} />
              <div>
                <b>Готовы начать?</b>
                <span className="muted small">Таймеры и подсказки будут идти по порядку</span>
              </div>
            </div>
            <button className="btn" onClick={() => onCookNow(current, cookNames)}>
              Готовлю сейчас
            </button>
          </div>

          <div className="rail-card">
            <div className="rail-card__title">
              <span className="rail-card__icon">
                <Icon name="salad" size={18} />
              </span>
              Что приготовим
            </div>
            {current.dishes.map((d) => {
              const recipe = recipeById(d.recipeId)
              const work = workloads.get(d.recipeId)
              const packed = current.pack.find((p) => p.recipeId === d.recipeId)
              return (
                <div className="rail-dish" key={d.recipeId}>
                  {recipe && <Icon name={recipeIcon(recipe)} size={18} />}
                  <span className="rail-dish__name">
                    <b>{d.title}</b>
                    <span className="muted small">
                      {work?.handsOnMinutes ?? 0} мин ·{' '}
                      {work?.appliance ? APPLIANCE_LABEL[work.appliance] : 'руками'}
                    </span>
                  </span>
                  <span className="rail-dish__pack">
                    {packed ? (
                      <>
                        <b>
                          {packed.containers}{' '}
                          {plural(packed.containers, ['контейнер', 'контейнера', 'контейнеров'])}
                        </b>
                        <span className="muted small">
                          на {packed.forDays.length}{' '}
                          {plural(packed.forDays.length, ['день', 'дня', 'дней'])}
                        </span>
                      </>
                    ) : (
                      <span className="muted small">едим сегодня</span>
                    )}
                  </span>
                </div>
              )
            })}
            <p className="hint" style={{ margin: 0 }}>
              Минуты — те, что руки заняты этим блюдом; вместе они и складываются в «руки заняты».
            </p>
          </div>

          <div className="rail-card">
            <div className="rail-card__title">
              <span className="rail-card__icon">
                <Icon name="kitchen" size={18} />
              </span>
              Загрузка кухни
            </div>
            {load.map((item) => {
              const forms = MULTI_FORMS[item.appliance]
              const free = item.capacity - item.peak
              const feminine = FEMININE.includes(item.appliance)
              if (item.capacity > 1 && forms) {
                return (
                  <div className="load-row" key={item.appliance}>
                    <span className="load-dots">
                      {Array.from({ length: item.capacity }, (_, i) => (
                        <i key={i} data-busy={i < item.peak} />
                      ))}
                    </span>
                    <span className="load-row__text">
                      {/* «из 4 конфорок» — родительный падеж, он же forms[2] */}
                      <b>
                        {item.peak} из {item.capacity} {forms[2]}
                      </b>
                      <span className="muted small">
                        {free === 0
                          ? `все ${forms[1]} заняты`
                          : free === 1
                            ? `одна ${forms[0]} свободна`
                            : `свободно ${free} ${plural(free, forms)}`}
                      </span>
                    </span>
                  </div>
                )
              }
              return (
                <div className="load-row load-row--single" key={item.appliance}>
                  {item.capacity > 0 && (
                    <span className="load-dots">
                      <i data-busy={item.peak > 0} />
                    </span>
                  )}
                  <span className="load-row__text">
                    <b>{APPLIANCE_LABEL[item.appliance]}</b>
                    <span className="muted small">
                      {item.capacity === 0
                        ? feminine
                          ? '— нужна по рецепту, а на кухне её нет'
                          : '— нужен по рецепту, а на кухне его нет'
                        : item.peak > 0
                          ? feminine
                            ? '— занята'
                            : '— занят'
                          : feminine
                            ? '— свободна'
                            : '— свободен'}
                    </span>
                  </span>
                </div>
              )
            })}
            <p className="hint" style={{ margin: 0 }}>
              Это самый плотный момент плана — в остальное время свободнее.
            </p>
          </div>

          {freeMinutes <= 0 && (
            <div className="rail-tip">
              <Icon name="alert" size={16} />
              <span>
                <b>Свободных минут почти нет</b>
                Второй день готовки разгрузит план.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
