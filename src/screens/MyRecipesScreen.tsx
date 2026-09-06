import { useMemo, useState } from 'react'
import { CATEGORY_LABEL, CATEGORY_ORDER, INGREDIENTS, INGREDIENT_BY_ID } from '../data/ingredients'
import { MEAL_SLOTS } from '../types'
import type { MealSlot, Recipe, RecipeItem, RecipeStep, Station } from '../types'
import { recipeStats } from '../lib/nutrition'
import { slotTargets } from '../lib/menu'
import { formatQty } from '../lib/shopping'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Card, Chip, Field, Section, Stepper, Switch } from '../components/ui'
import { Icon, recipeIcon } from '../components/icons'

const STATIONS: { id: Station; label: string }[] = [
  { id: 'prep', label: 'Руками' },
  { id: 'stove', label: 'Плита' },
  { id: 'oven', label: 'Духовка' },
  { id: 'wait', label: 'Ждём' },
]

function emptyRecipe(): Recipe {
  return {
    id: `custom-${Math.random().toString(36).slice(2, 9)}`,
    title: '',
    emoji: '🍲',
    slots: ['dinner'],
    items: [],
    steps: [{ text: '', minutes: 10, station: 'prep', handsOn: true }],
    tags: [],
    freezable: false,
    fridgeDays: 3,
    custom: true,
  }
}

/** Пустые шаги и нулевые количества до сохранения не доходят. */
function clean(recipe: Recipe): Recipe {
  return {
    ...recipe,
    title: recipe.title.trim(),
    items: recipe.items.filter((i) => i.ingredientId && i.qty > 0),
    steps: recipe.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ ...s, text: s.text.trim(), minutes: Math.max(1, s.minutes) })),
  }
}

function problems(recipe: Recipe): string[] {
  const list: string[] = []
  const r = clean(recipe)
  if (!r.title) list.push('нужно название')
  if (r.slots.length === 0) list.push('выберите хотя бы один приём пищи')
  if (r.items.length === 0) list.push('добавьте продукты')
  if (r.steps.length === 0) list.push('добавьте хотя бы один шаг')
  return list
}

function Editor({
  initial,
  targets,
  onSave,
  onCancel,
}: {
  initial: Recipe
  targets: Record<string, number>
  onSave: (recipe: Recipe) => void
  onCancel: () => void
}) {
  const [recipe, setRecipe] = useState<Recipe>(initial)
  const patch = (p: Partial<Recipe>) => setRecipe((r) => ({ ...r, ...p }))

  const stats = useMemo(() => recipeStats(clean(recipe)), [recipe])
  const issues = problems(recipe)

  const setItem = (index: number, item: RecipeItem) =>
    patch({ items: recipe.items.map((it, i) => (i === index ? item : it)) })
  const setStep = (index: number, step: RecipeStep) =>
    patch({ steps: recipe.steps.map((s, i) => (i === index ? step : s)) })

  return (
    <>
      <Section title="Блюдо" icon="book">
        <div className="stack">
          <Field
            label="Название"
            type="text"
            value={recipe.title}
            onChange={(v) => patch({ title: v })}
          />
          <div>
            <label className="small muted">Когда подходит</label>
            <div className="chips" style={{ marginTop: 6 }}>
              {MEAL_SLOTS.map((m) => (
                <Chip
                  key={m.id}
                  active={recipe.slots.includes(m.id)}
                  onClick={() =>
                    patch({
                      slots: recipe.slots.includes(m.id)
                        ? recipe.slots.filter((s) => s !== m.id)
                        : [...recipe.slots, m.id as MealSlot],
                    })
                  }
                >
                  <Icon name={m.icon} size={16} /> {m.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Продукты на одну порцию" icon="salad">
        {recipe.items.length === 0 && (
          <p className="hint" style={{ marginTop: 0 }}>
            Пока пусто. Количество указывайте на одного человека — приложение само умножит на
            число едоков и дней.
          </p>
        )}
        <div className="stack">
          {recipe.items.map((item, i) => {
            const ing = INGREDIENT_BY_ID[item.ingredientId]
            return (
              <div className="row" key={i} style={{ gap: 8 }}>
                <div className="field" style={{ flex: 2 }}>
                  <select
                    value={item.ingredientId}
                    onChange={(e) => setItem(i, { ...item, ingredientId: e.target.value })}
                  >
                    <option value="">— продукт —</option>
                    {CATEGORY_ORDER.map((c) => (
                      <optgroup key={c} label={CATEGORY_LABEL[c]}>
                        {INGREDIENTS.filter((x) => x.category === c).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={item.qty}
                    onChange={(e) => setItem(i, { ...item, qty: Number(e.target.value) || 0 })}
                  />
                </div>
                <span className="small muted" style={{ width: 26 }}>
                  {ing ? (ing.unit === 'pcs' ? 'шт' : ing.unit === 'ml' ? 'мл' : 'г') : ''}
                </span>
                <button
                  className="btn btn--ghost btn--small"
                  onClick={() => patch({ items: recipe.items.filter((_, k) => k !== i) })}
                  aria-label="удалить продукт"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            )
          })}
        </div>
        <button
          className="btn btn--soft btn--small"
          style={{ marginTop: 10 }}
          onClick={() => patch({ items: [...recipe.items, { ingredientId: '', qty: 100 }] })}
        >
          + Продукт
        </button>
      </Section>

      <Section title="Шаги" icon="pot">
        <p className="hint" style={{ marginTop: 0 }}>
          Станция и «занимает руки» нужны плану готовки: пока блюдо тушится без вашего участия,
          в это время встанет другое.
        </p>
        <div className="stack">
          {recipe.steps.map((step, i) => (
            <div key={i} className="card card--soft" style={{ marginBottom: 0 }}>
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <span className="step-line__n">{i + 1}</span>
                <div className="field" style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Что делаем"
                    value={step.text}
                    onChange={(e) => setStep(i, { ...step, text: e.target.value })}
                  />
                </div>
                <button
                  className="btn btn--ghost btn--small"
                  onClick={() => patch({ steps: recipe.steps.filter((_, k) => k !== i) })}
                  aria-label="удалить шаг"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Минут</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={step.minutes}
                    onChange={(e) =>
                      setStep(i, { ...step, minutes: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Где</label>
                  <select
                    value={step.station}
                    onChange={(e) =>
                      setStep(i, { ...step, station: e.target.value as Station })
                    }
                  >
                    {STATIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row row--between" style={{ marginTop: 8 }}>
                <span className="small muted">Занимает руки</span>
                <Switch on={step.handsOn} onChange={(handsOn) => setStep(i, { ...step, handsOn })} />
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn btn--soft btn--small"
          style={{ marginTop: 10 }}
          onClick={() =>
            patch({
              steps: [...recipe.steps, { text: '', minutes: 10, station: 'prep', handsOn: true }],
            })
          }
        >
          + Шаг
        </button>
      </Section>

      <Section title="Хранение" icon="snowflake">
        <div className="stack">
          <div className="row row--between">
            <span>Живёт в холодильнике, дней</span>
            <Stepper
              value={recipe.fridgeDays}
              min={1}
              max={7}
              onChange={(fridgeDays) => patch({ fridgeDays })}
            />
          </div>
          <div className="row row--between">
            <span>Можно замораживать</span>
            <Switch on={recipe.freezable} onChange={(freezable) => patch({ freezable })} />
          </div>
          <div className="row row--between">
            <span>Нужна духовка</span>
            <Switch
              on={Boolean(recipe.needs?.includes('oven'))}
              onChange={(on) =>
                patch({
                  needs: on
                    ? [...new Set([...(recipe.needs ?? []), 'oven' as const])]
                    : (recipe.needs ?? []).filter((n) => n !== 'oven'),
                })
              }
            />
          </div>
          <div className="row row--between">
            <span>Нужен блендер</span>
            <Switch
              on={Boolean(recipe.needs?.includes('blender'))}
              onChange={(on) =>
                patch({
                  needs: on
                    ? [...new Set([...(recipe.needs ?? []), 'blender' as const])]
                    : (recipe.needs ?? []).filter((n) => n !== 'blender'),
                })
              }
            />
          </div>
        </div>
      </Section>

      <Card variant="soft">
        {recipe.slots.map((slot) => {
          const target = targets[slot]
          if (!target || stats.kcal === 0) return null
          const ratio = stats.kcal / target
          if (ratio > 0.6 && ratio < 1.7) return null
          const label = MEAL_SLOTS.find((m) => m.id === slot)?.label.toLowerCase() ?? slot
          return (
            <div className="small" style={{ color: 'var(--warn)', marginBottom: 6 }} key={slot}>
              {stats.kcal} ккал — {ratio <= 0.6 ? 'маловато' : 'многовато'} на {label} (цель около{' '}
              {target} ккал). Блюдо будет попадать в меню реже.
            </div>
          )
        })}
        <div className="row row--between small">
          <span className="muted">Порция</span>
          <b>
            {stats.kcal} ккал · Б {stats.protein} · Ж {stats.fat} · У {stats.carbs} ·{' '}
            {stats.price} ₽
          </b>
        </div>
        <div className="row row--between small" style={{ marginTop: 6 }}>
          <span className="muted">Время</span>
          <b>{clean(recipe).steps.reduce((s, x) => s + x.minutes, 0)} мин</b>
        </div>
      </Card>

      {issues.length > 0 && <div className="warning">Чтобы сохранить: {issues.join(', ')}.</div>}

      <div className="row" style={{ gap: 10, marginBottom: 24 }}>
        <button className="btn btn--ghost" onClick={onCancel}>
          Отмена
        </button>
        <button
          className="btn"
          disabled={issues.length > 0}
          style={issues.length > 0 ? { opacity: 0.5 } : undefined}
          onClick={() => issues.length === 0 && onSave(clean(recipe))}
        >
          Сохранить
        </button>
      </div>
    </>
  )
}

export function MyRecipesScreen({ onBack }: { onBack: () => void }) {
  const { customRecipes, saveCustomRecipe, deleteCustomRecipe, household } = useStore()
  const [editing, setEditing] = useState<Recipe | null>(null)
  const targets = useMemo(() => (household ? slotTargets(household) : {}), [household])

  if (editing) {
    return (
      <div className="app">
        <button className="btn btn--ghost btn--small" style={{ marginTop: 16 }} onClick={() => setEditing(null)}>
          <Icon name="back" size={15} /> Назад
        </button>
        <div className="screen-title">{customRecipes.some((r) => r.id === editing.id) ? 'Правка рецепта' : 'Новый рецепт'}</div>
        <div className="screen-sub">Он попадёт в общий подбор наравне со встроенными.</div>
        <Editor
          initial={editing}
          targets={targets}
          onCancel={() => setEditing(null)}
          onSave={(recipe) => {
            saveCustomRecipe(recipe)
            setEditing(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <button className="btn btn--ghost btn--small" style={{ marginTop: 16 }} onClick={onBack}>
        <Icon name="back" size={15} /> Профиль
      </button>
      <div className="screen-title">{customRecipes.length === 0 ? 'Рецепты' : 'Мои рецепты'}</div>
      <div className="screen-sub">
        {customRecipes.length === 0
          ? 'Добавьте то, что готовите сами — приложение начнёт ставить это в меню.'
          : `${customRecipes.length} ${plural(customRecipes.length, ['свой рецепт', 'своих рецепта', 'своих рецептов'])} в подборе.`}
      </div>

      {customRecipes.map((recipe) => {
        const stats = recipeStats(recipe)
        return (
          <div className="dish" key={recipe.id}>
            <span className="dish__emoji">
              <Icon name={recipeIcon(recipe)} size={24} />
            </span>
            <span style={{ flex: 1 }}>
              <span className="dish__title">{recipe.title}</span>
              <span className="dish__meta">
                {stats.kcal} ккал · {recipe.items.length}{' '}
                {plural(recipe.items.length, ['продукт', 'продукта', 'продуктов'])} ·{' '}
                {recipe.steps.reduce((s, x) => s + x.minutes, 0)} мин
              </span>
              <span className="dish__meta">
                {recipe.items
                  .map((i) => INGREDIENT_BY_ID[i.ingredientId]?.name)
                  .filter(Boolean)
                  .slice(0, 4)
                  .join(', ')}
              </span>
            </span>
            <span className="stack" style={{ gap: 6 }}>
              <button className="btn btn--soft btn--small" onClick={() => setEditing(recipe)}>
                Править
              </button>
              <button
                className="btn btn--ghost btn--small"
                onClick={() => deleteCustomRecipe(recipe.id)}
              >
                Удалить
              </button>
            </span>
          </div>
        )
      })}

      <button className="btn" style={{ marginTop: 12 }} onClick={() => setEditing(emptyRecipe())}>
        + Добавить рецепт
      </button>

      <p className="hint">
        Количества указывайте на одну порцию: {formatQty(150, 'g')} курицы на человека, а не на
        всю кастрюлю. Меню пересоберётся сразу после сохранения.
      </p>
    </div>
  )
}
