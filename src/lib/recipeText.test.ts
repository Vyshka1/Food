import { describe, expect, it } from 'vitest'
import {
  findIngredient,
  parseItemLines,
  minutesIn,
  parseAmount,
  parseItemLine,
  parseRecipeText,
  parseServings,
  splitSections,
  toBaseQty,
} from './recipeText'
import { INGREDIENT_BY_ID } from '../data/ingredients'
import { statsOf } from './nutrition'

describe('название продукта', () => {
  it('узнаёт продукт в родительном падеже — в рецептах пишут только так', () => {
    expect(findIngredient('творога')).toBe('cottage_cheese')
    expect(findIngredient('муки')).toBe('flour')
    expect(findIngredient('сметаны')).toBe('sour_cream')
    expect(findIngredient('чечевицы')).toBe('lentils')
    expect(findIngredient('бананов')).toBe('banana')
  })

  it('и там, где гласная убегает при склонении', () => {
    // «перца» против «перец», «кабачка» против «кабачок» — без этого правила
    // не сходится ни одно такое слово, а их в базе полтора десятка
    expect(findIngredient('чёрного перца')).toBe('pepper')
    expect(findIngredient('кабачка')).toBe('zucchini')
    expect(findIngredient('креветок')).toBe('shrimp')
    expect(findIngredient('свежего огурца')).toBe('cucumber')
  })

  it('не путается в порядке слов', () => {
    // в базе «Масло сливочное», в рецепте «сливочного масла»
    expect(findIngredient('сливочного масла')).toBe('butter')
    expect(findIngredient('оливкового масла')).toBe('olive_oil')
    expect(findIngredient('твёрдого сыра')).toBe('cheese')
  })

  it('пропускает слова, которые описывают, а не называют', () => {
    expect(findIngredient('мелко нарезанного лука')).toBe('onion')
    expect(findIngredient('свежей моркови')).toBe('carrot')
  })

  it('уточняющее слово решает, что это за продукт', () => {
    // «помидоры черри» — это черри, а не помидоры
    expect(findIngredient('помидоры черри')).toBe('cherry_tomato')
    expect(findIngredient('перец')).toBe('pepper')
    expect(findIngredient('болгарский перец')).toBe('bell_pepper')
  })

  it('знает обиходные слова, которых из букв не вывести', () => {
    expect(findIngredient('зелень')).toBe('greens')
    expect(findIngredient('петрушка')).toBe('greens')
    expect(findIngredient('курица')).toBe('chicken_fillet')
    expect(findIngredient('картошка')).toBe('potato')
  })

  it('узнаёт продукт по названию штуки', () => {
    expect(findIngredient('луковица')).toBe('onion')
    expect(findIngredient('зубчика чеснока')).toBe('garlic')
  })

  it('честно молчит о том, чего в базе нет', () => {
    // выдумать здесь ответ хуже, чем не ответить: продукт с чужим id дальше
    // молча пропускается, и блюдо считается на ноль калорий
    expect(findIngredient('ванилин')).toBeNull()
    expect(findIngredient('крахмал')).toBeNull()
    expect(findIngredient('')).toBeNull()
  })
})

describe('количество', () => {
  it('читает то, как числа пишут люди', () => {
    expect(parseAmount('200 г творога')?.value).toBe(200)
    expect(parseAmount('1,5 стакана')?.value).toBe(1.5)
    expect(parseAmount('1/2 стакана')?.value).toBe(0.5)
    expect(parseAmount('½ луковицы')?.value).toBe(0.5)
    expect(parseAmount('полстакана молока')?.value).toBe(0.5)
  })

  it('в вилке берёт середину — точнее текст не говорит', () => {
    expect(parseAmount('2-3 яйца')?.value).toBe(2.5)
  })

  it('складывает целое с дробью', () => {
    expect(parseAmount('1½ стакана')?.value).toBe(1.5)
    expect(parseAmount('1 1/2 стакана')?.value).toBe(1.5)
  })

  it('без числа не выдумывает единицу', () => {
    expect(parseAmount('соль по вкусу')).toBeNull()
  })
})

describe('меры', () => {
  const flour = INGREDIENT_BY_ID['flour']
  const egg = INGREDIENT_BY_ID['egg']
  const oil = INGREDIENT_BY_ID['olive_oil']

  it('ложки считает по весу этого продукта, а не по общему числу', () => {
    // столовая ложка муки — 30 г, а масла — 17 мл
    expect(toBaseQty(flour, 2, { kind: 'tbsp' })?.qty).toBe(60)
    expect(toBaseQty(oil, 2, { kind: 'tbsp' })?.qty).toBe(34)
  })

  it('чайная — треть столовой', () => {
    expect(toBaseQty(flour, 3, { kind: 'tsp' })?.qty).toBe(30)
  })

  it('стакан сыпучего — по продукту, а не по объёму', () => {
    // стакан муки весит 130 г, а не 250: объём и вес это разные вещи
    expect(toBaseQty(flour, 1, { kind: 'cup' })?.qty).toBe(130)
  })

  it('и говорит вслух, когда посчитал стакан объёмом', () => {
    const cheese = INGREDIENT_BY_ID['cheese']
    const result = toBaseQty(cheese, 1, { kind: 'cup' })
    expect(result?.note).toContain('проверьте')
  })

  it('штучное остаётся в штуках', () => {
    expect(toBaseQty(egg, 3, { kind: 'piece' })?.qty).toBe(3)
    // 110 г яиц — это два яйца по 55 г
    expect(toBaseQty(egg, 110, { kind: 'gram' })?.qty).toBe(2)
  })

  it('вес штуки берётся из базы: «2 луковицы» это 180 г', () => {
    expect(toBaseQty(INGREDIENT_BY_ID['onion'], 2, { kind: 'piece' })?.qty).toBe(180)
  })

  it('не выдумывает ложку там, где её вес не задан', () => {
    // у трески нет tbspGrams, и придумывать его нельзя
    expect(toBaseQty(INGREDIENT_BY_ID['cod'], 2, { kind: 'tbsp' })).toBeNull()
  })
})

describe('строка состава', () => {
  it('читает и «200 г творога», и «Творог — 200 г»', () => {
    expect(parseItemLine('200 г творога')?.item).toEqual({ ingredientId: 'cottage_cheese', qty: 200 })
    expect(parseItemLine('Творог — 200 г')?.item).toEqual({ ingredientId: 'cottage_cheese', qty: 200 })
    expect(parseItemLine('- Творог: 200 г')?.item).toEqual({ ingredientId: 'cottage_cheese', qty: 200 })
  })

  it('без меры количество считается в единицах продукта', () => {
    expect(parseItemLine('2 яйца')?.item).toEqual({ ingredientId: 'egg', qty: 2 })
  })

  it('«по вкусу» не выбрасывает продукт из состава', () => {
    // ноль здесь означал бы, что соли в блюде нет вовсе: `clean` выкинет строку
    const parsed = parseItemLine('соль по вкусу')
    expect(parsed?.item.ingredientId).toBe('salt')
    expect(parsed?.item.qty).toBeGreaterThan(0)
    expect(parsed?.note).toContain('не указано')
  })

  it('незнакомый продукт возвращает null, а не пустую строку состава', () => {
    expect(parseItemLine('щепотка ванилина')).toBeNull()
  })
})

describe('разделы', () => {
  it('делит по заголовкам, если они есть', () => {
    const { items, steps } = splitSections(
      ['Ингредиенты:', '- 200 г творога', '- 2 яйца', 'Приготовление:', 'Смешать всё вилкой.'].join('\n'),
    )
    expect(items).toEqual(['200 г творога', '2 яйца'])
    expect(steps).toEqual(['Смешать всё вилкой.'])
  })

  it('и по виду строки, когда заголовков нет', () => {
    const { items, steps } = splitSections(
      ['300 г куриного филе', '1 луковица', 'Обжарить лук до золотистого цвета, добавить курицу.'].join('\n'),
    )
    expect(items).toHaveLength(2)
    expect(steps).toHaveLength(1)
  })
})

describe('порции и время', () => {
  it('находит число порций в тексте', () => {
    expect(parseServings('Сырники на 4 порции')).toBe(4)
    expect(parseServings('на 2-3 человека')).toBe(3)
    expect(parseServings('просто рецепт')).toBeNull()
  })

  it('читает время шага из его же текста', () => {
    expect(minutesIn('варить до мягкости 25 минут')).toBe(25)
    expect(minutesIn('запекать 1 час')).toBe(60)
    expect(minutesIn('нарезать овощи')).toBeNull()
  })
})

describe('разбор целого рецепта', () => {
  const REEL = `Сырники из творога
на 4 порции

Ингредиенты:
- 400 г творога
- 2 яйца
- 3 ст. л. муки
- 1 ст. л. сахара
- щепотка соли
- ванилин по вкусу

Приготовление:
1. Размять творог вилкой, добавить яйца и сахар.
2. Всыпать муку и соль, вымесить тесто.
3. Обжарить на сковороде по 4 минуты с каждой стороны.`

  it('количества делятся на порции: в рецепте они на одного', () => {
    const { recipe, servings } = parseRecipeText(REEL)
    expect(servings).toBe(4)
    const tvorog = recipe.items.find((i) => i.ingredientId === 'cottage_cheese')
    // 400 г на четверых — это 100 г на порцию, а не 400
    expect(tvorog?.qty).toBe(100)
    expect(recipe.items.find((i) => i.ingredientId === 'egg')?.qty).toBe(0.5)
    // три столовые ложки муки — 90 г, на порцию 22.5
    expect(recipe.items.find((i) => i.ingredientId === 'flour')?.qty).toBeCloseTo(22.5, 5)
  })

  it('нераспознанное видно, а не выброшено', () => {
    // самое опасное молчание: продукт исчезает, и блюдо считается на ноль
    const { unresolved } = parseRecipeText(REEL)
    expect(unresolved).toEqual(['ванилин по вкусу'])
  })

  it('шаги становятся шагами, и время читается из текста', () => {
    const { recipe } = parseRecipeText(REEL)
    expect(recipe.steps).toHaveLength(3)
    expect(recipe.steps[2].text).toContain('Обжарить')
    expect(recipe.steps[2].minutes).toBe(4)
    // прибор выводится тем же кодом, что и у встроенных рецептов
    expect(recipe.steps[2].station).not.toBe('prep')
  })

  it('название берётся из первой строки', () => {
    expect(parseRecipeText(REEL).recipe.title).toBe('Сырники из творога')
  })

  it('получается рецепт, который приложение считает как свой', () => {
    const { recipe } = parseRecipeText(REEL)
    const stats = statsOf(recipe.items)
    // блюдо на ноль калорий — признак того, что состав потерялся
    expect(stats.kcal).toBeGreaterThan(150)
    expect(stats.kcal).toBeLessThan(500)
    expect(stats.protein).toBeGreaterThan(10)
  })

  it('число порций можно задать снаружи: в тексте его часто нет', () => {
    const { recipe } = parseRecipeText(REEL, { servings: 2 })
    expect(recipe.items.find((i) => i.ingredientId === 'cottage_cheese')?.qty).toBe(200)
  })

  it('на пустом тексте не падает и не выдумывает рецепт', () => {
    const { recipe, unresolved } = parseRecipeText('')
    expect(recipe.items).toEqual([])
    expect(unresolved).toEqual([])
    expect(recipe.steps).toHaveLength(1)
  })

  it('одинаковый продукт из двух строк складывается, а не задваивается', () => {
    const { recipe } = parseRecipeText(
      'Ингредиенты:\n- 100 г лука\n- 1 луковица\nПриготовление:\nОбжарить.',
      { servings: 1 },
    )
    expect(recipe.items.filter((i) => i.ingredientId === 'onion')).toHaveLength(1)
    expect(recipe.items.find((i) => i.ingredientId === 'onion')?.qty).toBe(190)
  })
})

/*
 * Тексты, на которых модуль проверялся впервые. Каждый нашёл настоящую ошибку:
 * «тыква 800 г» не разбиралась вовсе, «соль, перец по вкусу» молча теряла
 * перец, а название блюда уходило в шаги и становилось подготовкой на десять
 * минут. Поэтому они и остаются здесь.
 */
describe('рецепты, как их пишут в интернете', () => {
  it('количество после названия — такая же обычная запись, как и до', () => {
    // «тыква 800 г»: разделителя нет вовсе, а количество есть
    expect(parseItemLine('тыква 800 г')?.item).toEqual({ ingredientId: 'pumpkin', qty: 800 })
    expect(parseItemLine('изюм 50 г')?.item).toEqual({ ingredientId: 'raisins', qty: 50 })
  })

  it('процент в названии — не количество', () => {
    // «Сливки 10% — 200 мл»: если взять первое число, выйдет 10 мл сливок
    expect(parseItemLine('Сливки 10% — 200 мл')?.item).toEqual({ ingredientId: 'cream_10', qty: 200 })
    expect(parseItemLine('Творог 5% 400 г')?.item).toEqual({ ingredientId: 'cottage_cheese', qty: 400 })
  })

  it('два продукта в строке не превращаются в один', () => {
    /*
     * Самая тихая потеря из всех: поиск умеет отбрасывать лишнее слово и на
     * «соль, перец по вкусу» честно находил соль, забыв про перец. Ни в составе,
     * ни в списке нераспознанного перца не оставалось.
     */
    const { items } = parseItemLines('соль, перец по вкусу')
    expect(items.map((i) => i.ingredientId).sort()).toEqual(['pepper', 'salt'])
  })

  it('а запятая внутри числа строку не делит', () => {
    const { items } = parseItemLines('1,5 стакана муки')
    expect(items).toHaveLength(1)
    expect(items[0].qty).toBe(195)
  })

  it('название блюда не становится шагом готовки', () => {
    const { recipe } = parseRecipeText(
      ['Паста с курицей в сливочном соусе', '250 г пасты', 'Отварить пасту 10 минут.'].join('\n'),
    )
    expect(recipe.title).toBe('Паста с курицей в сливочном соусе')
    expect(recipe.steps).toHaveLength(1)
    expect(recipe.steps[0].text).toContain('Отварить')
  })

  it('и название, называющее свой продукт, — тоже название', () => {
    // «Сырники из творога» — это заголовок, а не четыреста граммов творога
    const { recipe } = parseRecipeText('Сырники из творога\n400 г творога\nЖарить 5 минут.')
    expect(recipe.title).toBe('Сырники из творога')
    expect(recipe.items).toHaveLength(1)
  })

  it('шаги попадают на свою станцию: план готовки считает конфорки и духовку', () => {
    const { recipe } = parseRecipeText(
      [
        'Запеканка',
        '500 г творога',
        'Приготовление:',
        'Смешать творог с яйцами.',
        'Обжарить лук на сковороде 5 минут.',
        'Запекать в духовке при 180 градусах 35 минут.',
      ].join('\n'),
    )
    expect(recipe.steps.map((s) => s.station)).toEqual(['prep', 'stove', 'oven'])
    expect(recipe.steps[2].minutes).toBe(35)
    // температуру достаёт тот же вывод, что и у встроенных рецептов
    expect(recipe.steps[2].tempC).toBe(180)
  })

  it('чего нет в базе — то в списке нераспознанного, а не в тишине', () => {
    // манной крупы в базе нет, и выдумывать замену нельзя
    const { unresolved } = parseRecipeText('Запеканка\nПонадобится:\n500 г творога\n4 ст. л. манки')
    expect(unresolved).toEqual(['4 ст. л. манки'])
  })
})
