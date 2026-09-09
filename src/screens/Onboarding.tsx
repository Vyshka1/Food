import { useMemo, useState } from 'react'
import { ALLERGENS, DISLIKES, MEAL_SLOTS } from '../types'
import type { Activity, Allergen, Eater, Goal, Household, MealSlot, Sex } from '../types'
import { ACTIVITY_LABEL, GOAL_LABEL, dailyNorm } from '../lib/nutrition'
import { WEEKDAYS, householdNorms } from '../lib/menu'
import { defaultHousehold, newEater } from '../store'
import { CalorieRing, Card, Chip, Field, Section, Segmented } from '../components/ui'
import { Icon } from '../components/icons'
import { KitchenEditor } from '../components/KitchenEditor'
import { SwipeDeck } from '../components/SwipeDeck'
import { applyTastes, tastingDeck } from '../lib/tasting'
import type { TasteResult } from '../lib/tasting'
import { MACRO_COLOR } from '../lib/palette'

const STEPS = ['Состав семьи', 'Аллергии и вкусы', 'Что нравится', 'Режим питания', 'Кухня', 'Готово']

interface Props {
  initial?: Household | null
  onDone: (household: Household) => void
  onCancel?: () => void
}

export function Onboarding({ initial, onDone, onCancel }: Props) {
  const [household, setHousehold] = useState<Household>(initial ?? defaultHousehold())
  const [step, setStep] = useState(0)
  const [activeEaterId, setActiveEaterId] = useState(household.eaters[0]?.id ?? '')
  const [customAllergen, setCustomAllergen] = useState('')
  const [customDislike, setCustomDislike] = useState('')
  /** Зерно колоды: одно на всю анкету, чтобы карточки не перетасовывались. */
  const [deckSeed] = useState(() => Math.floor(Math.random() * 1e9))
  /** Сколько карточек человек уже разобрал — для подписи и кнопки «дальше». */
  const [tasted, setTasted] = useState(0)

  const activeEater = household.eaters.find((e) => e.id === activeEaterId) ?? household.eaters[0]

  const patchEater = (id: string, patch: Partial<Eater>) =>
    setHousehold((h) => ({
      ...h,
      eaters: h.eaters.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const addEater = () => {
    const eater = newEater({ name: `Едок ${household.eaters.length + 1}` })
    setHousehold((h) => ({ ...h, eaters: [...h.eaters, eater] }))
    setActiveEaterId(eater.id)
  }

  const removeEater = (id: string) => {
    setHousehold((h) => ({ ...h, eaters: h.eaters.filter((e) => e.id !== id) }))
    setActiveEaterId((cur) =>
      cur === id ? (household.eaters.find((e) => e.id !== id)?.id ?? '') : cur,
    )
  }

  const canNext =
    step !== 3 || (household.meals.length > 0 && household.cookingDays.length > 0)

  /*
   * Колода собирается один раз на едока и на состав анкеты: пересобирать её на
   * каждый свайп значит тасовать карточки под рукой у человека.
   */
  const deck = useMemo(
    () => (activeEater ? tastingDeck(household, { eaterId: activeEater.id, seed: deckSeed }) : []),
    // намеренно не следим за household целиком: колода не должна меняться от
    // собственных оценок, которые мы же в неё и записываем
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEater?.id, deckSeed],
  )

  const rateOne = (recipeId: string, verdict: TasteResult['verdict']) => {
    if (!activeEater) return
    setTasted((n) => n + 1)
    if (verdict === 'skip') return
    setHousehold((h) => applyTastes(h, activeEater.id, [{ recipeId, verdict }]))
  }

  return (
    <div className="app">
      <div className="wizard-progress">
        {STEPS.map((_, i) => (
          <i key={i} data-done={i <= step} />
        ))}
      </div>
      <div className="screen-title">{STEPS[step]}</div>
      <div className="screen-sub">
        Шаг {step + 1} из {STEPS.length}
      </div>

      {step === 0 && (
        <>
          <div className="eater-tabs">
            {household.eaters.map((e) => (
              <button
                key={e.id}
                className="eater-tab"
                data-active={e.id === activeEater?.id}
                onClick={() => setActiveEaterId(e.id)}
              >
                {e.name}
              </button>
            ))}
            <button className="eater-tab" onClick={addEater}>
              + Добавить
            </button>
          </div>

          {activeEater && (
            <Card>
              <div className="stack">
                <Field
                  label="Имя"
                  type="text"
                  value={activeEater.name}
                  onChange={(v) => patchEater(activeEater.id, { name: v })}
                />
                <Segmented<Sex>
                  value={activeEater.sex}
                  onChange={(sex) => patchEater(activeEater.id, { sex })}
                  options={[
                    { value: 'female', label: 'Женщина' },
                    { value: 'male', label: 'Мужчина' },
                  ]}
                />
                <div className="row">
                  <Field
                    label="Возраст"
                    value={activeEater.age}
                    onChange={(v) => patchEater(activeEater.id, { age: Number(v) || 0 })}
                  />
                  <Field
                    label="Рост"
                    suffix="см"
                    value={activeEater.heightCm}
                    onChange={(v) => patchEater(activeEater.id, { heightCm: Number(v) || 0 })}
                  />
                  <Field
                    label="Вес"
                    suffix="кг"
                    value={activeEater.weightKg}
                    onChange={(v) => patchEater(activeEater.id, { weightKg: Number(v) || 0 })}
                  />
                </div>
                <div className="field">
                  <label>Активность</label>
                  <select
                    value={activeEater.activity}
                    onChange={(e) =>
                      patchEater(activeEater.id, { activity: e.target.value as Activity })
                    }
                  >
                    {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => (
                      <option key={a} value={a}>
                        {ACTIVITY_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Цель</label>
                  <Segmented<Goal>
                    value={activeEater.goal}
                    onChange={(goal) => patchEater(activeEater.id, { goal })}
                    options={(Object.keys(GOAL_LABEL) as Goal[]).map((g) => ({
                      value: g,
                      label: GOAL_LABEL[g],
                    }))}
                  />
                </div>
                <div className="row row--between">
                  <span className="hint">
                    Норма: <b>{dailyNorm(activeEater).kcal} ккал</b> в день
                  </span>
                  {household.eaters.length > 1 && (
                    <button
                      className="btn btn--ghost btn--small"
                      onClick={() => removeEater(activeEater.id)}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {step === 1 && activeEater && (
        <>
          <div className="eater-tabs">
            {household.eaters.map((e) => (
              <button
                key={e.id}
                className="eater-tab"
                data-active={e.id === activeEater.id}
                onClick={() => setActiveEaterId(e.id)}
              >
                {e.name}
              </button>
            ))}
          </div>

          <Section title="Аллергии" icon="salad">
            <div className="chips">
              {ALLERGENS.map((a) => (
                <Chip
                  key={a.id}
                  active={activeEater.allergies.includes(a.id)}
                  onClick={() =>
                    patchEater(activeEater.id, {
                      allergies: toggleIn<Allergen>(activeEater.allergies, a.id),
                    })
                  }
                >
                  {a.label}
                </Chip>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field">
                <input
                  placeholder="Добавить свой аллерген…"
                  value={customAllergen}
                  onChange={(e) => setCustomAllergen(e.target.value)}
                />
              </div>
              <button
                className="btn btn--soft btn--small"
                onClick={() => {
                  const value = customAllergen.trim()
                  if (!value) return
                  patchEater(activeEater.id, {
                    customAllergens: [...activeEater.customAllergens, value],
                  })
                  setCustomAllergen('')
                }}
              >
                +
              </button>
            </div>
            {activeEater.customAllergens.length > 0 && (
              <div className="chips" style={{ marginTop: 10 }}>
                {activeEater.customAllergens.map((c) => (
                  <Chip
                    key={c}
                    active
                    onClick={() =>
                      patchEater(activeEater.id, {
                        customAllergens: activeEater.customAllergens.filter((x) => x !== c),
                      })
                    }
                  >
                    {c} <Icon name="close" size={13} />
                  </Chip>
                ))}
              </div>
            )}
          </Section>

          <Section title="Не люблю" icon="ban">
            <div className="chips">
              {DISLIKES.map((d) => (
                <Chip
                  key={d.id}
                  active={activeEater.dislikes.includes(d.id)}
                  onClick={() =>
                    patchEater(activeEater.id, { dislikes: toggleIn(activeEater.dislikes, d.id) })
                  }
                >
                  {d.label}
                </Chip>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field">
                <input
                  placeholder="Добавить продукт…"
                  value={customDislike}
                  onChange={(e) => setCustomDislike(e.target.value)}
                />
              </div>
              <button
                className="btn btn--soft btn--small"
                onClick={() => {
                  const value = customDislike.trim()
                  if (!value) return
                  patchEater(activeEater.id, { dislikes: [...activeEater.dislikes, value] })
                  setCustomDislike('')
                }}
              >
                +
              </button>
            </div>
            {activeEater.dislikes.filter((d) => !DISLIKES.some((x) => x.id === d)).length > 0 && (
              <div className="chips" style={{ marginTop: 10 }}>
                {activeEater.dislikes
                  .filter((d) => !DISLIKES.some((x) => x.id === d))
                  .map((d) => (
                    <Chip
                      key={d}
                      active
                      onClick={() =>
                        patchEater(activeEater.id, {
                          dislikes: activeEater.dislikes.filter((x) => x !== d),
                        })
                      }
                    >
                      {d} <Icon name="close" size={13} />
                    </Chip>
                  ))}
              </div>
            )}
            <p className="hint" style={{ marginBottom: 0 }}>
              Меню учитывает аллергии и «не люблю» всех едоков. Аллергии исключаем строго.
            </p>
          </Section>
        </>
      )}

      {step === 2 && activeEater && (
        <>
          <div className="screen-sub" style={{ marginTop: -4 }}>
            {household.eaters.length > 1 ? `Вкусы: ${activeEater.name}. ` : ''}
            Пролистайте блюда — меню соберётся под то, что нравится. Можно пропустить
            и оценивать потом, из карточек блюд.
            {tasted > 0 && ` Разобрано: ${tasted}.`}
          </div>

          {household.eaters.length > 1 && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {household.eaters.map((eater) => (
                <Chip
                  key={eater.id}
                  active={eater.id === activeEaterId}
                  onClick={() => {
                    setActiveEaterId(eater.id)
                    setTasted(0)
                  }}
                >
                  {eater.name}
                </Chip>
              ))}
            </div>
          )}

          {deck.length === 0 ? (
            <Card>
              <p className="muted" style={{ margin: 0 }}>
                Все блюда уже оценены — здесь больше нечего спрашивать.
              </p>
            </Card>
          ) : (
            <SwipeDeck
              key={`${activeEater.id}-${deckSeed}`}
              recipes={deck}
              onVerdict={rateOne}
              onDone={() => undefined}
            />
          )}
        </>
      )}

      {step === 3 && (
        <>
          <Section title="Приёмы пищи" icon="menu">
            <div className="chips">
              {MEAL_SLOTS.map((m) => (
                <Chip
                  key={m.id}
                  active={household.meals.includes(m.id)}
                  onClick={() =>
                    setHousehold((h) => ({ ...h, meals: toggleIn<MealSlot>(h.meals, m.id) }))
                  }
                >
                  <Icon name={m.icon} size={16} /> {m.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Дни готовки" icon="pan">
            <p className="hint" style={{ marginTop: 0 }}>
              Отметь дни, когда готовится еда на неделю. Остальные дни закроем заготовками, а что не
              доживёт в холодильнике — отправим в заморозку.
            </p>
            <div className="day-toggle">
              {WEEKDAYS.map((label, i) => (
                <button
                  key={label}
                  data-active={household.cookingDays.includes(i)}
                  onClick={() =>
                    setHousehold((h) => ({
                      ...h,
                      cookingDays: toggleIn(h.cookingDays, i).sort((a, b) => a - b),
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Бюджет на неделю" icon="cart">
            <Field
              label="₽ на всю семью (0 — без ограничений)"
              value={household.budgetPerWeek}
              onChange={(v) => setHousehold((h) => ({ ...h, budgetPerWeek: Number(v) || 0 }))}
            />
          </Section>
        </>
      )}

      {step === 4 && (
        <Section title="Что на кухне" icon="kitchen">
          <p className="hint" style={{ marginTop: 0 }}>
            От этого зависит план готовки: приборы — это ресурс расписания, и от них зависит,
            что можно вести параллельно, а что придётся ставить подряд.
          </p>
          <KitchenEditor
            kitchen={household.kitchen}
            onChange={(patch) =>
              setHousehold((h) => ({ ...h, kitchen: { ...h.kitchen, ...patch } }))
            }
          />
        </Section>
      )}

      {step === 5 && (
        <>
          <Card>
            <div className="row row--between" style={{ marginBottom: 10 }}>
              <b>Суточная норма семьи</b>
            </div>
            <div className="ring-row">
              <CalorieRing {...householdNorms(household)} />
              <div style={{ flex: 1 }}>
                <div className="macro">
                  <span>
                    <i className="dot" style={{ background: MACRO_COLOR.protein }} />
                    Белки
                  </span>
                  <b>{householdNorms(household).protein} г</b>
                </div>
                <div className="macro">
                  <span>
                    <i className="dot" style={{ background: MACRO_COLOR.fat }} />
                    Жиры
                  </span>
                  <b>{householdNorms(household).fat} г</b>
                </div>
                <div className="macro">
                  <span>
                    <i className="dot" style={{ background: MACRO_COLOR.carbs }} />
                    Углеводы
                  </span>
                  <b>{householdNorms(household).carbs} г</b>
                </div>
              </div>
            </div>
          </Card>

          <Section title="Проверь себя" icon="check">
            <div className="stack small">
              <div className="row row--between">
                <span className="muted">Едоков</span>
                <b>{household.eaters.length}</b>
              </div>
              <div className="row row--between">
                <span className="muted">Приёмов пищи в день</span>
                <b>{household.meals.length}</b>
              </div>
              <div className="row row--between">
                <span className="muted">Дни готовки</span>
                <b>{household.cookingDays.map((d) => WEEKDAYS[d]).join(', ') || '—'}</b>
              </div>
              <div className="row row--between">
                <span className="muted">Аллергии</span>
                <b>
                  {household.eaters.flatMap((e) => [...e.allergies, ...e.customAllergens]).length ||
                    'нет'}
                </b>
              </div>
            </div>
          </Section>
          <p className="hint">
            Дальше соберём меню на неделю, список продуктов и пошаговый план готовки на выбранные
            дни.
          </p>
        </>
      )}

      <div className="wizard-footer">
        {step > 0 ? (
          <button className="btn btn--ghost" onClick={() => setStep((s) => s - 1)}>
            Назад
          </button>
        ) : onCancel ? (
          <button className="btn btn--ghost" onClick={onCancel}>
            Отмена
          </button>
        ) : null}
        <button
          className="btn"
          disabled={!canNext}
          style={canNext ? undefined : { opacity: 0.5 }}
          onClick={() => {
            if (!canNext) return
            if (step === STEPS.length - 1) onDone(household)
            else setStep((s) => s + 1)
          }}
        >
          {step === STEPS.length - 1 ? 'Собрать меню' : `Далее · ${step + 1}/${STEPS.length}`}
        </button>
      </div>
    </div>
  )
}
