import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CELL_LAYOUT,
  buildButtonGrid,
  cellLayoutKey,
  columnLayoutKey,
  normalizeCellLayout,
  resolveCellLayout,
  serializeCellLayouts,
  deserializeCellLayouts,
} from './cellLayout'

const buttons = ['按钮1', '按钮2', '按钮3', '按钮4', '按钮5']

describe('cellLayout', () => {
  it('提供文字在上、按钮组在下的默认布局，并默认每行 1 个', () => {
    expect(DEFAULT_CELL_LAYOUT).toEqual({
      direction: 'column',
      textAlign: 'center',
      buttonGroup: { align: 'center', flow: 'row', count: 1, gap: 8 },
    })
  })

  it('按键名解析当前单元格覆盖和当前列默认布局', () => {
    const column = normalizeCellLayout({ direction: 'row', buttonGroup: { flow: 'column', count: 2 } })
    const cell = { buttonGroup: { align: 'right', count: 3 } }
    const layouts = { [columnLayoutKey('links')]: column, [cellLayoutKey('u1', 'links')]: cell }

    expect(resolveCellLayout(layouts, 'u1', 'links')).toEqual({
      direction: 'row',
      textAlign: 'center',
      buttonGroup: { align: 'right', flow: 'column', count: 3, gap: 8 },
    })
    expect(resolveCellLayout(layouts, 'u2', 'links')).toEqual(column)
    expect(resolveCellLayout({}, 'u2', 'links')).toEqual(DEFAULT_CELL_LAYOUT)
  })

  it('非法方向、空值和非整数配置回退到默认布局', () => {
    expect(normalizeCellLayout({ direction: 'bad', textAlign: 'left', buttonGroup: { count: null, gap: 'bad' } })).toEqual(DEFAULT_CELL_LAYOUT)
  })

  it('将按钮数量限制在 1 到 100，并对非法值回退', () => {
    expect(normalizeCellLayout({ buttonGroup: { count: 0 } }).buttonGroup.count).toBe(1)
    expect(normalizeCellLayout({ buttonGroup: { count: 101 } }).buttonGroup.count).toBe(100)
    expect(normalizeCellLayout({ buttonGroup: { count: 2.5 } }).buttonGroup.count).toBe(1)
    expect(normalizeCellLayout({ buttonGroup: { flow: 'bad', align: 'bad' } }).buttonGroup).toEqual({ align: 'center', flow: 'row', count: 1, gap: 8 })
  })

  it('按每行 N 个进行行优先排列', () => {
    expect(buildButtonGrid(buttons, { flow: 'row', count: 3 })).toEqual([
      { item: '按钮1', row: 1, column: 1 },
      { item: '按钮2', row: 1, column: 2 },
      { item: '按钮3', row: 1, column: 3 },
      { item: '按钮4', row: 2, column: 1 },
      { item: '按钮5', row: 2, column: 2 },
    ])
  })

  it('count 为 1、10、100 时不生成空按钮且保持顺序', () => {
    expect(buildButtonGrid(buttons.slice(0, 2), { flow: 'row', count: 1 }).map((item) => [item.row, item.column])).toEqual([[1, 1], [2, 1]])
    expect(buildButtonGrid(buttons, { flow: 'row', count: 10 }).map((item) => [item.row, item.column])).toEqual([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]])
    expect(buildButtonGrid(buttons, { flow: 'column', count: 100 }).map((item) => [item.row, item.column])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]])
  })

  it('支持布局快照序列化和反序列化，并忽略损坏记录', () => {
    const layouts = { [columnLayoutKey('links')]: normalizeCellLayout({ direction: 'row', buttonCount: 3 }) }
    const encoded = serializeCellLayouts(layouts)
    expect(deserializeCellLayouts(encoded)).toEqual(layouts)
    expect(deserializeCellLayouts('{bad-json')).toEqual({})
    expect(deserializeCellLayouts(JSON.stringify({ bad: { direction: 'bad' } }))).toEqual({})
  })

  it('按每列 N 个进行列优先排列', () => {
    expect(buildButtonGrid(buttons, { flow: 'column', count: 3 })).toEqual([
      { item: '按钮1', row: 1, column: 1 },
      { item: '按钮2', row: 2, column: 1 },
      { item: '按钮3', row: 3, column: 1 },
      { item: '按钮4', row: 1, column: 2 },
      { item: '按钮5', row: 2, column: 2 },
    ])
  })
})
