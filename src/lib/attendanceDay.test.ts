import { describe, expect, it } from 'vitest'
import type { Eater, Household } from '../types'
import { dayAttendance } from './attendance'
import { defaultRepeats } from './menu'
import { defaultOils } from './oil'

function eater(id: string, mealPlaces: Record<string, 'home' | 'takeaway' | 'away'> = {}): Eater {
  return {
    id, name: id, sex: 'female', age: 32, heightCm: 168, weightKg: 62,
    activity: 'light', goal: 'keep', allergies: [], customAllergens: [],
    dislikes: [], bannedRecipes: [], mealPlaces, ratings: {},
  }
}
function household(eaters: Eater[]): Household {
  return {
    eaters, cookingDays: [2, 6], meals: ['breakfast', 'lunch', 'dinner'],
    kitchen: { burners: 4, ovens: 1, hasAirfryer: false, hasMulticooker: false,
      hasBlender: true, hasProcessor: false, hasMicrowave: true,
      hasDishwasher: false, containers: 8, hasFreezer: true },
    budgetPerWeek: 0, drinks: [], oils: defaultOils(), repeats: defaultRepeats(),
    extras: [], weekStart: '2026-09-07',
  }
}

/*
 * «Кирилл не дома» — свойство дня. Экран обязан сказать это один раз, а у
 * конкретного приёма — только когда расписание внутри дня различается.
 */
describe('кто сегодня дома', () => {
  it('нет весь день — это про день, а не про каждое блюдо', () => {
    const away = eater('Кирилл', {
      '4:breakfast': 'away', '4:lunch': 'away', '4:dinner': 'away',
    })
    const a = dayAttendance(household([eater('Юлия'), away]), 4)

    expect(a.home.map((e) => e.id)).toEqual(['Юлия'])
    expect(a.awayAllDay.map((e) => e.id)).toEqual(['Кирилл'])
    // весь день нет — значит про отдельные приёмы говорить нечего
    expect(a.partly).toEqual([])
  })

  it('нет только на обед — вот про это у приёма сказать и стоит', () => {
    const a = dayAttendance(household([eater('Юлия'), eater('Кирилл', { '4:lunch': 'away' })]), 4)

    expect(a.awayAllDay).toEqual([])
    expect(a.partly.map((e) => e.id)).toEqual(['Кирилл'])
  })

  it('все дома — говорить нечего вовсе', () => {
    const a = dayAttendance(household([eater('Юлия'), eater('Кирилл')]), 4)
    expect(a.home).toHaveLength(2)
    expect(a.awayAllDay).toEqual([])
    expect(a.partly).toEqual([])
  })

  it('обед с собой — человек всё равно ест этот приём', () => {
    const a = dayAttendance(household([eater('Кирилл', { '4:lunch': 'takeaway' })]), 4)
    expect(a.home.map((e) => e.id)).toEqual(['Кирилл'])
    expect(a.partly).toEqual([])
  })
})
