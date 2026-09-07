/** Доменная модель приложения: анкета → меню на неделю → продукты → план готовки. */

export type Allergen =
  | 'nuts'
  | 'gluten'
  | 'lactose'
  | 'peanut'
  | 'seafood'
  | 'eggs'
  | 'fish'
  | 'soy'

export const ALLERGENS: { id: Allergen; label: string; emoji: string }[] = [
  { id: 'nuts', label: 'Орехи', emoji: '🌰' },
  { id: 'gluten', label: 'Глютен', emoji: '🌾' },
  { id: 'lactose', label: 'Лактоза', emoji: '🥛' },
  { id: 'peanut', label: 'Арахис', emoji: '🥜' },
  { id: 'seafood', label: 'Морепродукты', emoji: '🦐' },
  { id: 'eggs', label: 'Яйца', emoji: '🥚' },
  { id: 'fish', label: 'Рыба', emoji: '🐟' },
  { id: 'soy', label: 'Соя', emoji: '🫘' },
]

/** «Не люблю» — мягкое ограничение: учитывается тегами продуктов. */
export const DISLIKES: { id: string; label: string; emoji: string }[] = [
  { id: 'mushrooms', label: 'Грибы', emoji: '🍄' },
  { id: 'onion', label: 'Лук', emoji: '🧅' },
  { id: 'garlic', label: 'Чеснок', emoji: '🧄' },
  { id: 'olives', label: 'Оливки', emoji: '🫒' },
  { id: 'eggplant', label: 'Баклажаны', emoji: '🍆' },
  { id: 'cilantro', label: 'Кинза', emoji: '🌿' },
  { id: 'celery', label: 'Сельдерей', emoji: '🥬' },
  { id: 'spicy', label: 'Острое', emoji: '🌶️' },
  { id: 'sugar', label: 'Сахар', emoji: '🍬' },
  { id: 'pork', label: 'Свинина', emoji: '🐷' },
  { id: 'redmeat', label: 'Красное мясо', emoji: '🥩' },
  { id: 'caffeine', label: 'Кофеин', emoji: '☕' },
]

export type Sex = 'female' | 'male'
export type Activity = 'low' | 'light' | 'medium' | 'high'
export type Goal = 'lose' | 'keep' | 'gain'

export interface Eater {
  id: string
  name: string
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: Activity
  goal: Goal
  allergies: Allergen[]
  /** Свои аллергены текстом — исключаем строго по названию продукта. */
  customAllergens: string[]
  /** id из DISLIKES либо произвольный текст, добавленный пользователем. */
  dislikes: string[]
  /** Блюда, которые не показываем в меню (recipe id). */
  bannedRecipes: string[]
  /**
   * Приёмы пищи вне дома: ключи вида `2:lunch` — среда, обед. Пусто, значит
   * человек ест дома всё. Без этого семейный расчёт покупает лишнее: Кирилл
   * обедает в офисе, а закупка всё равно считает его обед.
   */
  awayMeals: string[]
  /**
   * Оценки блюд: 1 — нравится, −1 — не нравится. Мягкая настройка подбора, в
   * отличие от bannedRecipes, который убирает блюдо совсем.
   */
  ratings: Record<string, 1 | -1>
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_SLOTS: { id: MealSlot; label: string; icon: 'sun' | 'leaf' | 'moon' | 'apple' }[] =
  [
    { id: 'breakfast', label: 'Завтрак', icon: 'sun' },
    { id: 'lunch', label: 'Обед', icon: 'leaf' },
    { id: 'dinner', label: 'Ужин', icon: 'moon' },
    { id: 'snack', label: 'Перекус', icon: 'apple' },
  ]

/** Кухня пользователя — от неё зависит точность плана готовки. */
export interface Kitchen {
  burners: number
  hasOven: boolean
  hasBlender: boolean
  /** Сколько контейнеров есть под заготовки. */
  containers: number
  hasFreezer: boolean
}

export interface Household {
  eaters: Eater[]
  /** 0 = понедельник … 6 = воскресенье. */
  cookingDays: number[]
  meals: MealSlot[]
  kitchen: Kitchen
  /** Бюджет на неделю, ₽. 0 — не ограничиваем. */
  budgetPerWeek: number
  /** Дата понедельника недели, ISO yyyy-mm-dd. */
  weekStart: string
}

export type IngredientCategory =
  | 'veg'
  | 'fruit'
  | 'meat'
  | 'fish'
  | 'dairy'
  | 'grain'
  | 'legume'
  | 'pantry'
  | 'bakery'
  | 'egg'
  | 'nuts'

export type Unit = 'g' | 'ml' | 'pcs'

export interface Ingredient {
  id: string
  name: string
  unit: Unit
  category: IngredientCategory
  /** Ккал и БЖУ на 100 г / 100 мл / 1 шт. */
  kcal: number
  protein: number
  fat: number
  carbs: number
  /** ₽ за 1000 г / 1000 мл / 1 шт. */
  price: number
  allergens: Allergen[]
  /** Теги для «не люблю»: mushrooms, pork, spicy… */
  tags: string[]
  /** Шаг фасовки в базовых единицах (пачка 200 г и т.п.). */
  pack?: number
  /** Для штучных продуктов — примерный вес одной штуки, чтобы считать вес порции. */
  pieceGrams?: number
  /** Обычно есть дома и не попадает в список покупок. */
  staple?: boolean
}

export type Station = 'prep' | 'stove' | 'oven' | 'wait'

export interface RecipeStep {
  text: string
  minutes: number
  station: Station
  /** true — шаг требует рук повара всё время. */
  handsOn: boolean
}

export interface RecipeItem {
  ingredientId: string
  /** Количество на одну порцию, в базовых единицах ингредиента. */
  qty: number
}

export interface Recipe {
  id: string
  title: string
  emoji: string
  slots: MealSlot[]
  items: RecipeItem[]
  steps: RecipeStep[]
  tags: string[]
  /** Можно замораживать порции. */
  freezable: boolean
  /** Сколько дней живёт в холодильнике. */
  fridgeDays: number
  /** Требует духовку / блендер. */
  needs?: ('oven' | 'blender')[]
  /** Добавлен пользователем, а не из встроенной базы. */
  custom?: boolean
}

export type Storage = 'fresh' | 'fridge' | 'freezer'

/** Доля одного едока в блюде: 1.0 — «стандартная» порция рецепта. */
export interface EaterPortion {
  eaterId: string
  factor: number
}

export interface MenuEntry {
  id: string
  recipeId: string
  slot: MealSlot
  /** Индекс дня недели, когда блюдо едят (0..6). */
  day: number
  /** Индекс дня недели, когда блюдо готовят. */
  cookDay: number
  /**
   * Сколько порций достаётся каждому едоку. Готовим одно блюдо, но Юлии и
   * Кириллу нужны разные объёмы — здесь и живёт вся семейная арифметика.
   */
  portions: EaterPortion[]
  storage: Storage
  /** Человек оставил блюдо: пересборка меню его не трогает. */
  pinned?: boolean
  /**
   * Что с блюдом случилось на самом деле. План и факт — разные вещи: без
   * этого «меню на неделю» остаётся намерением, а не тем, что вы ели.
   */
  status?: EntryStatus
}

export type EntryStatus = 'cooked' | 'eaten' | 'skipped'

export const ENTRY_STATUS: { id: EntryStatus; label: string; icon: 'pot' | 'check' | 'ban' }[] = [
  { id: 'cooked', label: 'Приготовлено', icon: 'pot' },
  { id: 'eaten', label: 'Съедено', icon: 'check' },
  { id: 'skipped', label: 'Пропущено', icon: 'ban' },
]

/**
 * Сохранённая неделя. Держим меню целиком, чтобы удачную неделю можно было
 * повторить, а не собирать заново на тот же seed и получить другое.
 */
export interface WeekRecord {
  id: string
  weekStart: string
  savedAt: string
  menu: WeekMenu
  /** Сколько блюд отмечено приготовленными, съеденными и пропущенными. */
  cooked: number
  eaten: number
  skipped: number
  total: number
}

export interface WeekMenu {
  weekStart: string
  seed: number
  entries: MenuEntry[]
}

export interface Norms {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export interface ShoppingLine {
  ingredientId: string
  name: string
  category: IngredientCategory
  unit: Unit
  /** Нужно по рецептам. */
  needed: number
  /** Купить с учётом фасовки. */
  buy: number
  packs?: { count: number; size: number }
  price: number
  staple: boolean
}

export interface PlannedStep {
  recipeId: string
  title: string
  emoji: string
  stepIndex: number
  text: string
  station: Station
  handsOn: boolean
  /** Минуты от старта готовки. */
  start: number
  end: number
}

export interface FreezeTask {
  recipeId: string
  title: string
  portions: number
  eatOnDays: number[]
}

export interface CookingPlan {
  cookDay: number
  dishes: { recipeId: string; title: string; emoji: string; portions: number }[]
  steps: PlannedStep[]
  /** Общая длительность, мин. */
  makespan: number
  /** Сколько минут повар реально занят руками. */
  handsOnMinutes: number
  /** Максимум блюд, идущих одновременно. */
  maxParallel: number
  freeze: FreezeTask[]
  /** Дни, которые закрывает эта готовка. */
  coversDays: number[]
  warnings: string[]
}
