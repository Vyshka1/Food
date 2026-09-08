import { STORAGE_KEYS, useStore } from '../store'
import { today } from '../lib/day'

/**
 * Сообщение о том, что данные не читаются, не собираются или не сохраняются.
 *
 * Пока приложение молчало об этом, человек продолжал планировать неделю, ничего
 * не подозревая, — и терял её при закрытии вкладки. Случаи здесь разные, и
 * путать их нельзя: «не прочитали» — данные в браузере целы, запись выключена;
 * «данные новее приложения» — чинить нечего, надо обновиться; «не собралось
 * меню» — потери нет вовсе; «не сохранили» — работа этой сессии не переживёт
 * закрытия вкладки.
 */
export function StorageNotice() {
  const { storage, reset } = useStore()
  if (!storage.readProblem && !storage.saveProblem && !storage.menuProblem) return null

  /*
   * Единственная копия данных — те самые байты, которые не разобрались. Пока
   * запись выключена, они на месте; дать их скачать до того, как человек нажмёт
   * «начать заново», — это всё, что мы можем предложить взамен потери.
   *
   * Выгружаются оба ключа: «начать заново» стирает оба, и под старым может
   * лежать целая запись, сделанная ещё до переименования проекта.
   */
  const download = () => {
    const dump: Record<string, string | null> = {}
    for (const key of STORAGE_KEYS) {
      try {
        dump[key] = localStorage.getItem(key)
      } catch {
        dump[key] = null
      }
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `menu-nedelya-${today()}.json`
    document.body.append(link)
    link.click()
    link.remove()
    // не сразу: часть браузеров отменяет уже начатую загрузку
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="app" style={{ minHeight: 0, paddingBottom: 0, paddingTop: 12 }}>
      <div className="warning">
        {storage.newer ? (
          <p style={{ margin: 0 }}>
            Эти данные сохранены более новой версией приложения. Они целы и не тронуты —
            обновите страницу, чтобы загрузить свежую версию.
          </p>
        ) : (
          storage.readProblem && (
            <p style={{ margin: 0 }}>
              Не удалось прочитать сохранённые данные: {storage.readProblem}.
              {storage.blocked
                ? ' Они остались в браузере нетронутыми — приложение не станет писать поверх них. Пока можно работать без сохранения.'
                : ''}
            </p>
          )
        )}
        {storage.menuProblem && (
          <p style={{ margin: storage.readProblem ? '8px 0 0' : 0 }}>
            {storage.menuProblem}. Данные при этом целы — поправьте анкету, и меню соберётся.
          </p>
        )}
        {storage.saveProblem && (
          <p style={{ margin: storage.readProblem || storage.menuProblem ? '8px 0 0' : 0 }}>
            Не сохраняется: {storage.saveProblem}. Всё, что вы измените, пропадёт при закрытии
            вкладки.
          </p>
        )}
        {storage.blocked && (
          <p className="row" style={{ margin: '10px 0 0', gap: 8 }}>
            <button className="btn btn--small btn--soft" onClick={download}>
              Скачать копию
            </button>
            {/* «Начать заново» на данных от новой версии стёрло бы целую запись */}
            {!storage.newer && (
              <button
                className="btn btn--small"
                onClick={() => {
                  if (confirm('Стереть сохранённые данные и начать заново? Это необратимо.')) {
                    reset()
                  }
                }}
              >
                Начать заново
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
