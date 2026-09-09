import { useMemo, useState } from 'react'
import type { Recipe, RecipeItem } from '../types'
import { CATEGORY_LABEL, CATEGORY_ORDER, INGREDIENTS, INGREDIENT_BY_ID } from '../data/ingredients'
import { parseRecipeText, resolveLine } from '../lib/recipeText'
import { statsOf } from '../lib/nutrition'
import { householdQty } from '../lib/measures'
import { plural } from '../lib/format'
import { Card, Stepper, TextArea } from './ui'

/**
 * Служба, которая открывает ссылку и отдаёт текст. Задаётся при сборке: пока её
 * нет, поля для ссылки просто не видно — вставка текста от неё не зависит и
 * работает всегда.
 */
const EXTRACT_SERVICE = import.meta.env.VITE_EXTRACT_URL ?? ''
import { Icon } from './icons'

const EXAMPLE = `Сырники из творога
на 4 порции

Ингредиенты:
- 400 г творога
- 2 яйца
- 3 ст. л. муки
- щепотка соли

Приготовление:
Размять творог вилкой, добавить яйца.
Всыпать муку, вымесить тесто.
Обжарить 4 минуты с каждой стороны.`

/** Список продуктов для ручного выбора — тот же, что в редакторе рецепта. */
function IngredientPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">выбрать продукт…</option>
      {CATEGORY_ORDER.filter((c) => INGREDIENTS.some((i) => i.category === c)).map((category) => (
        <optgroup key={category} label={CATEGORY_LABEL[category]}>
          {INGREDIENTS.filter((i) => i.category === category).map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/**
 * Вставить рецепт текстом.
 *
 * Экран устроен вокруг двух вещей, которые легко потерять и дорого не заметить.
 *
 * Число порций: в тексте количества на всё блюдо, а в рецепте — на одну порцию.
 * Ошибиться здесь значит ошибиться в четыре раза во всём: в калориях, в закупке,
 * в размере кастрюли. Поэтому оно стоит наверху и меняется одним нажатием.
 *
 * Нераспознанные строки: продукт с чужим id дальше по коду молча пропускается,
 * и блюдо считается на ноль калорий. Поэтому они не спрятаны в углу, а показаны
 * отдельным блоком, и каждой можно выбрать продукт руками.
 */
export function RecipeImport({
  onReady,
  onCancel,
}: {
  onReady: (recipe: Recipe) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [linkProblem, setLinkProblem] = useState<string | null>(null)
  const [servings, setServings] = useState<number | null>(null)
  /**
   * Что человек выбрал сам для строк, которые разбор не узнал. Ключ — место
   * строки в списке, а не её текст: две одинаковые строки в рецепте не редкость,
   * и по тексту выбор для одной молча применялся к обеим.
   */
  const [fixed, setFixed] = useState<Record<number, string>>({})

  const draft = useMemo(
    () => (text.trim() ? parseRecipeText(text, servings ? { servings } : {}) : null),
    [text, servings],
  )

  const byLink = async () => {
    setLinkProblem(null)
    setLoading(true)
    try {
      const answer = await fetch(`${EXTRACT_SERVICE}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link.trim() }),
      })
      const data = (await answer.json()) as { text?: string; error?: string }
      if (!answer.ok || !data.text) {
        setLinkProblem(data.error ?? 'по этой ссылке не нашлось текста рецепта')
        return
      }
      setText(data.text)
    } catch {
      /*
       * Служба может быть не поднята, а может не иметь действующего
       * сертификата — тогда браузер не отправит запрос вовсе. Различить это
       * снаружи нельзя, поэтому говорим то, что знаем наверняка.
       */
      setLinkProblem('не удалось связаться со службой — вставьте текст руками')
    } finally {
      setLoading(false)
    }
  }

  if (!draft) {
    return (
      <>
        {EXTRACT_SERVICE && (
          <Card>
            <div className="section-title">Ссылка на рецепт</div>
            <div className="row" style={{ gap: 8 }}>
              <input
                style={{ flex: 1 }}
                value={link}
                placeholder="https://…"
                onChange={(e) => setLink(e.target.value)}
              />
              <button className="btn btn--small" disabled={!link.trim() || loading} onClick={byLink}>
                {loading ? 'Читаю…' : 'Взять текст'}
              </button>
            </div>
            {linkProblem && <p className="muted small" style={{ marginBottom: 0 }}>{linkProblem}</p>}
          </Card>
        )}

        <TextArea
          label="Текст рецепта"
          value={text}
          onChange={setText}
          rows={12}
          placeholder={EXAMPLE}
        />
        <p className="hint">
          Подойдёт что угодно: подпись под роликом, сообщение, страница из блога. Продукты и шаги
          разберутся сами — то, что не разберётся, покажем отдельно, а не потеряем.
        </p>
        <button className="btn btn--ghost" onClick={onCancel}>
          Отмена
        </button>
      </>
    )
  }

  // строки, которые человек починил руками, — уже не потеря
  const resolved: RecipeItem[] = draft.unresolved
    .map((line, index) => (fixed[index] ? resolveLine(line, fixed[index]) : null))
    .filter((item): item is RecipeItem => item !== null)

  const stillLost = draft.unresolved
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => !fixed[index] || !resolveLine(line, fixed[index]))

  const items = [...draft.recipe.items]
  for (const item of resolved) {
    const perServing = item.qty / draft.servings
    const found = items.findIndex((i) => i.ingredientId === item.ingredientId)
    if (found >= 0) items[found] = { ...items[found], qty: items[found].qty + perServing }
    else items.push({ ingredientId: item.ingredientId, qty: perServing })
  }

  const stats = statsOf(items)
  const recipe: Recipe = { ...draft.recipe, items }

  return (
    <>
      <TextArea label="Текст рецепта" value={text} onChange={setText} rows={7} />

      <Card>
        <div className="section-title">На сколько порций написан рецепт</div>
        <div className="row row--between">
          <span className="muted small" style={{ flex: 1 }}>
            В рецепте количества хранятся на одного. Если число неверное, ошибка будет во всём:
            в калориях, в закупке и в размере кастрюли.
          </span>
          <Stepper
            value={servings ?? draft.servings}
            min={1}
            max={20}
            onChange={(value) => setServings(value)}
          />
        </div>
      </Card>

      {stillLost.length > 0 && (
        <Card>
          <div className="section-title">Не узнали</div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Эти строки в рецепт не войдут. Если продукт есть в списке — выберите его, и количество
            прочитается из той же строки.
          </p>
          {stillLost.map(({ line, index }) => (
            <div className="field" key={index}>
              <label>{line}</label>
              <IngredientPicker
                value={fixed[index] ?? ''}
                onChange={(id) => setFixed((prev) => ({ ...prev, [index]: id }))}
              />
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="section-title">
          Узнали: {items.length} {plural(items.length, ['продукт', 'продукта', 'продуктов'])} · на
          одну порцию
        </div>
        {items.length === 0 ? (
          <p className="muted small">Пока ни одного — проверьте, что в тексте есть список продуктов.</p>
        ) : (
          items.map((item) => {
            const ing = INGREDIENT_BY_ID[item.ingredientId]
            if (!ing) return null
            const amount = householdQty(ing, item.qty)
            return (
              <div className="ing-line" key={item.ingredientId}>
                <span className="muted">{ing.name}</span>
                <b>
                  {/* тем же языком, что и карточка блюда: «½ луковицы», «по
                      вкусу» — щепотка соли на четверых округлялась в «0 г»,
                      и это читалось как «соли нет» */}
                  {amount.text}
                  {amount.approx ? <span className="muted small"> · {amount.approx}</span> : ''}
                </b>
              </div>
            )
          })
        )}
        {items.length > 0 && (
          <div className="ing-line">
            <span className="muted">Выйдет на порцию</span>
            <b>
              {stats.kcal} ккал · Б{stats.protein} Ж{stats.fat} У{stats.carbs}
            </b>
          </div>
        )}
      </Card>

      <Card>
        <div className="section-title">
          Шаги: {recipe.steps.length} {plural(recipe.steps.length, ['штука', 'штуки', 'штук'])}
        </div>
        {recipe.steps.map((step, index) => (
          <div className="ing-line" key={index}>
            <span className="muted" style={{ flex: 1 }}>
              {step.text || <i>пусто</i>}
            </span>
            <b>{step.minutes} мин</b>
          </div>
        ))}
      </Card>

      {draft.notes.length > 0 && (
        <div className="warning">
          Посчитали приблизительно — проверьте:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {draft.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn btn--ghost" onClick={onCancel}>
          Отмена
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => onReady(recipe)}>
          <span className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <Icon name="check" size={18} />
            Открыть в редакторе
          </span>
        </button>
      </div>

      <p className="hint">
        Дальше можно всё поправить руками: название, приёмы пищи, количества и шаги. Рецепт
        попадёт в подбор только после сохранения.
      </p>
    </>
  )
}
