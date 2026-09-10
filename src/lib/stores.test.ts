import { describe, expect, it } from 'vitest'
import { CATEGORY_ORDER } from '../data/ingredients'
import type { IngredientCategory, ShoppingLine } from '../types'
import { STORE_ORDER, categoriesOf, shoppingByStore, storeOf } from './stores'

function line(id: string, category: IngredientCategory, price: number): ShoppingLine {
  return {
    ingredientId: id,
    name: id,
    category,
    unit: 'g',
    needed: 100,
    buy: 100,
    price,
    staple: false,
  }
}

describe('отделы магазина', () => {
  it('у каждой категории есть отдел', () => {
    for (const category of CATEGORY_ORDER) {
      expect(STORE_ORDER, `категория ${category}`).toContain(storeOf(category))
    }
  })

  it('яйца и рыбу ищут там, где они лежат, а не там, где они в списке', () => {
    // за яйцами идут к молочному холодильнику, за рыбой — к мясному прилавку
    expect(storeOf('egg')).toBe('dairy')
    expect(storeOf('fish')).toBe('meat')
  })

  it('категории отдела и отдел категории говорят одно и то же', () => {
    for (const kind of STORE_ORDER) {
      for (const category of categoriesOf(kind)) expect(storeOf(category)).toBe(kind)
    }
    // и наоборот: ни одна категория не потерялась по дороге
    const all = STORE_ORDER.flatMap(categoriesOf)
    expect([...all].sort()).toEqual([...CATEGORY_ORDER].sort())
  })

  it('категории отдела идут в порядке списка покупок', () => {
    // фильтр отдела подсвечивает те же категории и в том же порядке, что и
    // заголовки в списке, иначе чипы и список расходятся
    expect(categoriesOf('produce')).toEqual(['veg', 'fruit'])
    expect(categoriesOf('grocery')).toEqual(['grain', 'legume', 'nuts', 'pantry'])
  })
})

describe('разбор закупки по отделам', () => {
  const lines = [
    line('morkov', 'veg', 40),
    line('yabloko', 'fruit', 90),
    line('kurica', 'meat', 300),
    line('treska', 'fish', 250),
    line('yaico', 'egg', 120),
    line('ris', 'grain', 80),
  ]

  it('складывает соседние категории в один отдел', () => {
    const rows = shoppingByStore(lines)
    const produce = rows.find((r) => r.kind === 'produce')
    expect(produce?.count).toBe(2)
    expect(produce?.price).toBe(130)

    const meat = rows.find((r) => r.kind === 'meat')
    expect(meat?.count).toBe(2)
    expect(meat?.price).toBe(550)
  })

  it('ничего не теряет и ничего не удваивает', () => {
    const rows = shoppingByStore(lines)
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(lines.length)
    expect(rows.reduce((s, r) => s + r.price, 0)).toBe(
      lines.reduce((s, l) => s + l.price, 0),
    )
  })

  it('пустые отделы не показываются', () => {
    const rows = shoppingByStore([line('ris', 'grain', 80)])
    expect(rows.map((r) => r.kind)).toEqual(['grocery'])
  })

  it('порядок отделов — порядок обхода магазина, а не порядок строк', () => {
    // хлеб в списке первый, но в тележку он должен лечь последним
    const rows = shoppingByStore([
      line('hleb', 'bakery', 60),
      line('moloko', 'dairy', 90),
      line('morkov', 'veg', 40),
    ])
    expect(rows.map((r) => r.kind)).toEqual(['produce', 'dairy', 'bakery'])
  })
})
