import { STORAGE_KEYS, useStore } from '../store'
import { today } from '../lib/day'

/**
 * Сообщение о том, что данные не читаются или не сохраняются.
 *
 * Пока приложение молчало об этом, человек продолжал планировать неделю, ничего
 * не подозревая, — и терял её при закрытии вкладки. Здесь два разных случая,
 * и путать их нельзя: «не прочитали» — данные в браузере целы, записывать
 * поверх них запрещено; «не сохранили» — работа этой сессии никуда не денется
 * сама, о ней надо позаботиться сейчас.
 */
export function StorageNotice() {
  const { storage, reset } = useStore()
  if (!storage.readProblem && !storage.saveProblem) return null

  /*
   * Единственная копия данных — те самые байты, которые не разобрались. Пока
   * запись выключена, они на месте; дать их скачать до того, как человек нажмёт
   * «начать заново», — это всё, что мы можем ему предложить взамен потери.
   */
  const download = () => {
    let raw: string | null = null
    try {
      for (const key of STORAGE_KEYS) raw = raw ?? localStorage.getItem(key)
    } catch {
      raw = null
    }
    const blob = new Blob([raw ?? ''], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `menu-nedelya-${today()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app" style={{ minHeight: 0, paddingBottom: 0, paddingTop: 12 }}>
      <div className="warning">
        {storage.readProblem && (
          <p style={{ margin: 0 }}>
            Не удалось прочитать сохранённые данные: {storage.readProblem}.
            {storage.blocked
              ? ' Они остались в браузере нетронутыми — приложение не станет писать поверх них. Пока можно работать без сохранения.'
              : ''}
          </p>
        )}
        {storage.saveProblem && (
          <p style={{ margin: storage.readProblem ? '8px 0 0' : 0 }}>
            Не сохраняется: {storage.saveProblem}. Всё, что вы измените, пропадёт при закрытии
            вкладки.
          </p>
        )}
        {storage.blocked && (
          <p className="row" style={{ margin: '10px 0 0', gap: 8 }}>
            <button className="btn btn--small btn--soft" onClick={download}>
              Скачать копию
            </button>
            <button
              className="btn btn--small"
              onClick={() => {
                if (confirm('Стереть сохранённые данные и начать заново? Это необратимо.')) reset()
              }}
            >
              Начать заново
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
