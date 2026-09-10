import { applianceCapacity } from '../types'
import type { Appliance, Kitchen, PlannedStep } from '../types'

/**
 * Чем и насколько занята кухня по готовому расписанию.
 *
 * Здесь ничего не планируется заново: расписание уже расставило шаги по
 * минутам в `buildCookingPlans`, а этот файл только читает результат. Пик
 * занятости — не «сколько шагов у плиты за день», а сколько конфорок стоят
 * занятыми одновременно в самый плотный момент: именно это отвечает на вопрос
 * «останется ли место под сковородку».
 */

/** Порядок приборов в отчёте: от того, что есть у всех, к редкому. */
const ORDER: Appliance[] = [
  'stove',
  'oven',
  'airfryer',
  'multicooker',
  'blender',
  'processor',
  'microwave',
]

export interface ApplianceLoad {
  appliance: Appliance
  /** Сколько таких приборов на кухне. 0 — прибора нет, а по рецепту он нужен. */
  capacity: number
  /** Сколько занято одновременно в самый плотный момент плана. */
  peak: number
}

/**
 * Сколько приборов каждого вида занято в пике.
 *
 * В отчёт попадает то, что стоит на кухне, и то, чем план пользуется: прибор
 * без единого шага важен (он свободен — значит, есть куда поставить), а
 * прибор, которого нет, но который нужен по рецепту, важен вдвойне.
 */
export function kitchenLoad(steps: PlannedStep[], kitchen: Kitchen): ApplianceLoad[] {
  const byAppliance = new Map<Appliance, PlannedStep[]>()
  for (const step of steps) {
    if (!step.appliance) continue
    const list = byAppliance.get(step.appliance) ?? []
    list.push(step)
    byAppliance.set(step.appliance, list)
  }

  const result: ApplianceLoad[] = []
  for (const appliance of ORDER) {
    const capacity = applianceCapacity(kitchen, appliance)
    const own = byAppliance.get(appliance) ?? []
    if (capacity === 0 && own.length === 0) continue
    result.push({ appliance, capacity, peak: peakOverlap(own) })
  }
  return result
}

/**
 * Максимум одновременно идущих отрезков. Считаем по началам: число пересечений
 * меняется только там, где что-то начинается, поэтому проверять каждую минуту
 * незачем.
 *
 * Интервал полуоткрытый, [start, end): шаг, который начинается в минуту конца
 * соседнего, конфорку с ним не делит, а шаг нулевой длины не занимает её вовсе.
 */
function peakOverlap(steps: PlannedStep[]): number {
  let peak = 0
  for (const at of steps) {
    const busy = steps.filter((s) => s.start <= at.start && at.start < s.end).length
    if (busy > peak) peak = busy
  }
  return peak
}

export interface DishWorkload {
  /** Минуты, когда руки заняты именно этим блюдом. */
  handsOnMinutes: number
  /** Прибор, за которым блюдо проводит больше всего времени. */
  appliance?: Appliance
}

/**
 * Во что обходится каждое блюдо по шагам этого же плана.
 *
 * Ручные минуты складываются в тот же `handsOnMinutes`, что показывает план
 * целиком: это одна и та же величина, разложенная по блюдам, а не второй
 * ответ на тот же вопрос.
 */
export function dishWorkloads(steps: PlannedStep[]): Map<string, DishWorkload> {
  const hands = new Map<string, number>()
  const applianceMinutes = new Map<string, Map<Appliance, number>>()

  for (const step of steps) {
    const minutes = Math.max(0, step.end - step.start)
    hands.set(step.recipeId, (hands.get(step.recipeId) ?? 0) + (step.handsOn ? minutes : 0))
    if (!step.appliance) continue
    const own = applianceMinutes.get(step.recipeId) ?? new Map<Appliance, number>()
    own.set(step.appliance, (own.get(step.appliance) ?? 0) + minutes)
    applianceMinutes.set(step.recipeId, own)
  }

  const result = new Map<string, DishWorkload>()
  for (const step of steps) {
    if (result.has(step.recipeId)) continue
    const own = applianceMinutes.get(step.recipeId)
    let appliance: Appliance | undefined
    let best = 0
    // ничья решается порядком ORDER: плита важнее блендера, а не наоборот
    for (const candidate of ORDER) {
      const minutes = own?.get(candidate) ?? 0
      if (minutes > best) {
        best = minutes
        appliance = candidate
      }
    }
    result.set(step.recipeId, { handsOnMinutes: hands.get(step.recipeId) ?? 0, appliance })
  }
  return result
}
