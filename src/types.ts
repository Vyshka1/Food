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

/**
 * Приборы, которые занимает шаг. Это ресурс расписания: два блюда не могут
 * одновременно занимать один блендер, а с двумя духовками — могут запекаться
 * параллельно. Раньше блендер был только фильтром «есть или нет», и план
 * спокойно ставил два блендерных шага в одну минуту.
 */
export type Appliance =
  | 'stove'
  | 'oven'
  | 'airfryer'
  | 'multicooker'
  | 'blender'
  | 'processor'
  | 'microwave'

export const APPLIANCE_LABEL: Record<Appliance, string> = {
  stove: 'плита',
  oven: 'духовка',
  airfryer: 'аэрогриль',
  multicooker: 'мультиварка',
  blender: 'блендер',
  processor: 'комбайн',
  microwave: 'микроволновка',
}

/** Кухня пользователя — от неё зависит точность плана готовки. */
export interface Kitchen {
  burners: number
  /** Сколько духовок: 0, 1 или 2. Две духовки реально распараллеливают запекание. */
  ovens: number
  hasAirfryer: boolean
  hasMulticooker: boolean
  hasBlender: boolean
  hasProcessor: boolean
  hasMicrowave: boolean
  hasDishwasher: boolean
  /** Сколько контейнеров есть под заготовки. */
  containers: number
  hasFreezer: boolean
}

/** Сколько таких приборов доступно одновременно. 0 — прибора нет. */
export function applianceCapacity(kitchen: Kitchen, appliance: Appliance): number {
  switch (appliance) {
    case 'stove':
      return Math.max(0, kitchen.burners)
    case 'oven':
      return Math.max(0, kitchen.ovens)
    case 'airfryer':
      return kitchen.hasAirfryer ? 1 : 0
    case 'multicooker':
      return kitchen.hasMulticooker ? 1 : 0
    case 'blender':
      return kitchen.hasBlender ? 1 : 0
    case 'processor':
      return kitchen.hasProcessor ? 1 : 0
    case 'microwave':
      return kitchen.hasMicrowave ? 1 : 0
  }
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
  /**
   * Примерный вес одной штуки. Есть и у весовых продуктов: лук продаётся на
   * вес, но на кухне его считают луковицами, и «½ средней луковицы» понятнее,
   * чем «42 г».
   */
  pieceGrams?: number
  /**
   * Вес столовой ложки, г. Для мелких количеств густого и жидкого: «1 ст. л.»
   * человек отмерит, а «21 г сметаны» будет взвешивать.
   */
  tbspGrams?: number
  /**
   * Как называть штуку в родительном падеже: «½ луковицы», «2 зубчика».
   * Пусто — используем «шт».
   */
  pieceName?: [one: string, few: string, many: string]
  /** Обычно есть дома и не попадает в список покупок. */
  staple?: boolean
}

export type Station = 'prep' | 'stove' | 'oven' | 'wait'

export interface RecipeStep {
  text: string
  /** Полная длительность шага: и активная часть, и ожидание. */
  minutes: number
  station: Station
  /** true — шаг требует рук повара всё время. */
  handsOn: boolean
  /**
   * Сколько из этих минут повар реально занят. «Варить 20 минут, помешивая» —
   * это не 20 минут работы и не ноль: булев handsOn такое описать не мог.
   */
  activeMinutes: number
  /** Какой прибор занят. Пусто — только руки или чистое ожидание. */
  appliance?: Appliance
  /** Температура, если она задана рецептом. */
  tempC?: number
  /** Можно уйти с кухни: духовка не требует присмотра, сковорода требует. */
  unattended: boolean
  /**
   * Шаги, которые должны закончиться раньше. Пусто — обычная
   * последовательность. Встроенные рецепты пока последовательны; поле есть,
   * чтобы своим рецептам можно было описать настоящую параллельность.
   */
  after?: number[]
  /**
   * Откуда взялась разметка: `derived` — выведена из текста шага правилами,
   * `checked` — проверена вручную. Нужна, чтобы неточности были находимы, а
   * не растворялись в данных.
   */
  source: 'derived' | 'checked'
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
  /**
   * Как это блюдо ведёт себя в морозилке. Заполняется правилами из состава и
   * шагов — см. lib/freezing.
   */
  freezing?: FreezingInfo
  /** Производственная партия — см. lib/batch. */
  batch?: RecipeBatch
  /** Требует духовку / блендер. Выводится из приборов в шагах. */
  needs?: ('oven' | 'blender')[]
  /** Добавлен пользователем, а не из встроенной базы. */
  custom?: boolean
}

/** Как продукт продаётся: на вес, поштучно или упаковкой. */
export type SaleForm = 'weight' | 'piece' | 'pack'

/**
 * Модель покупки — отдельно от рецепта. Рецепту всё равно, сколько граммов
 * фарша в упаковке; закупке и выбору партии — нет.
 */
export interface PurchaseInfo {
  form: SaleForm
  /** Типовые фасовки. Для мяса — 400/500/600 г. */
  packSizes: number[]
  preferredPack?: number
  /** Можно ли вскрыть упаковку и использовать часть. */
  partialUse: boolean
  /** Сколько дней живёт вскрытый остаток в холодильнике. */
  openedFridgeDays: number
  /** Можно ли заморозить сырой остаток. */
  rawFreezable: boolean
}

/**
 * Производственная партия рецепта.
 *
 * Отвечает на вопрос, которого раньше не было: сколько удобно приготовить за
 * раз. Норма человека говорит, сколько он съест, но не сколько имеет смысл
 * готовить: фарш продаётся упаковкой, форма имеет размер, кастрюля — объём.
 */
export interface RecipeBatch {
  /**
   * verified — закладка и выход выставлены осознанно, с указанием веса
   * изделия. derived — выведены правилами и годятся только для
   * приблизительного веса. Точное число изделий у derived не показывается
   * никогда: «примерно 1,8 кг» честно, «8 голубцов» — выдумка.
   */
  source: 'verified' | 'derived'
  /** Базовая закладка в долях рецепта: во сколько раз она больше одной доли. */
  baseScale: number
  /**
   * Главный неудобно делимый продукт, вокруг которого считается партия.
   * У котлет это фарш, у сырников — творог, у супа такого продукта нет.
   */
  anchorIngredientId?: string
  /** Допустимые множители закладки. */
  scales: number[]
  /** Меньше этого готовить непрактично. */
  minScale: number
  /** Приблизительный выход готового блюда, г, на одну закладку. */
  yieldGrams: number
  /** Выход в штуках на одну закладку. Только для verified. */
  yieldPieces?: number
  /** Как называть изделие: «голубец», «голубца», «голубцов». */
  pieceName?: [one: string, few: string, many: string]
  /** Готовый излишек можно заморозить. */
  freezeCooked: boolean
  /** Сырой остаток главного продукта можно заморозить. */
  freezeRawAnchor: boolean
  /**
   * Почему закладка именно такая. Человек должен понимать, отчего сервис
   * предлагает приготовить больше, чем он собирался съесть.
   */
  reason: BatchReason
}

export type BatchReason =
  /** Партия равна упаковке главного продукта: «фарш продаётся по 500 г». */
  | 'anchor-pack'
  /** Партия равна кастрюле: варить суп на одну порцию непрактично. */
  | 'pot'
  /** Партия ограничена формой: в противень больше просто не помещается. */
  | 'form'
  /** Жарится партиями на сковороде: оладьи, драники, сырники. */
  | 'pan'
  /** Делают впрок просто потому, что блюдо хорошо хранится. */
  | 'keeps'
  /** Блюдо готовят свежим, партии нет. */
  | 'fresh'

export type Storage = 'fresh' | 'fridge' | 'freezer'

/**
 * На каком этапе морозить. Котлеты замораживают сырыми — так они после
 * разморозки не разваливаются и жарятся как свежие; суп морозят готовым.
 * Разница не косметическая: она меняет и что делать на кухне, и срок.
 */
export type FreezeStage = 'raw' | 'cooked'

/**
 * Как размораживать.
 * fridge — переложить заранее в холодильник;
 * direct — греть прямо из морозилки, размораживать не нужно;
 * counter — оставить при комнатной температуре на час-другой.
 */
export type ThawMethod = 'fridge' | 'direct' | 'counter'

export const THAW_LABEL: Record<ThawMethod, string> = {
  fridge: 'переложить в холодильник заранее',
  direct: 'греть сразу из морозилки',
  counter: 'оставить при комнатной температуре',
}

export interface FreezingInfo {
  /** Сколько хранится в морозилке, дней. */
  days: number
  stage: FreezeStage
  /**
   * После какого шага морозить сырым. Есть только у stage: 'raw' — это тот
   * шаг, на котором блюдо уже сформовано, но ещё не приготовлено.
   */
  afterStep?: number
  thaw: ThawMethod
  /** За сколько часов до еды достать. Ноль — доставать заранее не нужно. */
  thawHours: number
  /** Разметка выведена правилами или проверена вручную. */
  source: 'derived' | 'checked'
}

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
  /** Сколько минут этого шага повар занят. */
  activeMinutes: number
  appliance?: Appliance
  tempC?: number
  unattended: boolean
  /** Какой повар занят шагом; null — шаг идёт сам. */
  cook: number | null
  /** Минуты от старта готовки. */
  start: number
  end: number
}

export interface FreezeTask {
  recipeId: string
  title: string
  portions: number
  eatOnDays: number[]
  /** Сколько контейнеров подписать. */
  containers: number
  stage: FreezeStage
  /** После какого шага морозить, если морозим сырым. */
  afterStep?: number
  thaw: ThawMethod
  thawHours: number
  /** Дата, до которой съесть, ISO. */
  useBy: string
  /** Готовая надпись на контейнер. */
  label: string
}

/**
 * Когда достать заготовку из морозилки. Раньше приложение говорило «убрать в
 * морозилку» и замолкало — а вопрос «когда доставать» решался человеком в
 * тот момент, когда доставать уже поздно.
 */
export interface ThawReminder {
  recipeId: string
  title: string
  /** В какой день доставать. */
  day: number
  /** На какой день еда. */
  forDay: number
  method: ThawMethod
  hours: number
}

export interface CookingPlan {
  cookDay: number
  dishes: { recipeId: string; title: string; emoji: string; portions: number }[]
  steps: PlannedStep[]
  /** Общая длительность, мин. */
  makespan: number
  /** Сколько минут повар занят целиком. */
  handsOnMinutes: number
  /** Присмотр поверх этого — идёт параллельно, складывать с handsOn нельзя. */
  attentionMinutes: number
  /** Занятые минуты каждого повара отдельно; handsOnMinutes — их сумма. */
  perCookMinutes: number[]
  /** Максимум блюд, идущих одновременно. */
  maxParallel: number
  freeze: FreezeTask[]
  /** Что и когда доставать из морозилки на этой неделе. */
  thaw: ThawReminder[]
  /** Дни, которые закрывает эта готовка. */
  coversDays: number[]
  warnings: string[]
}
