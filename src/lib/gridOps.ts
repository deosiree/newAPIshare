import type { ButtonsMeta, Row } from './data'
import type { ColumnDef } from '../fields'
import type { CellStyle } from './workbook'

export interface GridSnapshot {
  rows: Row[]
  columns: ColumnDef[]
  buttons: ButtonsMeta
  styles: Record<string, CellStyle>
  rowHeights: Record<number, number>
  columnWidths: Record<string, number>
}


export interface GridColumnState {
  colId: string
  width?: number | null
}

/**
 * 将一位起始的列序号转换成 Excel 列字母。
 * @param index 一位起始的列序号
 * @returns Excel 列字母
 */
function toExcelColumn(index: number): string {
  let value = index
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

/** 判断当前 AG Grid 状态是否允许按原始顺序拖拽行。 */
/**
 * 判断当前 AG Grid 状态是否允许按原始顺序拖拽行。
 * @param state 当前网格的排序和筛选状态
 * @returns 未排序且未筛选时返回 true
 */
export function canReorderRows(state: { sortModel: unknown[]; filterModel: Record<string, unknown> }): boolean {
  return state.sortModel.length === 0 && Object.keys(state.filterModel).length === 0
}

/** 将指定行移动到目标行之前，找不到任一 uid 时返回原数组。 */
/**
 * 将指定行移动到目标行之前，找不到任一 uid 时返回原数组。
 * @param rows 原始行顺序
 * @param sourceUid 被拖拽行的稳定 UID
 * @param targetUid 目标行的稳定 UID
 * @returns 移动后的新数组或原数组
 */
export function moveRowByUid(rows: Row[], sourceUid: string, targetUid: string): Row[] {
  const sourceIndex = rows.findIndex((row) => row.uid === sourceUid)
  const targetIndex = rows.findIndex((row) => row.uid === targetUid)
  if (sourceIndex < 0 || targetIndex < 0 || sourceUid === targetUid) return rows
  const next = [...rows]
  const [source] = next.splice(sourceIndex, 1)
  const insertIndex = next.findIndex((row) => row.uid === targetUid)
  next.splice(insertIndex < 0 ? targetIndex : insertIndex, 0, source)
  return next
}


/**
 * 根据最终列顺序重建同步助手需要的 Excel 列宽映射。
 * @param columns 保存时的最终列顺序，不包含隐藏行标记列和 UID 列
 * @param columnState AG Grid 当前列状态，包含用户拖拽后的宽度
 * @param existingWidths 原有 Excel 列宽，未被网格覆盖的键会保留
 * @param hasHiddenColumn 是否需要为隐藏行标记预留首列
 * @returns 按最终 Excel 列字母索引的列宽映射
 */
export function buildColumnWidthsFromState(
  columns: ColumnDef[],
  columnState: GridColumnState[],
  existingWidths: Record<string, number>,
  hasHiddenColumn: boolean,
): Record<string, number> {
  const next = { ...existingWidths }
  columns.forEach((column, index) => {
    const state = columnState.find((item) => item.colId === column.field)
    if (typeof state?.width === "number") {
      next[toExcelColumn(index + 1 + (hasHiddenColumn ? 1 : 0))] = state.width
    }
  })
  return next
}

/** 创建有限长度的快照历史，提供事务式撤销和重做。 */
/**
 * 创建有限长度的快照历史，提供事务式撤销和重做。
 * @param initial 初始编辑快照
 * @param limit 历史栈最大长度
 * @returns 提供 push、undo、redo、current 和 counts 的历史控制器
 */
export function createSnapshotHistory(initial: GridSnapshot, limit = 50) {
  let current = structuredClone(initial)
  const past: GridSnapshot[] = []
  const future: GridSnapshot[] = []
  return {
    push(next: GridSnapshot): void { past.push(current); if (past.length > limit) past.shift(); current = structuredClone(next); future.length = 0 },
    undo(): GridSnapshot | undefined { if (!past.length) return undefined; future.push(current); current = past.pop()!; return structuredClone(current) },
    redo(): GridSnapshot | undefined { if (!future.length) return undefined; past.push(current); current = future.pop()!; return structuredClone(current) },
    current(): GridSnapshot { return structuredClone(current) },
    counts(): { undo: number; redo: number } { return { undo: past.length, redo: future.length } },
  }
}
