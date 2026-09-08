import type {
  FreezeStage,
  FreezingInfo,
  Recipe,
  RecipeStep,
  ThawMethod,
} from '../types'

/**
 * Как блюдо ведёт себя в морозилке.
 *
 * Три вопроса, на которые приложение раньше не отвечало вовсе: на каком
 * этапе морозить, сколько оно там пролежит и как его потом размораживать.
 * Без первого совет «убрать в морозилку» бывает прямо вредным: котлеты,
 * замороженные готовыми, после разморозки разваливаются и сохнут, а сырыми
 * жарятся как свежие.
 *
 * Как и с разметкой шагов, значения выводятся правилами и помечаются
 * `source: 'derived'`. Правила консервативны: где текст не даёт уверенности,
 * выбирается более осторожный вариант — «переложить в холодильник заранее»
 * вместо «греть сразу», меньший срок вместо большего.
 */

/**
 * Лепка руками: только глаголы формовки. «Выложить в форму» сюда не входит —
 * это заливка теста в противень, а не изделие, которое можно заморозить
 * поштучно; на нём правило ошибочно относило творожную запеканку к сырой
 * заморозке.
 */
const SHAPING = /сформ|слепить|налепить|скатать/i

/** Термообработка: после неё блюдо уже готовое, а не сырое. */
const COOKING = /жарить|обжар|запек|запеч|варить|тушить|готовить|отварить|припуст/i

/** Блюда, которые греют прямо из морозилки — размораживать их незачем. */
const REHEAT_DIRECT = /суп|борщ|бульон|рагу|соус|карри|пюре|каша/i

/** Сроки в морозилке, дней. Бытовые, с запасом в безопасную сторону. */
const DAYS_MEAT_RAW = 90
const DAYS_COOKED_MEAT = 60
const DAYS_COOKED_PLAIN = 45
const DAYS_BAKED = 30

const MEAT_IDS = new Set([
  'beef', 'minced_beef', 'pork', 'chicken_fillet', 'chicken_thigh', 'minced_chicken',
  'turkey_fillet', 'minced_turkey', 'salmon', 'cod', 'pollock', 'shrimp',
])

function hasMeat(recipe: Recipe): boolean {
  return recipe.items.some((i) => MEAT_IDS.has(i.ingredientId))
}

function hasDairyToSeparate(recipe: Recipe): boolean {
  // сметана и сливки в заморозке расслаиваются — блюдо переживёт, но недолго
  return recipe.items.some((i) => ['sour_cream', 'cream_10', 'kefir'].includes(i.ingredientId))
}

/**
 * Индекс шага, на котором блюдо сформовано, но ещё не готовилось. Если такого
 * шага нет — морозить сырым нечего.
 */
export function rawFreezeStep(steps: RecipeStep[]): number | undefined {
  for (let i = 0; i < steps.length; i++) {
    if (!SHAPING.test(steps[i].text)) continue
    // Шаг формовки не должен сам содержать жарку. «Сформовать биточки,
    // обжарить» — одно действие в тексте, но заморозить «после» него значит
    // заморозить уже обжаренными, то есть не сырыми. Такие блюда честнее
    // отнести к готовым, чем дать неверный совет.
    if (COOKING.test(steps[i].text)) continue
    // формовка засчитывается, только если дальше идёт термообработка:
    // «скатать и убрать в холод» замораживать сырым нечего
    const cookedLater = steps.slice(i + 1).some((s) => COOKING.test(s.text))
    if (cookedLater) return i
  }
  return undefined
}

export function freezeStageOf(recipe: Recipe): { stage: FreezeStage; afterStep?: number } {
  const step = rawFreezeStep(recipe.steps)
  // сырым морозят то, что лепят руками и потом готовят: котлеты, тефтели,
  // сырники. Мясо здесь не обязательно — сырники лепят и жарят точно так же
  if (step !== undefined) return { stage: 'raw', afterStep: step }
  return { stage: 'cooked' }
}

export function freezerDaysOf(recipe: Recipe, stage: FreezeStage): number {
  if (stage === 'raw') return hasMeat(recipe) ? DAYS_MEAT_RAW : DAYS_BAKED
  if (hasDairyToSeparate(recipe)) return DAYS_BAKED
  if (recipe.needs?.includes('oven') || /оладь|блин|сырник|запеканк|маффин/i.test(recipe.title)) {
    return DAYS_BAKED
  }
  return hasMeat(recipe) ? DAYS_COOKED_MEAT : DAYS_COOKED_PLAIN
}

export function thawOf(recipe: Recipe, stage: FreezeStage): { thaw: ThawMethod; hours: number } {
  // сырое мясо размораживают только в холодильнике — это вопрос безопасности,
  // а не удобства, поэтому здесь никаких «на столе»
  if (stage === 'raw') return { thaw: 'fridge', hours: 12 }
  if (REHEAT_DIRECT.test(recipe.title)) return { thaw: 'direct', hours: 0 }
  if (/оладь|блин|сырник|запеканк|маффин|хлеб/i.test(recipe.title)) {
    return { thaw: 'counter', hours: 2 }
  }
  return { thaw: 'fridge', hours: 12 }
}

/** Полная разметка заморозки для рецепта. */
export function freezingOf(recipe: Recipe): FreezingInfo | undefined {
  if (!recipe.freezable) return undefined
  const { stage, afterStep } = freezeStageOf(recipe)
  const { thaw, hours } = thawOf(recipe, stage)
  return {
    days: freezerDaysOf(recipe, stage),
    stage,
    afterStep,
    thaw,
    thawHours: hours,
    source: 'derived',
  }
}

/** Дата, до которой заготовку стоит съесть. */
export function useByDate(cookedOn: Date, days: number): Date {
  const date = new Date(cookedOn)
  date.setDate(date.getDate() + days)
  return date
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** «до 9 декабря» — как это писать на контейнере. */
export function formatUseBy(date: Date): string {
  return `до ${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`
}

/** Что написать на контейнере: «Ленивые голубцы · 2 контейнера · до 9 декабря». */
export function containerLabel(title: string, containers: number, useBy: Date): string {
  const word = containers === 1 ? 'контейнер' : containers < 5 ? 'контейнера' : 'контейнеров'
  return `${title} · ${containers} ${word} · ${formatUseBy(useBy)}`
}

/** Проверка на консистентность: у блюда с мясом сырьё морозится в холодильник. */
export function isSafeThaw(info: FreezingInfo): boolean {
  return info.stage !== 'raw' || info.thaw === 'fridge'
}
