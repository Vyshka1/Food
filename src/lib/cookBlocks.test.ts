import { describe, expect, it } from 'vitest'
import type { PlannedStep } from '../types'
import {
  BLOCK_GAP_MINUTES,
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

  it('пустой план не выдумывает блоков', () => {
    expect(cookBlocks([])).toEqual([])
  })
})
