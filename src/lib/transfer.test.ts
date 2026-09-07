import { describe, expect, it } from 'vitest'
import type { Household, Recipe } from '../types'
import { decodeProfile, encodeProfile, profileLink } from './transfer'

const household: Household = {
  eaters: [
    {
      id: 'e1',
      name: 'Юлия',
      sex: 'female',
      age: 32,
      heightCm: 168,
      weightKg: 62,
      activity: 'light',
      goal: 'keep',
      allergies: ['lactose'],
      customAllergens: ['Кинза'],
      dislikes: ['mushrooms'],
      bannedRecipes: [],
      awayMeals: [],
      ratings: {},
    },
  ],
  cookingDays: [2, 6],
  meals: ['breakfast', 'lunch', 'dinner'],
  kitchen: { burners: 4, hasOven: true, hasBlender: true, containers: 8, hasFreezer: true },
  budgetPerWeek: 5000,
  weekStart: '2026-09-07',
}

const own: Recipe = {
  id: 'custom-1',
  title: 'Бабушкин суп',
  emoji: '🍲',
  slots: ['lunch'],
  items: [{ ingredientId: 'potato', qty: 150 }],
  steps: [{ text: 'Варить', minutes: 20, station: 'stove', handsOn: false }],
  tags: [],
  freezable: true,
  fridgeDays: 4,
  custom: true,
}

describe('перенос профиля', () => {
  it('кодирует и читает обратно без потерь, включая кириллицу', () => {
    const code = encodeProfile({ household, customRecipes: [own] })
    const back = decodeProfile(code)
    expect(back?.household).toEqual(household)
    expect(back?.customRecipes).toEqual([own])
  })

  it('понимает целую ссылку, а не только код', () => {
    const link = profileLink({ household, customRecipes: [] }, 'https://example.com/Food/')
    expect(link).toContain('#data=')
    expect(decodeProfile(link)?.household.eaters[0].name).toBe('Юлия')
  })

  it('терпит пробелы вокруг вставленного кода', () => {
    const code = encodeProfile({ household, customRecipes: [] })
    expect(decodeProfile(`  ${code}  `)).not.toBeNull()
  })

  it('возвращает null на мусор вместо того, чтобы стереть анкету', () => {
    expect(decodeProfile('')).toBeNull()
    expect(decodeProfile('не ссылка')).toBeNull()
    expect(decodeProfile(btoa('{"v":1}'))).toBeNull()
    expect(decodeProfile(btoa('{"v":2,"household":{"eaters":[{}]}}'))).toBeNull()
  })
})
