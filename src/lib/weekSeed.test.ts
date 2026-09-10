import { describe, expect, it } from 'vitest'
import { mulberry32 } from './random'
import { weekSeed } from './weekSeed'

/*
 * Зерно недели — то, на чём держится обещание предпросмотра: показанное в
 * воскресенье меню следующей недели должно совпасть с тем, что приложение
 * соберёт в понедельник. Совпадёт оно только если зерно у обеих сборок одно.
 */

describe('зерно недели', () => {
  it('одна и та же неделя — одно и то же зерно', () => {
    expect(weekSeed('2026-09-14')).toBe(weekSeed('2026-09-14'))
  })

  it('разные недели — разные зёрна', () => {
    const seeds = new Set<number>()
    for (let i = 0; i < 52; i++) {
      const d = new Date(2026, 0, 5 + i * 7)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      seeds.add(weekSeed(iso))
    }
    expect(seeds.size).toBe(52)
  })

  /*
   * Соседние понедельники отличаются одной-двумя цифрами. Простая сумма кодов
   * символов дала бы им соседние зёрна, а близкие зёрна mulberry32 разводит не
   * с первого числа: две недели подряд начинались бы одинаково подобранными
   * блюдами. Проверяем не хеш, а то, ради чего он нужен.
   */
  it('соседние недели расходятся с первого же случайного числа', () => {
    const a = mulberry32(weekSeed('2026-09-07'))
    const b = mulberry32(weekSeed('2026-09-14'))
    expect(Math.abs(a() - b())).toBeGreaterThan(0.05)
  })

  it('зерно — целое неотрицательное: mulberry32 работает с uint32', () => {
    const seed = weekSeed('2026-12-28')
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(2 ** 32)
  })
})
