import type { ButtonsMeta, Row } from './data'
import type { ColumnDef } from '../fields'
import type { CellStyle } from './workbook'
import type { CellLayout } from './cellLayout'

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

export interface CellContentHeightOptions {
  text?: string
  buttonCount?: number
  layout?: CellLayout
  columnWidth?: number
  wrapText?: boolean
  textLineHeight?: number
  buttonHeight?: number
  verticalPadding?: number
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


/** 根据字段宽度映射生成 Excel 列宽，供最适合列宽等批量操作使用。
 * @param columns 当前业务列定义，顺序对应 Excel 列顺序
 * @param widths 字段到像素宽度的映射
 * @param existingWidths 原有 Excel 列宽
 * @param hasHiddenColumn 是否存在隐藏标记列
 * @returns 合并后的 Excel 列宽映射
 */
export function buildColumnWidthsFromValues(
  columns: ColumnDef[],
  widths: Record<string, number>,
  existingWidths: Record<string, number>,
  hasHiddenColumn: boolean,
): Record<string, number> {
  const next = { ...existingWidths }
  columns.forEach((column, index) => {
    const width = widths[column.field]
    if (typeof width === 'number') next[toExcelColumn(index + 1 + (hasHiddenColumn ? 1 : 0))] = normalizeColumnWidth(width)
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


/** 将用户或网格产生的行高限制在 Excel 编辑器可接受的范围内。
 * @param value 待归一化的行高
 * @returns 24 到 1000 之间的合法行高
 */
export function normalizeRowHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 46
  return Math.min(1000, Math.max(24, Math.round(value)))
}

/** 将用户或网格产生的列宽限制在 Excel 编辑器可接受的范围内。
 * @param value 待归一化的列宽
 * @returns 40 到 1000 之间的合法列宽
 */
export function normalizeColumnWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 120
  return Math.min(1000, Math.max(40, Math.round(value)))
}

/** 估算按钮组在当前排列方式下需要占用的垂直高度。
 * @param buttonCount 按钮数量
 * @param layout 按钮组排列配置
 * @param buttonHeight 单个按钮高度，默认 28 像素
 * @returns 按钮组估算高度
 */
export function calculateButtonGroupHeight(
  buttonCount: number,
  layout: Pick<CellLayout['buttonGroup'], 'flow' | 'count' | 'gap'>,
  buttonHeight = 28,
): number {
  if (buttonCount <= 0) return 0
  const count = Math.max(1, Math.min(100, Math.floor(layout.count || 1)))
  const rows = layout.flow === 'column' ? Math.min(count, buttonCount) : Math.ceil(buttonCount / count)
  const gap = Number.isFinite(layout.gap) ? Math.max(0, layout.gap) : 8
  return rows * buttonHeight + Math.max(0, rows - 1) * gap
}

/** 估算单元格文字区与按钮组区共同需要的高度，避免按钮在编辑态被行高裁切。
 * @param options 文字、按钮数量、布局和尺寸估算参数
 * @returns 单元格内容估算高度
 */
export function calculateCellContentHeight(options: CellContentHeightOptions): number {
  const text = options.text ?? ''
  const textLineHeight = options.textLineHeight ?? 20
  const buttonHeight = options.buttonHeight ?? 28
  const verticalPadding = options.verticalPadding ?? 4
  const layout = options.layout ?? {
    direction: 'column',
    textAlign: 'center',
    buttonGroup: { align: 'center', flow: 'row', count: 1, gap: 8 },
  }
  const buttonCount = Math.max(0, Math.floor(options.buttonCount ?? 0))
  const hasText = text.length > 0
  const columnWidth = options.columnWidth
  const textLines = hasText
    ? options.wrapText && columnWidth
      ? text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor(columnWidth / 8)))), 0)
      : Math.max(1, text.split('\n').length)
    : 0
  const textHeight = textLines * textLineHeight
  const buttonHeightTotal = calculateButtonGroupHeight(buttonCount, layout.buttonGroup, buttonHeight)
  const gap = hasText && buttonCount > 0 ? layout.buttonGroup.gap : 0
  const contentHeight = layout.direction === 'row'
    ? Math.max(textHeight, buttonHeightTotal)
    : textHeight + buttonHeightTotal + gap
  return normalizeRowHeight(contentHeight > 0 ? contentHeight + verticalPadding * 2 : 24)
}

/** 从多行单元格内容中计算最适合的统一行高。
 * @param cells 待估算的单元格内容参数
 * @returns 能容纳所有内容的合法行高
 */
export function calculateBestRowHeight(cells: CellContentHeightOptions[]): number {
  if (!cells.length) return 46
  return Math.max(24, ...cells.map((cell) => calculateCellContentHeight(cell)))
}


export interface CellContentWidthOptions {
  text?: string
  buttonLabels?: string[]
  layout?: CellLayout
}

/** 根据文字和按钮标签估算单元格最适合的列宽。
 * @param cells 待估算的单元格文字、按钮标签和布局
 * @returns 40 到 1000 像素之间的列宽
 */
export function calculateBestColumnWidth(cells: CellContentWidthOptions[]): number {
  let best = 40
  cells.forEach((cell) => {
    const textWidth = Math.max(...(cell.text ?? '').split('\n').map((line) => line.length * 8 + 24), 40)
    const labels = (cell.buttonLabels ?? []).map(String)
    const layout = cell.layout ?? {
      direction: 'column',
      textAlign: 'center',
      buttonGroup: { align: 'center', flow: 'row', count: 1, gap: 8 },
    }
    const count = Math.max(1, Math.min(100, Math.floor(layout.buttonGroup.count || 1)))
    const columns = labels.length === 0
      ? 0
      : layout.buttonGroup.flow === 'row'
        ? Math.min(count, labels.length)
        : Math.ceil(labels.length / count)
    const labelWidths = labels.map((label) => Math.max(48, label.length * 8 + 24))
    const buttonWidth = columns > 0
      ? Array.from({ length: columns }, (_, columnIndex) => {
          if (layout.buttonGroup.flow === 'row') {
            return Math.max(...labelWidths.filter((_, index) => index % columns === columnIndex), 48)
          }
          return Math.max(...labelWidths.slice(columnIndex * count, columnIndex * count + count), 48)
        }).reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * Math.max(0, layout.buttonGroup.gap)
      : 0
    best = Math.max(best, textWidth, buttonWidth)
  })
  return normalizeColumnWidth(best)
}
