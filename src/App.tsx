import { useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Onboarding } from './screens/Onboarding'
import { MenuScreen } from './screens/MenuScreen'
import { PlanScreen } from './screens/PlanScreen'
import { ProductsScreen } from './screens/ProductsScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { MyRecipesScreen } from './screens/MyRecipesScreen'

type Tab = 'menu' | 'plan' | 'products' | 'profile' | 'recipes'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'menu', label: 'Меню', icon: '🍴' },
  { id: 'plan', label: 'Готовка', icon: '👨‍🍳' },
  { id: 'products', label: 'Продукты', icon: '🛒' },
  { id: 'profile', label: 'Профиль', icon: '👤' },
]

function Shell() {
  const { household, menu, saveHousehold } = useStore()
  const [tab, setTab] = useState<Tab>('menu')
  const [editing, setEditing] = useState(false)

  if (!household || !menu || editing) {
    return (
      <Onboarding
        initial={editing ? household : null}
        onCancel={editing ? () => setEditing(false) : undefined}
        onDone={(next) => {
          saveHousehold(next)
          setEditing(false)
          setTab('menu')
        }}
      />
    )
  }

  return (
    <>
      {tab === 'menu' && <MenuScreen />}
      {tab === 'plan' && <PlanScreen />}
      {tab === 'products' && <ProductsScreen />}
      {tab === 'profile' && (
        <ProfileScreen onEdit={() => setEditing(true)} onRecipes={() => setTab('recipes')} />
      )}
      {tab === 'recipes' && <MyRecipesScreen onBack={() => setTab('profile')} />}

      <nav className="tabbar">
        <div className="tabbar__inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              data-active={tab === t.id || (tab === 'recipes' && t.id === 'profile')}
              onClick={() => setTab(t.id)}
            >
              <span className="ico">{t.icon}</span>
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
