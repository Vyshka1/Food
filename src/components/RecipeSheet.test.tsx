// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { STORAGE_KEYS, StoreProvider } from '../store'
import { SCHEMA_VERSION } from '../lib/persist'
import { RecipeSheet } from './RecipeSheet'
import type { MenuEntry } from '../types'

/*
 * Карточка блюда, которое собирают перед едой.
 *
 * Разбор начался с неё: человек открыл «Йогурт с гранолой и яблоком» и увидел
 * «Приготовим примерно 1,0 кг · Нужно по меню 570 г · Останется 468 г — доесть
 * в ближайшие дни · Потому что меньше кастрюли готовить непрактично». Три
 * независимые величины сложились в одну, а у 468 граммов не оказалось ни
 * человека, ни дня, ни приёма пищи.
 */

const [KEY] = STORAGE_KEYS

/** Понедельник текущей недели: иначе загрузка пересоберёт меню своим зерном. */
const MONDAY = '2026-09-07'

/** Одна готовка на несколько приёмов пищи: cookDay у всех записей общий. */
function entry(id: string, recipeId: string, slot: string, day: number, pair = false): MenuEntry {
  return {
    id,
    recipeId,
    slot: slot as MenuEntry['slot'],
    day,
    cookDay: 0,
    portions: pair
      ? [
          { eaterId: 'e1', factor: 1 },
          { eaterId: 'e2', factor: 1.3 },
        ]
      : [{ eaterId: 'e1', factor: 1 }],
    storage: day === 0 ? 'fresh' : 'fridge',
  }
}

const SECOND_EATER = {
  id: 'e2',
  name: 'Кирилл',
  sex: 'male',
  age: 35,
  heightCm: 182,
  weightKg: 84,
  activity: 'light',
  goal: 'keep',
  allergies: [],
  customAllergens: [],
  dislikes: [],
  bannedRecipes: [],
  mealPlaces: {},
  ratings: {},
}

function saved(entries: MenuEntry[], hasFreezer = true, pair = false): string {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    household: {
      eaters: [
        {
          id: 'e1',
          name: 'Я',
          sex: 'female',
          age: 30,
          heightCm: 168,
          weightKg: 62,
          activity: 'light',
          goal: 'keep',
          allergies: [],
          customAllergens: [],
          dislikes: [],
          bannedRecipes: [],
          mealPlaces: {},
          ratings: {},
        },
        ...(pair ? [SECOND_EATER] : []),
      ],
      cookingDays: [0],
      meals: ['breakfast', 'lunch', 'dinner'],
      kitchen: { burners: 4, ovens: 1, containers: 8, hasFreezer },
      budgetPerWeek: 0,
      drinks: [],
      extras: [],
      weekStart: MONDAY,
    },
    menu: { weekStart: MONDAY, seed: 1, entries },
    atHome: [],
    pantry: { always: [], stock: [], freezer: [] },
    notifications: false,
    bought: [],
    warnings: [],
    customRecipes: [],
    history: [],
    cookEvents: [],
  })
}

function open(entries: MenuEntry[], hasFreezer = true, pair = false): string {
  localStorage.setItem(KEY, saved(entries, hasFreezer, pair))
  render(
    <StoreProvider>
      <RecipeSheet entry={entries[0]} onClose={() => {}} onSwap={() => {}} onBan={() => {}} />
    </StoreProvider>,
  )
  return document.body.textContent ?? ''
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  // среда той же недели: меню живое, пересборки не будет
  vi.setSystemTime(new Date(2026, 8, 9, 12, 0, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('карточка собираемого блюда', () => {
  /** Два завтрака йогуртом — тот самый случай из разбора. */
  const yogurt = [
    entry('a', 'yogurt_granola', 'breakfast', 0),
    entry('b', 'yogurt_granola', 'breakfast', 1),
  ]

  it('не обещает доесть остаток в ближайшие дни', () => {
    const text = open(yogurt)
    expect(text).not.toContain('доесть в ближайшие дни')
    expect(text).not.toContain('Останется')
    expect(text).not.toContain('Некуда убрать')
  })

  it('не объясняет сборку в банку размером кастрюли', () => {
    const text = open(yogurt)
    expect(text).not.toContain('меньше кастрюли готовить непрактично')
    expect(text).toContain('собирают перед самой едой')
    expect(text).not.toContain('Это блюдо')
  })

  it('называет блюдо собираемым, а не сваренным один раз', () => {
    const text = open(yogurt)
    expect(text).not.toContain('Готовим один раз')
    expect(text).toContain('Собираем перед едой')
  })

  it('говорит все шесть вещей, которые человек спрашивает у карточки', () => {
    /*
     * Макет карточки, заданный пользователем, по смыслу:
     *   Нужно: 2 завтрака по 285 г
     *   Приготовить заранее: гранолу
     *   Перед едой: добавить йогурт и яблоко
     *   Купить: йогурт — упаковка
     *   Использовать: по фактическому рецепту
     *   Остаток упаковки: останется продуктом в холодильнике
     *
     * Первые три — про готовку и обе оси сразу: сколько нужно, что делается
     * заранее и что перед самой едой. Последние три — про покупку, и главное в
     * них то, что это другая величина: пачка не обязана уйти в блюдо целиком.
     */
    const text = open(yogurt)
    expect(text).toMatch(/Нужно2 завтрака по \d+ г/)
    expect(text).toContain('Приготовить заранее')
    expect(text).toContain('подсушить хлопья с мёдом на сковороде')
    expect(text).toContain('Перед едой')
    expect(text).toContain('собрать слоями в банку')
    expect(text).toMatch(/куплено/)
    expect(text).toContain('Продукты на всю готовку')
    expect(text).toContain('остаётся продуктом в холодильнике')
  })

  it('не путает «приготовить заранее» с «перед едой»', () => {
    /*
     * Гранолу можно подсушить хоть накануне — она от этого только лучше. А
     * яблоко темнеет, и гранола в йогурте размокает: это делается перед едой.
     * Если бы обе стопки схлопнулись в одну, совет вернулся бы к тому, с чего
     * начинали: «смешайте килограмм заранее».
     */
    const text = open(yogurt)
    const ahead = text.indexOf('Приготовить заранее')
    const before = text.indexOf('Перед едой')
    expect(ahead).toBeGreaterThan(0)
    expect(before).toBeGreaterThan(ahead)
    const aheadPart = text.slice(ahead, before)
    expect(aheadPart).toContain('подсушить хлопья')
    expect(aheadPart).not.toContain('нарезать яблоко')
    expect(aheadPart).not.toContain('собрать слоями')
  })

  it('у блюда, которое готовится целиком, этих строк нет', () => {
    // чечевичный суп варят и едят: делить шаги на «заранее» и «перед едой»
    // там нечего, и выдумывать такое деление — врать о кухне
    const text = open([
      entry('s1', 'lentil_soup', 'lunch', 0),
      entry('s2', 'lentil_soup', 'lunch', 1),
    ])
    expect(text).not.toContain('Приготовить заранее')
    expect(text).not.toContain('Перед едой')
  })

  it('показывает одно число вместо двух расходящихся', () => {
    /*
     * «Приготовим 1,0 кг» и «нужно по меню 570 г» — два числа про одну
     * готовку. Разницы между ними здесь нет по устройству, и показывать её
     * значит намекать на остаток, которого не будет.
     */
    const text = open(yogurt)
    expect(text).not.toContain('Приготовим')
    expect(text).not.toContain('Нужно по меню')
    expect(text).toContain('ровно на запланированные приёмы')
  })

  it('называет, кому и когда — по каждому приёму пищи', () => {
    const text = open(yogurt)
    expect(text).toContain('Кому и когда')
    expect(text).toContain('Понедельник')
    expect(text).toContain('Вторник')
  })

  it('калории всей готовки равны сумме приёмов пищи', () => {
    /*
     * Инвариант, ради которого всё и затевалось: на йогурте карточка
     * показывала 1631 ккал всей готовки против 790 в двух запланированных
     * завтраках — 841 незапланированная калория.
     *
     * Берём чиа-пудинг: он собирается так же, но состоит только из весовых
     * продуктов. У йогурта в составе половина яблока, а половину яблока в
     * блюдо не кладут — расход округляется до целого, и карточка честно
     * считает калории целого яблока, тогда как строки «кому и когда» берут
     * калорийность доли рецепта. Это отдельное расхождение, оно живёт в
     * lib/cookCard и здесь не чинится; на чиа-пудинге его нет.
     */
    const text = open([
      entry('a', 'chia_pudding', 'breakfast', 0),
      entry('b', 'chia_pudding', 'breakfast', 1),
    ])
    const total = Number(text.match(/Калории всей готовки(\d+) ккал/)?.[1])
    const rows = [...text.matchAll(/ г · (\d+) ккал/g)].map((m) => Number(m[1]))
    expect(total).toBeGreaterThan(0)
    expect(rows.length).toBe(2)
    const sum = rows.reduce((s, n) => s + n, 0)
    expect(Math.abs(sum - total), `${sum} роздано против ${total} приготовленных`).toBeLessThanOrEqual(2)
  })

  it('и на йогурте расходятся ровно на округление до целого яблока', () => {
    /*
     * Замер того, что осталось: было 841 ккал без адреса, стало 36 — ровно
     * половина яблока, которую нельзя не положить в блюдо. Порог сторожит,
     * чтобы расхождение не поползло обратно.
     */
    const text = open(yogurt)
    const total = Number(text.match(/Калории всей готовки(\d+) ккал/)?.[1])
    const rows = [...text.matchAll(/ г · (\d+) ккал/g)].map((m) => Number(m[1]))
    const sum = rows.reduce((s, n) => s + n, 0)
    expect(rows.length).toBe(2)
    expect(total - sum, `${sum} роздано против ${total} приготовленных`).toBeLessThan(total * 0.12)
  })

  it('у блюда с настоящей партией объяснение размера осталось', () => {
    /*
     * Обратная половина: борщ варят кастрюлей, и «потому что…» там на месте.
     * Иначе правка лечила бы не ту болезнь — молчанием вместо неправды.
     */
    const text = open([
      entry('c', 'lentil_soup', 'lunch', 0),
      entry('d', 'lentil_soup', 'lunch', 1),
    ])
    expect(text).toContain('Приготовим')
    expect(text).toContain('Нужно по меню')
    expect(text).toContain('Потому что')
    expect(text).toContain('Готовим один раз')
  })

  it('и остаток кастрюли называется добавкой, а не «доесть в ближайшие дни»', () => {
    /*
     * Кастрюлю нельзя сварить меньше кастрюли, и на два обеда её бывает много.
     * Лишнее при этом никуда не пропадает — его наливают в те же тарелки, — но
     * сказать об этом надо так, чтобы у граммов был адрес. «Доесть в ближайшие
     * дни» адресом не является: ни человека, ни дня, ни приёма пищи.
     *
     * Строка берётся из плана недели — того же, по которому считается закупка.
     * У карточки был свой счёт с другим порогом: она звала остатком на доесть
     * всё до полукилограмма, в том числе целые приёмы пищи, которые есть
     * некому.
     */
    const text = open([
      entry('e', 'lentil_soup', 'lunch', 0),
      entry('f', 'lentil_soup', 'dinner', 0),
    ], false)
    expect(text).not.toContain('доесть в ближайшие дни')
    expect(text).toContain('добавка к этим же приёмам пищи')
  })

  it('и лишний голубец не исчезает с карточки молча', () => {
    /*
     * Штучное блюдо раздаётся целыми изделиями, а план недели делит граммы:
     * шестнадцатый голубец у плана попадает в «роздано», а в строках «кому и
     * когда» его нет — там 4 + 4 + 3 + 4. Пока карточка брала остаток из
     * плана, этот голубец не появлялся на экране нигде: 2596 ккал всей готовки
     * против 2430 в приёмах пищи, и разница ничем не объяснена.
     *
     * Поэтому остаток считается от тех самых строк, которые человек видит, а
     * делится по общему с планом правилу — `splitLeftover`.
     */
    const text = open([
      entry('g', 'lazy_cabbage_rolls', 'dinner', 0, true),
      entry('h', 'lazy_cabbage_rolls', 'dinner', 1, true),
    ], true, true)
    const piece = /(\d+) (?:голубец|голубца|голубцов)/
    const cooked = Number(text.match(/Приготовим(\d+) голубц/)?.[1])
    const onPlates = [...text.matchAll(/(\d+) (?:голубец|голубца|голубцов) · \d+ ккал/g)].reduce(
      (sum, m) => sum + Number(m[1]),
      0,
    )
    const frozen = Number(text.match(new RegExp(`В морозилку${piece.source}`))?.[1] ?? 0)
    const extra = Number(text.match(new RegExp(`Сверх нормы${piece.source}`))?.[1] ?? 0)
    expect(cooked).toBeGreaterThan(0)
    expect(onPlates).toBeGreaterThan(0)
    // без морозилки лишнее деть некуда, и на карточке оно обязано быть названо
    expect(extra, `${cooked} приготовлено, ${onPlates} на тарелках`).toBeGreaterThan(0)
    // каждый голубец на учёте: тарелка, морозилка или добавка к тем же тарелкам
    expect(onPlates + frozen + extra, `${cooked} приготовлено`).toBe(cooked)
  })
})
