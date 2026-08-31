import { describe, expect, it } from 'vitest'
import {
  buildColumnWidthsFromState,
  canReorderRows,
  moveRowByUid,
  createSnapshotHistory,
  type GridSnapshot,
} from './gridOps'

describe('gridOps', () => {
  const rows = [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }, { uid: 'c', name: 'C' }]
  const snapshot: GridSnapshot = { rows, columns: [], buttons: {}, styles: {}, rowHeights: {}, columnWidths: {} }

  it('仅在原始未排序未筛选状态允许行拖拽', () => {
    expect(canReorderRows({ sortModel: [], filterModel: {} })).toBe(true)
    expect(canReorderRows({ sortModel: [{ colId: 'name', sort: 'asc' }], filterModel: {} })).toBe(false)
    expect(canReorderRows({ sortModel: [], filterModel: { status: { filter: '有效' } } })).toBe(false)
  })

  it('按 uid 将行移动到目标位置并保持其他行顺序', () => {
    expect(moveRowByUid(rows, 'c', 'a').map((row) => row.uid)).toEqual(['c', 'a', 'b'])
    expect(moveRowByUid(rows, 'missing', 'a')).toEqual(rows)
  })

  it('根据最终列顺序写入对应 Excel 列宽', () => {
    expect(buildColumnWidthsFromState(
      [{ field: 'status', header: '状态' }, { field: 'name', header: '公益站' }],
      [{ colId: 'status', width: 30 }, { colId: 'name', width: 40 }],
      { A: 12, B: 18 },
      true,
    )).toEqual({ A: 12, B: 30, C: 40 })
  })

  it('历史记录支持撤销和重做快照', () => {
    const history = createSnapshotHistory(snapshot)
    const next: GridSnapshot = { ...snapshot, rows: [rows[1], rows[0], rows[2]] }
    history.push(next)
    expect(history.undo()?.rows.map((row) => row.uid)).toEqual(['a', 'b', 'c'])
    expect(history.redo()?.rows.map((row) => row.uid)).toEqual(['b', 'a', 'c'])
  })
})
