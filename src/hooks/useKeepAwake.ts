import { useEffect } from 'react'

/**
 * Не давать экрану гаснуть. Нужен и в магазине, и у плиты: в обоих случаях
 * руки заняты, а экран нужен постоянно. Где API нет — просто работаем как
 * обычно, без ошибок и без предупреждений.
 */
export function useKeepAwake(active = true): void {
  useEffect(() => {
    if (!active) return
    let sentinel: { release: () => Promise<void> } | null = null
    let cancelled = false
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    const acquire = () => {
      nav.wakeLock
        ?.request('screen')
        .then((lock) => {
          if (cancelled) void lock.release()
          else sentinel = lock
        })
        .catch(() => {
          // отказ в блокировке экрана — не повод ломать экран
        })
    }
    acquire()
    // Возврат из фона снимает блокировку — берём её заново
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
