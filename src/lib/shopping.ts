import { CATEGORY_ORDER, INGREDIENT_BY_ID } from '../data/ingredients'
import { recipeById } from '../data/recipeRegistry'
import type { Household, Pantry, ShoppingLine, WeekMenu } from '../types'
import { cookTasks } from './menu'
import type { BatchPreference } from './batch'
import { planWeek, purchaseFor } from './weekPlan'
import { shoppingByStore, storeOf } from './stores'
import { parseIso } from './day'

export interface ShoppingList {
  lines: ShoppingLine[]
  /** Сумма без «уже есть дома». */
  total: number
}

/**
 * Потребность без семьи: столько, сколько просит меню, без партий и напитков.
 *
 * Так список считается только там, где семьи ещё нет — например, в предпросмотре
 * до онбординга. Для настоящей недели это неверный ответ: партия почти всегда
 * больше потребности.
 */
function purchaseWithoutHousehold(menu: WeekMenu, pantry?: Pantry) {
  const needed = new Map<string, number>()
  for (const task of cookTasks(menu)) {
    const recipe = recipeById(task.recipeId)
    if (!recipe) continue
    for (const item of recipe.items) {
      needed.set(item.ingredientId, (needed.get(item.ingredientId) ?? 0) + item.qty * task.portions)
    }
  }
  return purchaseFor(needed, pantry)
}

export function buildShoppingList(
  menu: WeekMenu,
  household?: Household,
  pantry?: Pantry,
  prefer?: BatchPreference,
): ShoppingList {
  /*
   * Что нужно на неделю, берём из плана недели: он уже свёл готовки, напитки и
   * дополнения. Покупаем ровно на ту готовку, которую и советуем — партия часто
   * больше потребности по меню (пачка фарша, полная форма, сковорода оладий), и
   * пока список считался по потребности, карточка говорила «приготовим 1,2 кг»,
   * а продуктов покупалось на 1,0 кг.
   */
  const purchase = household
    ? planWeek(menu, household, { pantry, prefer }).purchase
    : purchaseWithoutHousehold(menu, pantry)

  const lines: ShoppingLine[] = []
  for (const line of purchase.values()) {
    const ing = INGREDIENT_BY_ID[line.ingredientId]
    if (!ing) continue
    lines.push({
      ingredientId: line.ingredientId,
      name: ing.name,
      category: ing.category,
      unit: ing.unit,
      needed: line.toBuy,
      buy: line.buy,
      /*
       * Показываем фасовку только там, где она есть: «11 уп. по 1 шт» про яйца
       * — это не подсказка, а шум. Штучное считается штуками, а не упаковками.
       */
      packs:
        line.parts.some((p) => p.size > 1) && (line.parts.length > 1 || line.packs > 1)
          ? line.parts.map((p) => ({ count: p.count, size: p.size }))
          : undefined,
      price: line.price,
      staple: line.staple,
      fromStock: line.fromStock > 0 ? Math.round(line.fromStock) : undefined,
    })
  }

  lines.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.name.localeCompare(b.name, 'ru'),
  )

  const total = lines.filter((l) => !l.staple).reduce((s, l) => s + l.price, 0)
  return { lines, total }
}

/**
 * Три разных числа, которые раньше были одним.
 *
 * «К оплате» — сумма на кассе: упаковки покупаются целиком. «Продукты на эту
 * неделю» — сколько из них уйдёт в еду. Разница не потрачена впустую: она
 * останется дома и вычтется из следующей закупки. Пока это было одним числом,
 * рост чека читался как перерасход, хотя часть его — просто переезд денег в
 * кладовую.
 */
export interface WeekSpending {
  /** Сумма на кассе. */
  checkout: number
  /** Стоимость продуктов, которые уйдут в еду этой недели. */
  used: number
  /** Что останется дома из купленного. */
  leftAtHome: number
}

export function weekSpending(
  menu: WeekMenu,
  household: Household,
  pantry?: Pantry,
  skip: string[] = [],
): WeekSpending {
  const list = buildShoppingList(menu, household, pantry)
  const skipped = new Set(skip)
  const lines = list.lines.filter((l) => !l.staple && !skipped.has(l.ingredientId))
  const checkout = lines.reduce((sum, l) => sum + l.price, 0)

  // сколько каждого продукта реально уйдёт в еду этой недели — из того же плана
  const need = planWeek(menu, household, { pantry }).demand

  let used = 0
  for (const line of lines) {
    const ing = INGREDIENT_BY_ID[line.ingredientId]
    if (!ing) continue
    // считаем только то, что куплено сейчас: то, что взято из запаса, в чек
    // этой недели не входило и в «останется» его записывать не за что
    const inUse = Math.min(line.buy, Math.max(0, (need.get(line.ingredientId) ?? 0) - (line.fromStock ?? 0)))
    used += ing.unit === 'pcs' ? ing.price * inUse : (ing.price * inUse) / 1000
  }

  return {
    checkout: Math.round(checkout),
    used: Math.round(used),
    leftAtHome: Math.max(0, Math.round(checkout - used)),
  }
}

/**
 * С какого размера отдела внутри него нужны подзаголовки категорий.
 *
 * Правило лежит рядом с самим списком, а не в экране: делить список на
 * разделы — это то же самое занятие, что и `shoppingListText` ниже, и порог
 * нужен там же, где считается сам отдел.
 *
 * Замер на десяти неделях (семья из двух едоков, пустая кладовая, зёрна 1–10):
 * в списке 34,5 строки и 4 непустых отдела, в отделе 8,6 строки и 2,4
 * категории. Среднее здесь обманывает — отделы разошлись на два вида. «Овощи и
 * фрукты» — 13,2 строки (до 16), «Бакалея» — 13,8 (до 16); «Мясо и рыба» — 3,3,
 * «Молочное» — 4,2. Строка в этом режиме высотой 68 px, на телефон их помещается
 * около восьми: большой отдел целиком не видно, и без подзаголовков в нём
 * теряешь место; маленький виден весь сразу, и делить его нечего.
 *
 * Если ставить подзаголовки везде, их выходит 9,5 на неделю и 40% из них стоят
 * над одной-двумя строками — то есть заголовков столько же, сколько было при
 * группировке по категориям, только теперь ещё и отделы сверху. С порогом их
 * 5,7, под каждым 4,7 строки, над одной-двумя — 21%.
 *
 * Тот замер сделан на полных списках, а в зале половина строк уходит под
 * «прятать купленное». Досчитано на 30 неделях × трёх долях купленного
 * (25/50/75%), 240 отделов на экране. Если считать порог по видимым строкам,
 * подзаголовки исчезают посреди похода в 51 отделе из 120, где они были, —
 * 43%: стоишь в «Овощах и фруктах», прячешь купленное, и разметка отдела
 * перестраивается под рукой. Выигрыша при этом почти нет: «тонких»
 * подзаголовков (над одной-двумя строками) 47% против 54% при счёте по всему
 * отделу — скрытие делает их тонкими в любом случае. Поэтому порог считается
 * по всему походу: подзаголовок — это ориентир в зале, и пропадать он должен
 * вместе с отделом, а не от переключателя.
 */
export const CATEGORY_HEADS_FROM = 8

/**
 * Какие подзаголовки поставить внутри отдела.
 *
 * На вход — заголовок отдела и подписи его категорий по порядку списка (все,
 * что есть в этом походе, а не только видимые сейчас) и сколько строк в отделе
 * за весь поход. Возвращает подписи, которые стоит показать; пустой список
 * значит «отдел идёт сплошняком».
 */
export function categoryHeads(store: string, categories: string[], count: number): string[] {
  // подзаголовок делит отдел: в коротком делить нечего, в отделе из одной
  // категории он повторил бы заголовок другими словами («Хлеб» под «Хлебом»)
  if (count < CATEGORY_HEADS_FROM || categories.length < 2) return []
  /*
   * И не повторяем заголовок отдела дословно: «Бакалея» сразу под «Бакалеей»
   * — это не деление, а эхо, первой же строке подписи не нужно.
   *
   * Снимаем только первый подзаголовок, и это важно. Категория с тем же
   * именем, стоящая в середине отдела, свою работу делает: без неё её строки
   * встают под чужой подписью — масло и специи оказываются под «Орехами и
   * семечками». Повторённое слово через полэкрана от заголовка — неловкость,
   * чужая подпись — неправда, и выбирать между ними не приходится.
   */
  return categories.filter((c, i) => !(i === 0 && c === store))
}

/** Что и в каком порядке отметили: на вход всем, кто отвечает «что ещё купить». */
export interface ShoppingMarks {
  /** Отмеченное «есть дома» — это не покупают. */
  atHome: string[]
  /** Отмеченное в зале как уже лежащее в тележке. */
  bought: string[]
}

/**
 * Что ещё предстоит купить — единственный ответ на этот вопрос в приложении.
 *
 * Считать его два раза нельзя: счётчик над кнопкой в режиме магазина вычитал
 * отмеченное, а текст для мессенджера — нет, и один экран давал два ответа.
 * Замерено на неделе из 34 позиций: над кнопкой «17 позиций · ≈ 3642 ₽», а в
 * отправленном сообщении 34 строки и «Итого примерно 8523 ₽».
 *
 * Уходят три вида строк, и каждый по своей причине: постоянные продукты
 * (соль, масло) не покупают вовсе, «есть дома» уже есть, отмеченное в зале
 * уже в тележке.
 */
export function remainingToBuy(list: ShoppingList, marks: ShoppingMarks): ShoppingList {
  const home = new Set(marks.atHome)
  const inCart = new Set(marks.bought)
  const lines = list.lines.filter(
    (l) => !l.staple && !home.has(l.ingredientId) && !inCart.has(l.ingredientId),
  )
  return { lines, total: lines.reduce((sum, l) => sum + l.price, 0) }
}

/**
 * Текст списка для мессенджера: отделы зала, позиции, итог.
 *
 * Отделы, а не категории, и порядок их — тот же, что на экране режима
 * магазина: один источник, `lib/stores`. Иначе получатель идёт другим
 * маршрутом, чем автор списка: категорий одиннадцать, и в зале они
 * перемешаны — по ним выходило «Мясо и птица», потом отдельно «Рыба» (тот же
 * прилавок) и «Яйца» отдельным разделом в стороне от молочного холодильника.
 * Подзаголовков категорий здесь нет: в сообщении список не листают, делить
 * отдел незачем.
 *
 * `bought` спрашиваем всегда, и в этом весь смысл. Список отправляют в двух
 * разных случаях: до магазина — целиком, «зайди по дороге», и из зала —
 * «вот что мне ещё осталось». Раньше эти два случая различались молча: текст
 * всегда собирался целиком, поэтому из зала уходил список, который человек на
 * экране уже наполовину вычеркнул. Теперь случай задаёт вызывающий, пустой
 * массив — это честное «ничего не отмечено», и заголовок тогда другой.
 */
export function shoppingListText(
  list: ShoppingList,
  opts: ShoppingMarks & { weekStart: string },
): string {
  const rest = remainingToBuy(list, opts)
  // отмечено ли что-то на самом деле, а не просто передан непустой массив:
  // в `bought` могут лежать продукты, которых в этом списке уже нет
  const marked = remainingToBuy(list, { atHome: opts.atHome, bought: [] }).lines.length
  const partial = marked > rest.lines.length

  const start = parseIso(opts.weekStart)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
  const week = `${fmt(start)}–${fmt(end)}`

  /*
   * «Продукты на неделю» и «Осталось купить» — разные обещания, и получатель
   * должен видеть, какое из них ему прислали: по первому заголовку короткий
   * список читается как «на неделю нужно всего-то это».
   */
  const head = partial ? `Осталось купить на неделю ${week}` : `Продукты на неделю ${week}`
  const out: string[] = [head, '']

  if (rest.lines.length === 0) {
    // «Итого примерно 0 ₽» под пустым списком читается как сбой; причина
    // пустоты — единственное, что здесь стоит сказать
    out.push(partial ? 'Всё уже куплено.' : 'Покупать нечего.')
    return out.join('\n')
  }

  // строки уже отсортированы по категориям: внутри отдела их порядок тот же,
  // что и на экране
  for (const store of shoppingByStore(rest.lines)) {
    const group = rest.lines.filter((l) => storeOf(l.category) === store.kind)
    out.push(store.label)
    for (const line of group) out.push(`— ${line.name}, ${formatQty(line.buy, line.unit)}`)
    out.push('')
  }
  out.push(`Итого примерно ${rest.total} ₽`)
  return out.join('\n')
}

export function formatQty(qty: number, unit: 'g' | 'ml' | 'pcs'): string {
  if (unit === 'pcs') return `${qty} шт`
  // «1,4 л», а не «1.4 л»: десятичная точка в русском тексте выглядит опечаткой
  if (qty >= 1000) {
    const big = (qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1).replace('.', ',')
    return `${big} ${unit === 'g' ? 'кг' : 'л'}`
  }
  return `${Math.round(qty)} ${unit === 'g' ? 'г' : 'мл'}`
}
