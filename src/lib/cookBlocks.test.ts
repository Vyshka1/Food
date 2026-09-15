import { describe, expect, it } from 'vitest'
import type { PlannedStep } from '../types'
import {
  BLOCK_GAP_MINUTES,
  BLOCK_MAX_STEPS,
  BLOCK_SPAN_MINUTES,
  FIRST_BLOCK_MINUTES,
  blockHint,
  blockTitle,
  cookBlocks,
} from './cookBlocks'

/*
 * Блоки отвечают на вопрос «что делать сейчас». Проверяем не форму, а три
 * обещания: ни один шаг не потерян, границы стоят там, где человек и правда
 * переводит дух, и первый блок остаётся коротким.
 */

function step(patch: Partial<PlannedStep> & { start: number; end: number }): PlannedStep {
  return {
    recipeId: 'r1',
    title: 'Блюдо',
    emoji: '',
    stepIndex: 0,
    text: 'шаг',
    station: 'prep',
    handsOn: true,
    activeMinutes: patch.end - patch.start,
    unattended: false,
    cook: 0,
    ...patch,
  }
}

describe('блоки готовки', () => {
  it('ни один шаг не теряется и не задваивается', () => {
    const steps = [
      step({ start: 0, end: 5 }),
      step({ start: 2, end: 4, stepIndex: 1 }),
      step({ start: 40, end: 45, stepIndex: 2 }),
      step({ start: 41, end: 43, stepIndex: 3 }),
    ]
    const flat = cookBlocks(steps).flatMap((b) => b.steps)
    expect(flat).toHaveLength(steps.length)
    expect(new Set(flat.map((s) => s.stepIndex)).size).toBe(steps.length)
  })

  it('пауза начинает новый блок, а плотная работа — нет', () => {
    const tight = cookBlocks([
      step({ start: 0, end: 2 }),
      step({ start: 2, end: 4, stepIndex: 1 }),
    ])
    expect(tight).toHaveLength(1)

    const paused = cookBlocks([
      step({ start: 0, end: 2 }),
      step({ start: 2 + BLOCK_GAP_MINUTES, end: 30, stepIndex: 1 }),
    ])
    expect(paused).toHaveLength(2)
    expect(paused[1].start).toBe(2 + BLOCK_GAP_MINUTES)
  })

  it('первый блок короче остальных: «начните» — это про сейчас', () => {
    const steps = Array.from({ length: 12 }, (_, i) =>
      step({ start: i * 2, end: i * 2 + 1, stepIndex: i, activeMinutes: 1 }),
    )
    const blocks = cookBlocks(steps)
    const firstSpan = Math.max(...blocks[0].steps.map((s) => s.start)) - blocks[0].start
    expect(firstSpan).toBeLessThan(FIRST_BLOCK_MINUTES)
    // а следующему блоку разрешено быть длиннее
    expect(BLOCK_SPAN_MINUTES).toBeGreaterThan(FIRST_BLOCK_MINUTES)
    const secondSpan = Math.max(...blocks[1].steps.map((s) => s.start)) - blocks[1].start
    expect(secondSpan).toBeGreaterThanOrEqual(firstSpan)
  })

  it('«пока всё варится» — только когда что-то правда варится', () => {
    const blocks = cookBlocks([
      step({ start: 0, end: 45, unattended: true, activeMinutes: 2 }),
      step({ start: 10, end: 12, stepIndex: 1 }),
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[1].waiting).toBe(true)
    expect(blockTitle(blocks[1], 1, 3)).toBe('Пока всё варится')

    const dry = cookBlocks([
      step({ start: 0, end: 2 }),
      step({ start: 10, end: 12, stepIndex: 1 }),
    ])
    expect(dry[1].waiting).toBe(false)
    expect(blockTitle(dry[1], 1, 3)).toBe('Готовим дальше')
  })

  it('одному повару не обещают одновременность', () => {
    const blocks = cookBlocks([step({ start: 0, end: 2 }), step({ start: 1, end: 3, stepIndex: 1 })])
    const alone = blockHint(blocks[0], 0, 2, 1)
    const pair = blockHint(blocks[0], 0, 2, 2)

    expect(alone).toContain('по порядку')
    expect(alone.toLowerCase()).not.toContain('одновременно')
    expect(pair).toContain('двое')
    expect(blockTitle(blocks[0], 0, 2)).toBe('Начните с этих двух шагов')
  })

  it('«варится» — это про то, что идёт само, а не про чужие руки', () => {
    /*
     * Мутация «убрать проверку unattended» пережила прежний тест: в нём шаги
     * вообще не пересекались по времени. Здесь пересекаются — но первый шаг
     * занимает руки, а не стоит на плите.
     */
    const busyHands = cookBlocks([
      step({ start: 0, end: 45, unattended: false, activeMinutes: 45 }),
      step({ start: 10, end: 12, stepIndex: 1 }),
    ])
    expect(busyHands[busyHands.length - 1].waiting).toBe(false)
  })

  it('шаги приходят в любом порядке, а блоки выходят по времени', () => {
    const blocks = cookBlocks([
      step({ start: 40, end: 42, stepIndex: 2 }),
      step({ start: 0, end: 2, stepIndex: 0 }),
      step({ start: 1, end: 3, stepIndex: 1 }),
    ])
    expect(blocks[0].start).toBe(0)
    expect(blocks.flatMap((b) => b.steps).map((s) => s.stepIndex)).toEqual([0, 1, 2])
  })

  it('поставить и отойти — это всё же минута занятых рук', () => {
    /*
     * У шага с activeMinutes = 0 руки заняты хотя бы на постановку. Без этой
     * минуты пауза считается от самого старта, и шаг, начатый ровно через
     * BLOCK_GAP_MINUTES, ошибочно открывает новый блок: человек не отходил,
     * он всё это время был у плиты.
     */
    const blocks = cookBlocks([
      step({ start: 0, end: 45, activeMinutes: 0, unattended: true }),
      step({ start: BLOCK_GAP_MINUTES, end: 8, stepIndex: 1 }),
    ])
    expect(blocks).toHaveLength(1)
  })

  it('заголовки крайних блоков не путаются', () => {
    const one = cookBlocks([step({ start: 0, end: 2 })])
    expect(blockTitle(one[0], 0, 1)).toBe('Начните с первого шага')

    const blocks = cookBlocks([
      step({ start: 0, end: 2 }),
      step({ start: 30, end: 32, stepIndex: 1 }),
      step({ start: 60, end: 62, stepIndex: 2 }),
    ])
    expect(blockTitle(blocks[blocks.length - 1], blocks.length - 1, blocks.length)).toBe(
      'Заканчиваем',
    )
    expect(blockTitle(blocks[1], 1, blocks.length)).not.toBe('Заканчиваем')
  })

  /*
   * Вдвоём за те же минуты успевают вдвое больше, и потолок по времени
   * перестаёт сдерживать длину блока: замер показал каждый пятый блок длиннее
   * семи шагов. Поэтому есть отдельный потолок по шагам.
   */
  it('плотная работа внутри одного окна режется по числу шагов', () => {
    // первый шаг отдельно, дальше восемь подряд в одном окне по времени
    const steps = [
      step({ start: 0, end: 1, activeMinutes: 1 }),
      ...Array.from({ length: 8 }, (_, i) =>
        step({ start: 20 + i, end: 21 + i, stepIndex: i + 1, activeMinutes: 1 }),
      ),
    ]
    // восьмёрка укладывается и в паузу, и в потолок по времени
    expect(7).toBeLessThan(BLOCK_SPAN_MINUTES)
    expect(1).toBeLessThan(BLOCK_GAP_MINUTES)

    const blocks = cookBlocks(steps)
    expect(blocks.map((b) => b.steps.length)).toEqual([1, BLOCK_MAX_STEPS, 3])
  })

  it('одну минуту потолок по шагам не разрывает', () => {
    // восемь шагов в одну и ту же минуту: два повара взялись разом
    const steps = Array.from({ length: 8 }, (_, i) =>
      step({ start: 0, end: 3, stepIndex: i, activeMinutes: 3 }),
    )
    const blocks = cookBlocks(steps)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].steps).toHaveLength(8)
  })

  it('пустой план не выдумывает блоков', () => {
    expect(cookBlocks([])).toEqual([])
  })
})
