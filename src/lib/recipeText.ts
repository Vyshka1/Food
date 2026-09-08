import type { Ingredient, Recipe, RecipeItem, RecipeStep, Station } from '../types'
import { INGREDIENTS, INGREDIENT_BY_ID } from '../data/ingredients'
import { deriveRecipeSteps } from './stepDetail'

/**
 * Рецепт, написанный словами, — в черновик своего рецепта.
 *
 * Люди приносят рецепты откуда угодно: подпись под рилсом, сообщение от мамы,
 * страница блога. Всё это — свободный текст, и превратить его в состав из базы
 * продуктов можно только с ошибками. Поэтому здесь два правила.
 *
 * Первое: ничего не выбрасывать молча. Неизвестный `ingredientId` дальше по
 * коду просто пропускается (`statsOf`: `if (!ing) continue`), и блюдо выходит на
 * ноль калорий — никто не заметит, а меню будет считаться неправильно. Всё, что
 * не опознано, возвращается списком и показывается человеку.
 *
 * Второе: количества в тексте — на всё блюдо, а в рецепте они на одну порцию.
 * Это разница в четыре-шесть раз, и угадывать её нельзя: число порций приходит
 * снаружи, а не выдумывается здесь.
 */

/** Что получилось из текста. Устроено как `parseState`: без исключений и без молчания. */
export interface RecipeDraft {
  recipe: Recipe
  /** Строки состава, которые не удалось опознать. Их решает человек. */
  unresolved: string[]
  /** Где разбор шёл на глазок — чтобы это можно было проверить. */
  notes: string[]
  /** На сколько порций поделены количества. */
  servings: number
}

/* ------------------------------------------------------------------ слова */

/**
 * Беглая гласная: «перец» → «перц», «кабачок» → «кабачк», «креветок» →
 * «креветк». В русском она то появляется, то исчезает при склонении, и без
 * этого родительный падеж не сходится с именительным ни у одного такого слова.
 * На проверочном списке из 46 форм это давало +6 совпадений — больше, чем
 * любое другое правило здесь.
 */
function squeeze(word: string): string {
  return word.replace(/([бвгджзклмнпрстфхцчшщ])[ео]([бвгджзклмнпрстфхцчшщ])$/, '$1$2')
}

/**
 * Окончания от длинных к коротким. Порядок важен: «оливкового» надо срезать по
 * «ого», а не по «о». Форма «ый/ий/ой/ей» приведена к «ыи/ии/ои/еи», потому что
 * `й` заранее заменяется на `и` — иначе «яиц» не сходится с «яйцо».
 */
const ENDINGS = [
  'ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
  'ыи', 'ии', 'ои', 'еи', 'ов', 'ев', 'ах', 'ях', 'ам', 'ям',
  'ую', 'юю', 'ые', 'ие', 'ая', 'яя', 'ое', 'ее', 'ым', 'им', 'ом', 'ем',
  'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь',
]

function stem(word: string): string {
  const w = word.toLowerCase().replace(/ё/g, 'е').replace(/й/g, 'и')
  for (const end of ENDINGS) {
    if (w.length - end.length >= 3 && w.endsWith(end)) return squeeze(w.slice(0, -end.length))
  }
  return squeeze(w)
}

/** Слова текста, приведённые к основам. Проценты и скобки в названиях не считаем. */
function stemsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\d+\s*%|\([^)]*\)/g, ' ')
    .split(/[^а-я]+/)
    .filter((word) => word.length > 2)
    .map(stem)
}

/**
 * Слова, которые описывают продукт, а не называют его. «Мелко нарезанного
 * лука» — это лук; «свежего огурца» — огурец.
 */
const FILLER = [
  'свеж', 'сушен', 'молот', 'нарезан', 'натерт', 'измельчен', 'очищен', 'отварн',
  'мелк', 'крупн', 'средн', 'больш', 'небольш', 'вкус', 'любим', 'домашн', 'готов',
]

/**
 * Синонимы, которых не возьмёт никакой разбор слов.
 *
 * «Зелень» — это «Укроп и петрушка», и узнать это из букв нельзя. Здесь только
 * такие случаи: обиходное слово, под которым в базе лежит другое название.
 */
const ALIASES: [words: string, id: string][] = [
  ['зелень', 'greens'],
  ['укроп', 'greens'],
  ['петрушка', 'greens'],
  ['курица', 'chicken_fillet'],
  ['куриная грудка', 'chicken_fillet'],
  ['грудка', 'chicken_fillet'],
  ['говяжий фарш', 'minced_beef'],
  ['растительное масло', 'sunflower_oil'],
  ['подсолнечное масло', 'sunflower_oil'],
  ['сливочное масло', 'butter'],
  ['твёрдый сыр', 'cheese'],
  ['шампиньоны', 'mushrooms'],
  ['грибы', 'mushrooms'],
  ['картошка', 'potato'],
  ['морковка', 'carrot'],
  ['томаты', 'tomato'],
  ['помидоры черри', 'cherry_tomato'],
  ['перец болгарский', 'bell_pepper'],
  ['сладкий перец', 'bell_pepper'],
  ['перец', 'pepper'],
  ['чёрный перец', 'pepper'],
  ['молотый перец', 'pepper'],
  ['геркулес', 'oats'],
  ['овсянка', 'oats'],
  ['йогурт', 'greek_yogurt'],
  ['сливки', 'cream_10'],
  ['творожный сыр', 'cottage_cheese'],
  ['томатный соус', 'tomato_paste'],
  ['куркума', 'curry'],
  ['специи', 'dried_herbs'],
  ['травы', 'dried_herbs'],
  ['бульон', 'vegetable_broth'],
  ['лимонный сок', 'lemon'],
  ['цедра лимона', 'lemon'],
]

interface Entry {
  id: string
  stems: string[]
}

function buildIndex(): Entry[] {
  const rows: Entry[] = INGREDIENTS.map((ing) => ({ id: ing.id, stems: stemsOf(ing.name) }))
  // названия штук — вторая пачка слов у того же продукта: «луковица», «зубчик»
  for (const ing of INGREDIENTS) {
    if (!ing.pieceName) continue
    rows.push({ id: ing.id, stems: stemsOf(ing.pieceName[0]) })
  }
  return rows
}

const INDEX = buildIndex()

/**
 * Синонимы решают раньше разбора по буквам.
 *
 * «Перец» подходит под три названия сразу — чёрный, болгарский и чили, — и по
 * буквам между ними не выбрать: у всех ровно одно лишнее слово. А человек,
 * пишущий в рецепте «перец», имеет в виду чёрный. Такое решение принимается
 * один раз и руками, поэтому словарь идёт первым.
 */
const ALIAS_INDEX = new Map(ALIASES.map(([words, id]) => [stemsOf(words).sort().join(' '), id]))

/** Основы считаем одинаковыми, если одна начинается с другой: «сливочн» и «сливочно». */
function close(a: string, b: string): boolean {
  if (a === b) return true
  return a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))
}

/**
 * Найти продукт по названию из текста. `null` — значит не нашли, и это
 * нормальный ответ: половина рецептов из интернета ссылается на то, чего в базе
 * нет вовсе.
 */
export function findIngredient(text: string): string | null {
  const words = stemsOf(text).filter((s) => !FILLER.some((f) => close(s, f)))
  if (words.length === 0) return null

  const alias = ALIAS_INDEX.get([...words].sort().join(' '))
  if (alias) return alias

  let best: { id: string; extra: number } | null = null
  for (const row of INDEX) {
    const covered = words.filter((s) => row.stems.some((r) => close(s, r))).length
    if (covered < words.length) continue
    // из подходящих берём название с наименьшим числом лишних слов: «перец» —
    // это чёрный перец, а не болгарский, пока не сказано иначе
    const extra = row.stems.length - covered
    if (!best || extra < best.extra) best = { id: row.id, extra }
  }
  if (best) return best.id

  /*
   * Не сошлось целиком — пробуем без одного слова, слева направо. В «помидоры
   * черри» общее слово стоит первым, а уточняющее вторым, и решает именно оно.
   * Берём только однозначный ответ: угадывать между двумя продуктами нельзя.
   */
  for (let skip = 0; skip < words.length; skip += 1) {
    const rest = words.filter((_, i) => i !== skip)
    if (rest.length === 0) continue
    const found = new Set(
      INDEX.filter((row) => rest.every((s) => row.stems.some((r) => close(s, r)))).map((r) => r.id),
    )
    if (found.size === 1) return [...found][0]
  }
  return null
}

/* ----------------------------------------------------------------- числа */

const FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
}

/**
 * Число из начала строки. Понимает «1,5», «1/2», «½», «2-3» (берём среднее) и
 * приставку «пол-»: «полстакана» — это половина.
 */
export function parseAmount(text: string): { value: number; rest: string } | null {
  const raw = text.trim()

  const fraction = raw.match(/^([½⅓⅔¼¾])\s*(.*)$/u)
  if (fraction) return { value: FRACTIONS[fraction[1]], rest: fraction[2] }

  const half = raw.match(/^пол\s*-?\s*(\S.*)$/i)
  if (half) return { value: 0.5, rest: half[1] }

  const ratio = raw.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/)
  if (ratio) {
    const bottom = Number(ratio[2])
    if (bottom > 0) return { value: Number(ratio[1]) / bottom, rest: ratio[3] }
  }

  // «2-3 штуки» — берём среднее, точнее текст всё равно не говорит
  const range = raw.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (range) {
    const from = Number(range[1].replace(',', '.'))
    const to = Number(range[2].replace(',', '.'))
    return { value: (from + to) / 2, rest: range[3] }
  }

  const plain = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (plain) {
    const value = Number(plain[1].replace(',', '.'))
    // «1 1/2 стакана» и «1½»
    const more = parseAmount(plain[2])
    if (more && more.value < 1 && /^[½⅓⅔¼¾]|^\d+\s*\//.test(plain[2].trim())) {
      return { value: value + more.value, rest: more.rest }
    }
    return { value, rest: plain[2] }
  }
  return null
}

/* ------------------------------------------------------------------ меры */

export type Measure =
  | { kind: 'base' }
  | { kind: 'gram' }
  | { kind: 'kilo' }
  | { kind: 'milli' }
  | { kind: 'litre' }
  | { kind: 'piece' }
  | { kind: 'tbsp' }
  | { kind: 'tsp' }
  | { kind: 'cup' }
  | { kind: 'pinch' }
  | { kind: 'pack' }

/*
 * Порядок важен: «ст. л.» ищем раньше, чем «л», иначе литр съест ложку.
 *
 * Конец меры сторожит `(?![а-я])`, а не `\b`: после «ст. л.» стоит точка, и
 * границы слова между точкой и пробелом нет — три ложки муки превращались в
 * три грамма. Отрицательный просмотр заодно бережёт «г» от «говядины».
 */
const END = '(?![а-я])'
const MEASURES: [RegExp, Measure][] = [
  [new RegExp(`^(ст\\.?\\s*л\\.?|столов\\S*\\s+ложк\\S*)${END}`, 'i'), { kind: 'tbsp' }],
  [new RegExp(`^(ч\\.?\\s*л\\.?|чайн\\S*\\s+ложк\\S*)${END}`, 'i'), { kind: 'tsp' }],
  [new RegExp(`^(стакан\\S*)${END}`, 'i'), { kind: 'cup' }],
  [new RegExp(`^(щепот\\S*)${END}`, 'i'), { kind: 'pinch' }],
  [new RegExp(`^(пачк\\S*|упаковк\\S*|банк\\S*)${END}`, 'i'), { kind: 'pack' }],
  [new RegExp(`^(кг|килограмм\\S*)${END}`, 'i'), { kind: 'kilo' }],
  [new RegExp(`^(мл|миллилитр\\S*)${END}`, 'i'), { kind: 'milli' }],
  [new RegExp(`^(л\\.?|литр\\S*)${END}`, 'i'), { kind: 'litre' }],
  [new RegExp(`^(гр?\\.?|грамм\\S*)${END}`, 'i'), { kind: 'gram' }],
  [new RegExp(`^(шт\\.?|штук\\S*)${END}`, 'i'), { kind: 'piece' }],
]

/** Мера из начала строки. Если меры нет, продукт считается в своих единицах. */
export function parseMeasure(text: string): { measure: Measure; rest: string } | null {
  const raw = text.trim()
  for (const [pattern, measure] of MEASURES) {
    const hit = raw.match(pattern)
    if (hit) return { measure, rest: raw.slice(hit[0].length).trim() }
  }
  return null
}

/**
 * Сколько весит стакан.
 *
 * Стакан — мера объёма (250 мл), а сыпучее ею меряют по привычке, и вес выходит
 * разный: стакан муки — 130 г, стакан сахара — 200 г. Пересчитывать надо по
 * продукту, а не по одному числу; для чего таблицы нет, берём объём и говорим
 * об этом вслух.
 */
const CUP_GRAMS: Record<string, number> = {
  flour: 130, sugar: 200, rice: 180, buckwheat: 165, oats: 90, breadcrumbs: 110,
  walnuts: 100, almonds: 140, sesame: 130, raisins: 145, cornmeal: 160,
  buckwheat_flour: 120, cocoa: 100, chia: 170, pumpkin_seeds: 130,
}

const CUP_ML = 250
/** Щепотка — примерно четверть чайной ложки соли. */
const PINCH_GRAMS = 1

/**
 * Перевести измеренное человеком количество в базовые единицы продукта.
 *
 * `null` — меру к этому продукту применить нельзя (ложка чего-то, у чего не
 * задан вес ложки). Молчать об этом нельзя: разница в разы.
 */
export function toBaseQty(
  ing: Ingredient,
  value: number,
  measure: Measure,
): { qty: number; note?: string } | null {
  const weighed = ing.unit !== 'pcs'

  switch (measure.kind) {
    case 'gram':
      return weighed ? { qty: value } : pieces(ing, value)
    case 'kilo':
      return weighed ? { qty: value * 1000 } : pieces(ing, value * 1000)
    case 'milli':
      return weighed ? { qty: value } : pieces(ing, value)
    case 'litre':
      return weighed ? { qty: value * 1000 } : pieces(ing, value * 1000)

    case 'piece':
      if (ing.unit === 'pcs') return { qty: value }
      if (ing.pieceGrams) return { qty: value * ing.pieceGrams }
      return null

    case 'tbsp': {
      if (!ing.tbspGrams) return null
      const grams = value * ing.tbspGrams
      return weighed ? { qty: grams } : pieces(ing, grams)
    }
    case 'tsp': {
      // чайная ложка — треть столовой; отдельной таблицы в базе нет
      if (!ing.tbspGrams) return null
      const grams = (value * ing.tbspGrams) / 3
      return weighed ? { qty: grams } : pieces(ing, grams)
    }
    case 'cup': {
      const perCup = CUP_GRAMS[ing.id] ?? (ing.unit === 'ml' ? CUP_ML : null)
      if (perCup === null) {
        return {
          qty: value * CUP_ML,
          note: `${ing.name}: стакан посчитан как ${CUP_ML} мл — проверьте вес`,
        }
      }
      const grams = value * perCup
      return weighed ? { qty: grams } : pieces(ing, grams)
    }
    case 'pinch': {
      const grams = value * PINCH_GRAMS
      return weighed ? { qty: grams } : pieces(ing, grams)
    }
    case 'pack': {
      if (!ing.pack) return null
      const grams = value * ing.pack
      return weighed
        ? { qty: grams, note: `${ing.name}: пачка взята как ${ing.pack} ${ing.unit === 'ml' ? 'мл' : 'г'}` }
        : pieces(ing, grams)
    }
    case 'base':
      return { qty: value }
  }
}

/** Вес → штуки: у штучных продуктов количество хранится в штуках. */
function pieces(ing: Ingredient, grams: number): { qty: number } | null {
  if (!ing.pieceGrams) return null
  return { qty: grams / ing.pieceGrams }
}

/* --------------------------------------------------------------- разделы */

const INGREDIENT_HEADINGS = /^\s*(ингредиент|состав|продукт|нам понадоб|понадоб|нужно)/i
/** «на 4 порции» — это про рецепт целиком, а не продукт в нём. */
const SERVINGS_LINE = /^\s*(на\s+)?\d+\s*([-–—]\s*\d+\s*)?(порци|человек|персон)\S*\s*\.?$/i
const STEP_HEADINGS = /^\s*(приготовлен|способ|шаги|как готов|инструкц|рецепт:)/i

/**
 * Глаголы готовки. Строка состава называет продукт, строка приготовления —
 * действие, и число есть у обеих: «250 г пасты» и «отварить пасту 10 минут».
 * Различает их только глагол — без него шаг уходил в состав и превращался в
 * четверть килограмма пасты.
 */
const STEP_VERBS =
  /обжар|жар|вар|туш|запек|запеч|смеш|нарез|наруб|измельч|добав|влить|всып|посып|посол|довести|поставить|взбить|размя|выложить|остуд|охлад|подава|переме|разогре|прогре|натер|замочи|промы|очист|слить|накры/i

function stripBullet(line: string): string {
  return line.replace(/^\s*[-–—•*·▪]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim()
}

/**
 * Строка состава — короткая и с числом; строка приготовления — длинная и с
 * глаголом. Заголовки, если они есть, надёжнее любого угадывания, поэтому
 * сначала ищем их.
 */
export function splitSections(text: string): { items: string[]; steps: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const items: string[] = []
  const steps: string[] = []

  let mode: 'unknown' | 'items' | 'steps' = 'unknown'
  for (const line of lines) {
    if (INGREDIENT_HEADINGS.test(line) && line.length < 60) {
      mode = 'items'
      continue
    }
    if (STEP_HEADINGS.test(line) && line.length < 60) {
      mode = 'steps'
      continue
    }
    if (SERVINGS_LINE.test(line)) continue
    if (mode === 'items') {
      items.push(stripBullet(line))
      continue
    }
    if (mode === 'steps') {
      steps.push(stripBullet(line))
      continue
    }
    // заголовков не было: делим по виду строки
    const bare = stripBullet(line)
    if (STEP_VERBS.test(bare)) {
      steps.push(bare)
      continue
    }
    const looksLikeItem = bare.length <= 60 && /\d|^пол/i.test(bare)
    if (looksLikeItem) items.push(bare)
    else if (bare.length > 25) steps.push(bare)
  }
  return { items, steps }
}

/* ---------------------------------------------------------------- разбор */

/**
 * Мера, которую человек не назвал.
 *
 * «1 луковица» — это не один грамм лука. Меру здесь никто не написал, потому
 * что она в самом слове: луковица, зубчик, стручок. Такие слова у продукта
 * записаны в базе, по ним и узнаём.
 *
 * Остаётся «2 моркови» — слова про штуку нет, а имеется в виду штука. Опираемся
 * на то, что вес всегда пишут с единицей: «200 моркови» никто не напишет, а
 * «200 г моркови» разберётся выше. Поэтому малое число без единицы у весового
 * продукта со штучным весом — это штуки.
 */
function impliedMeasure(ing: Ingredient, rest: string, value: number): Measure {
  if (ing.unit === 'pcs' || !ing.pieceGrams) return { kind: 'base' }
  if (ing.pieceName) {
    const noun = stemsOf(ing.pieceName[0])
    const words = stemsOf(rest)
    if (noun.length > 0 && words.some((w) => noun.some((n) => close(w, n)))) return { kind: 'piece' }
  }
  return value <= 10 ? { kind: 'piece' } : { kind: 'base' }
}

/** Одна строка состава: «200 г творога» → продукт и количество в базовых единицах. */
export function parseItemLine(line: string): { item: RecipeItem; note?: string } | null {
  const text = stripBullet(line).replace(/\s+/g, ' ').trim()
  if (!text) return null

  /*
   * Проценты — часть названия, а не количество: в «Сливки 10% — 200 мл» число
   * стоит дважды, и если взять первое, получатся десять миллилитров сливок.
   */
  const scrubbed = text.replace(/\d+\s*%/g, ' ')

  /*
   * Количество пишут и до названия, и после: «200 г творога» и «Творог — 200 г»
   * встречаются одинаково часто, а «тыква 800 г» — без всякого разделителя.
   * Поэтому не разбираем разделители, а ищем, где начинается число.
   */
  const at = scrubbed.search(/[\d½⅓⅔¼¾]|пол[а-я]/i)
  let namePart: string
  let amountPart: string
  if (at < 0) {
    namePart = scrubbed
    amountPart = ''
  } else if (at === 0) {
    /*
     * Мера — часть количества, а не названия. Пока «стакана муки» шло в поиск
     * целиком, «стакан» тянул за собой лишнее слово, и мука переставала
     * отличаться от гречневой муки.
     */
    const leading = parseAmount(scrubbed)
    const rest = leading ? leading.rest : scrubbed
    namePart = parseMeasure(rest)?.rest ?? rest
    amountPart = scrubbed
  } else {
    namePart = scrubbed.slice(0, at)
    amountPart = scrubbed.slice(at)
  }

  const ingredientId = findIngredient(namePart)
  if (!ingredientId) return null
  const ing = INGREDIENT_BY_ID[ingredientId]

  const amount = amountPart ? parseAmount(amountPart) : null
  if (!amount) {
    /*
     * Количества нет вовсе: «соль по вкусу», «зелень». Ставить ноль нельзя —
     * такую строку `clean` выбросит, и продукт исчезнет из состава молча.
     * Берём щепотку и говорим об этом.
     */
    const pinch = toBaseQty(ing, 1, { kind: 'pinch' })
    return pinch
      ? { item: { ingredientId, qty: pinch.qty }, note: `${ing.name}: количество не указано` }
      : null
  }

  const measure = parseMeasure(amount.rest)?.measure ?? impliedMeasure(ing, amount.rest, amount.value)
  const converted = toBaseQty(ing, amount.value, measure)
  if (!converted) return null
  return { item: { ingredientId, qty: converted.qty }, note: converted.note }
}

/**
 * Строка состава может содержать несколько продуктов: «соль, перец по вкусу».
 *
 * Разбирать её целиком нельзя. Поиск продукта умеет отбрасывать лишнее слово —
 * и на такой строке он честно находит соль, тихо забыв про перец. Тихо забытый
 * продукт — это ровно то, чего здесь быть не должно, поэтому сначала пробуем
 * разделить, и делим только если после этого узнали больше одного продукта.
 */
export function parseItemLines(line: string): {
  items: RecipeItem[]
  notes: string[]
  ok: boolean
} {
  const bare = stripBullet(line)
  // запятая внутри числа не разделитель: «1,5 стакана муки» — это одна строка
  const parts = bare.split(/,(?!\s*\d)|\s+и\s+/i).map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    const parsed = parts.map((part) => parseItemLine(part))
    const found = parsed.filter((p): p is NonNullable<typeof p> => p !== null)
    if (found.length > 1) {
      return {
        items: found.map((p) => p.item),
        notes: found.flatMap((p) => (p.note ? [p.note] : [])),
        ok: found.length === parts.length,
      }
    }
  }
  const single = parseItemLine(bare)
  if (!single) return { items: [], notes: [], ok: false }
  return { items: [single.item], notes: single.note ? [single.note] : [], ok: true }
}

/**
 * Строка, которую разбор не узнал, но человек сказал, что это за продукт.
 *
 * Количество в строке при этом есть и написано так же, как в остальных, —
 * менять руками надо только название. `null` значит, что и количества нет:
 * тогда его тоже придётся ввести самому.
 */
export function resolveLine(line: string, ingredientId: string): RecipeItem | null {
  const ing = INGREDIENT_BY_ID[ingredientId]
  if (!ing) return null
  const text = stripBullet(line).replace(/\d+\s*%/g, ' ').replace(/\s+/g, ' ').trim()
  const at = text.search(/[\d½⅓⅔¼¾]|пол[а-я]/i)
  if (at < 0) return null
  const amount = parseAmount(text.slice(at))
  if (!amount) return null
  const measure = parseMeasure(amount.rest)?.measure ?? impliedMeasure(ing, amount.rest, amount.value)
  const converted = toBaseQty(ing, amount.value, measure)
  return converted ? { ingredientId, qty: converted.qty } : null
}

/** Число порций из текста: «на 4 порции», «4 порции», «на 2 человека». */
export function parseServings(text: string): number | null {
  const hit = text.match(/(?:на\s+)?(\d+)(?:\s*[-–—]\s*(\d+))?\s*(порци\w*|человек\w*|персон\w*)/i)
  if (!hit) return null
  const from = Number(hit[1])
  const to = hit[2] ? Number(hit[2]) : from
  const value = Math.round((from + to) / 2)
  return value >= 1 && value <= 20 ? value : null
}

/**
 * Где происходит шаг.
 *
 * Станцию `deriveStep` не выводит — она приходит от автора рецепта, а автор
 * здесь мы. Без неё все шаги оказались бы «подготовкой», и план готовки не
 * увидел бы ни занятой конфорки, ни занятой духовки: два блюда встали бы на
 * одну плиту одновременно.
 */
const STATIONS: [RegExp, Station][] = [
  [/запек|запеч|духовк|противен?ь|запекан/i, 'oven'],
  [/обжар|жар|туш|варить|отвар|вскипят|кипят|сковород|кастрюл|прогре/i, 'stove'],
  [/настоя|остуд|остыв|охлад|мариноват|дать постоять|убрать в холодильник/i, 'wait'],
]

export function stationOf(text: string): Station {
  for (const [pattern, station] of STATIONS) {
    if (pattern.test(text)) return station
  }
  return 'prep'
}

/** Время из текста шага: «варить 25 минут» — это двадцать пять, а не десять. */
export function minutesIn(text: string): number | null {
  const hit = text.match(/(\d+)(?:\s*[-–—]\s*(\d+))?\s*(мин|час)/i)
  if (!hit) return null
  const from = Number(hit[1])
  const to = hit[2] ? Number(hit[2]) : from
  const value = Math.round((from + to) / 2) * (hit[3].toLowerCase() === 'час' ? 60 : 1)
  return value >= 1 && value <= 600 ? value : null
}

export interface ParseOptions {
  /** На сколько порций написан текст. Если не задано — ищем в тексте, иначе 4. */
  servings?: number
  /** Название, если человек его уже ввёл. */
  title?: string
}

/**
 * Разобрать текст в черновик своего рецепта.
 *
 * Никогда не бросает. Всё, что не опознано, лежит в `unresolved` — это не
 * мелочь: неизвестный продукт дальше по коду молча пропускается, и блюдо
 * считается на ноль калорий.
 */
export function parseRecipeText(text: string, options: ParseOptions = {}): RecipeDraft {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const first = lines[0] ?? ''

  /*
   * Первая строка — почти всегда название блюда. Из разбора её надо убрать:
   * иначе «Паста с курицей в сливочном соусе» уходит в шаги и превращается в
   * подготовку на десять минут.
   *
   * Признак — отсутствие числа: у строки состава количество есть почти всегда,
   * а название блюда его не содержит. Проверять при этом, не узнаётся ли в
   * первой строке продукт, нельзя: название блюда сплошь и рядом называет свой
   * главный продукт — «Сырники из творога», «Тыквенный крем-суп».
   */
  const firstIsTitle = first.length > 0 && first.length <= 70 && !/\d/.test(first)
  const body = firstIsTitle ? lines.slice(1).join('\n') : text

  const { items: itemLines, steps: stepLines } = splitSections(body)
  const servings = options.servings ?? parseServings(text) ?? 4

  const byIngredient = new Map<string, number>()
  const unresolved: string[] = []
  const notes: string[] = []

  for (const line of itemLines) {
    const parsed = parseItemLines(line)
    if (!parsed.ok) unresolved.push(line)
    for (const item of parsed.items) {
      // количества в тексте — на всё блюдо, а в рецепте они на одну порцию
      byIngredient.set(
        item.ingredientId,
        (byIngredient.get(item.ingredientId) ?? 0) + item.qty / servings,
      )
    }
    notes.push(...parsed.notes)
  }

  /*
   * Шаги отдаём в тот же вывод, что и встроенные рецепты: он сам расставит
   * прибор, температуру и «можно ли отойти», да ещё протянет температуру
   * духовки со шага на шаг. Своё блюдо должно считаться так же, как чужое.
   */
  const steps: RecipeStep[] = deriveRecipeSteps(
    stepLines.map((text) => ({
      text,
      minutes: minutesIn(text) ?? 10,
      station: stationOf(text),
      // «поставить вариться на 20 минут» — это не двадцать минут у плиты
      handsOn: stationOf(text) === 'prep',
    })),
  )
  const recipe: Recipe = {
    id: `custom-${Math.random().toString(36).slice(2, 9)}`,
    title: options.title ?? (firstIsTitle ? first.slice(0, 60) : ''),
    emoji: '🍲',
    slots: ['dinner'],
    items: [...byIngredient].map(([ingredientId, qty]) => ({ ingredientId, qty })),
    steps: steps.length > 0 ? steps : deriveRecipeSteps([{ text: '', minutes: 10, station: 'prep', handsOn: true }]),
    tags: [],
    freezable: false,
    fridgeDays: 3,
    custom: true,
  }

  return { recipe, unresolved, notes, servings }
}
