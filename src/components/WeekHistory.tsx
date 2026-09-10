import { useState } from 'react'
import { recipeById } from '../data/recipeRegistry'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Icon } from './icons'
import { weekLabel } from '../lib/day'


/**
 * История недель. Удачное меню — редкая находка: раньше пересборка стирала
 * его без следа, теперь неделю можно сохранить и повторить.
 */
export function WeekHistory() {
  const { menu, history, archiveWeek, repeatWeek, removeWeek } = useStore()
  const [note, setNote] = useState('')

  const saved = menu ? history.some((r) => r.id === `${menu.weekStart}-${menu.seed}`) : false

  const say = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(''), 4000)
  }

  return (
    <>
      {note && <div className="shop__note">{note}</div>}

      <button
        className="btn btn--soft btn--small"
        disabled={!menu || saved}
        onClick={() => {
          archiveWeek()
          say('Неделя сохранена — её можно будет повторить.')
        }}
      >
        {saved ? 'Эта неделя уже сохранена' : 'Сохранить текущую неделю'}
      </button>

      {history.length === 0 && (
        <p className="hint">
          Пока пусто. Прошлая неделя попадёт сюда сама, когда начнётся новая — вместе с
          отметками «приготовлено» и «съедено».
        </p>
      )}

      <div className="stack" style={{ marginTop: 12 }}>
        {history.map((record) => {
          const dishes = [
            ...new Set(record.menu.entries.map((e) => recipeById(e.recipeId)?.title).filter(Boolean)),
          ]
          return (
            <div className="card card--soft" key={record.id} style={{ marginBottom: 0 }}>
              <div className="row row--between">
                <b>{weekLabel(record.weekStart)}</b>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn btn--soft btn--small"
                    onClick={() => {
                      repeatWeek(record.id)
                      say(`Повторили неделю ${weekLabel(record.weekStart)}.`)
                    }}
                  >
                    <Icon name="repeat" size={14} /> Повторить
                  </button>
                  <button
                    className="btn btn--ghost btn--small"
                    onClick={() => removeWeek(record.id)}
                    aria-label={`удалить неделю ${weekLabel(record.weekStart)}`}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {record.eaten > 0 || record.cooked > 0 || record.skipped > 0
                  ? `съедено ${record.eaten} из ${record.total}` +
                    (record.skipped > 0
                      ? ` · пропущено ${record.skipped}`
                      : '')
                  : `${record.total} ${plural(record.total, ['блюдо', 'блюда', 'блюд'])}, отметок не было`}
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                {dishes.slice(0, 4).join(' · ')}
                {dishes.length > 4 && ` и ещё ${dishes.length - 4}`}
              </div>
            </div>
          )
        })}
      </div>

      {history.length > 0 && (
        <p className="hint" style={{ marginBottom: 0 }}>
          «Повторить» переносит блюда на текущую неделю и пересчитывает порции — состав
          семьи и дни готовки могли измениться.
        </p>
      )}
    </>
  )
}
