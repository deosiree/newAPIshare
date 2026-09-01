import { describe, expect, it } from 'vitest'
import { applyCellStylePatch, copyCellStyle } from './editOps'

describe('editOps', () => {
  it('updates cell style by uid and field and cleans empty style', () => {
    const result = applyCellStylePatch(
      { 'a|name': { font: { bold: true } } },
      [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }],
      { rowIndex: 0, field: 'name' },
      { font: { bold: false, color: '#ff0000' } },
    )
    expect(result).toEqual({ 'a|name': { font: { color: '#ff0000' } } })
  })

  it('bulk updates an existing column when column header is selected', () => {
    const result = applyCellStylePatch(
      {},
      [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }],
      { selectedCol: 'name' },
      { horizontal: 'center', wrapText: true },
    )
    expect(result).toEqual({
      'a|name': { horizontal: 'center', wrapText: true },
      'b|name': { horizontal: 'center', wrapText: true },
    })
  })

  it('copies only cell formatting for format painter', () => {
    const source = { font: { color: '#ff0000', bold: true, italic: true }, fillColor: '#00ff00', horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }
    expect(copyCellStyle(source)).toEqual(source)
    expect(copyCellStyle(undefined)).toEqual({})
  })
})
