import { useEffect, useState } from 'react'
import type { Reminder } from '../lib/reminders'

/**
 * Системные уведомления.
 *
 * Честная граница: без сервера уведомление можно показать только пока
 * приложение открыто хотя бы в фоновой вкладке. Обещать «напомним утром,
 * даже если приложение закрыто» нельзя — это неправда, и человек об этом
 * узнает ровно в тот момент, когда напоминание не придёт.
 *
 * Поэтому уведомления здесь — дубль карточки «Сегодня» на экране, а не
 * замена ей: список дел виден всегда, уведомление приходит, если повезло.
 */

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied'

import { today as todayIso } from '../lib/day'

const SEEN_KEY = 'food.reminders.seen'

function seenToday(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as {
      date?: string
      ids?: string[]
    }
    const today = todayIso()
    return raw.date === today ? new Set(raw.ids ?? []) : new Set()
  } catch {
    return new Set()
  }
}

function remember(ids: Set<string>): void {
  try {
    localStorage.setItem(
      SEEN_KEY,
      JSON.stringify({ date: todayIso(), ids: [...ids] }),
    )
  } catch {
    // приватный режим — переживём без памяти о показанном
  }
}

export function useReminders(reminders: Reminder[], enabled: boolean): {
  state: NotifyState
  ask: () => Promise<void>
} {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [state, setState] = useState<NotifyState>(
    supported ? (Notification.permission as NotifyState) : 'unsupported',
  )

  useEffect(() => {
    if (!enabled || !supported || state !== 'granted') return
    const shown = seenToday()
    const hour = new Date().getHours()
    let cancelled = false

    const show = (reminder: Reminder) => {
      if (cancelled || shown.has(reminder.id)) return
      shown.add(reminder.id)
      remember(shown)
      try {
        new Notification(reminder.title, { body: reminder.text, tag: reminder.id })
      } catch {
        // на iOS уведомления вне установленного приложения запрещены
      }
    }

    const timers: number[] = []
    for (const reminder of reminders) {
      if (hour >= reminder.hour) {
        show(reminder)
        continue
      }
      // ждём своего часа, пока вкладка открыта
      const delay = (reminder.hour - hour) * 3600_000
      timers.push(window.setTimeout(() => show(reminder), delay))
    }
    return () => {
      cancelled = true
      for (const t of timers) window.clearTimeout(t)
    }
  }, [reminders, enabled, state, supported])

  return {
    state,
    ask: async () => {
      if (!supported) return
      const result = await Notification.requestPermission()
      setState(result as NotifyState)
    },
  }
}
