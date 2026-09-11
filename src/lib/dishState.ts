import type { MenuEntry } from '../types'
import { WEEKDAYS, WEEKDAYS_ACC } from './menu'

/**
 * Что сейчас с этим блюдом.
 *
 * Раньше карточка показывала рядом две плашки: «из холодильника» и «готовим
 * Ср». Вместе они противоречат друг другу — его ещё готовят или оно уже
 * лежит? На деле это не два свойства, а одно состояние, и зависит оно от двух
 * вещей: прошёл ли день готовки и отмечена ли готовка сделанной.
 *
 * Здесь же проходит граница, ради которой всё и затевалось: план («приготовим
 * в среду»), факт готовки («готово») и факт еды («съедено») — три разных
 * слоя. Этот модуль знает только про первые два; про съеденное он молчит.
 */
export type DishStage =
  /** День готовки ещё не наступил. */
  | 'planned'
  /** Готовим сегодня. */
  | 'today'
  /** Готовка отмечена сделанной, блюдо лежит и ждёт. */
  | 'ready'
  /** День готовки прошёл, а отметки нет. */
  | 'unconfirmed'
  /** Заготовка с прошлых недель: сегодня не готовим вовсе. */
  | 'freezer'

export interface DishState {
  stage: DishStage
  label: string
  /** Мягкое предупреждение: сказано не для красоты, а потому что чего-то не хватает. */
  warn: boolean
}

export function dishState(entry: MenuEntry, cooked: boolean, today: number): DishState {
  if (entry.fromFreezer) {
    return { stage: 'freezer', label: 'Достать из морозилки', warn: false }
  }
  const sameDay = entry.cookDay === entry.day
  const where = entry.storage === 'freezer' ? 'из морозилки' : 'из холодильника'

  if (cooked) {
    return {
      stage: 'ready',
      label: sameDay ? 'Готово' : `Готово в ${WEEKDAYS_ACC[entry.cookDay]} · ${where}`,
      warn: false,
    }
  }
  if (entry.cookDay > today) {
    return { stage: 'planned', label: `Приготовим в ${WEEKDAYS_ACC[entry.cookDay]}`, warn: false }
  }
  if (entry.cookDay === today) {
    return { stage: 'today', label: 'Готовим сегодня', warn: false }
  }
  /*
   * День готовки прошёл, отметки нет. Молчать нельзя: либо человек забыл
   * отметить, либо не готовил — и тогда сегодняшний обед взять неоткуда.
   */
  return {
    stage: 'unconfirmed',
    label: `Не отмечено приготовленным · ${WEEKDAYS[entry.cookDay]}`,
    warn: true,
  }
}
