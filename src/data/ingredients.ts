import type { Allergen, Ingredient, IngredientCategory, Unit } from '../types'

interface Opts {
  allergens?: Allergen[]
  tags?: string[]
  pack?: number
  staple?: boolean
  pieceGrams?: number
  tbspGrams?: number
  pieceName?: [string, string, string]
}

/**
 * Ккал/БЖУ и клетчатка — на 100 г, 100 мл или 1 шт. Цена — за 1000 г, 1000 мл
 * или 1 шт. Клетчатка взята из обычных таблиц состава: у круп и бобовых — в
 * сухом виде, у штучного (яблоко, авокадо) — на штуку, у мяса, рыбы, яиц и
 * масел она равна нулю не по недосмотру, а потому что её там нет.
 */
function ing(
  id: string,
  name: string,
  unit: Unit,
  category: IngredientCategory,
  nutrition: [kcal: number, protein: number, fat: number, carbs: number, fiber: number],
  price: number,
  opts: Opts = {},
): Ingredient {
  const [kcal, protein, fat, carbs, fiber] = nutrition
  return {
    id,
    name,
    unit,
    category,
    kcal,
    protein,
    fat,
    carbs,
    fiber,
    price,
    allergens: opts.allergens ?? [],
    tags: opts.tags ?? [],
    pack: opts.pack,
    staple: opts.staple,
    pieceGrams: opts.pieceGrams,
    tbspGrams: opts.tbspGrams,
    pieceName: opts.pieceName,
  }
}

export const INGREDIENTS: Ingredient[] = [
  // Овощи и зелень
  ing('onion', 'Лук', 'g', 'veg', [41, 1.4, 0.2, 8.2, 1.7], 48, { tags: ['onion'], pieceGrams: 90, pieceName: ['луковица', 'луковицы', 'луковиц'] }),
  ing('garlic', 'Чеснок', 'g', 'veg', [143, 6.5, 0.5, 26, 2.1], 300, { tags: ['garlic'], pieceGrams: 4, pieceName: ['зубчик', 'зубчика', 'зубчиков'] }),
  ing('carrot', 'Морковь', 'g', 'veg', [35, 1.3, 0.1, 6.9, 2.8], 31, { pieceGrams: 85, pieceName: ['морковка', 'морковки', 'морковок'] }),
  ing('potato', 'Картофель', 'g', 'veg', [77, 2, 0.4, 16.3, 2.2], 50, { pieceGrams: 110, pieceName: ['картофелина', 'картофелины', 'картофелин'] }),
  ing('tomato', 'Помидор', 'g', 'veg', [20, 1.1, 0.2, 3.7, 1.2], 119, { pieceGrams: 110, pieceName: ['помидор', 'помидора', 'помидоров'] }),
  ing('cucumber', 'Огурец', 'g', 'veg', [14, 0.8, 0.1, 2.5, 0.5], 140, { pieceGrams: 120, pieceName: ['огурец', 'огурца', 'огурцов'] }),
  ing('bell_pepper', 'Болгарский перец', 'g', 'veg', [27, 1.3, 0.1, 5.3, 2.1], 275, { pieceGrams: 150, pieceName: ['перец', 'перца', 'перцев'] }),
  ing('zucchini', 'Кабачок', 'g', 'veg', [24, 0.6, 0.3, 4.6, 1.0], 100, { pieceGrams: 300, pieceName: ['кабачок', 'кабачка', 'кабачков'] }),
  ing('cabbage', 'Белокочанная капуста', 'g', 'veg', [28, 1.8, 0.1, 4.7, 2.5], 28),
  ing('broccoli', 'Брокколи', 'g', 'veg', [34, 3, 0.4, 4.2, 2.6], 350),
  ing('cauliflower', 'Цветная капуста', 'g', 'veg', [30, 2.5, 0.3, 4.2, 2.0], 220),
  ing('beet', 'Свёкла', 'g', 'veg', [43, 1.6, 0.2, 8.8, 2.8], 45, { pieceGrams: 150, pieceName: ['свёкла', 'свёклы', 'свёкол'] }),
  ing('pumpkin', 'Тыква', 'g', 'veg', [26, 1, 0.1, 4.4, 0.5], 90),
  ing('spinach', 'Шпинат', 'g', 'veg', [23, 2.9, 0.4, 2, 2.2], 600, { pack: 200 }),
  ing('greens', 'Укроп и петрушка', 'g', 'veg', [38, 2.5, 0.5, 6.3, 2.8], 900, { pack: 50 }),
  ing('lettuce', 'Салат листовой', 'g', 'veg', [15, 1.4, 0.2, 1.8, 1.3], 500, { pack: 150 }),
  ing('celery', 'Сельдерей', 'g', 'veg', [16, 0.7, 0.2, 3, 1.6], 250, { tags: ['celery'] }),
  ing('mushrooms', 'Шампиньоны', 'g', 'veg', [27, 4.3, 1, 1, 1.0], 350, { tags: ['mushrooms'] }),
  ing('green_beans', 'Стручковая фасоль', 'g', 'veg', [31, 1.8, 0.1, 7, 3.4], 300, { pack: 400 }),
  ing('green_peas', 'Зелёный горошек', 'g', 'veg', [73, 5, 0.2, 12.8, 5.1], 200, { pack: 400 }),
  ing('corn', 'Кукуруза консервированная', 'g', 'veg', [58, 2.2, 0.4, 11.2, 2.4], 300, { pack: 340 }),
  ing('avocado', 'Авокадо', 'pcs', 'veg', [230, 2.8, 21, 3, 9.0], 130, { pieceGrams: 200 }),
  ing('cherry_tomato', 'Черри', 'g', 'veg', [20, 1.1, 0.2, 3.7, 1.2], 500, { pack: 250 }),
  ing('eggplant', 'Баклажан', 'g', 'veg', [24, 1.2, 0.2, 4.5, 3.0], 200, { tags: ['eggplant'], pieceGrams: 250, pieceName: ['баклажан', 'баклажана', 'баклажанов'] }),
  ing('olives', 'Оливки', 'g', 'veg', [115, 0.8, 10.7, 6.3, 3.2], 900, { tags: ['olives'], pack: 300 }),
  ing('cilantro', 'Кинза', 'g', 'veg', [23, 2.1, 0.5, 3.7, 2.8], 900, { tags: ['cilantro'], pack: 50 }),
  ing('green_onion', 'Зелёный лук', 'g', 'veg', [32, 1.8, 0.1, 6.5, 1.8], 700, { tags: ['onion'], pack: 100 }),
  ing('ginger', 'Имбирь', 'g', 'veg', [80, 1.8, 0.8, 15.8, 2.0], 600, { pack: 100 }),
  ing('chili', 'Перец чили', 'g', 'veg', [40, 2, 0.2, 9.5, 1.5], 800, { tags: ['spicy'], pack: 50, pieceGrams: 15, pieceName: ['стручок', 'стручка', 'стручков'] }),

  // Фрукты и ягоды
  ing('apple', 'Яблоко', 'pcs', 'fruit', [72, 0.4, 0.2, 17, 4.0], 25, { pieceGrams: 180 }),
  ing('banana', 'Банан', 'pcs', 'fruit', [105, 1.3, 0.4, 27, 3.1], 25, { pieceGrams: 120 }),
  ing('lemon', 'Лимон', 'g', 'fruit', [29, 1.1, 0.3, 9.3, 2.8], 250, { pieceGrams: 100, pieceName: ['лимон', 'лимона', 'лимонов'] }),
  ing('orange', 'Апельсин', 'pcs', 'fruit', [62, 1.2, 0.2, 15.4, 3.1], 40, { pieceGrams: 150 }),
  ing('pear', 'Груша', 'pcs', 'fruit', [101, 0.6, 0.2, 27, 5.5], 45, { pieceGrams: 180 }),
  ing('berries', 'Ягоды замороженные', 'g', 'fruit', [50, 0.8, 0.4, 10, 4.0], 450, { pack: 300 }),
  ing('raisins', 'Изюм', 'g', 'fruit', [299, 3.1, 0.5, 79, 3.7], 400, { pack: 200 }),
  ing('dates', 'Финики', 'g', 'fruit', [277, 1.8, 0.2, 75, 8.0], 700, { pack: 250 }),

  // Мясо и птица
  ing('chicken_fillet', 'Куриное филе', 'g', 'meat', [113, 23.6, 1.9, 0.4, 0], 450, { pack: 500 }),
  ing('chicken_thigh', 'Куриное бедро', 'g', 'meat', [185, 17, 13, 0, 0], 350, { pack: 500 }),
  ing('minced_chicken', 'Фарш куриный', 'g', 'meat', [143, 17.4, 8, 0, 0], 400, { pack: 400 }),
  ing('turkey_fillet', 'Филе индейки', 'g', 'meat', [104, 19.2, 2.8, 0, 0], 550, { pack: 500 }),
  ing('beef', 'Говядина', 'g', 'meat', [187, 18.9, 12.4, 0, 0], 750, { tags: ['redmeat'], pack: 500 }),
  ing('minced_beef', 'Фарш говяжий', 'g', 'meat', [254, 17.2, 20, 0, 0], 700, { tags: ['redmeat'], pack: 400 }),
  ing('pork', 'Свинина', 'g', 'meat', [259, 16, 21.5, 0, 0], 450, { tags: ['pork', 'redmeat'], pack: 500 }),

  // Рыба
  ing('salmon', 'Лосось', 'g', 'fish', [208, 20, 13.4, 0, 0], 1400, { allergens: ['fish'], pack: 300 }),
  ing('cod', 'Треска', 'g', 'fish', [82, 17.8, 0.7, 0, 0], 600, { allergens: ['fish'], pack: 400 }),
  ing('tuna_canned', 'Тунец консервированный', 'g', 'fish', [116, 25.5, 1, 0, 0], 900, {
    allergens: ['fish'],
    pack: 185,
  }),
  ing('shrimp', 'Креветки', 'g', 'fish', [99, 20.5, 1.7, 0, 0], 1200, { allergens: ['seafood'], pack: 400 }),

  // Молочное и яйца
  ing('milk', 'Молоко', 'ml', 'dairy', [52, 3.2, 2.5, 4.7, 0], 90, { allergens: ['lactose'], pack: 1000 }),
  ing('kefir', 'Кефир', 'ml', 'dairy', [51, 3, 2.5, 4, 0], 110, { allergens: ['lactose'], pack: 900 }),
  ing('greek_yogurt', 'Греческий йогурт', 'g', 'dairy', [59, 10, 0.4, 3.6, 0], 500, {
    allergens: ['lactose'],
    pack: 130,
  }),
  ing('cottage_cheese', 'Творог 5%', 'g', 'dairy', [121, 17, 5, 1.8, 0], 400, {
    allergens: ['lactose'],
    pack: 200,
  }),
  ing('sour_cream', 'Сметана 15%', 'g', 'dairy', [162, 2.6, 15, 3.6, 0], 350, {
    allergens: ['lactose'],
    pack: 300,
    tbspGrams: 25,
  }),
  ing('butter', 'Масло сливочное', 'g', 'dairy', [748, 0.5, 82.5, 0.8, 0], 1100, {
    allergens: ['lactose'],
    pack: 180,
    tbspGrams: 20,
  }),
  ing('cheese', 'Сыр твёрдый', 'g', 'dairy', [364, 24, 29, 0.3, 0], 900, { allergens: ['lactose'], pack: 200 }),
  ing('cream_10', 'Сливки 10%', 'ml', 'dairy', [118, 3, 10, 4, 0], 300, { allergens: ['lactose'], pack: 500 }),
  ing('oat_milk', 'Овсяное молоко', 'ml', 'dairy', [45, 0.5, 1.5, 7, 0.8], 200, { pack: 1000 }),
  ing('egg', 'Яйцо', 'pcs', 'egg', [72, 6.3, 5, 0.4, 0], 15, { allergens: ['eggs'], pack: 10, pieceGrams: 55 }),

  // Крупы, мука, хлеб
  ing('oats', 'Овсяные хлопья', 'g', 'grain', [352, 12.3, 6.2, 59.5, 10.0], 120, {
    allergens: ['gluten'],
    pack: 500,
  }),
  ing('rice', 'Рис', 'g', 'grain', [344, 6.7, 0.7, 78.9, 1.3], 150, { pack: 900 }),
  ing('buckwheat', 'Гречка', 'g', 'grain', [343, 12.6, 3.3, 62.1, 10.0], 130, { pack: 900 }),
  ing('pasta', 'Паста', 'g', 'grain', [344, 10.4, 1.1, 71.5, 3.2], 180, { allergens: ['gluten'], pack: 400 }),
  ing('bulgur', 'Булгур', 'g', 'grain', [342, 12.3, 1.3, 63.4, 12.5], 200, { allergens: ['gluten'], pack: 500 }),
  ing('quinoa', 'Киноа', 'g', 'grain', [368, 14.1, 6.1, 57.2, 7.0], 700, { pack: 400 }),
  ing('flour', 'Мука', 'g', 'grain', [342, 10.3, 1.1, 70.6, 2.7], 70, { allergens: ['gluten'], pack: 1000, tbspGrams: 30 }),
  ing('bread', 'Хлеб цельнозерновой', 'g', 'bakery', [229, 8.5, 3.3, 40, 7.0], 200, {
    allergens: ['gluten'],
    pack: 400,
  }),
  ing('tortilla', 'Тортилья', 'pcs', 'bakery', [150, 4, 3.5, 25, 2.0], 40, { allergens: ['gluten'], pack: 6, pieceGrams: 45 }),
  ing('breadcrumbs', 'Панировочные сухари', 'g', 'grain', [347, 11, 2, 72, 3.5], 200, {
    allergens: ['gluten'],
    pack: 200,
    tbspGrams: 15,
  }),

  // Бобовые
  ing('lentils', 'Чечевица', 'g', 'legume', [295, 24, 1.5, 46.3, 30.0], 200, { pack: 450 }),
  ing('chickpeas', 'Нут', 'g', 'legume', [364, 19, 6, 61, 17.0], 220, { pack: 450 }),
  ing('beans_canned', 'Фасоль консервированная', 'g', 'legume', [99, 6.7, 0.5, 17.3, 6.0], 250, { pack: 400 }),
  ing('tofu', 'Тофу', 'g', 'legume', [76, 8, 4.8, 1.9, 0.9], 700, { allergens: ['soy'], pack: 300 }),

  // Орехи и семечки
  ing('walnuts', 'Грецкие орехи', 'g', 'nuts', [654, 15.2, 65.2, 7, 6.7], 1500, {
    allergens: ['nuts'],
    pack: 150,
  }),
  ing('almonds', 'Миндаль', 'g', 'nuts', [579, 21.2, 49.9, 9.5, 12.5], 1800, { allergens: ['nuts'], pack: 150 }),
  ing('peanut_butter', 'Арахисовая паста', 'g', 'nuts', [588, 25, 50, 20, 6.0], 900, {
    allergens: ['peanut'],
    pack: 300,
  }),
  ing('sesame', 'Кунжут', 'g', 'nuts', [573, 17.7, 49.7, 23.4, 11.8], 700, { pack: 100, tbspGrams: 10 }),
  ing('pumpkin_seeds', 'Тыквенные семечки', 'g', 'nuts', [559, 30.2, 49, 10.7, 6.0], 900, { pack: 150 }),

  // Бакалея
  ing('olive_oil', 'Оливковое масло', 'ml', 'pantry', [884, 0, 100, 0, 0], 900, { staple: true, pack: 500, tbspGrams: 17 }),
  ing('sunflower_oil', 'Подсолнечное масло', 'ml', 'pantry', [899, 0, 99.9, 0, 0], 150, {
    staple: true,
    pack: 1000,
    tbspGrams: 17,
  }),
  ing('ghee', 'Топлёное масло гхи', 'g', 'pantry', [900, 0, 99.8, 0, 0], 1600, {
    staple: true,
    pack: 400,
    tbspGrams: 17,
  }),
  ing('coconut_oil', 'Кокосовое масло', 'ml', 'pantry', [899, 0, 99.9, 0, 0], 1200, {
    staple: true,
    pack: 500,
    tbspGrams: 17,
  }),
  ing('salt', 'Соль', 'g', 'pantry', [0, 0, 0, 0, 0], 30, { staple: true, pack: 1000 }),
  ing('pepper', 'Чёрный перец', 'g', 'pantry', [251, 10, 3.3, 38.3, 25.0], 2000, { staple: true, pack: 50 }),
  ing('paprika', 'Паприка', 'g', 'pantry', [282, 14.1, 12.9, 34, 35.0], 1500, { staple: true, pack: 50 }),
  ing('curry', 'Карри', 'g', 'pantry', [325, 12.7, 13.8, 58.2, 33.0], 2000, { staple: true, pack: 50 }),
  ing('dried_herbs', 'Прованские травы', 'g', 'pantry', [265, 9, 7, 40, 40.0], 2000, { staple: true, pack: 20 }),
  ing('vinegar', 'Уксус', 'ml', 'pantry', [18, 0, 0, 0.4, 0], 200, { staple: true, pack: 500, tbspGrams: 15 }),
  ing('baking_powder', 'Разрыхлитель', 'g', 'pantry', [80, 0, 0, 20, 0], 1500, { staple: true, pack: 10 }),
  ing('sugar', 'Сахар', 'g', 'pantry', [399, 0, 0, 99.8, 0], 80, { staple: true, tags: ['sugar'], pack: 900, tbspGrams: 25 }),
  ing('honey', 'Мёд', 'g', 'pantry', [304, 0.3, 0, 82.4, 0.2], 900, { tags: ['sugar'], pack: 250, tbspGrams: 30 }),
  ing('soy_sauce', 'Соевый соус', 'ml', 'pantry', [53, 8.1, 0.6, 4.1, 0.8], 400, {
    allergens: ['soy'],
    pack: 200,
  }),
  ing('mustard', 'Горчица', 'g', 'pantry', [143, 9.9, 12.7, 5.3, 4.0], 400, { pack: 180, tbspGrams: 20 }),
  ing('tomato_paste', 'Томатная паста', 'g', 'pantry', [82, 4.3, 0.5, 18.9, 4.5], 250, { pack: 250, tbspGrams: 30 }),
  ing('canned_tomatoes', 'Томаты в собственном соку', 'g', 'pantry', [32, 1.6, 0.2, 5.2, 1.3], 250, {
    pack: 400,
  }),
  ing('coconut_milk', 'Кокосовое молоко', 'ml', 'pantry', [197, 2, 21, 2.8, 2.2], 400, { pack: 400 }),
  ing('cocoa', 'Какао', 'g', 'pantry', [228, 19.6, 13.7, 38.4, 33.0], 1200, { pack: 100, tbspGrams: 12 }),
  ing('vegetable_broth', 'Овощной бульон (кубик)', 'g', 'pantry', [200, 8, 12, 15, 0], 1500, {
    staple: true,
    pack: 60,
  }),
  // Добавлено для расширения базы рецептов
  ing('sweet_potato', 'Батат', 'g', 'veg', [86, 1.6, 0.1, 20.1, 3.0], 250, { pieceGrams: 200, pieceName: ['батат', 'батата', 'бататов'] }),
  ing('leek', 'Лук-порей', 'g', 'veg', [61, 2, 0.3, 14.2, 1.8], 300, { tags: ['onion'], pieceGrams: 200, pieceName: ['стебель', 'стебля', 'стеблей'] }),
  ing('mint', 'Мята', 'g', 'veg', [70, 3.8, 0.9, 14.9, 8.0], 900, { pack: 30 }),
  ing('basil', 'Базилик', 'g', 'veg', [23, 3.2, 0.6, 2.7, 1.6], 900, { pack: 50 }),
  ing('pollock', 'Минтай', 'g', 'fish', [72, 15.9, 0.9, 0, 0], 400, { allergens: ['fish'], pack: 500 }),
  ing('minced_turkey', 'Фарш индейки', 'g', 'meat', [161, 19, 9, 0, 0], 500, { pack: 400 }),
  ing('feta', 'Фета', 'g', 'dairy', [264, 14.2, 21.3, 4.1, 0], 1200, { allergens: ['lactose'], pack: 200 }),
  ing('coconut_yogurt', 'Кокосовый йогурт', 'g', 'dairy', [97, 1, 8, 5, 0.5], 900, { pack: 300 }),
  ing('rice_noodles', 'Рисовая лапша', 'g', 'grain', [364, 6, 0.6, 82, 1.6], 300, { pack: 300 }),
  ing('buckwheat_flour', 'Гречневая мука', 'g', 'grain', [335, 13, 3, 62, 10.0], 200, { pack: 500 }),
  ing('cornmeal', 'Кукурузная крупа', 'g', 'grain', [328, 8.3, 1.2, 71, 7.0], 120, { pack: 600 }),
  ing('chia', 'Семена чиа', 'g', 'nuts', [486, 16.5, 30.7, 42.1, 34.0], 1400, { pack: 200, tbspGrams: 12 }),
  ing('cinnamon', 'Корица', 'g', 'pantry', [247, 4, 1.2, 27.5, 53.0], 2000, { staple: true, pack: 30 }),

  // Напитки. Считаются не как блюда, а как ежедневный расход калорий: два
  // капучино в день — это 280 ккал, которые иначе молча уходят сверх нормы.
  ing('coffee', 'Кофе молотый', 'g', 'pantry', [2, 0.1, 0, 0.2, 0], 1800, { tags: ['caffeine'], pack: 250 }),
  ing('tea', 'Чай', 'g', 'pantry', [1, 0, 0, 0.2, 0], 3000, { tags: ['caffeine'], pack: 100 }),
  ing('matcha', 'Матча', 'g', 'pantry', [280, 29, 5, 39, 38.0], 12000, { tags: ['caffeine'], pack: 50 }),
  ing('protein_powder', 'Протеин', 'g', 'pantry', [380, 75, 5, 8, 2.0], 2500, { pack: 900 }),
  ing('orange_juice', 'Апельсиновый сок', 'ml', 'pantry', [45, 0.7, 0.2, 10.4, 0.3], 150, { pack: 1000 }),
  ing('cola', 'Газировка', 'ml', 'pantry', [42, 0, 0, 10.6, 0], 90, { tags: ['sugar'], pack: 1000 }),
  ing('wine_dry', 'Вино сухое', 'ml', 'pantry', [68, 0.1, 0, 0.6, 0], 800, { pack: 750 }),
  ing('beer_light', 'Пиво светлое', 'ml', 'pantry', [43, 0.5, 0, 3.6, 0], 150, { allergens: ['gluten'], pack: 500 }),
  ing('syrup', 'Сироп', 'ml', 'pantry', [270, 0, 0, 67, 0], 900, { tags: ['sugar'], pack: 250, tbspGrams: 20 }),
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
