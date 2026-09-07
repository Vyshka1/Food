import { useState } from 'react'
import type { DrinkHabit, DrinkKind } from '../types'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import {
  DRINK_KINDS,
  MILK_OPTIONS,
  cupStats,
  drinkLabel,
  drinkNorms,
  habitLabel,
} from '../lib/drinks'
import { WEEKDAYS } from '../lib/menu'
import { dailyNorm } from '../lib/nutrition'
import { useStore } from '../store'
import { Stepper } from './ui'

/**
 * Привычные напитки.
 *
 * Кофе не блюдо, и в меню ему делать нечего — но два капучино в день это
 * около 280 ккал, которые иначе уходят сверх нормы молча. Здесь их и
 * заводят: калории резервируются до раскладки меню, а молоко попадает в
 * список покупок.
 */

/** Каким напиткам вообще нужен вопрос про молоко. */
const WITH_MILK: DrinkKind[] = ['latte', 'cappuccino', 'matcha', 'cocoa', 'protein']

function newHabit(eaterId: string): DrinkHabit {
  return {
    id: `d${Date.now().toString(36)}`,
    eaterId,
    kind: 'cappuccino',
    volumeMl: 250,
    milkId: 'milk',
    sugarTsp: 0,
    syrupMl: 0,
    perDay: 1,
    days: [0, 1, 2, 3, 4, 5, 6],
  }
}

export function DrinksEditor() {
  const { household, setDrinks } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  if (!household) return null

  const drinks = household.drinks ?? []
  const patch = (id: string, change: Partial<DrinkHabit>) =>
    setDrinks(drinks.map((d) => (d.id === id ? { ...d, ...change } : d)))
  const add = (eaterId: string) => {
    const habit = newHabit(eaterId)
    setDrinks([...drinks, habit])
    setOpenId(habit.id)
  }

  return (
    <div className="stack">
      {household.eaters.map((eater) => {
        const mine = drinks.filter((d) => d.eaterId === eater.id)
        const perDay = drinkNorms(household, eater.id, 0)
        const norm = dailyNorm(eater)
        return (
          <div key={eater.id} className="drinks__person">
            <div className="row row--between">
              <b>{eater.name}</b>
              <button className="chip" onClick={() => add(eater.id)}>
                + Напиток
              </button>
            </div>

            {mine.length === 0 && (
              <p className="hint" style={{ marginBottom: 0 }}>
                Пока ничего. Если {eater.name} пьёт кофе или сок каждый день, эти калории лучше
                учесть заранее — иначе рацион выходит выше нормы незаметно.
              </p>
            )}

            {mine.map((habit) => {
              const stats = cupStats(habit)
              const open = openId === habit.id
              return (
                <div className="drink" key={habit.id}>
                  <button className="drink__head" onClick={() => setOpenId(open ? null : habit.id)}>
                    <span>
                      <b>{habitLabel(habit)}</b>
                      <span className="muted small">
                        {habit.perDay} × {stats.kcal} ккал · {habit.days.length} дн
                      </span>
                    </span>
                    <span className="drink__kcal">{stats.kcal * habit.perDay} ккал</span>
                  </button>

                  {open && (
                    <div className="drink__body">
                      <div className="chips">
                        {DRINK_KINDS.map((k) => (
                          <button
                            key={k.id}
                            className="chip"
                            data-active={habit.kind === k.id}
                            onClick={() => patch(habit.id, { kind: k.id })}
                          >
                            {k.label}
                          </button>
                        ))}
                      </div>

                      <div className="row row--between">
                        <span>Объём, мл</span>
                        <Stepper
                          value={habit.volumeMl}
                          min={50}
                          max={1000}
                          step={50}
                          onChange={(volumeMl) => patch(habit.id, { volumeMl })}
                        />
                      </div>

                      {WITH_MILK.includes(habit.kind) && (
                        <div className="chips">
                          {MILK_OPTIONS.map((id) => (
                            <button
                              key={id}
                              className="chip"
                              data-active={(habit.milkId ?? 'milk') === id}
                              onClick={() => patch(habit.id, { milkId: id })}
                            >
                              {INGREDIENT_BY_ID[id]?.name ?? id}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="row row--between">
                        <span>Сахар, ч. л.</span>
                        <Stepper
                          value={habit.sugarTsp}
                          min={0}
                          max={5}
                          onChange={(sugarTsp) => patch(habit.id, { sugarTsp })}
                        />
                      </div>
                      <div className="row row--between">
                        <span>Сироп, мл</span>
                        <Stepper
                          value={habit.syrupMl}
                          min={0}
                          max={60}
                          step={10}
                          onChange={(syrupMl) => patch(habit.id, { syrupMl })}
                        />
                      </div>
                      <div className="row row--between">
                        <span>Сколько раз в день</span>
                        <Stepper
                          value={habit.perDay}
                          min={1}
                          max={6}
                          onChange={(perDay) => patch(habit.id, { perDay })}
                        />
                      </div>

                      <div className="days">
                        {WEEKDAYS.map((label, day) => (
                          <button
                            key={label}
                            className="chip"
                            data-active={habit.days.includes(day)}
                            onClick={() =>
                              patch(habit.id, {
                                days: habit.days.includes(day)
                                  ? habit.days.filter((d) => d !== day)
                                  : [...habit.days, day].sort(),
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <p className="hint">
                        В чашке {stats.kcal} ккал: белки {stats.protein} г, жиры {stats.fat} г,
                        углеводы {stats.carbs} г. Продукты для {drinkLabel(habit.kind).toLowerCase()}{' '}
                        попадут в список покупок.
                      </p>

                      <button
                        className="btn btn--ghost"
                        onClick={() => setDrinks(drinks.filter((d) => d.id !== habit.id))}
                      >
                        Убрать напиток
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {perDay.kcal > 0 && (
              <p className="hint" style={{ marginBottom: 0 }}>
                Напитки — {perDay.kcal} ккал в день, еде остаётся {Math.max(0, norm.kcal - perDay.kcal)} из{' '}
                {norm.kcal}.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
