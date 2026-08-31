/** 数据加载：public/sites.xlsx(唯一业务数据源) + public/columns.json(列布局) + public/buttons.json(单元格按钮)。 */
import { loadWorkbook, type CellStyle } from './workbook'
import { BASE_COLUMNS, HIDDEN_ROW_HEADER, HIDDEN_ROW_FIELD, type ColumnDef } from '../fields'

export type Row = Record<string, string>

export interface ButtonDef { label: string; field: string }
export interface ButtonsMeta {
  columnDefaults?: Record<string, ButtonDef[]>
  overrides?: Record<string, ButtonDef[] | null>
}

export interface ColumnsMeta {
  updated?: string
  columns: ColumnDef[]
}

export interface ViewPreset {
  name: string
  filterModel: Record<string, unknown>
  sortModel: { colId: string; sort: string }[]
  hiddenFields: string[]
}
export interface HighlightRule { field: string; value: string; color: string }
export interface EditorPrefs { rowHeight?: number }

export type MetaAll = ColumnsMeta & {
  views?: ViewPreset[]
  rules?: HighlightRule[]
  editor?: EditorPrefs
}

export interface SiteData {
  rows: Row[]
  columns: ColumnDef[]
  buttons?: ButtonsMeta
  metaAll?: MetaAll
  styles: Record<string, CellStyle>
  rowHeights: Record<number, number>
  columnWidths: Record<string, number>
  updated?: string
}

/**
 * 从 XLSX 和应用元数据加载站点数据，失败时返回可定位的中文错误。
 * @returns 站点行、列、按钮、样式和尺寸数据
 * @throws XLSX 加载或解析失败时抛出中文错误
 */
export async function loadSiteData(): Promise<SiteData> {
  const [xlsxBuffer, colsText, btnText] = await Promise.all([
    fetch('./sites.xlsx').then((response) => {
      if (!response.ok) throw new Error('sites.xlsx 加载失败: ' + response.status)
      return response.arrayBuffer()
    }),
    fetch('./columns.json').then((response) => (response.ok ? response.json() : null)).catch(() => null),
    fetch('./buttons.json').then((response) => (response.ok ? response.json() : null)).catch(() => null),
  ])
  const meta = (colsText as MetaAll | null) ?? { columns: BASE_COLUMNS }
  const workbook = await loadWorkbook(xlsxBuffer, meta.columns)
  const columns = workbook.columns
    .filter((column) => column.field !== HIDDEN_ROW_FIELD && column.field !== 'uid')
    .map((column) => ({ ...column, width: column.width ?? meta.columns.find((item) => item.field === column.field)?.width }))
  return {
    rows: workbook.rows,
    columns,
    buttons: (btnText as ButtonsMeta | null) ?? undefined,
    metaAll: meta,
    styles: workbook.styles,
    rowHeights: workbook.rowHeights,
    columnWidths: workbook.columnWidths,
    updated: meta.updated,
  }
}

/** 将工作簿单元格样式转换为 React inline style，供浏览态和编辑态复用。
 * @param row 当前数据行，使用 uid 定位样式
 * @param field 当前字段名
 * @param styles 工作簿解析出的样式索引
 * @returns 可直接绑定到 React 元素的样式对象
 */
export function cellStyleFor(row: Row, field: string, styles?: Record<string, CellStyle>): Record<string, string | number> {
  const style = styles?.[row.uid + '|' + field]
  if (!style) return {}
  return {
    color: style.font?.color ?? '',
    backgroundColor: style.fillColor ?? '',
    fontWeight: style.font?.bold ? 700 : '',
    fontStyle: style.font?.italic ? 'italic' : '',
    textAlign: style.horizontal ?? '',
    verticalAlign: style.vertical === 'middle' ? 'middle' : style.vertical ?? '',
    whiteSpace: style.wrapText ? 'pre-wrap' : '',
  }
}

/**
 * 判断行是否被编辑态标记为隐藏。
 * @param r 待判断的数据行
 * @returns 行标记为 1 时返回 true
 */
export function isRowHidden(r: Row): boolean {
  return r[HIDDEN_ROW_FIELD] === '1'
}

/**
 * 解析某行某列最终生效的按钮，单元格覆盖优先，null 覆盖表示无按钮。
 * @param row 当前数据行
 * @param field 当前字段名
 * @param bm 按钮配置
 * @returns 最终生效的按钮列表
 */
export function cellButtons(row: Row, field: string, bm?: ButtonsMeta): ButtonDef[] {
  if (!bm) return []
  const key = (row.uid ?? '') + '|' + field
  if (bm.overrides && key in bm.overrides) return bm.overrides[key] ?? []
  return bm.columnDefaults?.[field] ?? []
}

void HIDDEN_ROW_HEADER
