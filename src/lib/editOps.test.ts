import { describe, expect, it } from 'vitest'
import { applyCellStylePatch } from './editOps'

describe('editOps', () => {
  it('按单元格 uid 和 field 更新样式并清理空样式', () => {
    const result = applyCellStylePatch(
      { 'a|name': { font: { bold: true } } },
      [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }],
      { rowIndex: 0, field: 'name' },
      { font: { bold: false, color: '#ff0000' } },
    )
    expect(result).toEqual({ 'a|name': { font: { color: '#ff0000' } } })
  })

  it('选中列头时批量更新该列的已有行', () => {
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
})
