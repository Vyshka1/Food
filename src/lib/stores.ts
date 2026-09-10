import { CATEGORY_ORDER } from '../data/ingredients'
import type { IngredientCategory, ShoppingLine } from '../types'

/**
 * По каким отделам разложить закупку.
 *
 * Список продуктов собран по категориям рецептов — овощи, крупы, молочное, —
 * а ходят по магазину не так: за яйцами идут к молочному холодильнику, а не в
 * бакалею, рыбу берут там же, где мясо. Пока эти два порядка не совпадали,
 * человек возвращался в уже пройденный отдел: категорий одиннадцать, и в
 * зале они перемешаны.
 *
 * Здесь только соответствие и группировка — ни одной новой суммы: цены и
 * количества приходят готовыми из `buildShoppingList`.
 */
export type StoreKind = 'produce' | 'meat' | 'dairy' | 'bakery' | 'grocery'

export const STORE_LABEL: Record<StoreKind, string> = {
  produce: 'Овощи и фрукты',
  meat: 'Мясо и рыба',
  dairy: 'Молочное',
  bakery: 'Хлеб',
  grocery: 'Бакалея',
}

/**
 * Порядок обхода: сначала то, что не боится лежать в тележке, потом холодное,
 * потом хлеб. Так мороженое мясо меньше времени проводит в тепле, а хлеб не
 * приезжает домой раздавленным банками.
 */
export const STORE_ORDER: StoreKind[] = ['produce', 'grocery', 'meat', 'dairy', 'bakery']

const OF_CATEGORY: Record<IngredientCategory, StoreKind> = {
  veg: 'produce',
  fruit: 'produce',
  meat: 'meat',
  // рыба лежит в том же холодильном ряду, что и мясо, а не отдельным походом
  fish: 'meat',
  dairy: 'dairy',
  // яйца — в молочном холодильнике; в бакалее их искать неоткуда
  egg: 'dairy',
  bakery: 'bakery',
  grain: 'grocery',
  legume: 'grocery',
  nuts: 'grocery',
  pantry: 'grocery',
}

/** В каком отделе искать продукты этой категории. */
export function storeOf(category: IngredientCategory): StoreKind {
  return OF_CATEGORY[category]
}

/**
 * Категории отдела — в том же порядке, в каком они идут в списке. Порядок не
 * задаётся вторым списком: единственный источник — `CATEGORY_ORDER`, иначе
 * добавленная категория попадала бы в отдел, но не в его фильтр.
 */
export function categoriesOf(kind: StoreKind): IngredientCategory[] {
  return CATEGORY_ORDER.filter((category) => OF_CATEGORY[category] === kind)
}

/** Строка «Овощи и фрукты · 10 позиций · ≈ 1 210 ₽». */
export interface StoreRow {
  kind: StoreKind
  label: string
  categories: IngredientCategory[]
  count: number
  price: number
}

/**
 * Разложить строки закупки по отделам. На вход идёт то, что действительно
 * покупается (без постоянных и без отмеченного «есть дома») — тогда сумма
 * отделов сходится с чеком, а не спорит с ним.
 *
 * Пустые отделы не показываем: «Хлеб · 0 позиций» — это не информация.
 */
export function shoppingByStore(lines: ShoppingLine[]): StoreRow[] {
  const rows: StoreRow[] = []
  for (const kind of STORE_ORDER) {
    const mine = lines.filter((line) => storeOf(line.category) === kind)
    if (mine.length === 0) continue
    rows.push({
      kind,
      label: STORE_LABEL[kind],
      categories: categoriesOf(kind),
      count: mine.length,
      price: Math.round(mine.reduce((sum, line) => sum + line.price, 0)),
    })
  }
  return rows
}
