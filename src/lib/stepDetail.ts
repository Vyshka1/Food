import type { Appliance, RecipeStep, Station } from '../types'

/**
 * Разметка шага рецепта по его тексту.
 *
 * У 78 встроенных рецептов около 400 шагов. Проставить прибор, температуру,
 * активное время и «можно ли отойти» вручную для каждого — отдельная работа
 * на несколько заходов. Здесь эти параметры выводятся правилами из текста, и
 * каждый выведенный шаг помечается `source: 'derived'`: неточность должна
 * быть находимой, а не раствориться в данных.
 *
 * Правила намеренно консервативны. Там, где текст не даёт уверенности,
 * выбирается более осторожный вариант: «нужно присматривать» вместо «можно
 * уйти», активное время выше, а не ниже.
 */

/**
 * Слова, по которым узнаём прибор. Порядок важен: ищем более конкретное
 * раньше. Прибор назначается только там, где он действительно нужен:
 * «нашинковать» и «натереть» делаются руками, и выводить из них комбайн
 * значит требовать от человека прибор, которого задача не требует.
 */
const APPLIANCE_WORDS: [RegExp, Appliance][] = [
  [/аэрогрил|эйрфрай/i, 'airfryer'],
  [/мультиварк|скороварк/i, 'multicooker'],
  [/микроволнов|свч\b/i, 'microwave'],
  [/комбайн/i, 'processor'],
  [/блендер|пюрир|взбить погружн/i, 'blender'],
  [/духовк|запек|запеч|противень/i, 'oven'],
  [/сковород|кастрюл|плит[аеу]|варить|обжар|жарить|тушить|кипят|припуст|сотейник/i, 'stove'],
]

/**
 * «Помешивая», «следить», «не отходить» — руки нужны, даже если шаг длинный.
 * Это же запрещает считать шаг оставляемым без контроля.
 */
const ATTENTION =
  /помешива|мешая|следит|не отход|перевернуть|переворачива|взбива|контролир|снима[яй]|снять пену|доводить|порциями/i

/** Шаги, где духовка или кастрюля работают сами и можно заняться другим. */
const UNATTENDED = /запек|запеч|тушить|томить|настоя|остуд|остыть|охлад|дать постоять|мариноват|разморозить|поднимет|дойти|варить/i

/**
 * Жарка присмотра требует всегда. «Обжарить с двух сторон под крышкой» первая
 * версия правил считала шагом, на котором можно уйти с кухни, — потому что
 * увидела «под крышкой». Сгоревшие сырники такую разметку не прощают.
 */
const FRYING = /обжар|жарить|подрумян|карамелиз|на сильном огне/i

/** Доля длительности, которую занимают руки, когда шаг требует присмотра. */
const STIRRING_SHARE = 0.3

/** Температура из текста: «при 180», «180 °C», «разогреть до 200». */
export function parseTemp(text: string): number | undefined {
  const match = text.match(/(?:при|до|на)\s+(\d{2,3})\s*(?:°|градус|c\b|с\b)?/i)
  if (!match) return undefined
  const value = Number(match[1])
  // диапазон бытовой духовки: всё остальное — это минуты, граммы или что-то ещё
  return value >= 60 && value <= 300 ? value : undefined
}

/**
 * Замачивание и заливка кипятком прибор не занимают: чайник уже вскипел, а
 * лапша просто стоит в миске. Правило по тексту раньше видело «кипятке» и
 * занимало этим конфорку на всё время — то есть отнимало у плана ресурс,
 * который на самом деле свободен.
 */
const SOAKING = /замочить|замачива|залить кипятк|кипятком|запарить|настоять|под плёнк/i

export function parseAppliance(text: string, station: Station): Appliance | undefined {
  // станция «ожидание» проставлена в рецепте руками и всегда сильнее текста
  if (station === 'wait') return undefined
  if (SOAKING.test(text)) return undefined
  for (const [re, appliance] of APPLIANCE_WORDS) if (re.test(text)) return appliance
  // текст молчит — доверяем станции, которая проставлена в рецепте руками
  if (station === 'oven') return 'oven'
  if (station === 'stove') return 'stove'
  return undefined
}

/**
 * Сколько минут шага повар реально занят.
 * — руки заняты целиком (`handsOn`) → всё время;
 * — «варить, помешивая» → треть времени;
 * — духовка, ожидание, маринование → ноль.
 */
export function activeMinutesOf(text: string, minutes: number, station: Station, handsOn: boolean): number {
  if (handsOn || station === 'prep') return minutes
  if (station === 'wait') return 0
  if (ATTENTION.test(text) || FRYING.test(text)) {
    return Math.max(1, Math.round(minutes * STIRRING_SHARE))
  }
  if (station === 'oven') return 0
  // плита без явного «помешивая»: заглянуть всё равно придётся
  return Math.max(1, Math.round(minutes * 0.15))
}

/** Можно ли уйти с кухни на время шага. */
export function isUnattended(text: string, station: Station, handsOn: boolean): boolean {
  if (handsOn || station === 'prep') return false
  if (ATTENTION.test(text) || FRYING.test(text)) return false
  if (station === 'wait' || station === 'oven') return true
  return UNATTENDED.test(text)
}

/** Полная разметка шага из его текста — с пометкой, что она выведена, а не проверена. */
export function deriveStep(
  text: string,
  minutes: number,
  station: Station,
  handsOn: boolean,
): Omit<RecipeStep, 'text' | 'minutes' | 'station' | 'handsOn'> {
  return {
    activeMinutes: activeMinutesOf(text, minutes, station, handsOn),
    appliance: parseAppliance(text, station),
    tempC: parseTemp(text),
    unattended: isUnattended(text, station, handsOn),
    source: 'derived',
  }
}

/** Пересчитывает выводимые поля шага после правки текста, времени или станции. */
export function withDerivedDetail(step: RecipeStep): RecipeStep {
  return {
    ...step,
    ...deriveStep(step.text, step.minutes, step.station, step.handsOn),
  }
}

/** Пустой шаг для редактора своих рецептов. */
export function newStep(): RecipeStep {
  return withDerivedDetail({
    text: '',
    minutes: 10,
    station: 'prep',
    handsOn: true,
    activeMinutes: 10,
    unattended: false,
    source: 'derived',
  })
}

/**
 * Разметка всех шагов рецепта разом. Отдельно от `deriveStep` она нужна из-за
 * температуры: рецепт пишет «разогреть духовку до 200°» один раз, а дальше
 * идут «запекать картофель» и «допекать вместе» — без переноса температуры
 * вперёд две трети духовых шагов оставались бы без градусов.
 */
export function deriveRecipeSteps(
  steps: { text: string; minutes: number; station: Station; handsOn: boolean }[],
): RecipeStep[] {
  let ovenTemp: number | undefined
  return steps.map(({ text, minutes, station, handsOn }) => {
    const detail = deriveStep(text, minutes, station, handsOn)
    if (detail.appliance === 'oven') {
      if (detail.tempC) ovenTemp = detail.tempC
      else if (ovenTemp) detail.tempC = ovenTemp
    }
    return { text, minutes, station, handsOn, ...detail }
  })
}
