import type { DrinkKind, ExtraKind, Recipe } from '../types'

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
  | 'close'
  | 'back'
  | 'forward'
  | 'alert'
  | 'party'
  | 'pin'
  | 'thumbUp'
  | 'thumbDown'
  | 'history'
  | 'repeat'
  | 'phone'
  | 'laptop'
  | 'shield'
  | 'cup'
  | 'glass'
  | 'bread'
  | 'nuts'
  | 'yogurt'
  | 'cheese'
  | 'home'
  | 'bag'

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
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  alert: 'M12 3.5 1.8 20.5h20.4L12 3.5ZM12 10v4M12 17.5h.01',
  party: 'M4 20l5.5-13 8.5 8.5L4 20ZM14 4.5c1 .5 1.3 1.6 1 2.5M18.5 3c.6 1.2.2 2.4-.7 3M20.5 8.5c-1 .3-2 0-2.6-.8M17 12.5c.8-.9 2-1.1 3-.6',
  pin: 'M12 17.5V22M8.5 2.5h7v1.2l1.6 5.6A3.5 3.5 0 0 1 17.6 12H6.4a3.5 3.5 0 0 1 .5-2.7l1.6-5.6V2.5Z',
  thumbUp: 'M7 21V10l4.5-7c1.2.2 1.8 1 1.8 2.2L12.6 9H19a2 2 0 0 1 2 2.3l-1.1 7A2 2 0 0 1 18 20H7ZM7 10H3v11h4',
  thumbDown: 'M7 3v11l4.5 7c1.2-.2 1.8-1 1.8-2.2L12.6 15H19a2 2 0 0 0 2-2.3l-1.1-7A2 2 0 0 0 18 4H7ZM7 14H3V3h4',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v4h4M12 7.5V12l3 2',
  repeat: 'M4 9a5 5 0 0 1 5-5h9M18 4l-3-3M18 4l-3 3M20 15a5 5 0 0 1-5 5H6M6 20l3-3M6 20l3 3',
  // перенос данных: с телефона по ссылке на компьютер
  phone: 'M7 2.5h10a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1ZM10 18.5h4',
  laptop: 'M5 5.5h14a1 1 0 0 1 1 1v10H4v-10a1 1 0 0 1 1-1ZM2 16.5h20l-1.5 3H3.5l-1.5-3Z',
  shield: 'M12 2.5l8 3v6c0 5-3.4 8.8-8 10-4.6-1.2-8-5-8-10v-6l8-3Z',
  /*
   * Напитки и дополнения к столу. Своими контурами, а не эмодзи: эмодзи
   * рисуются шрифтом системы — на телефоне, на макбуке и в Windows это три
   * разных картинки, и рядом с ровным набором линий они выглядят наклейками.
   */
  cup: 'M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M3 21h14M8 5c0-1 1-1.3 1-2.2M12 5c0-1 1-1.3 1-2.2',
  glass: 'M7 3h10l-1 15.2a2 2 0 0 1-2 1.8h-4a2 2 0 0 1-2-1.8L7 3ZM7.4 9h9.2',
  bread: 'M5 9.5C5 6.5 8 5 12 5s7 1.5 7 4.5c0 1.4-1 2-2 2v6.5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V11.5c-1 0-2-.6-2-2ZM10 11.5v7M14 11.5v7',
  nuts: 'M12 3c3.5 0 6 3 6 7.5S15.5 21 12 21s-6-6-6-10.5S8.5 3 12 3ZM12 4.5v15M9 8.5c1.5 1 4.5 1 6 0M9 14c1.5 1 4.5 1 6 0',
  yogurt: 'M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 8ZM5 5.5h14v2.5H5zM10 12.5c1 .8 3 .8 4 0',
  cheese: 'M3 12.5 13 6.5l8 3.5v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4.5ZM3 12.5h18M8 15h.01M13 14h.01M17 15.5h.01',
  // где человек ест: дома, с собой в контейнере, не дома
  home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5ZM10 20v-5h4v5',
  bag: 'M3.5 8h17v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V8ZM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M3.5 12h17',
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
/** Напиток своим значком: горячее в чашке, холодное в стакане. */
export function drinkIcon(kind: DrinkKind): IconName {
  if (kind === 'wine' || kind === 'beer') return 'glass'
  if (kind === 'juice' || kind === 'soda' || kind === 'protein') return 'glass'
  return 'cup'
}

/** Дополнение к столу: то же самое для овощной тарелки, фрукта, хлеба. */
export function extraIcon(kind: ExtraKind): IconName {
  const map: Record<ExtraKind, IconName> = {
    veg_plate: 'salad',
    fruit: 'apple',
    bread: 'bread',
    nuts: 'nuts',
    yogurt: 'yogurt',
    cheese: 'cheese',
  }
  return map[kind]
}

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
