import { ALLERGENS } from '../types'
import { WEEKDAYS, householdNorms } from '../lib/menu'
import { GOAL_LABEL, dailyNorm } from '../lib/nutrition'
import { useStore } from '../store'
import { CalorieRing, Card, Section } from '../components/ui'

export function ProfileScreen({ onEdit }: { onEdit: () => void }) {
  const { household, saveHousehold, reset } = useStore()
  if (!household) return null
  const norms = householdNorms(household)

  const toggleCookingDay = (day: number) => {
    const cookingDays = household.cookingDays.includes(day)
      ? household.cookingDays.filter((d) => d !== day)
      : [...household.cookingDays, day].sort((a, b) => a - b)
    if (cookingDays.length === 0) return
    saveHousehold({ ...household, cookingDays })
  }

  return (
    <div className="app">
      <div className="screen-title">Профиль</div>
      <div className="screen-sub">Анкета, нормы и расписание готовки.</div>

      <Card>
        <div className="row row--between" style={{ marginBottom: 10 }}>
          <b>Суточная норма семьи</b>
          <button className="btn btn--soft btn--small" onClick={onEdit}>
            Изменить
          </button>
        </div>
        <div className="ring-row">
          <CalorieRing {...norms} />
          <div style={{ flex: 1 }}>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: '#8ec06c' }} />
                Белки
              </span>
              <b>{norms.protein} г</b>
            </div>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: '#e0b352' }} />
                Жиры
              </span>
              <b>{norms.fat} г</b>
            </div>
            <div className="macro">
              <span>
                <i className="dot" style={{ background: '#3f7233' }} />
                Углеводы
              </span>
              <b>{norms.carbs} г</b>
            </div>
          </div>
        </div>
      </Card>

      <Section title="Дни готовки" icon="🍳">
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
        <p className="hint" style={{ marginBottom: 0 }}>
          Меняешь дни — меню и план готовки пересобираются сразу.
        </p>
      </Section>

      <Section title="Кто ест дома" icon="👥">
        <div className="stack">
          {household.eaters.map((e) => {
            const norm = dailyNorm(e)
            const allergies = [
              ...e.allergies.map((a) => ALLERGENS.find((x) => x.id === a)?.label ?? a),
              ...e.customAllergens,
            ]
            return (
              <div className="row" key={e.id} style={{ gap: 12 }}>
                <div className="avatar">{e.name.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <b>{e.name}</b>
                  <div className="muted small">
                    {norm.kcal} ккал · {GOAL_LABEL[e.goal].toLowerCase()}
                  </div>
                  {allergies.length > 0 && (
                    <div className="small" style={{ color: 'var(--warn)' }}>
                      аллергии: {allergies.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Кухня" icon="🍲">
        <div className="stack small">
          <div className="row row--between">
            <span className="muted">Конфорки</span>
            <b>{household.kitchen.burners}</b>
          </div>
          <div className="row row--between">
            <span className="muted">Духовка</span>
            <b>{household.kitchen.hasOven ? 'есть' : 'нет'}</b>
          </div>
          <div className="row row--between">
            <span className="muted">Морозилка</span>
            <b>{household.kitchen.hasFreezer ? 'есть' : 'нет'}</b>
          </div>
          <div className="row row--between">
            <span className="muted">Контейнеры</span>
            <b>{household.kitchen.containers}</b>
          </div>
        </div>
      </Section>

      <button className="btn btn--ghost" onClick={reset}>
        Сбросить анкету и меню
      </button>
    </div>
  )
}
