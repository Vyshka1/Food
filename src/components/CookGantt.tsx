import type { CSSProperties } from 'react'
import { Icon, recipeIcon } from './icons'
import { recipeById } from '../data/recipeRegistry'
import { APPLIANCE_LABEL } from '../types'
import type { PlannedStep } from '../types'

/**
 * Расписание готовки полосами: строка на блюдо, отрезок на шаг.
 *
 * Список шагов отвечал на вопрос «что делать сейчас», но не на главный вопрос
 * этого экрана — что идёт одновременно. Здесь ничего не считается заново:
 * `start` и `end` уже расставлены расписанием, полоса — это те же минуты,
 * переведённые в проценты ширины.
 */

/** Чем занят шаг. Полоса у каждого вида своя — это и есть легенда. */
type Band = 'hands' | 'stove' | 'oven' | 'free'

const BAND_LABEL: Record<Band, string> = {
  hands: 'руками',
  stove: 'плита',
  oven: 'духовка',
  free: 'можно отойти',
}

/**
 * Порядок важен: шаг может быть и ручным, и плитой сразу («жарить,
 * помешивая»). Для человека решает то, отнимает ли шаг руки, — поэтому
 * «руками» старше прибора, а прибор старше «можно отойти»: духовка печёт сама,
 * но плашка «отойди» рядом с духовкой читалась бы как «выключено».
 */
function bandOf(step: PlannedStep): Band {
  if (step.handsOn) return 'hands'
  // аэрогриль — та же духовка по смыслу: сухой жар и «поставил и ждёшь»
  if (step.appliance === 'oven' || step.appliance === 'airfryer') return 'oven'
  if (step.appliance === 'stove') return 'stove'
  return 'free'
}

/*
 * Сетка времени: шаг круглый, подписей немного, масштаб — от подписи.
 *
 * Подпись времени при 12 px занимает 30 px (замер в Chromium), с просветом —
 * 44 px: чаще одной подписи на 44 px шкала сливается в частокол. Отсюда и
 * масштаб: не меньше 3.6 px на минуту (при них двухчасовой план — 430 px, ещё
 * читаемая ширина), а если выбранный шаг сетки в 44 px не укладывается,
 * масштаб растягивается до них.
 *
 * Шаг сетки при этом круглый и подписей не больше семи: в макете их шесть на
 * час сорок семь готовки при шаге в двадцать минут. Из этих двух условий шаг и
 * выбирается — первый круглый, при котором подписей семь или меньше.
 */
const TICK_OPTIONS = [10, 15, 20, 30, 60]
const MAX_TICKS = 7
const MIN_PX_PER_MINUTE = 3.6
const LABEL_ROOM_PX = 44

function tickStep(makespan: number): number {
  return TICK_OPTIONS.find((s) => Math.floor(makespan / s) + 1 <= MAX_TICKS) ?? 60
}

/** Чем занят шаг словами — для подсказки и для чтения с экрана. */
function stepTitle(step: PlannedStep, clock: (minutes: number) => string): string {
  const what = step.appliance ? APPLIANCE_LABEL[step.appliance] : BAND_LABEL[bandOf(step)]
  return `${clock(step.start)}–${clock(step.end)} · ${step.text} · ${step.end - step.start} мин · ${what}`
}

export function CookGantt({
  steps,
  makespan,
  clock,
}: {
  steps: PlannedStep[]
  /** Длительность готовки: она же ширина диаграммы. */
  makespan: number
  /** Время дня по минутам от старта — считает экран, он же владеет часом начала. */
  clock: (minutes: number) => string
}) {
  if (steps.length === 0 || makespan <= 0) return null

  // строка на блюдо, в том порядке, в каком блюда вступают в работу
  const lanes: { recipeId: string; title: string; steps: PlannedStep[] }[] = []
  for (const step of steps) {
    const lane = lanes.find((l) => l.recipeId === step.recipeId)
    if (lane) lane.steps.push(step)
    else lanes.push({ recipeId: step.recipeId, title: step.title, steps: [step] })
  }

  const tick = tickStep(makespan)
  const ticks: number[] = []
  for (let t = 0; t <= makespan; t += tick) ticks.push(t)

  const pxPerMinute = Math.max(MIN_PX_PER_MINUTE, LABEL_ROOM_PX / tick)
  const pct = (minutes: number) => `${(minutes / makespan) * 100}%`

  return (
    <div className="gantt">
      <div className="gantt__head">
        <div className="section-title" style={{ marginBottom: 0 }}>
          Расписание
        </div>
        <div className="gantt__legend">
          {(['hands', 'stove', 'oven', 'free'] as Band[]).map((band) => (
            <span className="gantt__legend-item" key={band}>
              <i className="gantt__swatch" data-band={band} />
              {BAND_LABEL[band]}
            </span>
          ))}
        </div>
      </div>

      <div
        className="gantt__scroll"
        tabIndex={0}
        role="group"
        aria-label="Расписание готовки по блюдам"
      >
        <div
          className="gantt__grid"
          style={
            {
              // сетка не ужимается ниже читаемой: дальше — прокрутка внутри блока
              '--gantt-lanes': `${Math.round(makespan * pxPerMinute)}px`,
              '--gantt-tick': pct(tick),
            } as CSSProperties
          }
        >
          <div className="gantt__corner" />
          <div className="gantt__axis">
            {ticks.map((t) => (
              <span className="gantt__tick" key={t} style={{ left: pct(t) }}>
                {clock(t)}
              </span>
            ))}
          </div>

          {lanes.map((lane) => {
            const recipe = recipeById(lane.recipeId)
            return [
              <div className="gantt__dish" key={`${lane.recipeId}-name`}>
                {recipe && <Icon name={recipeIcon(recipe)} size={18} />}
                <span className="gantt__dish-title">{lane.title}</span>
              </div>,
              <div className="gantt__lane" key={`${lane.recipeId}-lane`}>
                {lane.steps.map((step) => (
                  /*
                   * У отрезка есть имя, а не только подсказка при наведении:
                   * `title` на телефоне не показывается вовсе, и в дерево
                   * доступности пустой span без роли не попадает. Диаграмма
                   * рисует форму дня — но прочитать её должно быть можно и без
                   * мыши.
                   */
                  <span
                    className="gantt__bar"
                    key={`${step.stepIndex}-${step.start}`}
                    data-band={bandOf(step)}
                    role="img"
                    aria-label={stepTitle(step, clock)}
                    style={{ left: pct(step.start), width: pct(step.end - step.start) }}
                    title={stepTitle(step, clock)}
                  />
                ))}
              </div>,
            ]
          })}
        </div>
      </div>
    </div>
  )
}
