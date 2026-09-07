import { RECIPES } from '../data/recipes'
import { AS_WRITTEN, OILS, affectedRecipes, oilsInUse, oilsOf } from '../lib/oil'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { plural } from '../lib/format'
import { useStore } from '../store'
import { Switch } from './ui'

/**
 * На чём готовим.
 *
 * Масло стоит в рецептах числом, и его калории считаются всегда. Здесь
 * выбирается только то, каким маслом заменить написанное — и это меняет и
 * КБЖУ, и список покупок, поэтому меню пересобирается сразу.
 */
export function OilEditor() {
  const { household, setOils } = useStore()
  if (!household) return null
  const oils = oilsOf(household)
  const changed = affectedRecipes(RECIPES, oils)
  const inUse = oilsInUse(RECIPES, oils)

  return (
    <div className="stack">
      <div>
        <div className="muted small" style={{ marginBottom: 6 }}>
          Основное масло
        </div>
        <div className="chips">
          <button
            className="chip"
            data-active={oils.mainId === AS_WRITTEN}
            onClick={() => setOils({ ...oils, mainId: AS_WRITTEN })}
          >
            Как в рецепте
          </button>
          {OILS.map((oil) => (
            <button
              key={oil.id}
              className="chip"
              data-active={oils.mainId === oil.id}
              onClick={() => setOils({ ...oils, mainId: oil.id })}
              title={oil.hint}
            >
              {oil.label}
            </button>
          ))}
        </div>
        <p className="hint">
          {OILS.find((o) => o.id === oils.mainId)?.hint ??
            'у каждого блюда останется то масло, которое в нём написано'}
        </p>
      </div>

      <div>
        <div className="muted small" style={{ marginBottom: 6 }}>
          Чем заменить, если основное не подходит
        </div>
        <div className="chips">
          {OILS.filter((o) => o.id !== oils.mainId).map((oil) => (
            <button
              key={oil.id}
              className="chip"
              data-active={oils.alternatives.includes(oil.id)}
              onClick={() =>
                setOils({
                  ...oils,
                  alternatives: oils.alternatives.includes(oil.id)
                    ? oils.alternatives.filter((id) => id !== oil.id)
                    : [...oils.alternatives, oil.id],
                })
              }
            >
              {oil.label}
            </button>
          ))}
        </div>
        <p className="hint">
          Сливочное масло горит на сковороде: там, где блюдо жарят, вместо него подставится
          подходящее.
        </p>
      </div>

      <div className="row row--between">
        <div>
          <div>Считать масло для формы</div>
          <div className="muted small">пять миллилитров на смазывание — это 45 ккал</div>
        </div>
        <Switch
          on={oils.greaseForms}
          onChange={(greaseForms) => setOils({ ...oils, greaseForms })}
        />
      </div>

      <p className="hint" style={{ marginBottom: 0 }}>
        {changed === 0
          ? 'Рецепты остаются как есть.'
          : `Замена коснётся ${changed} ${plural(changed, ['блюда', 'блюд', 'блюд'])}.`}{' '}
        Покупать нужно: {inUse.map((id) => INGREDIENT_BY_ID[id]?.name.toLowerCase()).join(', ')}.
      </p>
    </div>
  )
}
