import { useState } from 'react'
import { useStore } from '../store'
import { profileLink } from '../lib/transfer'
import { Icon } from './icons'

/**
 * Перенос данных на другое устройство.
 *
 * Вынесено из экрана профиля отдельным компонентом: то же самое показывается
 * дважды — карточкой в обзоре и целиком во вкладке «Данные», — а состояние у
 * него своё (вставленная ссылка, ответ на копирование). Две копии этой логики
 * разошлись бы в первый же день.
 */
export function TransferCard({ compact }: { compact?: boolean }) {
  const { household, customRecipes, importProfile } = useStore()
  const [note, setNote] = useState('')
  const [pasted, setPasted] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  if (!household) return null

  const say = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(''), 4000)
  }

  const share = async () => {
    const link = profileLink(
      { household, customRecipes },
      window.location.origin + window.location.pathname,
    )
    const nav = navigator as Navigator & { share?: (d: { url: string }) => Promise<void> }
    try {
      if (nav.share) await nav.share({ url: link })
      else {
        await navigator.clipboard.writeText(link)
        say('Ссылка скопирована')
      }
    } catch {
      say('Не удалось скопировать ссылку')
    }
  }

  return (
    <>
      {compact ? (
        <p className="hint" style={{ marginTop: 0 }}>
          Здесь ваша анкета и рецепты. Откройте ссылку на другом устройстве, и всё перенесётся.
        </p>
      ) : (
        <p className="hint" style={{ marginTop: 0 }}>
          Данные хранятся только в этом браузере. Ссылка ниже содержит анкету и свои рецепты —
          откройте её на другом устройстве, и всё перенесётся. В ней ваш вес, рост и аллергии,
          поэтому не публикуйте её.
        </p>
      )}

      {compact && (
        <div className="transfer-hop" aria-hidden="true">
          <Icon name="phone" size={26} />
          <span className="transfer-hop__dots" />
          <Icon name="link" size={18} />
          <span className="transfer-hop__dots" />
          <Icon name="laptop" size={30} />
        </div>
      )}

      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--soft btn--small" onClick={share}>
          {compact ? 'Создать ссылку' : 'Ссылка с данными'}
        </button>
        {!compact && (
          <button className="btn btn--ghost btn--small" onClick={() => setShowPaste((v) => !v)}>
            Вставить ссылку
          </button>
        )}
      </div>

      {note && (
        <p className="small" style={{ color: 'var(--green-dark)' }}>
          {note}
        </p>
      )}

      {showPaste && (
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="field">
            <input
              type="text"
              placeholder="Вставьте сюда ссылку или код"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
          </div>
          <button
            className="btn btn--small btn--soft"
            onClick={() => {
              const ok = importProfile(pasted)
              say(ok ? 'Данные загружены' : 'Ссылка не распознана')
              if (ok) {
                setPasted('')
                setShowPaste(false)
              }
            }}
          >
            Загрузить
          </button>
        </div>
      )}
    </>
  )
}
