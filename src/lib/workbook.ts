import ExcelJS from 'exceljs'
import type { ButtonsMeta, Row } from './data'
import type { ColumnDef } from '../fields'
import { cellLayoutKey, columnLayoutKey, normalizeCellLayout, type CellLayout } from './cellLayout'

export interface CellFontStyle {
  bold?: boolean
  italic?: boolean
  color?: string
}

export interface CellStyle {
  font?: CellFontStyle
  fillColor?: string
  horizontal?: 'left' | 'center' | 'right'
  vertical?: 'top' | 'middle' | 'bottom'
  wrapText?: boolean
}

/** 生成稳定的单元格样式键，行 UID 变化时不会误用其他行样式。 */
/**
 * 生成稳定的单元格样式键，避免行顺序变化时串用样式。
 * @param uid 行的稳定 UID
 * @param field 单元格字段名
 * @returns 样式索引键
 */
export function cellStyleKey(uid: string, field: string): string {
  return uid + '|' + field
}

/** 将样式补丁合并到单元格样式，并删除显式关闭的空样式字段。 */
/**
 * 将样式补丁合并到当前样式，并清理显式关闭后的空字段。
 * @param current 当前单元格样式
 * @param patch 要应用的样式补丁
 * @returns 合并后的样式；没有有效样式时返回 undefined
 */
export function mergeCellStyle(current: CellStyle | undefined, patch: Partial<CellStyle>): CellStyle | undefined {
  const next: CellStyle = {
    ...(current ?? {}),
    ...patch,
    font: { ...(current?.font ?? {}), ...(patch.font ?? {}) },
  }
  if (next.font?.bold === false) delete next.font.bold
  if (next.font?.italic === false) delete next.font.italic
  if (!next.font?.bold && !next.font?.italic && !next.font?.color) delete next.font
  if (!next.fillColor) delete next.fillColor
  if (!next.horizontal) delete next.horizontal
  if (!next.vertical) delete next.vertical
  if (!next.wrapText) delete next.wrapText
  return Object.keys(next).length ? next : undefined
}

export interface WorkbookDocument {
  rows: Row[]
  columns: ColumnDef[]
  styles: Record<string, CellStyle>
  rowHeights: Record<number, number>
  columnWidths: Record<string, number>
  layouts: Record<string, CellLayout>
  merges: string[]
  worksheetName: string
  workbook: ExcelJS.Workbook
}

/**
 * 读取 ExcelJS 工作表中的合并范围并转换为 A1 地址。
 * @param worksheet 主工作表
 * @returns 合并范围地址列表
 */
function readMergeRanges(worksheet: ExcelJS.Worksheet): string[] {
  const merges = (worksheet as any)._merges ?? {}
  return Object.values(merges).map((range: any) => {
    const model = range?.model
    if (!model) return ''
    const start = worksheet.getCell(model.top, model.left).address
    const end = worksheet.getCell(model.bottom, model.right).address
    return start + ':' + end
  }).filter(Boolean)
}

const LAYOUT_SHEET_NAME = '__newAPIshare_layout'
const LAYOUT_HEADERS = ['version', 'scope', 'uid', 'field', 'direction', 'textAlign', 'buttonAlign', 'buttonFlow', 'buttonCount', 'gap'] as const

/** 读取隐藏布局工作表并转换为应用布局记录。
 * @param workbook ExcelJS 工作簿
 * @returns 已归一化的布局记录
 */
function readLayouts(workbook: ExcelJS.Workbook): Record<string, CellLayout> {
  const worksheet = workbook.getWorksheet(LAYOUT_SHEET_NAME)
  if (!worksheet) return {}
  const layouts: Record<string, CellLayout> = {}
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const scope = String(row.getCell(2).value ?? '').trim()
    const uid = String(row.getCell(3).value ?? '').trim()
    const field = String(row.getCell(4).value ?? '').trim()
    if (!field || (scope !== 'cell' && scope !== 'column') || (scope === 'cell' && !uid)) return
    const input = {
      direction: row.getCell(5).value,
      textAlign: row.getCell(6).value,
      buttonAlign: row.getCell(7).value,
      buttonFlow: row.getCell(8).value,
      buttonCount: row.getCell(9).value,
      gap: row.getCell(10).value,
    }
    const key = scope === 'cell' ? cellLayoutKey(uid, field) : columnLayoutKey(field)
    layouts[key] = normalizeCellLayout(input)
  })
  return layouts
}

/** 将布局记录写入隐藏工作表，并清除已删除的旧布局。
 * @param workbook ExcelJS 工作簿
 * @param layouts 当前布局记录
 * @returns 无返回值
 */
function writeLayouts(workbook: ExcelJS.Workbook, layouts: Record<string, CellLayout>): void {
  const worksheet = workbook.getWorksheet(LAYOUT_SHEET_NAME) ?? workbook.addWorksheet(LAYOUT_SHEET_NAME)
  worksheet.state = 'hidden'
  while (worksheet.rowCount > 0) worksheet.spliceRows(1, 1)
  worksheet.addRow([...LAYOUT_HEADERS])
  Object.entries(layouts).forEach(([key, value]) => {
    const isCell = key.startsWith('cell:')
    const isColumn = key.startsWith('column:')
    if (!isCell && !isColumn) return
    const normalized = normalizeCellLayout(value)
    const raw = isCell ? key.slice(5) : key.slice(7)
    const separator = isCell ? raw.indexOf('|') : -1
    const uid = isCell && separator >= 0 ? raw.slice(0, separator) : ''
    const field = isCell && separator >= 0 ? raw.slice(separator + 1) : raw
    if (!field || (isCell && !uid)) return
    worksheet.addRow([1, isCell ? 'cell' : 'column', uid, field, normalized.direction, normalized.textAlign, normalized.buttonGroup.align, normalized.buttonGroup.flow, normalized.buttonGroup.count, normalized.buttonGroup.gap])
  })
}

const HEADER_FIELD_MAP: Record<string, string> = {
  隐藏: 'hidden', 公益站: 'name', 状态: 'status', 评分: 'rating', 注册: 'register', 每日签到: 'daily',
  邀请制: 'invite', 模型质量: 'model', 体验感: 'exp', 其他: 'other', '其他2·白嫖org': 'other2',
  '其他3·飞书合集': 'other3', '其他4·幻城导航': 'other4', 验证: 'verified', 模型: 'models', 响应: 'latency',
  渠道状态: 'api_status', 注册链接: 'url', 注册地址: 'url', 签到地址: 'checkin', uid: 'uid',
}

/** 将 ExcelJS 颜色转换为网页使用的十六进制颜色。 */
/**
 * 将 ExcelJS 的 ARGB 颜色转换为网页使用的十六进制颜色。
 * @param color ExcelJS 颜色对象
 * @returns 六位 CSS 十六进制颜色；无法解析时返回 undefined
 */
function argbToHex(color?: Partial<ExcelJS.Color>): string | undefined {
  if (!color) return undefined
  const argb = color.argb?.replace(/^FF/i, '')
  return argb && argb.length === 6 ? '#' + argb.toUpperCase() : undefined
}

/** 将 Excel 单元格值归一化为编辑器使用的字符串。 */
/**
 * 将 Excel 单元格值归一化为编辑器使用的字符串。
 * @param value ExcelJS 单元格原始值
 * @returns 可编辑的字符串值
 */
function cellValue(value: any): string {
  if (value == null) return ''
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '')
  if (typeof value === 'object' && 'richText' in value) return value.richText.map((item: any) => item.text).join('')
  return String(value)
}

/** 根据中文表头和列元数据生成稳定字段名。 */
/**
 * 根据中文表头和列元数据生成稳定字段名。
 * @param header Excel 工作表表头
 * @param columnsMeta 应用侧列元数据
 * @returns 合并后的列定义
 */
function resolveColumn(header: string, columnsMeta?: ColumnDef[]): ColumnDef {
  const fromMeta = columnsMeta?.find((column) => column.header === header)
  const field = fromMeta?.field ?? HEADER_FIELD_MAP[header] ?? header
  return { ...(fromMeta ?? {}), field, header }
}

/** 读取单元格格式，供编辑态和浏览态共享。 */
/**
 * 读取单元格的基础格式，供编辑态和浏览态共享。
 * @param cell ExcelJS 单元格
 * @returns 可序列化的单元格样式；无有效格式时返回 undefined
 */
function readStyle(cell: ExcelJS.Cell): CellStyle | undefined {
  const style: CellStyle = {
    font: {
      bold: cell.font?.bold || undefined,
      italic: cell.font?.italic || undefined,
      color: argbToHex(cell.font?.color),
    },
    fillColor: argbToHex(cell.fill?.type === 'pattern' ? cell.fill.fgColor : undefined),
    horizontal: ['left', 'center', 'right'].includes(cell.alignment?.horizontal ?? '') ? cell.alignment?.horizontal as CellStyle['horizontal'] : undefined,
    vertical: ['top', 'middle', 'bottom'].includes(cell.alignment?.vertical ?? '') ? cell.alignment?.vertical as CellStyle['vertical'] : undefined,
    wrapText: cell.alignment?.wrapText || undefined,
  }
  const meaningful = style.font?.bold || style.font?.italic || style.font?.color || style.fillColor || style.horizontal || style.vertical || style.wrapText
  return meaningful ? style : undefined
}

/** 读取第一张工作表，保留工作簿对象以便写回时保留其他工作表。 */
/**
 * 读取第一张工作表，并保留工作簿对象以便保存时保留其他工作表。
 * @param input XLSX 二进制内容
 * @param columnsMeta 应用侧列元数据
 * @returns 可编辑的工作簿文档
 * @throws XLSX 损坏、缺失或没有第一张工作表时抛出中文错误
 */
export async function loadWorkbook(input: ArrayBuffer | Uint8Array, columnsMeta?: ColumnDef[]): Promise<WorkbookDocument> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(input as ArrayBuffer)
  } catch (error) {
    throw new Error('XLSX 工作簿读取失败: ' + (error instanceof Error ? error.message : String(error)))
  }
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('XLSX 工作簿缺少第一张工作表')
  const headerValues = worksheet.getRow(1).values as any[]
  const headers = headerValues.slice(1).map((value: any) => String(value ?? '').trim()).filter(Boolean)
  const allColumns = headers.map((header, index) => ({ ...resolveColumn(header, columnsMeta), width: worksheet.getColumn(index + 1).width }))
  const columns = allColumns.filter((column) => column.field !== 'hidden')
  const rows: Row[] = []
  const styles: Record<string, CellStyle> = {}
  const rowHeights: Record<number, number> = {}
  const columnWidths: Record<string, number> = {}
  const layouts = readLayouts(workbook)
  const merges = readMergeRanges(worksheet)
  allColumns.forEach((_column, index) => {
    const excelColumn = worksheet.getColumn(index + 1)
    if (excelColumn.width != null) columnWidths[excelColumn.letter] = excelColumn.width
  })
  ;(worksheet as any).eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return
    const item: Row = {}
    allColumns.forEach((column, index) => { item[column.field] = cellValue(row.getCell(index + 1).value) })
    if (!item.uid) item.uid = 'row-' + (rowNumber - 1)
    rows.push(item)
    if (row.height != null) rowHeights[rowNumber] = row.height
    allColumns.forEach((column, index) => {
      const style = readStyle(row.getCell(index + 1))
      if (style) styles[item.uid + '|' + column.field] = style
    })
  })
  return { rows, columns, styles, rowHeights, columnWidths, layouts, merges, worksheetName: worksheet.name, workbook }
}

/** 将编辑器快照写回第一张工作表，并返回新的 XLSX 二进制内容。 */
/**
 * 将编辑器数据写回第一张工作表，并返回新的 XLSX 二进制内容。
 * @param document 可编辑的工作簿文档
 * @returns 新的 XLSX 二进制内容
 */
export async function saveWorkbook(document: WorkbookDocument): Promise<Uint8Array> {
  const worksheet = document.workbook.worksheets[0]
  if (!worksheet) throw new Error('XLSX 工作簿缺少第一张工作表')
  const hasHidden = document.rows.some((row) => 'hidden' in row)
  const hasUid = document.rows.some((row) => row.uid)
  const existingMerges = readMergeRanges(worksheet)
  existingMerges.forEach((range) => worksheet.unMergeCells(range))
  const headers = (hasHidden ? ['闅愯棌'] : []).concat(document.columns.map((column) => column.header))
  if (hasUid) headers.push('uid')
  const fields = (hasHidden ? ['hidden'] : []).concat(document.columns.map((column) => column.field))
  if (hasUid) fields.push('uid')
  const maxColumns = Math.max(worksheet.columnCount, headers.length)
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber += 1) worksheet.getCell(rowNumber, columnNumber).value = null
  }
  headers.forEach((header, index) => { worksheet.getCell(1, index + 1).value = header })
  document.rows.forEach((row, index) => {
    const rowNumber = index + 2
    fields.forEach((field, columnIndex) => { worksheet.getCell(rowNumber, columnIndex + 1).value = row[field] ?? '' })
    const excelRow = worksheet.getRow(rowNumber)
    excelRow.height = document.rowHeights[rowNumber] ?? undefined
    document.columns.forEach((column, columnIndex) => {
      const excelColumnIndex = (hasHidden ? 2 : 1) + columnIndex
      const cell = excelRow.getCell(excelColumnIndex)
      const style = document.styles[row.uid + '|' + column.field]
      cell.font = {}
      cell.fill = { type: 'pattern', pattern: 'none' }
      cell.alignment = {}
      if (!style) return
      cell.font = {
        bold: style.font?.bold,
        italic: style.font?.italic,
        color: style.font?.color ? { argb: 'FF' + style.font.color.replace('#', '') } : undefined,
      }
      if (style.fillColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + style.fillColor.replace('#', '') } }
      cell.alignment = { horizontal: style.horizontal, vertical: style.vertical, wrapText: style.wrapText }
    })  })
  ;(document.merges ?? []).forEach((range) => worksheet.mergeCells(range))
  writeLayouts(document.workbook, document.layouts ?? {})
  for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
    const column = worksheet.getColumn(columnNumber)
    column.width = document.columnWidths[column.letter] ?? undefined
  }
  return new Uint8Array(await document.workbook.xlsx.writeBuffer())
}

/** 将工作簿编辑状态转换为同步助手 /save 接口的 JSON 载荷。 */
/**
 * 将工作簿编辑状态转换为同步助手保存接口的 JSON 载荷。
 * @param document 工作簿可序列化编辑状态
 * @param buttons 按钮配置
 * @param extras 视图等扩展元数据
 * @returns 同步助手可接受的请求载荷
 */
export function workbookPayload(document: Pick<WorkbookDocument, 'rows' | 'columns' | 'styles' | 'rowHeights' | 'columnWidths' | 'layouts' | 'merges'>, buttons?: ButtonsMeta, extras?: Record<string, unknown>): Record<string, unknown> {
  return { rows: document.rows, columns: document.columns, styles: document.styles, rowHeights: document.rowHeights, columnWidths: document.columnWidths, layouts: document.layouts, merges: document.merges, buttons, extras }
}
