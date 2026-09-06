import type { Recipe } from '../types'

/**
 * Одна система контурных иконок вместо эмодзи: у эмодзи в каждой ОС свой стиль,
 * и на экране получалась мешанина — фотографический перец рядом с плоским боулом.
 */
export type IconName =
  | 'menu'
  | 'pot'
  | 'cart'
  | 'user'
  | 'sun'
  | 'leaf'
  | 'moon'
  | 'apple'
  | 'soup'
  | 'porridge'
  | 'salad'
  | 'bake'
  | 'pan'
  | 'fish'
  | 'meat'
  | 'pancake'
  | 'drink'
  | 'snowflake'
  | 'fridge'
  | 'clock'
  | 'book'
  | 'link'
  | 'ban'
  | 'kitchen'
  | 'people'
  | 'check'

const PATHS: Record<IconName, string> = {
  // навигация
  menu: 'M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.5 1.2-2 3-2 5s.5 3 1.5 3.5V21',
  pot: 'M4 9h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9ZM2 9h20M7 6V4M12 6V3M17 6V4',
  cart: 'M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20.5 7H6M9 20h.01M17 20h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-3.5 3.6-6 8-6s8 2.5 8 6',
  // приёмы пищи
  sun: 'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  leaf: 'M20 4C10 4 4 9 4 16c0 2 1 4 1 4s2-9 15-11c0 0-3 8-11 10 6 1 11-3 11-9 0-3-1-6 0-6Z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  apple: 'M12 8c-1-2-3-3-5-2s-2 4-1 7 3 6 5 6c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 4-3 5-6s0-6-2-7-4 0-5 2M12 8V5c0-1 1-2 2-2',
  // категории блюд
  soup: 'M4 11h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8ZM2 21h20M9 7c0-1 1-1.5 1-2.5S9 3 9 3M13 7c0-1 1-1.5 1-2.5S13 3 13 3',
  porridge: 'M4 12h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8ZM15 12c0-4 2-6 4-7M6 9c1-1 2-1 3 0s2 1 3 0',
  salad: 'M4 12h16a8 8 0 0 1-16 0ZM8 12c0-3 2-5 4-5s4 2 4 5M12 7V4M9 9c-1-1-2-1-3-2',
  bake: 'M4 6h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6ZM4 10h16M7 8h.01M10 8h.01M8 14h8',
  pan: 'M3 12h11a4 4 0 0 1 0 8H7a4 4 0 0 1-4-4v-4ZM14 14l7-3M9 8c0-1 1-1.5 1-2.5M12 8c0-1 1-1.5 1-2.5',
  fish: 'M3 12c3-4 7-6 11-6 3 0 5 2 7 6-2 4-4 6-7 6-4 0-8-2-11-6ZM17 11h.01M7 8c-1 2-1 6 0 8',
  meat: 'M7 17a5 5 0 0 1 0-10c1 0 2-4 6-4s7 3 7 7-3 7-7 7c-3 0-4 3-6 3s-4-1-4-3 2-2 4 0ZM8 12h.01',
  pancake: 'M4 9c0-2 3.6-3.5 8-3.5S20 7 20 9s-3.6 3.5-8 3.5S4 11 4 9ZM4 9v4c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5V9M9 16.5V19M14 16.5V19',
  drink: 'M6 4h12l-1.5 16.2a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L6 4ZM6.6 10h10.8',
  // служебные
  snowflake: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9M12 7l-2.5-2M12 7l2.5-2M12 17l-2.5 2M12 17l2.5 2',
  fridge: 'M6 3h12v18H6zM6 10h12M9 6.5v1.5M9 13v2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  book: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5ZM8 3v18',
  link: 'M10 13a4 4 0 0 0 6 .5l2-2a4 4 0 1 0-5.7-5.7L11 7M14 11a4 4 0 0 0-6-.5l-2 2A4 4 0 1 0 11.7 18l1.3-1.2',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  kitchen: 'M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8ZM4 8V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3M8 6h.01M12 6h.01M9 12h6',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20c0-3 3.1-5 7-5s7 2 7 5M17 11a3 3 0 1 0 0-6M18 20c0-2 .5-3.5-1-4.5',
  check: 'M5 12.5 9.5 17 19 7',
}

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Иконка блюда по его сути: суп, каша, салат, запечённое, сковорода и так далее. */
export function recipeIcon(recipe: Recipe): IconName {
  const title = recipe.title.toLowerCase()
  const has = (...words: string[]) => words.some((w) => title.includes(w))
  const uses = (...ids: string[]) => recipe.items.some((i) => ids.includes(i.ingredientId))

  if (has('суп', 'уха', 'борщ', 'бульон')) return 'soup'
  if (has('каша', 'овсян', 'пудинг', 'запеканка из кабач')) return 'porridge'
  if (has('салат', 'боул', 'хумус', 'палочки')) return 'salad'
  if (has('смузи', 'йогурт', 'кефир')) return 'drink'
  if (has('оладь', 'блин', 'сырник', 'драник', 'тост', 'запеканка')) return 'pancake'
  if (recipe.needs?.includes('oven')) return 'bake'
  if (uses('salmon', 'cod', 'pollock', 'tuna_canned', 'shrimp')) return 'fish'
  if (uses('beef', 'minced_beef', 'pork', 'chicken_thigh', 'chicken_fillet', 'minced_chicken', 'turkey_fillet', 'minced_turkey'))
    return 'meat'
  if (recipe.slots.includes('snack')) return 'apple'
  return 'pan'
}
