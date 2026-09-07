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
  dranik: 65,
  pancake: 55,
  ball: 25,
  muffin: 80,
} as const

/** Мясная и рыбная партия под упаковку: одинаковая для целой группы блюд. */
function meatBatch(
  anchorIngredientId: string,
  baseScale: number,
  yieldGrams: number,
): RecipeBatch {
  return {
    source: 'verified',
    baseScale,
    anchorIngredientId,
    scales: [0.5, 1, 1.5, 2],
    minScale: 0.5,
    yieldGrams,
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  }
}

/**
 * Кастрюля: суп и рагу варят объёмом, а не порциями.
 *
 * Шаг мелкий: «меньше кастрюли непрактично» — ограничение снизу, а не
 * требование варить строго кратно кастрюле. Полную кастрюлю можно налить на
 * три четверти, и это обычное дело.
 */
function potBatch(yieldGrams: number): RecipeBatch {
  return {
    source: 'verified',
    baseScale: 4,
    scales: [1, 1.25, 1.5, 1.75, 2],
    minScale: 1,
    yieldGrams,
    freezeCooked: true,
    freezeRawAnchor: false,
    reason: 'pot',
  }
}

/** Форма или противень: больше просто не помещается, а меньше — можно. */
function formBatch(baseScale: number, yieldGrams: number): RecipeBatch {
  return {
    source: 'verified',
    baseScale,
    scales: [1, 1.25, 1.5, 1.75, 2],
    minScale: 1,
    yieldGrams,
    freezeCooked: true,
    freezeRawAnchor: false,
    reason: 'form',
  }
}

export const VERIFIED_BATCHES: Record<string, RecipeBatch> = {
  // ── Мясное и рыбное: партия равна упаковке ──────────────────────────────
  // Везде одно и то же рассуждение: пачка делится на доли рецепта, выход —
  // сырьё минус ужарка. Числа сверены с составом каждого рецепта.
  chicken_noodle_soup: meatBatch('chicken_thigh', 4.25, 1223),
  borsch: meatBatch('beef', 5, 2235),
  chicken_rice_broccoli: meatBatch('chicken_fillet', 3.5, 1164),
  turkey_bulgur: meatBatch('turkey_fillet', 3.5, 1137),
  beef_stew: meatBatch('beef', 3.75, 1337),
  turkey_cabbage: meatBatch('turkey_fillet', 3.75, 1627),
  chicken_potato_oven: meatBatch('chicken_thigh', 3.25, 1250),
  chicken_quinoa_bowl: meatBatch('chicken_fillet', 3.75, 1257),
  chicken_rice_soup: meatBatch('chicken_thigh', 4.25, 1216),
  beef_goulash_buckwheat: meatBatch('beef', 3.75, 1013),
  chicken_sweet_potato: meatBatch('chicken_thigh', 3.25, 1084),
  zucchini_mince_bake: meatBatch('minced_chicken', 2.75, 1241),

  // ── Кастрюля: варят объёмом ─────────────────────────────────────────────
  lentil_soup: potBatch(898),
  chickpea_curry: potBatch(1271),
  bean_veg_stew: potBatch(1584),
  pumpkin_soup: potBatch(1489),
  eggplant_lentil_stew: potBatch(1228),
  tofu_veg_curry: potBatch(1577),

  // ── Форма ───────────────────────────────────────────────────────────────
  // Овсяная запеканка: 456 г сырья на долю, в форму влезает около 1400 г —
  // отсюда три доли. Правило по упаковке давало ×6,75, то есть три килограмма
  // теста, потому что овсяное молоко продаётся литром.
  oat_apple_bake: formBatch(3, 1204),
  cottage_casserole: formBatch(4, 1031),
  lentils_roasted_veg: formBatch(4, 1204),

  // ── Штучное, которое жарят или катают партиями ──────────────────────────
  // Драники: 344 г теста на долю, драник около 65 г.
  draniki: {
    source: 'verified',
    baseScale: 3,
    scales: [1, 1.5, 2],
    minScale: 1,
    yieldGrams: 908,
    yieldPieces: Math.round((344 * 3) / PIECE.dranik),
    pieceName: ['драник', 'драника', 'драников'],
    // на сковороде помещается пять драников, заход — шесть минут: они толще
    // оладий и жарятся дольше
    piece: { perLoad: 5, loadMinutes: 6, sizes: [10, 12, 16, 20, 24], max: 24 },
    freezeCooked: true,
    freezeRawAnchor: false,
    reason: 'pan',
  },

  // Гречневые оладьи: 246 г теста на долю, оладья около 55 г.
  buckwheat_pancakes: {
    source: 'verified',
    baseScale: 3,
    scales: [1, 1.5, 2],
    minScale: 1,
    yieldGrams: 650,
    yieldPieces: Math.round((246 * 3) / PIECE.pancake),
    pieceName: ['оладья', 'оладьи', 'оладий'],
    // пять оладий за раз, по две минуты на сторону
    piece: { perLoad: 5, loadMinutes: 4, sizes: [12, 16, 20, 24, 30], max: 30 },
    freezeCooked: true,
    freezeRawAnchor: false,
    reason: 'pan',
  },

  // Яичные маффины: 240 г на долю, форма на 12 ячеек по 80 г. Двенадцать
  // ячеек — это четыре доли, а не три: первая версия писала «ровно три доли»
  // и давала девять маффинов, то есть неполную форму.
  egg_muffins: {
    source: 'verified',
    baseScale: 4,
    scales: [1, 2],
    minScale: 1,
    yieldGrams: 845,
    yieldPieces: Math.round((240 * 4) / PIECE.muffin),
    pieceName: ['маффин', 'маффина', 'маффинов'],
    // форма на двенадцать ячеек, выпекание двадцать минут: вторая форма есть
    // не у всех, поэтому больше двенадцати за раз не делаем
    piece: { perLoad: 12, loadMinutes: 20, sizes: [12], max: 12 },
    freezeCooked: true,
    freezeRawAnchor: false,
    reason: 'form',
  },

  // Овсяно-финиковые шарики: 90 г массы на долю, шарик около 25 г.
  // Ни кастрюли, ни формы здесь нет — их просто катают впрок, благо хранятся
  // они неделю.
  oat_cocoa_balls: {
    source: 'verified',
    baseScale: 4,
    scales: [1, 1.5, 2],
    minScale: 1,
    yieldGrams: 317,
    yieldPieces: Math.round((90 * 4) / PIECE.ball),
    pieceName: ['шарик', 'шарика', 'шариков'],
    // шарики не жарят, их катают: «заход» здесь — вся партия сразу
    piece: { perLoad: 24, loadMinutes: 10, sizes: [8, 12, 16, 20, 24], max: 24 },
    freezeCooked: true,
    freezeRawAnchor: false,
    reason: 'keeps',
  },

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
    // шесть сырников на сковороде, по три минуты на сторону
    piece: { perLoad: 6, loadMinutes: 6, sizes: [6, 8, 10, 12], max: 12 },
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
    // тефтели мелкие: дюжина за раз, обжарка пять минут, дальше они тушатся
    piece: { perLoad: 12, loadMinutes: 5, sizes: [12, 16, 20, 24, 30], max: 30 },
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
    // шесть котлет на сковороде, по пять минут на сторону
    piece: { perLoad: 6, loadMinutes: 10, sizes: [6, 8, 10, 12, 16], max: 16 },
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
    // биточки крупные: шесть за заход, восемь минут
    piece: { perLoad: 6, loadMinutes: 8, sizes: [6, 8, 10, 12, 16], max: 16 },
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
    piece: { perLoad: 6, loadMinutes: 8, sizes: [6, 8, 10, 12, 16], max: 16 },
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
    piece: { perLoad: 12, loadMinutes: 5, sizes: [12, 16, 20, 24, 30], max: 30 },
    freezeCooked: true,
    freezeRawAnchor: true,
    reason: 'anchor-pack',
  },
}
