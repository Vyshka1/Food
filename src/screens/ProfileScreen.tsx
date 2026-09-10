import { useEffect, useRef, useState } from 'react'
import { ALLERGENS } from '../types'
import { WEEKDAYS } from '../lib/menu'
import { GOAL_LABEL, dailyNorm } from '../lib/nutrition'
import { useStore } from '../store'
import { recipeById } from '../data/recipeRegistry'
import { Section } from '../components/ui'
import { Icon, recipeIcon } from '../components/icons'
import { RECIPES } from '../data/recipes'
import { plural } from '../lib/format'
import { AttendanceGrid } from '../components/AttendanceGrid'
import { DrinksEditor } from '../components/DrinksEditor'
import { OilEditor } from '../components/OilEditor'
import { RepeatsEditor } from '../components/RepeatsEditor'
import { ExtrasEditor } from '../components/ExtrasEditor'
import { WeekHistory } from '../components/WeekHistory'
import { KitchenEditor } from '../components/KitchenEditor'
import { ProfileOverview } from '../components/ProfileOverview'
import { TransferCard } from '../components/TransferCard'

export type ProfileTab = 'overview' | 'family' | 'schedule' | 'food' | 'kitchen' | 'data'

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'family', label: 'Семья' },
  { id: 'schedule', label: 'Расписание' },
  { id: 'food', label: 'Питание' },
  { id: 'kitchen', label: 'Кухня' },
  { id: 'data', label: 'Данные' },
]

/**
 * Профиль.
 *
 * Раньше это была одна лента из тринадцати разделов: чтобы дойти до кухни,
 * нужно было проскроллить напитки, повторы и историю недель. Теперь обзор
 * отвечает на вопрос «что сейчас настроено», а правки живут по вкладкам —
 * кроме дней готовки, которые правятся прямо в обзоре, потому что их трогают
 * каждую неделю.
 */
export function ProfileScreen({
  onEdit,
  onRecipes,
}: {
  onEdit: () => void
  onRecipes: () => void
}) {
  const { household, saveHousehold, reset, customRecipes, unbanRecipe, storage } = useStore()
  const [tab, setTab] = useState<ProfileTab>('overview')
  const saved = useSavedFlash()
  if (!household) return null
  const hidden = [...new Set(household.eaters.flatMap((e) => e.bannedRecipes))]

  return (
    <div className="app app--profile">
      <header className="phead">
        <div>
          <div className="screen-title">Профиль</div>
          <div className="screen-sub">Семья, питание и настройки кухни</div>
        </div>
        <div className="phead__right">
          <ProfileStatus saved={saved} problem={storage.saveProblem} blocked={storage.blocked} />
          <button className="btn btn--small" onClick={onEdit}>
            Редактировать анкету
          </button>
        </div>
      </header>

      <nav className="ptabs" aria-label="Разделы профиля">
        {TABS.map((t) => (
          <button key={t.id} data-active={t.id === tab} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <ProfileOverview onOpen={setTab} onRecipes={onRecipes} />
      )}

      {tab === 'family' && (
        <>
          <Section title="Состав семьи" icon="people">
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
            <button className="btn btn--soft btn--small" onClick={onEdit}>
              Редактировать анкету
            </button>
          </Section>

          {hidden.length > 0 && (
            <Section title="Скрытые блюда" icon="ban">
              <div className="stack">
                {hidden.map((id) => (
                  <div className="row row--between" key={id}>
                    <span className="row" style={{ gap: 8 }}>
                      {recipeById(id) && <Icon name={recipeIcon(recipeById(id)!)} size={18} />}
                      {recipeById(id)?.title ?? id}
                    </span>
                    <button className="btn btn--soft btn--small" onClick={() => unbanRecipe(id)}>
                      Вернуть
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'schedule' && (
        <>
          <Section title="Дни готовки" icon="pan">
            <div className="day-toggle">
              {WEEKDAYS.map((label, i) => (
                <button
                  key={label}
                  data-active={household.cookingDays.includes(i)}
                  onClick={() => {
                    const cookingDays = household.cookingDays.includes(i)
                      ? household.cookingDays.filter((d) => d !== i)
                      : [...household.cookingDays, i].sort((a, b) => a - b)
                    if (cookingDays.length === 0) return
                    saveHousehold({ ...household, cookingDays })
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              Меняешь дни — меню и план готовки пересобираются сразу.
            </p>
          </Section>

          <Section title="Кто где ест" icon="clock">
            <AttendanceGrid />
          </Section>

          <Section title="Повторы" icon="repeat">
            <RepeatsEditor />
          </Section>

          <Section title="История недель" icon="history">
            <WeekHistory />
          </Section>
        </>
      )}

      {tab === 'food' && (
        <>
          <Section title="Привычные напитки" icon="cup">
            <DrinksEditor />
          </Section>

          <Section title="Каждый день к столу" icon="salad">
            <ExtrasEditor />
          </Section>

          <Section title="На чём готовим" icon="pan">
            <OilEditor />
          </Section>
        </>
      )}

      {tab === 'kitchen' && (
        <Section title="Кухня" icon="kitchen">
          <KitchenEditor
            kitchen={household.kitchen}
            onChange={(patch) =>
              saveHousehold({ ...household, kitchen: { ...household.kitchen, ...patch } })
            }
          />
        </Section>
      )}

      {tab === 'data' && (
        <>
          <Section title="Мои рецепты" icon="book">
            <div className="row row--between">
              <span className="muted small">
                {customRecipes.length === 0
                  ? `Встроенная коллекция: ${RECIPES.length} блюд`
                  : `Встроенная коллекция и ${customRecipes.length} ${plural(customRecipes.length, ['свой рецепт', 'своих рецепта', 'своих рецептов'])}`}
              </span>
              <button className="btn btn--soft btn--small" onClick={onRecipes}>
                {customRecipes.length === 0 ? 'Добавить свой' : 'Открыть'}
              </button>
            </div>
          </Section>

          <Section title="Перенос на другое устройство" icon="link">
            <TransferCard />
          </Section>

          {/*
            * «Сбросить» живёт только здесь. На общем экране эта кнопка стояла
            * последней в длинной ленте — рядом с настройками, которые нажимают
            * каждую неделю, — а стирает она анкету, кладовую и историю разом.
            */}
          <Section title="Опасная зона" icon="alert">
            <p className="hint" style={{ marginTop: 0 }}>
              Сброс стирает анкету, меню, кладовую и историю недель в этом браузере. Отменить это
              нельзя — если данные нужны, сначала сделайте ссылку переноса.
            </p>
            <button className="btn btn--ghost" onClick={reset}>
              Сбросить анкету и меню
            </button>
          </Section>
        </>
      )}
    </div>
  )
}

/**
 * «Сохранено» вместо кнопки сохранения.
 *
 * Каждая настройка здесь применяется сразу — меню пересобирается тут же, — и
 * кнопка «Сохранить» у каждой мелочи означала бы обещание, которого нет: она
 * ничего не решает. Но и молчать нельзя: человек, переключивший день готовки,
 * должен видеть, что его услышали. Поэтому — короткая отметка на две секунды.
 */
function useSavedFlash(): boolean {
  const { household } = useStore()
  const [on, setOn] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setOn(true)
    const timer = setTimeout(() => setOn(false), 2000)
    return () => clearTimeout(timer)
  }, [household])
  return on
}

function ProfileStatus({
  saved,
  problem,
  blocked,
}: {
  saved: boolean
  problem: string | null
  blocked: boolean
}) {
  // О неудачной записи молчать нельзя: «Сохранено» тогда было бы неправдой
  if (blocked || problem) {
    return (
      <div className="pstatus pstatus--warn">
        <Icon name="alert" size={18} />
        <div>
          <b>Не сохраняется</b>
          <span className="muted small">{problem ?? 'Данные защищены от перезаписи'}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="pstatus" data-flash={saved}>
      <Icon name="check" size={18} />
      <div>
        <b>{saved ? 'Сохранено' : 'Анкета заполнена'}</b>
        <span className="muted small">
          {saved ? 'Меню пересобрано' : 'Все основные настройки сохранены'}
        </span>
      </div>
    </div>
  )
}
