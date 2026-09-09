import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Onboarding } from './screens/Onboarding'
import { MenuScreen } from './screens/MenuScreen'
import { PlanScreen } from './screens/PlanScreen'
import { ProductsScreen } from './screens/ProductsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { MyRecipesScreen } from './screens/MyRecipesScreen'
import { ShoppingModeScreen } from './screens/ShoppingModeScreen'
import { CookNowScreen } from './screens/CookNowScreen'
import { Icon, type IconName } from './components/icons'
import { StorageNotice } from './components/StorageNotice'
import type { CookingPlan } from './types'

type Tab = 'menu' | 'plan' | 'products' | 'profile' | 'recipes'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'menu', label: 'Меню', icon: 'menu' },
  { id: 'plan', label: 'Готовка', icon: 'pot' },
  { id: 'products', label: 'Продукты', icon: 'cart' },
  { id: 'profile', label: 'Профиль', icon: 'user' },
]

function Shell() {
  const { household, menu, saveHousehold, importProfile } = useStore()
  const [imported, setImported] = useState<'ok' | 'fail' | null>(null)

  // Ссылка вида …#data=… переносит анкету с другого устройства
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#data=')) return
    const ok = importProfile(hash)
    setImported(ok ? 'ok' : 'fail')
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [importProfile])
  const [tab, setTab] = useState<Tab>('menu')
  const [editing, setEditing] = useState(false)
  const [shopping, setShopping] = useState(false)
  /**
   * Готовка живёт здесь, а не внутри PlanScreen: иначе случайный тап по
   * вкладке размонтирует экран и унесёт с собой таймеры и отметки посреди
   * готовки.
   */
  const [cooking, setCooking] = useState<{ plan: CookingPlan; cookNames: string[] } | null>(null)

  if (!household || !menu || editing) {
    return (
      <>
        <StorageNotice />
        <Onboarding
          initial={editing ? household : null}
          onCancel={editing ? () => setEditing(false) : undefined}
          onDone={(next) => {
            saveHousehold(next)
            setEditing(false)
            setTab('menu')
          }}
        />
      </>
    )
  }

  if (shopping) return <ShoppingModeScreen onExit={() => setShopping(false)} />
  if (cooking)
    return (
      <CookNowScreen
        plan={cooking.plan}
        cookNames={cooking.cookNames}
        onExit={() => setCooking(null)}
      />
    )

  return (
    <>
      <StorageNotice />
      {imported && (
        <div className="app" style={{ minHeight: 0, paddingBottom: 0, paddingTop: 12 }}>
          <div className={imported === 'ok' ? 'shop__note' : 'warning'}>
            {imported === 'ok'
              ? 'Данные из ссылки загружены — меню собрано заново.'
              : 'Не удалось прочитать данные из ссылки.'}
            <button
              className="btn btn--small btn--soft"
              style={{ marginLeft: 10 }}
              onClick={() => setImported(null)}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
      {tab === 'menu' && <MenuScreen />}
      {tab === 'plan' && (
        <PlanScreen onCookNow={(plan, cookNames) => setCooking({ plan, cookNames })} />
      )}
      {tab === 'products' && <ProductsScreen onShoppingMode={() => setShopping(true)} />}
      {tab === 'profile' && (
        <ProfileScreen onEdit={() => setEditing(true)} onRecipes={() => setTab('recipes')} />
      )}
      {tab === 'recipes' && <MyRecipesScreen onBack={() => setTab('profile')} />}

      {/*
        * Две навигации, а не одна на все случаи. Внизу целятся пальцем, и там
        * она уместна; на мониторе та же панель отнимала бы низ экрана и
        * заставляла вести курсор вниз, хотя слева места сколько угодно.
        * Показывается ровно одна — какая, решает ширина, а не устройство:
        * телефон боком и планшет стоймя ведут себя как им удобнее.
        */}
      <nav className="sidenav">
        <div className="sidenav__brand">
          <Icon name="leaf" size={22} />
          Домашнее меню
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            data-active={tab === t.id || (tab === 'recipes' && t.id === 'profile')}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={20} />
            {t.label}
          </button>
        ))}
      </nav>

      <nav className="tabbar">
        <div className="tabbar__inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              data-active={tab === t.id || (tab === 'recipes' && t.id === 'profile')}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={22} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
