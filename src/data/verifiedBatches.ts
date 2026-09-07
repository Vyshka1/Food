import type { RecipeBatch } from '../types'

/**
 * Партии, выставленные вручную.
 *
 * Здесь только блюда, где размер партии и число изделий действительно
 * решают: их лепят поштучно, замораживают сырыми и покупают под них
 * упаковку фарша. Для остального весового выхода достаточно, и он остаётся
 * `derived`.
 *
 * Что означает `verified` в этом файле: закладка и выход выставлены
 * осознанно, от веса упаковки главного продукта и от веса одного изделия,
 * который указан в комментарии к каждой строке. Это не значит, что блюдо
 * приготовлено и взвешено — такой проверки не было, и притворяться, что
 * была, нельзя. Но это и не механически выведенное число: каждое здесь
 * можно проверить арифметикой, а вес изделия — обычный бытовой.
 *
 * Если после готовки окажется, что изделий выходит другое число, менять
 * нужно здесь: правила из lib/batchInfo эти рецепты не трогают.
 */

/** Вес одного изделия, г. Обычные бытовые размеры. */
const PIECE = {
  syrnik: 70,
  cutlet: 90,
  meatball: 40,
  cabbageRoll: 120,
  fishCake: 90,
} as const

export const VERIFIED_BATCHES: Record<string, RecipeBatch> = {
  // Творог 200 г на пачку, 150 г на долю → закладка чуть меньше полутора долей.
  // Сырники лепят по 70 г: из закладки выходит примерно шесть штук.
  cottage_pancakes: {
    source: 'verified',
    baseScale: 1.5,
    anchorIngredientId: 'cottage_cheese',
    scales: [1, 1.5, 2],
    minScale: 1,
    yieldGrams: 330,
    yieldPieces: Math.round((150 * 1.5 + 27 * 1.5 + 25 * 1.5) / PIECE.syrnik),
    pieceName: ['сырник', 'сырника', 'сырников'],
    freezeCooked: true,
    freezeRawAnchor: false,
    reason: 'anchor-pack',
  },

  // Фарш куриный 400 г на пачку, 130 г на долю → три доли.
  // Тефтеля 40 г, масса на тефтели — фарш с луком и яйцом.
  buckwheat_meatballs: {
    source: 'verified',
    baseScale: 3,
    anchorIngredientId: 'minced_chicken',
    scales: [0.5, 1, 1.5, 2],
    minScale: 0.5,
    yieldGrams: 830,
    yieldPieces: Math.round((130 * 3 + 30 * 3 + 16 * 3) / PIECE.meatball),
    pieceName: ['тефтеля', 'тефтели', 'тефтелей'],
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  },

  // Фарш куриный 400 г, 140 г на долю → без малого три доли.
  // Котлета 90 г: фарш, лук, яйцо и сухари.
  chicken_cutlets_veg: {
    source: 'verified',
    baseScale: 2.75,
    anchorIngredientId: 'minced_chicken',
    scales: [0.5, 1, 1.5, 2],
    minScale: 0.5,
    yieldGrams: 1090,
    yieldPieces: Math.round((140 * 2.75 + 30 * 2.75 + 16 * 2.75 + 15 * 2.75) / PIECE.cutlet),
    pieceName: ['котлета', 'котлеты', 'котлет'],
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  },

  // Фарш индейки 400 г, 130 г на долю → три доли.
  // Числа перцев здесь намеренно нет: в рецепте 180 г перца на долю — это
  // очищенная мякоть, а не целый овощ, и сколько выйдет фаршированных перцев,
  // из этого не следует. Приблизительного веса достаточно; поставить сюда
  // число можно будет, когда оно проверено на кухне.
  stuffed_peppers: {
    source: 'verified',
    baseScale: 3,
    anchorIngredientId: 'minced_turkey',
    scales: [0.5, 1, 1.5, 2],
    minScale: 0.5,
    yieldGrams: 1490,
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  },

  // Фарш индейки 400 г, 130 г на долю → три доли.
  // Голубец 120 г: фарш, капуста, рис и лук.
  lazy_cabbage_rolls: {
    source: 'verified',
    baseScale: 3,
    anchorIngredientId: 'minced_turkey',
    scales: [0.5, 1, 1.5, 2],
    minScale: 0.5,
    yieldGrams: 1300,
    yieldPieces: Math.round((130 * 3 + 180 * 3 + 45 * 3 + 40 * 3) / PIECE.cabbageRoll),
    pieceName: ['голубец', 'голубца', 'голубцов'],
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  },

  // Минтай 500 г, 160 г на долю → три доли.
  // Котлета 90 г: рыба, лук и яйцо; пюре считается отдельно.
  fish_cakes_mash: {
    source: 'verified',
    baseScale: 3,
    anchorIngredientId: 'pollock',
    scales: [0.5, 1, 1.5, 2],
    minScale: 0.5,
    yieldGrams: 1170,
    yieldPieces: Math.round((160 * 3 + 30 * 3 + 27 * 3) / PIECE.fishCake),
    pieceName: ['котлета', 'котлеты', 'котлет'],
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  },

  // Фарш индейки 400 г, 140 г на долю → без малого три доли.
  // Тефтеля 40 г; рис идёт гарниром и в счёт изделий не входит.
  turkey_meatballs_rice: {
    source: 'verified',
    baseScale: 2.75,
    anchorIngredientId: 'minced_turkey',
    scales: [0.5, 1, 1.5, 2],
    minScale: 0.5,
    yieldGrams: 1090,
    yieldPieces: Math.round((140 * 2.75 + 35 * 2.75 + 16 * 2.75) / PIECE.meatball),
    pieceName: ['тефтеля', 'тефтели', 'тефтелей'],
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  },
}
