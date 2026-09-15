import { useState } from 'react'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { MealSlot, MenuEntry, PreparationMode } from '../types'
import { THAW_LABEL } from '../types'
import {
  BATCH_POLICY_HINT,
  PREPARATION_HINT,
  batchPolicyOf,
  cooksToOrder,
  preparationOf,
} from '../lib/cookMode'
import { formatDuration } from '../lib/cookingPlan'
import { WEEKDAYS_FULL } from '../lib/menu'
import { plural, shortDate } from '../lib/format'
import { cookAmountLabel, cookCard, weightLabel } from '../lib/cookCard'
import type { CardLeftover } from '../lib/cookCard'
import { householdQty } from '../lib/measures'
import { batchReasonText, splitLeftover } from '../lib/batch'
import { formatQty } from '../lib/shopping'
import { daysLeft, expiresOn } from '../lib/pantry'
import { recipeStats } from '../lib/nutrition'
import { useStore } from '../store'
import { Sheet } from './ui'
import { Icon } from './icons'
import { DishBanner, DishThumb } from './DishImage'
import { today as todayIso } from '../lib/day'

const STORAGE_LABEL: Record<string, string> = {
  fresh: 'Готовим в этот день',
  fridge: 'Из холодильника',
  freezer: 'Из морозилки — достать заранее',
}

/**
 * Сколько раз это едят. Считаем приёмы пищи, а не тарелки: обед на двоих —
 * это один приём, и «едим дважды» про него было бы неправдой.
 *
 * «Готовим один раз — едим дважды» уместно только там, где один раз и правда
 * готовят. У йогурта с гранолой этот заголовок стоял над предложением смешать
 * килограмм на два завтрака: гранола размокнет к утру, а яблоко потемнеет.
 * Собираемое блюдо собирают столько раз, сколько его едят, и заголовок
 * говорит именно это.
 */
function mealsLabel(prep: PreparationMode, meals: number, plates: number): string {
  const times = `${meals} ${plural(meals, ['приём', 'приёма', 'приёмов'])} пищи`
  if (prep === 'portionOnly') {
    return meals <= 1 ? 'Готовить нечего — разложить' : `Готовить нечего — разложить на ${times}`
  }
  if (prep === 'assembleBeforeEating') {
    return meals <= 1 ? 'Собираем перед едой' : `Собираем перед едой, и так ${times}`
  }
  if (prep === 'prepareComponents') {
    return meals <= 1 ? 'Делаем заготовку' : `Делаем заготовку — хватит на ${times}`
  }
  const head =
    meals <= 1
      ? 'Готовим один раз — на один приём пищи'
      : meals === 2
        ? 'Готовим один раз — едим дважды'
        : `Готовим один раз — на ${times}`
  return plates > meals ? `${head}, ${plates} ${plural(plates, ['порция', 'порции', 'порций'])}` : head
}

/** «2 завтрака», «3 обеда» — как назвать приёмы пищи, которые закрывает готовка. */
function mealsWord(slot: MealSlot | undefined, meals: number): string {
  const forms: Partial<Record<MealSlot, [string, string, string]>> = {
    breakfast: ['завтрак', 'завтрака', 'завтраков'],
    lunch: ['обед', 'обеда', 'обедов'],
    dinner: ['ужин', 'ужина', 'ужинов'],
    snack: ['перекус', 'перекуса', 'перекусов'],
  }
  return plural(meals, forms[slot ?? 'lunch'] ?? ['приём', 'приёма', 'приёмов'])
}

/**
 * Что стало с упаковкой. Три числа вместо одного совета: сколько ушло сюда,
 * сколько в другие блюда недели и сколько осталось на самом деле. Пристроенным
 * остаток считается только тогда, когда для него есть конкретное блюдо или
 * конкретное действие.
 */
/**
 * Одна строка «что станет с упаковкой».
 *
 * Было три строки на продукт, шесть продуктов — стена текста, в которой не
 * найти главного. И главное там не находилось вовсе: «320 г в другие блюда» не
 * отвечает на вопрос «в какие», а именно его человек и задаёт, глядя на
 * непочатую пачку.
 *
 * Осталось две строки: сколько уходит сюда и куда денется остальное — с
 * названиями блюд. Остаток в пределах округления не называется: «4 г останется,
 * использовать за 5 дней» — издевательство, а не совет.
 */
function LeftoverLine({ line }: { line: CardLeftover }) {
  /*
   * Сначала покупка, потом расход. Порядок тут и есть смысл: «купили 700 г,
   * в блюдо ушло 690» человек читает как две разные величины, а «690 г сюда»
   * без первой половины — как будто пачка и есть порция. Ровно из этой
   * склейки и выросла готовка под упаковку.
   */
  const parts = []
  if (line.bought > 0) parts.push(`${formatQty(line.bought, line.unit)} куплено`)
  parts.push(`${formatQty(line.usedHere, line.unit)} сюда`)
  if (line.usedElsewhere > 0) {
    // названия в кавычках: тогда именительный падеж рядом с «в» не режет глаз
    const named = line.elsewhere.slice(0, 2).map((t) => `«${t}»`).join(', ')
    const more = line.elsewhere.length - 2
    parts.push(
      named
        ? `${formatQty(line.usedElsewhere, line.unit)} в ${named}${more > 0 ? ` и ещё ${more}` : ''}`
        : `${formatQty(line.usedElsewhere, line.unit)} в другие блюда`,
    )
  }

  const rest =
    line.placed?.kind === 'absorbed'
      ? 'без остатка'
      : line.restNegligible
        ? ''
        : line.placed?.kind === 'freeze'
          ? `${formatQty(line.left, line.unit)} заморозить сырым`
          : line.days > 30
            ? `${formatQty(line.left, line.unit)} в запас`
            : `${formatQty(line.left, line.unit)} на ${line.days} дн`
  if (rest) parts.push(rest)

  return (
    <div className="leftover">
      <span className="leftover__name">{line.name}</span>
      <span className="muted small">{parts.join(' · ')}</span>
    </div>
  )
}

/**
 * Блюдо, которое уже приготовлено и лежит в морозилке.
 *
 * Здесь нечего считать и нечего покупать. Всё, что нужно человеку, — сколько
 * контейнеров достать, когда именно и до какого числа это ещё еда.
 */
function FreezerMealSheet({
  entry,
  onClose,
  onSwap,
  onBan,
}: {
  entry: MenuEntry
  onClose: () => void
  onSwap: () => void
  onBan: () => void
}) {
  const { household, pantry, rateRecipe } = useStore()
  const recipe = recipeById(entry.recipeId)
  if (!recipe || !household) return null
  const today = todayIso()
  const lots = pantry.freezer.filter((f) => f.recipeId === recipe.id)
  const need = entry.portions.reduce((sum, p) => sum + p.factor, 0)
  const perContainer = lots[0]?.portionsEach ?? 1
  const containers = Math.max(1, Math.ceil(need / Math.max(0.1, perContainer)))
  const soonest = lots.slice().sort((a, b) => daysLeft(a, today) - daysLeft(b, today))[0]
  const info = recipe.freezing

  return (
    <Sheet onClose={onClose}>
      <DishBanner recipe={recipe} />

      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <DishThumb recipe={recipe} size={56} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
          <div className="muted small">готово — лежит в морозилке</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Ничего не готовим</div>
        <div className="ing-line">
          <span className="muted">Достать</span>
          <b>
            {containers} {plural(containers, ['контейнер', 'контейнера', 'контейнеров'])}
          </b>
        </div>
        {info && (
          <div className="ing-line">
            <span className="muted">Как разморозить</span>
            <b>
              {THAW_LABEL[info.thaw]}
              {info.thawHours >= 8 ? ' — с вечера' : ''}
            </b>
          </div>
        )}
        {soonest && (
          <div className="ing-line">
            <span className="muted">Годно до</span>
            <b>{shortDate(expiresOn(soonest))}</b>
          </div>
        )}
        <p className="hint" style={{ marginBottom: 0 }}>
          Это заготовка с прошлых недель. Продуктов на неё покупать не нужно — они уже куплены
          и потрачены тогда.
        </p>
      </div>

      <div className="card">
        <div className="section-title">Кому и когда</div>
        {entry.portions
          .filter((p) => p.factor > 0)
          .map((p) => {
            const eater = household.eaters.find((e) => e.id === p.eaterId)
            return (
              <div className="ing-line" key={p.eaterId}>
                <span>
                  {WEEKDAYS_FULL[entry.day]}
                  {household.eaters.length > 1 && eater ? ` · ${eater.name}` : ''}
                </span>
                <b>{Math.round(recipeStats(recipe).kcal * p.factor)} ккал</b>
              </div>
            )
          })}
      </div>

      <div className="card">
        <div className="section-title">Как вам блюдо</div>
        {household.eaters.map((eater) => {
          const value = eater.ratings?.[recipe.id] ?? 0
          return (
            <div className="rate-line" key={eater.id}>
              <span>{eater.name}</span>
              <div className="rate">
                <button
                  data-on={value === 1}
                  onClick={() => rateRecipe(eater.id, recipe.id, value === 1 ? 0 : 1)}
                  aria-label={`${eater.name}: нравится`}
                  aria-pressed={value === 1}
                >
                  <Icon name="thumbUp" size={16} /> нравится
                </button>
                <button
                  data-on={value === -1}
                  onClick={() => rateRecipe(eater.id, recipe.id, value === -1 ? 0 : -1)}
                  aria-label={`${eater.name}: не нравится`}
                  aria-pressed={value === -1}
                >
                  <Icon name="thumbDown" size={16} /> не нравится
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--soft" onClick={onSwap}>
          Приготовить другое
        </button>
        <button className="btn btn--ghost" onClick={onBan}>
          Больше не показывать
        </button>
      </div>
    </Sheet>
  )
}

export function RecipeSheet({
  entry,
  onClose,
  onSwap,
  onBan,
}: {
  entry: MenuEntry
  onClose: () => void
  onSwap: () => void
  onBan: () => void
}) {
  const { household, menu, pantry, rateRecipe } = useStore()
  const [showOther, setShowOther] = useState(false)
  const recipe = recipeById(entry.recipeId)
  if (!recipe || !household || !menu) return null
  // Заготовку не готовят: её достают. Карточка «сколько приготовить, из чего
  // и по каким шагам» здесь была бы не просто лишней, а вредной — человек
  // пошёл бы покупать продукты на блюдо, которое уже лежит в морозилке.
  if (entry.fromFreezer) {
    return (
      <FreezerMealSheet
        entry={entry}
        onClose={onClose}
        onSwap={onSwap}
        onBan={onBan}
      />
    )
  }

  const card = cookCard(menu, household, entry, pantry)
  if (!card) return null
  // время этой готовки, а не время рецепта на одну долю
  const totalMinutes = card.cookMinutes
  const pieceName = recipe.batch?.pieceName
  const amount = cookAmountLabel(card, pieceName)
  /** Насколько раздача разошлась с нормой — это стоит сказать вслух. */
  const offRows = card.rows.filter((r) => Math.abs(r.kcal - r.targetKcal) > r.targetKcal * 0.12)
  /*
   * Две оси, и карточка спрашивает обе. Количество: у блюда без подтверждённой
   * партии приготовленное и нужное — одно и то же число, и показывать его
   * дважды («приготовим 1,0 кг», «нужно 570 г») значит намекать на разницу,
   * которой нет. Подготовка: что сделать заранее, а что перед самой едой.
   */
  const policy = batchPolicyOf(card.plan?.batch ?? recipe.batch)
  const prep = preparationOf(recipe)
  const toOrder = cooksToOrder(policy)
  /*
   * Что осталось сверх розданного — считаем от тех самых строк «кому и когда»,
   * которые человек видит ниже. Брать это из плана недели нельзя: план делит
   * граммы, а карточка раздаёт целые изделия, и шестнадцатый голубец в плане
   * попадает в «роздано», а на экране не появляется нигде.
   *
   * А вот правило, по которому остаток делится на добавку и на «некуда», —
   * общее с планом: `splitLeftover`. У карточки было своё, с порогом в полкило,
   * и целые приёмы пищи, которые есть некому, она звала остатком на доесть.
   */
  const servingGrams = card.servings > 0 ? card.cookGrams / card.servings : card.cookGrams
  const servedGrams = card.rows.reduce((sum, row) => sum + row.grams, 0)
  const { tailGrams, unplacedGrams } = splitLeftover(
    card.cookGrams - servedGrams - card.freezeGrams,
    servingGrams,
  )
  // о ложке говорить нечего; у штучного блюда мера очевиднее — одно изделие
  const tailWorthTelling = tailGrams >= (card.pieceGrams ?? 50)
  const tailPieces =
    card.pieceGrams && tailGrams >= card.pieceGrams
      ? Math.max(1, Math.round(tailGrams / card.pieceGrams))
      : undefined
  /*
   * Что можно сделать заранее и что делается перед самой едой.
   *
   * Заранее — то, что переживает хранение: подсушенная гранола, сваренная
   * крупа, обжаренная курица. Перед едой — всё остальное: яблоко темнеет,
   * гранола размокает, салат течёт. Разметка блюда уже сказала, что оно
   * собирается перед едой; здесь только раскладываем шаги на две стопки.
   */
  const AHEAD_STEP = /жарить|обжар|запек|запеч|варить|отварить|тушить|подсуш|пробить|блендер|замочить|набух|настоя/i
  const aheadSteps = prep === 'assembleBeforeEating'
    ? recipe.steps.filter((s) => s.station === 'stove' || s.station === 'oven' || AHEAD_STEP.test(s.text))
    : []
  const beforeMealSteps =
    prep === 'assembleBeforeEating' ? recipe.steps.filter((s) => !aheadSteps.includes(s)) : []
  /** «2 завтрака по 285 г» — из чего сложилась потребность. */
  const perMeal = card.meals > 0 ? Math.round(card.neededGrams / card.meals) : card.neededGrams
  const mealWord = mealsWord(card.entries[0]?.slot, card.meals)

  return (
    <Sheet onClose={onClose}>
      <DishBanner recipe={recipe} />

      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <DishThumb recipe={recipe} size={56} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
          <div className="muted small">
            {formatDuration(totalMinutes)} · продукты в блюде — примерно {card.usedPrice} ₽
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">{mealsLabel(prep, card.meals, card.rows.length)}</div>

        {toOrder ? (
          /*
           * Одно число вместо двух: сколько нужно на запланированные приёмы,
           * столько и сделаем. Разницы между «приготовим» и «нужно по меню»
           * здесь нет по устройству, и показывать две строки значит намекать
           * на несуществующий остаток.
           *
           * И сразу из чего это число сложилось: «2 завтрака по 285 г» человек
           * читает как план на неделю, а «570 г» — как вес кастрюли.
           */
          <div className="ing-line">
            <span className="muted">Нужно</span>
            <b>
              {card.meals} {mealWord} по {perMeal} г
            </b>
          </div>
        ) : (
          <>
            <div className="ing-line">
              <span className="muted">Приготовим</span>
              <b>{amount}</b>
            </div>
            <div className="ing-line">
              <span className="muted">Нужно по меню</span>
              <b>{card.neededGrams} г</b>
            </div>
          </>
        )}
        {card.freezeGrams > 0 && (
          <div className="ing-line">
            <span className="muted">В морозилку</span>
            <b>
              {card.freezePieces
                ? `${card.freezePieces} ${plural(card.freezePieces, pieceName ?? ['шт', 'шт', 'шт'])} · примерно ${card.freezeGrams} г`
                : `примерно ${card.freezeGrams} г`}
            </b>
          </div>
        )}
        {card.ahead && (
          /*
           * Партия выросла не сама по себе: последняя готовка недели кормит и
           * её начало. Без этой строки человек видит только «варить больше» и
           * не видит, зачем.
           */
          <div className="ing-line ing-line--note">
            <span className="muted">Из них впрок</span>
            <b>
              {card.ahead.grams} г — {card.ahead.label} на следующей неделе
            </b>
          </div>
        )}
        {tailWorthTelling && (
          /*
           * «Доесть в ближайшие дни» здесь было раньше, и это не адрес: у таких
           * граммов нет ни человека, ни дня, ни приёма пищи. Теперь сюда
           * попадает только то, что меньше порции, — и у него адрес есть: те же
           * самые приёмы пищи, что перечислены ниже, просто тарелки чуть полнее.
           */
          <div className="ing-line">
            <span className="muted">Сверх нормы</span>
            <b>
              {tailPieces
                ? `${tailPieces} ${plural(tailPieces, pieceName ?? ['шт', 'шт', 'шт'])}`
                : `${tailGrams} г`}{' '}
              — добавка к этим же приёмам пищи
            </b>
          </div>
        )}
        {unplacedGrams > 0 && (
          <div className="ing-line">
            <span className="muted">Некуда убрать</span>
            <b>{unplacedGrams} г — в морозилке нет места</b>
          </div>
        )}

        {aheadSteps.length > 0 && (
          /*
           * Что можно сделать заранее: подсушить гранолу, отварить крупу,
           * обжарить курицу. Это и есть вторая ось на экране — не «сколько», а
           * «когда что делать». Если заранее делать нечего, строки нет.
           */
          <div className="ing-line">
            <span className="muted">Приготовить заранее</span>
            <b>{aheadSteps.map((s) => s.text.toLowerCase()).join('; ')}</b>
          </div>
        )}
        {beforeMealSteps.length > 0 && (
          <div className="ing-line">
            <span className="muted">Перед едой</span>
            <b>{beforeMealSteps.map((s) => s.text.toLowerCase()).join('; ')}</b>
          </div>
        )}

        {card.loads && (
          <div className="ing-line">
            <span className="muted">Жарить</span>
            <b>
              {card.loads.count}{' '}
              {plural(card.loads.count, ['заход', 'захода', 'заходов'])}
              {card.loads.twoPans ? ' на двух сковородах' : ''} по {card.loads.perLoad} шт ·{' '}
              {card.loads.minutes} мин
            </b>
          </div>
        )}

        {/*
          * Почему столько. У блюда с партией это свойство кухни — кастрюля,
          * форма, упаковка. У блюда без партии объяснять надо не размер, а
          * порядок: что сделать заранее и что перед едой. Раньше здесь для
          * йогурта стояло «потому что меньше кастрюли готовить непрактично» —
          * фраза про кастрюлю над блюдом, которое собирают в банку.
          */}
        {toOrder ? (
          <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
            {BATCH_POLICY_HINT[policy]} {PREPARATION_HINT[prep]}
          </p>
        ) : (
          card.plan && (
            <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
              Потому что {batchReasonText(card.plan.batch)}. {PREPARATION_HINT[prep]}
            </p>
          )
        )}

        {card.limitedByPractical && (
          <p className="hint" style={{ marginTop: 0, marginBottom: 8, color: 'var(--warn)' }}>
            Больше за раз не делают — на всю неделю понадобится вторая готовка.
          </p>
        )}

        {card.alternatives.length > 0 && (
          <>
            <button className="btn btn--ghost btn--small" onClick={() => setShowOther((v) => !v)}>
              {showOther ? 'Скрыть' : 'Изменить количество'}
            </button>
            {showOther &&
              card.alternatives.map((option) => (
                <div className="ing-line" key={option.scale}>
                  <span>
                    {option.pieces
                      ? `${option.pieces} ${plural(option.pieces, pieceName ?? ['шт', 'шт', 'шт'])} · примерно ${weightLabel(option.grams)}`
                      : `примерно ${weightLabel(option.grams)}`}
                  </span>
                  <b className="small">{option.note}</b>
                </div>
              ))}
          </>
        )}

        {/*
          * Оговорка про прикидку нужна там, где вес партии — самостоятельное
          * утверждение. У блюда без партии его нет: вес взят из потребности
          * меню, а она посчитана по нормам едоков.
          */}
        {card.plan?.batch.source === 'derived' && !toOrder && (
          <p className="hint" style={{ marginBottom: 0 }}>
            Выход прикинут по составу и не проверен на кухне — поэтому только вес, без числа
            изделий.
          </p>
        )}
      </div>

      <div className="card">
        <div className="section-title">Кому и когда</div>
        {card.rows.map((row, i) => (
          <div className="ing-line" key={`${row.day}-${row.eaterId}-${i}`}>
            <span>
              {WEEKDAYS_FULL[row.day]}
              {household.eaters.length > 1 ? ` · ${row.eaterName}` : ''}
            </span>
            <b>
              {row.pieces
                ? `${row.pieces} ${plural(row.pieces, pieceName ?? ['шт', 'шт', 'шт'])} · ${row.kcal} ккал`
                : `${row.grams} г · ${row.kcal} ккал`}
            </b>
          </div>
        ))}
        <p className="hint" style={{ marginBottom: 0 }}>
          {offRows.length === 0
            ? 'Каждому столько, сколько нужно по его норме.'
            : `Изделия целые, поэтому ровно в норму не попасть: ${offRows
                .map((r) => {
                  const diff = r.kcal - r.targetKcal
                  return `${r.eaterName} — ${diff > 0 ? '+' : '−'}${Math.abs(diff)} ккал`
                })
                .join(', ')}. Недобор проще закрыть овощами или фруктом, чем резать изделие пополам.`}
        </p>
      </div>

      <div className="card card--soft">
        <div className="row row--between small">
          <span className="muted">Калории всей готовки</span>
          <b>{card.stats.kcal} ккал</b>
        </div>
        <div className="row row--between small" style={{ marginTop: 6 }}>
          <span className="muted">Белки · жиры · углеводы</span>
          <b>
            {card.stats.protein} · {card.stats.fat} · {card.stats.carbs} г
          </b>
        </div>
        <div className="row row--between small" style={{ marginTop: 6 }}>
          <span className="muted">Хранение</span>
          <b>{STORAGE_LABEL[entry.storage]}</b>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Продукты на всю готовку</div>
        {card.items.map((item) => {
          const ing = INGREDIENT_BY_ID[item.ingredientId]
          if (!ing) return null
          const measure = householdQty(ing, item.qty)
          return (
            <div className="ing-line" key={item.ingredientId}>
              <span>{ing.name}</span>
              <b>
                {measure.text}
                {measure.approx && <span className="muted small"> · {measure.approx}</span>}
              </b>
            </div>
          )
        })}
        <p className="hint" style={{ marginBottom: 0 }}>
          Продукты в блюде — примерно {card.usedPrice} ₽. Эти же упаковки в магазине стоят около{' '}
          {card.purchasePrice} ₽: они целые, и часть уйдёт в другие блюда недели и в запас.
        </p>
      </div>

      {card.leftovers.length > 0 && (
        <div className="card">
          <div className="section-title">Что станет с упаковками</div>
          {card.leftovers.map((line) => (
            <LeftoverLine line={line} key={line.ingredientId} />
          ))}
          {/*
            * Главная мысль всей переработки, сказанная вслух: упаковка — это
            * покупка, а не порция. Пачка йогурта 600 г не значит, что все 600 г
            * надо сегодня смешать с гранолой; лишнее остаётся продуктом в
            * холодильнике и ждёт следующего блюда. Пока этого не было сказано,
            * система сама достраивала связь и варила под упаковку.
            */}
          <p className="hint" style={{ marginBottom: 0 }}>
            Упаковки покупаются целыми, а в блюдо идёт столько, сколько нужно по
            рецепту. Остаток не пропадает и не «доедается»: он остаётся продуктом в
            холодильнике и ждёт следующего блюда.
          </p>
        </div>
      )}

      <div className="card">
        <div className="section-title">Шаги</div>
        {recipe.steps.map((step, i) => (
          <div className="step-line" key={i}>
            <span className="step-line__n">{i + 1}</span>
            <div>
              <div>{step.text}</div>
              <div className="muted small">
                {card.stepMinutes[i]} мин ·{' '}
                {step.station === 'oven'
                  ? 'духовка'
                  : step.station === 'stove'
                    ? 'плита'
                    : step.station === 'wait'
                      ? 'без участия'
                      : 'руками'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">Как вам блюдо</div>
        {household.eaters.map((eater) => {
          const value = eater.ratings?.[recipe.id] ?? 0
          return (
            <div className="rate-line" key={eater.id}>
              <span>{eater.name}</span>
              <div className="rate">
                <button
                  data-on={value === 1}
                  onClick={() => rateRecipe(eater.id, recipe.id, value === 1 ? 0 : 1)}
                  aria-label={`${eater.name}: нравится`}
                  aria-pressed={value === 1}
                >
                  <Icon name="thumbUp" size={16} /> нравится
                </button>
                <button
                  data-on={value === -1}
                  onClick={() => rateRecipe(eater.id, recipe.id, value === -1 ? 0 : -1)}
                  aria-label={`${eater.name}: не нравится`}
                  aria-pressed={value === -1}
                >
                  <Icon name="thumbDown" size={16} /> не нравится
                </button>
              </div>
            </div>
          )
        })}
        <p className="hint" style={{ marginBottom: 0 }}>
          Оценка меняет подбор на следующих неделях. Чтобы блюдо исчезло совсем —
          «Больше не показывать».
        </p>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--soft" onClick={onSwap}>
          Заменить блюдо
        </button>
        <button className="btn btn--ghost" onClick={onBan}>
          Больше не показывать
        </button>
      </div>
    </Sheet>
  )
}
