import { useCallback, useEffect, useRef, useState } from 'react'
import type { Recipe } from '../types'
import type { Verdict } from '../lib/tasting'
import { recipeStats } from '../lib/nutrition'
import { dishPhoto } from '../lib/photos'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { formatDuration } from '../lib/cookingPlan'
import { Icon, recipeIcon } from './icons'

/**
 * Стопка карточек: влево — не нравится, вправо — нравится.
 *
 * Пальцем это делается быстрее, чем нажатием, и потому спрашивать можно о
 * двух десятках блюд, а не о трёх. Но свайп — не единственный способ: те же
 * решения доступны кнопками и стрелками на клавиатуре. Жест, без которого
 * нельзя обойтись, отрезает и тех, кто с клавиатуры, и тех, у кого не
 * получается провести точно.
 */

/** Сколько пикселей надо утащить карточку, чтобы это считалось решением. */
const THRESHOLD = 90
/** Насколько карточка наклоняется в руке — чисто чтобы жест читался. */
const TILT = 0.06

function activeMinutes(recipe: Recipe): number {
  return recipe.steps.reduce((sum, s) => sum + s.minutes, 0)
}

/** Из чего блюдо: три главных продукта по весу — этого хватает, чтобы узнать. */
function mainIngredients(recipe: Recipe): string[] {
  return [...recipe.items]
    .filter((item) => {
      const ing = INGREDIENT_BY_ID[item.ingredientId]
      return ing && !ing.staple
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3)
    .map((item) => INGREDIENT_BY_ID[item.ingredientId]!.name.toLowerCase())
}

function Card({ recipe }: { recipe: Recipe }) {
  const stats = recipeStats(recipe)
  const photo = dishPhoto(recipe)
  return (
    <>
      <div className="taste-card__art">
        {photo ? (
          <img src={photo.src} alt={photo.alt} />
        ) : (
          <Icon name={recipeIcon(recipe)} size={72} />
        )}
      </div>
      <div className="taste-card__body">
        <div className="taste-card__title">{recipe.title}</div>
        <div className="muted small">{mainIngredients(recipe).join(' · ')}</div>
        <div className="row" style={{ gap: 14, marginTop: 10 }}>
          <span className="muted small">{stats.kcal} ккал</span>
          <span className="muted small">{formatDuration(activeMinutes(recipe))}</span>
          <span className="muted small">Б{stats.protein} Ж{stats.fat} У{stats.carbs}</span>
        </div>
        {photo && !photo.exact && (
          // чужой снимок под видом вашего блюда — враньё, которое человек
          // заметит на кухне; поэтому подписываем
          <div className="muted small" style={{ marginTop: 6 }}>фото похожего блюда</div>
        )}
      </div>
    </>
  )
}

export function SwipeDeck({
  recipes,
  onVerdict,
  onDone,
}: {
  recipes: Recipe[]
  onVerdict: (recipeId: string, verdict: Verdict) => void
  onDone: () => void
}) {
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState(0)
  /** Куда карточка улетает, пока идёт снимок решения. */
  const [flying, setFlying] = useState<'left' | 'right' | null>(null)
  const start = useRef<number | null>(null)

  const recipe = recipes[index]
  const next = recipes[index + 1]

  const decide = useCallback(
    (verdict: Verdict) => {
      const current = recipes[index]
      if (!current) return
      onVerdict(current.id, verdict)
      if (verdict === 'like' || verdict === 'dislike') {
        setFlying(verdict === 'like' ? 'right' : 'left')
      }
      setDrag(0)
      start.current = null
      // ждём, пока карточка улетит, — иначе следующая появляется рывком
      window.setTimeout(() => {
        setFlying(null)
        setIndex((i) => i + 1)
      }, 180)
    },
    [index, onVerdict, recipes],
  )

  // стрелки на клавиатуре: то же самое без мыши и без пальца
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') decide('dislike')
      else if (event.key === 'ArrowRight') decide('like')
      else if (event.key === 'ArrowDown') decide('skip')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide])

  useEffect(() => {
    if (index >= recipes.length && recipes.length > 0) onDone()
  }, [index, recipes.length, onDone])

  /*
   * Колода кончилась. Показать пустое место значит сказать «что-то сломалось»:
   * человек только что сделал два десятка решений и заслуживает ответа, что
   * они дошли.
   */
  if (!recipe) {
    return (
      <div className="taste">
        <div className="card" style={{ textAlign: 'center', padding: '28px 18px' }}>
          <Icon name="check" size={32} />
          <div style={{ fontSize: 17, fontWeight: 700, margin: '8px 0 4px' }}>
            Готово, спасибо
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Меню соберётся с оглядкой на это. Оценку любого блюда можно поменять потом —
            в его карточке.
          </p>
        </div>
      </div>
    )
  }

  const shift = flying === 'left' ? -600 : flying === 'right' ? 600 : drag
  const verdictHint = drag > THRESHOLD ? 'like' : drag < -THRESHOLD ? 'dislike' : null

  return (
    <div className="taste">
      <div className="taste-stack">
        {next && (
          // следующая карточка видна из-под текущей: так стопка читается
          // стопкой, и видно, что впереди ещё есть
          <div className="taste-card taste-card--behind" aria-hidden="true">
            <Card recipe={next} />
          </div>
        )}
        <div
          className="taste-card"
          style={{
            transform: `translateX(${shift}px) rotate(${shift * TILT}deg)`,
            transition: start.current === null ? 'transform .18s ease-out' : 'none',
          }}
          onPointerDown={(e) => {
            start.current = e.clientX
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (start.current === null) return
            setDrag(e.clientX - start.current)
          }}
          onPointerUp={() => {
            if (start.current === null) return
            const moved = drag
            start.current = null
            if (moved > THRESHOLD) decide('like')
            else if (moved < -THRESHOLD) decide('dislike')
            else setDrag(0)
          }}
          onPointerCancel={() => {
            start.current = null
            setDrag(0)
          }}
        >
          <Card recipe={recipe} />
          {verdictHint && (
            <div className="taste-card__stamp" data-verdict={verdictHint}>
              {verdictHint === 'like' ? 'нравится' : 'не нравится'}
            </div>
          )}
        </div>
      </div>

      <div className="taste-actions">
        <button className="taste-btn" data-kind="dislike" onClick={() => decide('dislike')}>
          <Icon name="close" size={22} /> Не нравится
        </button>
        <button className="taste-btn" data-kind="like" onClick={() => decide('like')}>
          <Icon name="check" size={22} /> Нравится
        </button>
      </div>

      <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 10 }}>
        <button className="btn btn--small btn--soft" onClick={() => decide('skip')}>
          Не знаю
        </button>
        <button className="btn btn--small btn--soft" onClick={() => decide('ban')}>
          Больше не показывать
        </button>
      </div>

      <p className="hint" style={{ textAlign: 'center' }}>
        {index + 1} из {recipes.length} · тяните карточку в сторону или нажимайте кнопки
      </p>
    </div>
  )
}
