import type { Row } from './data'
import { cellStyleKey, mergeCellStyle, type CellStyle } from './workbook'

export interface StyleTarget {
  rowIndex?: number
  field?: string
  selectedCol?: string
}

/** 根据当前单元格或列头选择，生成应用样式补丁后的不可变样式映射。
 * @param styles 当前单元格样式映射
 * @param rows 当前行数据
 * @param target 当前单元格或列头目标
 * @param patch 要应用的样式补丁
 * @returns 应用补丁后的新样式映射
 */
export function applyCellStylePatch(
  styles: Record<string, CellStyle>,
  rows: Row[],
  target: StyleTarget,
  patch: Partial<CellStyle>,
): Record<string, CellStyle> {
  const field = target.selectedCol ?? target.field
  if (!field) return styles
  const targetRows = target.selectedCol
    ? rows
    : target.rowIndex == null || !rows[target.rowIndex]
      ? []
      : [rows[target.rowIndex]]
  const next = { ...styles }
  targetRows.forEach((row) => {
    const key = cellStyleKey(row.uid, field)
    const value = mergeCellStyle(next[key], patch)
    if (value) next[key] = value
    else delete next[key]
  })
  return next
}
