import { useMemo, useState } from 'react'
import { WEEKDAYS, WEEKDAYS_ACC, WEEKDAYS_FULL, cookTaskId } from '../lib/menu'
import { buildCookingPlans, formatDuration } from '../lib/cookingPlan'
import { dishWorkloads, kitchenLoad } from '../lib/kitchenLoad'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Card, Warnings } from '../components/ui'
import { Icon, recipeIcon } from '../components/icons'
import { CookGantt } from '../components/CookGantt'
import { blockHint, blockTitle, cookBlocks } from '../lib/cookBlocks'
import { IMPLICIT_COOK_NOTE } from '../lib/menu'
import { recipeById } from '../data/recipeRegistry'
import { APPLIANCE_LABEL, STATION_LABEL, THAW_LABEL } from '../types'
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

/** Сколько блюд помещается в рейке, не превращая её во вторую таблицу. */
const RAIL_DISHES = 4

export function PlanScreen({
  onCookNow,
}: {
  onCookNow: (plan: CookingPlan, cookNames: string[]) => void
}) {
  const { household, menu, pantry, warnings, cookEvents, completeCookTask, undoCookTask } =
    useStore()
  const [startHour, setStartHour] = useState(11)
  const [activeDay, setActiveDay] = useState<number | null>(null)
  /** Готовим одна или вдвоём — это второй повар в расписании, а не оформление. */
  const [cooks, setCooks] = useState(1)
  /** Диаграмма — дополнительный режим, а не главный экран. */
  const [showGantt, setShowGantt] = useState(false)
  /** Рейка показывает первые блюда; остальные — по ссылке. */
  const [railDishes, setRailDishes] = useState(false)
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
   *
   * Вычитаем занятость самого нагруженного повара, а не сумму по всем.
   * `handsOnMinutes` — это работа всей кухни, и вдвоём она вдвое больше
   * настенных часов: план на 1 ч 40 при двух поварах по 1 ч 10 и 1 ч 06
   * давал «минус 36 минут». Экран советовал разнести готовку на два дня ровно
   * там, где второй повар уже сократил её на 37 минут. Замерено: при двух
   * поварах в минус уходили 49 планов из 60.
   */
  const busiestCook = Math.max(...current.perCookMinutes, 0)
  const freeMinutes = current.makespan - busiestCook
  const clock = (offset: number) => clockFrom(startHour, offset)
  /*
   * Группировку не мемоизируем: она идёт после ранних возвратов, а хук там
   * стоять не может. Замерено — 0.007 мс на плане из 56 шагов (2000 вызовов),
   * то есть считать её заново каждую отрисовку дешевле, чем городить ради
   * этого лишний хук.
   */
  const blocks = cookBlocks(current.steps)
  /** Ключ готовки — тот же, что у cookTasks: неделя, блюдо, день готовки. */
  const taskKey = (recipeId: string) => cookTaskId(menu.weekStart, recipeId, current.cookDay)
  const doneTasks = new Set(cookEvents.map((e) => e.taskId))

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

      {/*
        * Про дописанную понедельничную готовку говорим здесь — рядом с
        * планом, который из-за неё и появился. На экране меню это сообщение
        * стояло над пятницей и не относилось ни к одному блюду на экране.
        */}
      {warnings.includes(IMPLICIT_COOK_NOTE) && (
        <div className="plan-note">
          <Icon name="pan" size={16} />
          <span>
            <b>Добавили короткую готовку в понедельник</b>
            Понедельник не отмечен днём готовки, а чем-то начало недели закрывать надо. Уберётся
            сама, если отметить понедельник днём готовки в профиле.
          </span>
        </div>
      )}

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

          {/*
            * Сводка отвечает на четыре вопроса, которые задают до готовки:
            * сколько это займёт, сколько действий, сколько блюд, когда я
            * освобожусь. «Руки заняты» отсюда убрано намеренно: при одном
            * поваре оно почти равно общему времени и читается как «четыре
            * часа не отойти», хотя это не так — присмотр и ожидание внутри.
            * Точное число осталось в подробностях ниже.
            */}
          <div className="plan-stats">
            <div className="plan-stat">
              <i className="plan-stat__icon">
                <Icon name="clock" size={20} />
              </i>
              <b>{formatDuration(current.makespan)}</b>
              <span>всего</span>
            </div>
            <div className="plan-stat">
              <i className="plan-stat__icon">
                <Icon name="check" size={20} />
              </i>
              <b>
                {current.steps.length}{' '}
                {plural(current.steps.length, ['действие', 'действия', 'действий'])}
              </b>
              <span>по плану</span>
            </div>
            <div className="plan-stat">
              <i className="plan-stat__icon">
                <Icon name="pot" size={20} />
              </i>
              <b>
                {current.dishes.length}{' '}
                {plural(current.dishes.length, ['блюдо', 'блюда', 'блюд'])}
              </b>
              <span>на {current.coversDays.length} {plural(current.coversDays.length, ['день', 'дня', 'дней'])}</span>
            </div>
            <div className="plan-stat">
              <i className="plan-stat__icon">
                <Icon name="party" size={20} />
              </i>
              <b>{clock(current.makespan)}</b>
              <span>закончите</span>
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
          <p className="hint plan-free">
            Руки заняты {formatDuration(current.handsOnMinutes)}, присмотр —{' '}
            {formatDuration(current.attentionMinutes)} поверх них: помешать, перевернуть,
            заглянуть в кастрюлю. Одновременно в работе до {current.maxParallel}{' '}
            {plural(current.maxParallel, ['блюда', 'блюд', 'блюд'])}.
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

          {/*
            * План по времени — главное на экране, и он стоит до всего
            * остального. Человек у плиты спрашивает «что мне делать сейчас»,
            * а не «как устроен день»: диаграмма отвечает на второй вопрос и
            * потому уехала под кнопку.
            */}
          {blocks.map((block, i) => (
            <Card key={`${block.start}-${i}`}>
              <div className="plan-block">
                <span className="plan-block__time">{clock(block.start)}</span>
                <div className="plan-block__head">
                  <b>{blockTitle(block, i, blocks.length)}</b>
                  <span className="muted small">
                    {blockHint(block, i, blocks.length, cooks)}
                  </span>
                </div>
              </div>
              {block.steps.map((step) => {
                const recipe = recipeById(step.recipeId)
                const minutes = step.end - step.start
                const detail = [
                  `${minutes} мин`,
                  step.activeMinutes > 0 && step.activeMinutes < minutes
                    ? `руки заняты ${step.activeMinutes}`
                    : null,
                  step.appliance ? APPLIANCE_LABEL[step.appliance] : STATION_LABEL[step.station],
                  step.tempC ? `${step.tempC}°` : null,
                  step.unattended ? 'можно отойти' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <div className="next-step" key={`${step.recipeId}-${step.stepIndex}`}>
                    <span className="next-step__mark">
                      <Icon name="check" size={12} />
                    </span>
                    <span className="next-step__what">
                      {step.text}
                      <span className="next-step__detail muted small">{detail}</span>
                    </span>
                    <span className="next-step__dish muted small">
                      {recipe && <Icon name={recipeIcon(recipe)} size={16} />}
                      {step.title}
                    </span>
                  </div>
                )
              })}
            </Card>
          ))}

          {/*
            * Диаграмма осталась — но как дополнительный режим. Она полезна,
            * когда хочется понять, почему день складывается именно так; на
            * вопрос «с чего начать» она без расшифровки не отвечает.
            */}
          {current.steps.length > 0 && (
            <Card>
              <button
                className="btn btn--soft btn--small plan-gantt-toggle"
                onClick={() => setShowGantt((v) => !v)}
              >
                <Icon name={showGantt ? 'close' : 'history'} size={14} />
                {showGantt ? 'Скрыть загрузку кухни' : 'Показать загрузку кухни'}
              </button>
              {showGantt && (
                <CookGantt steps={current.steps} makespan={current.makespan} clock={clock} />
              )}
            </Card>
          )}

          {/*
            * Контейнеры, морозилка и разморозка — один завершающий этап, а не
            * три таблицы в подвале. Пока они лежали отдельными карточками
            * внизу, они читались как справка; на деле это последнее действие
            * дня, и у него есть своё место в порядке «сейчас → потом → после».
            */}
          {(current.pack.length > 0 || current.freeze.length > 0 || current.thaw.length > 0) && (
            <Card>
              <div className="plan-block">
                <span className="plan-block__time">{clock(current.makespan)}</span>
                <div className="plan-block__head">
                  <b>После готовки</b>
                  <span className="muted small">Разложить, подписать и убрать.</span>
                </div>
              </div>

              {current.pack.map((task) => (
                <div className="next-step next-step--after" key={`pack-${task.recipeId}`}>
                  <span className="next-step__mark">
                    <Icon name="check" size={12} />
                  </span>
                  <span className="next-step__what">
                    {task.title}
                    <span className="next-step__detail muted small">
                      {task.containers}{' '}
                      {plural(task.containers, ['контейнер', 'контейнера', 'контейнеров'])} · на{' '}
                      {task.forDays.map((d) => WEEKDAYS[d]).join(', ')}
                    </span>
                  </span>
                </div>
              ))}

              {current.freeze.map((f) => (
                <div className="next-step next-step--after" key={`freeze-${f.recipeId}`}>
                  <span className="next-step__mark">
                    <Icon name="snowflake" size={12} />
                  </span>
                  <span className="next-step__what">
                    {f.label}
                    <span className="next-step__detail muted small">
                      {f.stage === 'raw'
                        ? `морозить сырыми${
                            f.afterStep !== undefined
                              ? ` — после «${stepText(f.recipeId, f.afterStep)}»`
                              : ''
                          }`
                        : 'морозить готовыми, дав остыть'}
                      {' · '}
                      {THAW_LABEL[f.thaw]}
                    </span>
                  </span>
                </div>
              ))}

              {current.thaw.map((r) => (
                <div className="next-step next-step--after" key={`thaw-${r.recipeId}-${r.day}`}>
                  <span className="next-step__mark">
                    <Icon name="fridge" size={12} />
                  </span>
                  <span className="next-step__what">
                    Достать {r.title}
                    <span className="next-step__detail muted small">
                      {WEEKDAYS_FULL[r.day]}
                      {r.hours >= 8 ? ' вечером' : ' утром'}
                      {r.day !== r.forDay ? ` — на ${WEEKDAYS_ACC[r.forDay]}` : ''}
                    </span>
                  </span>
                </div>
              ))}

              <p className="hint" style={{ marginBottom: 0 }}>
                Сегодняшнюю порцию раскладывать незачем — её едят с тарелки. Надпись на контейнер
                уже готова: срок считается от сегодняшней готовки.
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
            {/*
              * Первые четыре блюда и ссылка на остальные. Девять строк с
              * минутами и контейнерами — это уже не сводка, а вторая таблица
              * сбоку от плана: рейка должна отвечать «что получится», а не
              * пересказывать весь день.
              */}
            {(railDishes ? current.dishes : current.dishes.slice(0, RAIL_DISHES)).map((d) => {
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
                      {work?.appliance ? APPLIANCE_LABEL[work.appliance] : 'руками'} ·{' '}
                      {/*
                        * Порции: сколько всего варим. Число ушло с экрана
                        * вместе со старой карточкой «Что готовим», а больше
                        * его тут негде увидеть — «2 контейнера» отвечают на
                        * другой вопрос, про раскладку, а не про объём.
                        */}
                      {d.portions.toFixed(1).replace('.0', '')}{' '}
                      {plural(Math.round(d.portions), ['порция', 'порции', 'порций'])}
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
                  {/*
                    * Отметка о готовке живёт здесь — на готовке, а не в меню,
                    * где она читалась третьим состоянием рядом со «съедено».
                    * Это единственный вход в самую опасную операцию
                    * приложения: она списывает продукты из кладовой и кладёт
                    * заготовки в морозилку.
                    */}
                  <button
                    className="rail-dish__cooked"
                    data-on={doneTasks.has(taskKey(d.recipeId))}
                    onClick={() => {
                      const key = taskKey(d.recipeId)
                      if (doneTasks.has(key)) undoCookTask(key)
                      else completeCookTask(key)
                    }}
                    aria-pressed={doneTasks.has(taskKey(d.recipeId))}
                    aria-label={`${d.title}: приготовлено`}
                  >
                    <Icon name="check" size={14} />
                    <span>{doneTasks.has(taskKey(d.recipeId)) ? 'Готово' : 'Приготовлено'}</span>
                  </button>
                </div>
              )
            })}
            {current.dishes.length > RAIL_DISHES && (
              <button className="rail-more" onClick={() => setRailDishes((v) => !v)}>
                {railDishes
                  ? 'Свернуть'
                  : `Все ${current.dishes.length} ${plural(current.dishes.length, ['блюдо', 'блюда', 'блюд'])}`}
                <Icon name={railDishes ? 'back' : 'forward'} size={14} />
              </button>
            )}
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
