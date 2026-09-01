import { describe, expect, it } from 'vitest'
import {
  calculateBestRowHeight,
  buildColumnWidthsFromValues,
  calculateBestColumnWidth,
  calculateButtonGroupHeight,
  calculateCellContentHeight,
  normalizeColumnWidth,
  normalizeRowHeight,
} from './gridOps'
import { DEFAULT_CELL_LAYOUT } from './cellLayout'

describe('gridOps sizing', () => {
  it('builds Excel widths from field values while preserving hidden-column offset', () => {
    expect(buildColumnWidthsFromValues([{ field: 'name', header: 'Name' }, { field: 'link', header: 'Link' }], { name: 101, link: 202 }, { A: 50 }, true)).toEqual({ A: 50, B: 101, C: 202 })
  })

  it('normalizes row height and column width', () => {
    expect(normalizeRowHeight(10)).toBe(24)
    expect(normalizeRowHeight(1001)).toBe(1000)
    expect(normalizeRowHeight('bad')).toBe(46)
    expect(normalizeColumnWidth(10)).toBe(40)
    expect(normalizeColumnWidth(1200)).toBe(1000)
    expect(normalizeColumnWidth(undefined)).toBe(120)
  })

  it('calculates button group height for row and column flows', () => {
    expect(calculateButtonGroupHeight(5, { ...DEFAULT_CELL_LAYOUT.buttonGroup, flow: 'row', count: 2, gap: 8 })).toBe(100)
    expect(calculateButtonGroupHeight(5, { ...DEFAULT_CELL_LAYOUT.buttonGroup, flow: 'column', count: 2, gap: 8 })).toBe(64)
    expect(calculateButtonGroupHeight(0, DEFAULT_CELL_LAYOUT.buttonGroup)).toBe(0)
  })

  it('calculates a best-fit column width from text and button labels', () => {
    expect(calculateBestColumnWidth([{ text: 'short' }])).toBe(64)
    expect(calculateBestColumnWidth([{ text: 'x', buttonLabels: ['打开', '详情'], layout: { ...DEFAULT_CELL_LAYOUT, buttonGroup: { ...DEFAULT_CELL_LAYOUT.buttonGroup, flow: 'column', count: 1, gap: 8 } } }])).toBeGreaterThan(100)
    expect(calculateBestColumnWidth([{ text: 'x'.repeat(300) }])).toBe(1000)
    expect(calculateBestColumnWidth([{ text: 'x', buttonLabels: ['LONG LABEL', 'B', 'A'], layout: { ...DEFAULT_CELL_LAYOUT, buttonGroup: { ...DEFAULT_CELL_LAYOUT.buttonGroup, flow: 'row', count: 2, gap: 8 } } }])).toBeGreaterThanOrEqual(48 + 8 + 104)
  })

  it('includes text and button heights in best row height', () => {
    const height = calculateCellContentHeight({
      text: 'text',
      buttonCount: 5,
      layout: { ...DEFAULT_CELL_LAYOUT, buttonGroup: { ...DEFAULT_CELL_LAYOUT.buttonGroup, count: 2, gap: 8 } },
    })
    expect(height).toBe(136)
    expect(calculateBestRowHeight([
      { text: 'a', buttonCount: 0 },
      { text: 'b', buttonCount: 3, layout: { ...DEFAULT_CELL_LAYOUT, buttonGroup: { ...DEFAULT_CELL_LAYOUT.buttonGroup, count: 1 } } },
    ])).toBeGreaterThan(100)
  })
})
