import { describe, expect, it } from 'vitest'
import { cellStyleFor } from './data'

describe('cellStyleFor', () => {
  it('将 Excel 样式转换为公开表格可用的 inline style', () => {
    const row = { uid: 'row-1', name: '示例站' }
    expect(cellStyleFor(row, 'name', {
      'row-1|name': {
        font: { color: '#ff0000', bold: true, italic: true },
        fillColor: '#ffff00',
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      },
    })).toEqual({
      color: '#ff0000',
      backgroundColor: '#ffff00',
      fontWeight: 700,
      fontStyle: 'italic',
      textAlign: 'center',
      verticalAlign: 'middle',
      whiteSpace: 'pre-wrap',
    })
  })

  it('没有样式时返回空对象', () => {
    expect(cellStyleFor({ uid: 'row-1' }, 'name', {})).toEqual({})
  })
})
