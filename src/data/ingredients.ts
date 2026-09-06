import type { Allergen, Ingredient, IngredientCategory, Unit } from '../types'

interface Opts {
  allergens?: Allergen[]
  tags?: string[]
  pack?: number
  staple?: boolean
}

/** Ккал/БЖУ — на 100 г, 100 мл или 1 шт. Цена — за 1000 г, 1000 мл или 1 шт. */
function ing(
  id: string,
  name: string,
  unit: Unit,
  category: IngredientCategory,
  nutrition: [kcal: number, protein: number, fat: number, carbs: number],
  price: number,
  opts: Opts = {},
): Ingredient {
  const [kcal, protein, fat, carbs] = nutrition
  return {
    id,
    name,
    unit,
    category,
    kcal,
    protein,
    fat,
    carbs,
    price,
    allergens: opts.allergens ?? [],
    tags: opts.tags ?? [],
    pack: opts.pack,
    staple: opts.staple,
  }
}

export const INGREDIENTS: Ingredient[] = [
  // Овощи и зелень
  ing('onion', 'Лук', 'g', 'veg', [41, 1.4, 0.2, 8.2], 48, { tags: ['onion'] }),
  ing('garlic', 'Чеснок', 'g', 'veg', [143, 6.5, 0.5, 26], 300, { tags: ['garlic'] }),
  ing('carrot', 'Морковь', 'g', 'veg', [35, 1.3, 0.1, 6.9], 31),
  ing('potato', 'Картофель', 'g', 'veg', [77, 2, 0.4, 16.3], 50),
  ing('tomato', 'Помидор', 'g', 'veg', [20, 1.1, 0.2, 3.7], 119),
  ing('cucumber', 'Огурец', 'g', 'veg', [14, 0.8, 0.1, 2.5], 140),
  ing('bell_pepper', 'Болгарский перец', 'g', 'veg', [27, 1.3, 0.1, 5.3], 275),
  ing('zucchini', 'Кабачок', 'g', 'veg', [24, 0.6, 0.3, 4.6], 100),
  ing('cabbage', 'Белокочанная капуста', 'g', 'veg', [28, 1.8, 0.1, 4.7], 28),
  ing('broccoli', 'Брокколи', 'g', 'veg', [34, 3, 0.4, 4.2], 350),
  ing('cauliflower', 'Цветная капуста', 'g', 'veg', [30, 2.5, 0.3, 4.2], 220),
  ing('beet', 'Свёкла', 'g', 'veg', [43, 1.6, 0.2, 8.8], 45),
  ing('pumpkin', 'Тыква', 'g', 'veg', [26, 1, 0.1, 4.4], 90),
  ing('spinach', 'Шпинат', 'g', 'veg', [23, 2.9, 0.4, 2], 600, { pack: 200 }),
  ing('greens', 'Укроп и петрушка', 'g', 'veg', [38, 2.5, 0.5, 6.3], 900, { pack: 50 }),
  ing('lettuce', 'Салат листовой', 'g', 'veg', [15, 1.4, 0.2, 1.8], 500, { pack: 150 }),
  ing('celery', 'Сельдерей', 'g', 'veg', [16, 0.7, 0.2, 3], 250, { tags: ['celery'] }),
  ing('mushrooms', 'Шампиньоны', 'g', 'veg', [27, 4.3, 1, 1], 350, { tags: ['mushrooms'] }),
  ing('green_beans', 'Стручковая фасоль', 'g', 'veg', [31, 1.8, 0.1, 7], 300, { pack: 400 }),
  ing('green_peas', 'Зелёный горошек', 'g', 'veg', [73, 5, 0.2, 12.8], 200, { pack: 400 }),
  ing('corn', 'Кукуруза консервированная', 'g', 'veg', [58, 2.2, 0.4, 11.2], 300, { pack: 340 }),
  ing('avocado', 'Авокадо', 'pcs', 'veg', [230, 2.8, 21, 3], 130),
  ing('cherry_tomato', 'Черри', 'g', 'veg', [20, 1.1, 0.2, 3.7], 500, { pack: 250 }),
  ing('eggplant', 'Баклажан', 'g', 'veg', [24, 1.2, 0.2, 4.5], 200, { tags: ['eggplant'] }),
  ing('olives', 'Оливки', 'g', 'veg', [115, 0.8, 10.7, 6.3], 900, { tags: ['olives'], pack: 300 }),
  ing('cilantro', 'Кинза', 'g', 'veg', [23, 2.1, 0.5, 3.7], 900, { tags: ['cilantro'], pack: 50 }),
  ing('green_onion', 'Зелёный лук', 'g', 'veg', [32, 1.8, 0.1, 6.5], 700, { tags: ['onion'], pack: 100 }),
  ing('ginger', 'Имбирь', 'g', 'veg', [80, 1.8, 0.8, 15.8], 600, { pack: 100 }),
  ing('chili', 'Перец чили', 'g', 'veg', [40, 2, 0.2, 9.5], 800, { tags: ['spicy'], pack: 50 }),

  // Фрукты и ягоды
  ing('apple', 'Яблоко', 'pcs', 'fruit', [72, 0.4, 0.2, 17], 25),
  ing('banana', 'Банан', 'pcs', 'fruit', [105, 1.3, 0.4, 27], 25),
  ing('lemon', 'Лимон', 'g', 'fruit', [29, 1.1, 0.3, 9.3], 250),
  ing('orange', 'Апельсин', 'pcs', 'fruit', [62, 1.2, 0.2, 15.4], 40),
  ing('pear', 'Груша', 'pcs', 'fruit', [101, 0.6, 0.2, 27], 45),
  ing('berries', 'Ягоды замороженные', 'g', 'fruit', [50, 0.8, 0.4, 10], 450, { pack: 300 }),
  ing('raisins', 'Изюм', 'g', 'fruit', [299, 3.1, 0.5, 79], 400, { pack: 200 }),
  ing('dates', 'Финики', 'g', 'fruit', [277, 1.8, 0.2, 75], 700, { pack: 250 }),

  // Мясо и птица
  ing('chicken_fillet', 'Куриное филе', 'g', 'meat', [113, 23.6, 1.9, 0.4], 450, { pack: 500 }),
  ing('chicken_thigh', 'Куриное бедро', 'g', 'meat', [185, 17, 13, 0], 350, { pack: 500 }),
  ing('minced_chicken', 'Фарш куриный', 'g', 'meat', [143, 17.4, 8, 0], 400, { pack: 400 }),
  ing('turkey_fillet', 'Филе индейки', 'g', 'meat', [104, 19.2, 2.8, 0], 550, { pack: 500 }),
  ing('beef', 'Говядина', 'g', 'meat', [187, 18.9, 12.4, 0], 750, { tags: ['redmeat'], pack: 500 }),
  ing('minced_beef', 'Фарш говяжий', 'g', 'meat', [254, 17.2, 20, 0], 700, { tags: ['redmeat'], pack: 400 }),
  ing('pork', 'Свинина', 'g', 'meat', [259, 16, 21.5, 0], 450, { tags: ['pork', 'redmeat'], pack: 500 }),

  // Рыба
  ing('salmon', 'Лосось', 'g', 'fish', [208, 20, 13.4, 0], 1400, { allergens: ['fish'], pack: 300 }),
  ing('cod', 'Треска', 'g', 'fish', [82, 17.8, 0.7, 0], 600, { allergens: ['fish'], pack: 400 }),
  ing('tuna_canned', 'Тунец консервированный', 'g', 'fish', [116, 25.5, 1, 0], 900, {
    allergens: ['fish'],
    pack: 185,
  }),
  ing('shrimp', 'Креветки', 'g', 'fish', [99, 20.5, 1.7, 0], 1200, { allergens: ['seafood'], pack: 400 }),

  // Молочное и яйца
  ing('milk', 'Молоко', 'ml', 'dairy', [52, 3.2, 2.5, 4.7], 90, { allergens: ['lactose'], pack: 1000 }),
  ing('kefir', 'Кефир', 'ml', 'dairy', [51, 3, 2.5, 4], 110, { allergens: ['lactose'], pack: 900 }),
  ing('greek_yogurt', 'Греческий йогурт', 'g', 'dairy', [59, 10, 0.4, 3.6], 500, {
    allergens: ['lactose'],
    pack: 130,
  }),
  ing('cottage_cheese', 'Творог 5%', 'g', 'dairy', [121, 17, 5, 1.8], 400, {
    allergens: ['lactose'],
    pack: 200,
  }),
  ing('sour_cream', 'Сметана 15%', 'g', 'dairy', [162, 2.6, 15, 3.6], 350, {
    allergens: ['lactose'],
    pack: 300,
  }),
  ing('butter', 'Масло сливочное', 'g', 'dairy', [748, 0.5, 82.5, 0.8], 1100, {
    allergens: ['lactose'],
    pack: 180,
  }),
  ing('cheese', 'Сыр твёрдый', 'g', 'dairy', [364, 24, 29, 0.3], 900, { allergens: ['lactose'], pack: 200 }),
  ing('cream_10', 'Сливки 10%', 'ml', 'dairy', [118, 3, 10, 4], 300, { allergens: ['lactose'], pack: 500 }),
  ing('oat_milk', 'Овсяное молоко', 'ml', 'dairy', [45, 0.5, 1.5, 7], 200, { pack: 1000 }),
  ing('egg', 'Яйцо', 'pcs', 'egg', [72, 6.3, 5, 0.4], 15, { allergens: ['eggs'], pack: 10 }),

  // Крупы, мука, хлеб
  ing('oats', 'Овсяные хлопья', 'g', 'grain', [352, 12.3, 6.2, 59.5], 120, {
    allergens: ['gluten'],
    pack: 500,
  }),
  ing('rice', 'Рис', 'g', 'grain', [344, 6.7, 0.7, 78.9], 150, { pack: 900 }),
  ing('buckwheat', 'Гречка', 'g', 'grain', [343, 12.6, 3.3, 62.1], 130, { pack: 900 }),
  ing('pasta', 'Паста', 'g', 'grain', [344, 10.4, 1.1, 71.5], 180, { allergens: ['gluten'], pack: 400 }),
  ing('bulgur', 'Булгур', 'g', 'grain', [342, 12.3, 1.3, 63.4], 200, { allergens: ['gluten'], pack: 500 }),
  ing('quinoa', 'Киноа', 'g', 'grain', [368, 14.1, 6.1, 57.2], 700, { pack: 400 }),
  ing('flour', 'Мука', 'g', 'grain', [342, 10.3, 1.1, 70.6], 70, { allergens: ['gluten'], pack: 1000 }),
  ing('bread', 'Хлеб цельнозерновой', 'g', 'bakery', [229, 8.5, 3.3, 40], 200, {
    allergens: ['gluten'],
    pack: 400,
  }),
  ing('tortilla', 'Тортилья', 'pcs', 'bakery', [150, 4, 3.5, 25], 40, { allergens: ['gluten'], pack: 6 }),
  ing('breadcrumbs', 'Панировочные сухари', 'g', 'grain', [347, 11, 2, 72], 200, {
    allergens: ['gluten'],
    pack: 200,
  }),

  // Бобовые
  ing('lentils', 'Чечевица', 'g', 'legume', [295, 24, 1.5, 46.3], 200, { pack: 450 }),
  ing('chickpeas', 'Нут', 'g', 'legume', [364, 19, 6, 61], 220, { pack: 450 }),
  ing('beans_canned', 'Фасоль консервированная', 'g', 'legume', [99, 6.7, 0.5, 17.3], 250, { pack: 400 }),
  ing('tofu', 'Тофу', 'g', 'legume', [76, 8, 4.8, 1.9], 700, { allergens: ['soy'], pack: 300 }),

  // Орехи и семечки
  ing('walnuts', 'Грецкие орехи', 'g', 'nuts', [654, 15.2, 65.2, 7], 1500, {
    allergens: ['nuts'],
    pack: 150,
  }),
  ing('almonds', 'Миндаль', 'g', 'nuts', [579, 21.2, 49.9, 9.5], 1800, { allergens: ['nuts'], pack: 150 }),
  ing('peanut_butter', 'Арахисовая паста', 'g', 'nuts', [588, 25, 50, 20], 900, {
    allergens: ['peanut'],
    pack: 300,
  }),
  ing('sesame', 'Кунжут', 'g', 'nuts', [573, 17.7, 49.7, 23.4], 700, { pack: 100 }),
  ing('pumpkin_seeds', 'Тыквенные семечки', 'g', 'nuts', [559, 30.2, 49, 10.7], 900, { pack: 150 }),

  // Бакалея
  ing('olive_oil', 'Оливковое масло', 'ml', 'pantry', [884, 0, 100, 0], 900, { staple: true, pack: 500 }),
  ing('sunflower_oil', 'Подсолнечное масло', 'ml', 'pantry', [899, 0, 99.9, 0], 150, {
    staple: true,
    pack: 1000,
  }),
  ing('salt', 'Соль', 'g', 'pantry', [0, 0, 0, 0], 30, { staple: true, pack: 1000 }),
  ing('pepper', 'Чёрный перец', 'g', 'pantry', [251, 10, 3.3, 38.3], 2000, { staple: true, pack: 50 }),
  ing('paprika', 'Паприка', 'g', 'pantry', [282, 14.1, 12.9, 34], 1500, { staple: true, pack: 50 }),
  ing('curry', 'Карри', 'g', 'pantry', [325, 12.7, 13.8, 58.2], 2000, { staple: true, pack: 50 }),
  ing('dried_herbs', 'Прованские травы', 'g', 'pantry', [265, 9, 7, 40], 2000, { staple: true, pack: 20 }),
  ing('vinegar', 'Уксус', 'ml', 'pantry', [18, 0, 0, 0.4], 200, { staple: true, pack: 500 }),
  ing('baking_powder', 'Разрыхлитель', 'g', 'pantry', [80, 0, 0, 20], 1500, { staple: true, pack: 10 }),
  ing('sugar', 'Сахар', 'g', 'pantry', [399, 0, 0, 99.8], 80, { staple: true, tags: ['sugar'], pack: 900 }),
  ing('honey', 'Мёд', 'g', 'pantry', [304, 0.3, 0, 82.4], 900, { tags: ['sugar'], pack: 250 }),
  ing('soy_sauce', 'Соевый соус', 'ml', 'pantry', [53, 8.1, 0.6, 4.1], 400, {
    allergens: ['soy'],
    pack: 200,
  }),
  ing('mustard', 'Горчица', 'g', 'pantry', [143, 9.9, 12.7, 5.3], 400, { pack: 180 }),
  ing('tomato_paste', 'Томатная паста', 'g', 'pantry', [82, 4.3, 0.5, 18.9], 250, { pack: 250 }),
  ing('canned_tomatoes', 'Томаты в собственном соку', 'g', 'pantry', [32, 1.6, 0.2, 5.2], 250, {
    pack: 400,
  }),
  ing('coconut_milk', 'Кокосовое молоко', 'ml', 'pantry', [197, 2, 21, 2.8], 400, { pack: 400 }),
  ing('cocoa', 'Какао', 'g', 'pantry', [228, 19.6, 13.7, 38.4], 1200, { pack: 100 }),
  ing('vegetable_broth', 'Овощной бульон (кубик)', 'g', 'pantry', [200, 8, 12, 15], 1500, {
    staple: true,
    pack: 60,
  }),
]

export const INGREDIENT_BY_ID: Record<string, Ingredient> = Object.fromEntries(
  INGREDIENTS.map((i) => [i.id, i]),
)

export const CATEGORY_LABEL: Record<IngredientCategory, string> = {
  veg: 'Овощи и зелень',
  fruit: 'Фрукты и ягоды',
  meat: 'Мясо и птица',
  fish: 'Рыба',
  dairy: 'Молочное',
  egg: 'Яйца',
  grain: 'Крупы и мука',
  legume: 'Бобовые',
  bakery: 'Хлеб',
  nuts: 'Орехи и семечки',
  pantry: 'Бакалея',
}

export const CATEGORY_ORDER: IngredientCategory[] = [
  'veg',
  'fruit',
  'meat',
  'fish',
  'dairy',
  'egg',
  'grain',
  'legume',
  'bakery',
  'nuts',
  'pantry',
]
