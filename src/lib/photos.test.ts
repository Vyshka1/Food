import { describe, expect, it } from 'vitest'
import { RECIPES, RECIPE_BY_ID } from '../data/recipes'
import { dishPhoto, photoCoverage, pickPhoto } from './photos'

const dishFiles = { '../assets/photos/dish/draniki.webp': '/assets/draniki-abc.webp' }
const kindFiles = {
  '../assets/photos/kind/pancake.webp': '/assets/pancake-def.webp',
  '../assets/photos/kind/soup.webp': '/assets/soup-ghi.webp',
}

describe('какое фото показать', () => {
  it('своё фото блюда — точное и без оговорок', () => {
    const photo = pickPhoto(RECIPE_BY_ID['draniki'], dishFiles, kindFiles)
    expect(photo?.src).toBe('/assets/draniki-abc.webp')
    expect(photo?.exact).toBe(true)
    expect(photo?.alt).toBe('Идеальные драники')
  })

  it('без своего берёт категорийное и помечает его как похожее', () => {
    // сырники — та же категория, что и драники, но своего фото у них нет
    const photo = pickPhoto(RECIPE_BY_ID['cottage_pancakes'], dishFiles, kindFiles)
    expect(photo?.src).toBe('/assets/pancake-def.webp')
    expect(photo?.exact).toBe(false)
    // подпись обязана говорить, что блюдо похожее: выдавать чужой снимок за
    // фотографию этого блюда нельзя
    expect(photo?.alt).toContain('Похожее блюдо')
  })

  it('когда нет ни своего, ни категорийного — ничего, а не битая картинка', () => {
    const photo = pickPhoto(RECIPE_BY_ID['borsch'], dishFiles, {})
    expect(photo).toBeNull()
  })

  it('фото из чужой папки не подходит', () => {
    // файл с именем блюда, но лежащий в kind/, своим фото не считается
    const misplaced = { '../assets/photos/kind/draniki.webp': '/assets/x.webp' }
    expect(pickPhoto(RECIPE_BY_ID['draniki'], misplaced, {})).toBeNull()
  })
})

describe('пока фотографий нет', () => {
  it('ни одно блюдо не ломается — приложение показывает иконки', () => {
    for (const recipe of RECIPES) {
      expect(dishPhoto(recipe)).toBeNull()
    }
  })

  it('покрытие считается честно', () => {
    const coverage = photoCoverage(RECIPES)
    expect(coverage.own + coverage.kind + coverage.none).toBe(RECIPES.length)
    expect(coverage.none).toBe(RECIPES.length)
  })
})
