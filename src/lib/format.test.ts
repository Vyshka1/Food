import { describe, expect, it } from 'vitest'
import { decimal, plural, portionsLabel, shortDate} from './format'
import { formatQty, remainingToBuy, shoppingListText } from './shopping'
import { STORE_LABEL, shoppingByStore } from './stores'
import { CATEGORY_ORDER } from '../data/ingredients'
import { WEEKDAYS_ACC, WEEKDAYS_FULL } from './menu'
import { formatDuration } from './cookingPlan'

const dish: [string, string, string] = ['блюдо', 'блюда', 'блюд']

describe('plural', () => {
  it('склоняет по русским правилам', () => {
    expect([1, 2, 5, 11, 14, 21, 22, 25, 101].map((n) => plural(n, dish))).toEqual([
      'блюдо',
      'блюда',
      'блюд',
      'блюд',
      'блюд',
      'блюдо',
      'блюда',
      'блюд',
      'блюдо',
    ])
  })
})

describe('plural для людей', () => {
  it('1 человек, 2 человека, 5 человек', () => {
    const forms: [string, string, string] = ['человек', 'человека', 'человек']
    expect([1, 2, 3, 5, 11, 21, 22].map((n) => plural(n, forms))).toEqual([
      'человек',
      'человека',
      'человека',
      'человек',
      'человек',
      'человек',
      'человека',
    ])
  })
})

describe('formatQty', () => {
  it('переводит в кило- и литры от 1000', () => {
    expect(formatQty(950, 'g')).toBe('950 г')
    expect(formatQty(1400, 'g')).toBe('1,4 кг')
    expect(formatQty(2000, 'ml')).toBe('2 л')
    expect(formatQty(3, 'pcs')).toBe('3 шт')
  })
})

describe('formatDuration', () => {
  it('показывает часы и минуты', () => {
    expect(formatDuration(45)).toBe('45 мин')
    expect(formatDuration(60)).toBe('1 ч')
    expect(formatDuration(100)).toBe('1 ч 40 мин')
  })
})

describe('shoppingListText', () => {
  const list = {
    total: 300,
    lines: [
      { ingredientId: 'potato', name: 'Картофель', category: 'veg' as const, unit: 'g' as const, needed: 1200, buy: 1200, price: 60, staple: false },
      { ingredientId: 'salt', name: 'Соль', category: 'pantry' as const, unit: 'g' as const, needed: 30, buy: 1000, price: 30, staple: true },
      { ingredientId: 'milk', name: 'Молоко', category: 'dairy' as const, unit: 'ml' as const, needed: 900, buy: 1000, price: 90, staple: false },
    ],
  }

  const send = (opts: { atHome?: string[]; bought?: string[] } = {}) =>
    shoppingListText(list, {
      atHome: opts.atHome ?? [],
      bought: opts.bought ?? [],
      weekStart: '2026-09-07',
    })

  it('группирует по отделам зала и считает итог', () => {
    const text = send()
    expect(text).toContain('Продукты на неделю 7.09–13.09')
    // отдел, а не категория: «Овощи и фрукты», а не «Овощи и зелень»
    expect(text).toContain('Овощи и фрукты')
    expect(text).not.toContain('Овощи и зелень')
    expect(text).toContain('— Картофель, 1,2 кг')
    expect(text).toContain('— Молоко, 1 л')
    expect(text).toContain('Итого примерно 150 ₽')
  })

  /*
   * Маршрут в сообщении — тот же, что на экране. Пока текст шёл по категориям,
   * получатель списка ходил по залу иначе, чем его автор: «Мясо и птица»,
   * потом отдельной строкой «Рыба» (тот же прилавок) и «Яйца» отдельным
   * разделом вдали от молочного холодильника.
   */
  it('отделы идут в том же порядке, что и на экране', () => {
    const lines = [
      { ingredientId: 'egg', name: 'Яйца', category: 'egg' as const, unit: 'pcs' as const, needed: 10, buy: 10, price: 100, staple: false },
      { ingredientId: 'cod', name: 'Треска', category: 'fish' as const, unit: 'g' as const, needed: 500, buy: 500, price: 300, staple: false },
      { ingredientId: 'beef', name: 'Говядина', category: 'meat' as const, unit: 'g' as const, needed: 500, buy: 500, price: 400, staple: false },
      { ingredientId: 'rice', name: 'Рис', category: 'grain' as const, unit: 'g' as const, needed: 900, buy: 1000, price: 120, staple: false },
      { ingredientId: 'apple', name: 'Яблоко', category: 'fruit' as const, unit: 'pcs' as const, needed: 4, buy: 4, price: 80, staple: false },
    ]
    const sorted = [...lines].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
    )
    const text = shoppingListText(
      { lines: sorted, total: 1000 },
      { atHome: [], bought: [], weekStart: '2026-09-07' },
    )
    const heads = new Set(Object.values(STORE_LABEL))
    const shown = text.split('\n').filter((s) => heads.has(s))
    // тот же порядок обхода, что и у экрана, — и оба берут его из lib/stores
    expect(shown).toEqual(shoppingByStore(sorted).map((s) => s.label))
    // рыба идёт у того же прилавка, что и мясо, а яйца — в молочном отделе
    expect(text).not.toContain('Рыба\n')
    expect(text).not.toContain('Яйца\n— ')
    const at = (name: string) => text.indexOf(name)
    expect(at('— Треска,')).toBeGreaterThan(at(STORE_LABEL.meat))
    expect(at('— Треска,')).toBeLessThan(at(STORE_LABEL.dairy))
    expect(at('— Яйца,')).toBeGreaterThan(at(STORE_LABEL.dairy))
  })

  it('не пишет то, что есть дома, и специи', () => {
    const text = send({ atHome: ['milk'] })
    expect(text).not.toContain('Молоко')
    expect(text).not.toContain('Соль')
    expect(text).toContain('Итого примерно 60 ₽')
  })

  /*
   * Главное свойство: отправленный список и счётчик над кнопкой отвечают на
   * один вопрос. Раньше из магазина уходил весь список с полной суммой, хотя
   * половина строк была вычеркнута на экране.
   */
  it('отмеченное в магазине не уходит в сообщение — ни строкой, ни рублём', () => {
    const text = send({ bought: ['potato'] })
    expect(text).not.toContain('Картофель')
    expect(text).toContain('— Молоко, 1 л')
    expect(text).toContain('Итого примерно 90 ₽')
  })

  it('отмеченный список и целый различаются заголовком, а не молча', () => {
    expect(send()).toContain('Продукты на неделю 7.09–13.09')
    expect(send({ bought: ['potato'] })).toContain('Осталось купить на неделю 7.09–13.09')
    // «зайди по дороге»: до магазина ничего не отмечено — и уходит весь список
    expect(send({ bought: [] })).not.toContain('Осталось купить')
  })

  it('отметки на продуктах не из списка заголовок не меняют', () => {
    // в `bought` остаются продукты прошлой недели; списка они не касаются, и
    // называть из-за них целый список «остатком» — неправда
    const text = send({ bought: ['buckwheat'] })
    expect(text).toContain('Продукты на неделю 7.09–13.09')
    expect(text).toContain('Итого примерно 150 ₽')
  })

  it('вместо пустого списка с нулём называет причину пустоты', () => {
    expect(send({ bought: ['potato', 'milk'] })).toContain('Всё уже куплено.')
    expect(send({ bought: ['potato', 'milk'] })).not.toContain('Итого примерно 0 ₽')
    expect(send({ atHome: ['potato', 'milk'] })).toContain('Покупать нечего.')
  })
})

describe('remainingToBuy', () => {
  const list = {
    total: 150,
    lines: [
      { ingredientId: 'potato', name: 'Картофель', category: 'veg' as const, unit: 'g' as const, needed: 1200, buy: 1200, price: 60, staple: false },
      { ingredientId: 'salt', name: 'Соль', category: 'pantry' as const, unit: 'g' as const, needed: 30, buy: 1000, price: 30, staple: true },
      { ingredientId: 'milk', name: 'Молоко', category: 'dairy' as const, unit: 'ml' as const, needed: 900, buy: 1000, price: 90, staple: false },
    ],
  }

  it('убирает постоянные, домашние и уже купленное — и сумму считает по ним же', () => {
    expect(remainingToBuy(list, { atHome: [], bought: [] })).toEqual({
      lines: [list.lines[0], list.lines[2]],
      total: 150,
    })
    expect(remainingToBuy(list, { atHome: ['milk'], bought: [] }).total).toBe(60)
    expect(remainingToBuy(list, { atHome: [], bought: ['milk'] }).total).toBe(60)
    expect(remainingToBuy(list, { atHome: [], bought: ['potato', 'milk'] })).toEqual({
      lines: [],
      total: 0,
    })
  })
})

describe('portionsLabel', () => {
  it('склоняет целые порции по правилам русского', () => {
    expect(portionsLabel(1)).toBe('1 порция')
    expect(portionsLabel(2)).toBe('2 порции')
    expect(portionsLabel(5)).toBe('5 порций')
    expect(portionsLabel(11)).toBe('11 порций')
    expect(portionsLabel(21)).toBe('21 порция')
  })

  it('дробные ставит в родительный падеж, а не по целой части', () => {
    // «2,5 порций» — типичная ошибка: склонять по округлённой тройке нельзя
    expect(portionsLabel(2.5)).toBe('2,5 порции')
    expect(portionsLabel(1.5)).toBe('1,5 порции')
    expect(portionsLabel(0.5)).toBe('0,5 порции')
    expect(portionsLabel(4.5)).toBe('4,5 порции')
  })

  it('пишет десятичную запятую и не тянет лишний ноль', () => {
    expect(decimal(1)).toBe('1')
    expect(decimal(1.25)).toBe('1,3')
    expect(portionsLabel(3.0)).toBe('3 порции')
  })
})

describe('дни недели в винительном падеже', () => {
  it('«на среду», а не «на среда»', () => {
    // на экране разморозки именительный давал «на пятница» — видно сразу,
    // но только если посмотреть
    expect(`на ${WEEKDAYS_ACC[2]}`).toBe('на среду')
    expect(`на ${WEEKDAYS_ACC[4]}`).toBe('на пятницу')
    expect(`на ${WEEKDAYS_ACC[5]}`).toBe('на субботу')
  })

  it('дни, которые не меняются, остаются как есть', () => {
    expect(WEEKDAYS_ACC[0]).toBe('понедельник')
    expect(WEEKDAYS_ACC[3]).toBe('четверг')
    expect(WEEKDAYS_ACC[6]).toBe('воскресенье')
  })

  it('совпадает по длине с остальными списками дней', () => {
    expect(WEEKDAYS_ACC).toHaveLength(7)
    expect(WEEKDAYS_FULL).toHaveLength(7)
  })
})

describe('shortDate', () => {
  it('читается по-русски, а не по-американски', () => {
    // «10-07» из ISO-строки читается как десятое июля, хотя это седьмое октября
    expect(shortDate('2026-10-07')).toBe('07.10')
    expect(shortDate('2026-01-31')).toBe('31.01')
  })
})
