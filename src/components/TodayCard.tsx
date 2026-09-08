import { useMemo } from 'react'
import { remindersFor } from '../lib/reminders'
import { useReminders } from '../hooks/useReminders'
import { useStore } from '../store'
import { Card } from './ui'
import { Icon } from './icons'
import { today as todayIso } from '../lib/day'

const ICON = {
  thaw: 'snowflake',
  container: 'cart',
  cooking: 'pan',
  expiring: 'alert',
} as const

/**
 * Что сделать сегодня.
 *
 * После появления морозилки это перестало быть украшением: блюдо само себя
 * из морозилки в холодильник не переложит, а узнать про «достать за 12 часов»
 * постфактум бесполезно.
 *
 * Карточка видна всегда — она и есть основной способ доставки. Системные
 * уведомления к ней прилагаются, но без сервера они приходят только пока
 * приложение открыто, и обещать больше нечестно.
 */
export function TodayCard({ day }: { day: number }) {
  const { household, menu, pantry, notifications, setNotifications } = useStore()
  const today = todayIso()
  const reminders = useMemo(
    () => (household ? remindersFor(household, menu, pantry, day, today) : []),
    [household, menu, pantry, day, today],
  )
  const { state, ask } = useReminders(reminders, notifications)

  if (!household || reminders.length === 0) return null

  return (
    <Card>
      <div className="section-title">Сегодня</div>
      {reminders.map((r) => (
        <div className="today-row" key={r.id}>
          <Icon name={ICON[r.kind]} size={17} />
          <span>
            <b>{r.title}</b>
            <span className="muted small">{r.text}</span>
          </span>
        </div>
      ))}

      {state === 'granted' && (
        <label className="today-toggle">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
          />
          Показывать уведомлениями, пока приложение открыто
        </label>
      )}
      {state === 'default' && (
        <button className="chip" style={{ marginTop: 10 }} onClick={ask}>
          Присылать уведомления
        </button>
      )}
      {state === 'denied' && (
        <p className="hint" style={{ marginBottom: 0 }}>
          Уведомления запрещены в настройках браузера — список дел остаётся здесь.
        </p>
      )}
    </Card>
  )
}
