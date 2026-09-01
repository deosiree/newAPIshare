export interface MergeRange {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

/** 将 Excel 列字母转换为从 1 开始的列号。
 * @param letters Excel 列字母
 * @returns 1-based 列号，非法输入返回 0
 */
function columnNumber(letters: string): number {
  let result = 0
  for (const letter of letters.toUpperCase()) {
    if (letter < 'A' || letter > 'Z') return 0
    result = result * 26 + letter.charCodeAt(0) - 64
  }
  return result
}

/** 将 1-based 列号转换为 Excel 列字母。
 * @param value 1-based 列号
 * @returns Excel 列字母
 */
function columnLetters(value: number): string {
  let current = value
  let result = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }
  return result
}

/** 解析 Excel 合并范围，只接受同一行的横向范围。
 * @param value Excel 合并范围字符串，例如 B2:D2
 * @returns 解析后的范围，非法输入返回 undefined
 */
export function parseMergeRange(value: string): MergeRange | undefined {
  const match = /^\s*([A-Z]+)(\d+)\s*:\s*([A-Z]+)(\d+)\s*$/i.exec(value)
  if (!match) return undefined
  const startRow = Number(match[2])
  const endRow = Number(match[4])
  const startColumn = columnNumber(match[1])
  const endColumn = columnNumber(match[3])
  const range = { startRow: Math.min(startRow, endRow), startColumn: Math.min(startColumn, endColumn), endRow: Math.max(startRow, endRow), endColumn: Math.max(startColumn, endColumn) }
  return isValidMergeRange(range) ? range : undefined
}

/** 判断合并范围是否为至少两个单元格的同行横向范围。
 * @param value 合并范围字符串或已解析范围
 * @returns 是否可以写入 Excel 合并区域
 */
export function isValidMergeRange(value: string | MergeRange): boolean {
  const range = typeof value === 'string' ? parseMergeRange(value) : value
  return !!range && range.startRow > 0 && range.startColumn > 0 && range.endRow === range.startRow && range.endColumn > range.startColumn
}

/** 将解析后的合并范围转换为规范化的 Excel 地址。
 * @param range 合并范围
 * @returns 规范化的 Excel 合并地址
 */
function formatMergeRange(range: MergeRange): string {
  const startColumn = Math.min(range.startColumn, range.endColumn)
  const endColumn = Math.max(range.startColumn, range.endColumn)
  const row = Math.min(range.startRow, range.endRow)
  return columnLetters(startColumn) + row + ':' + columnLetters(endColumn) + row
}

/** 将 0-based 行索引的合并范围转换为 Excel 地址。
 * @param range 以 0-based 行索引表示的合并范围
 * @returns 规范化的 Excel 合并地址
 */
export function buildMergeRange(range: MergeRange): string {
  return formatMergeRange({ ...range, startRow: range.startRow + 1, endRow: range.endRow + 1 })
}

/** 清洗、去重并排序合并范围，过滤跨行或单格范围。
 * @param values 原始 Excel 合并地址列表
 * @returns 可持久化的规范化合并地址列表
 */
export function normalizeMergeRanges(values: string[]): string[] {
  return [...new Set(values.map((value) => parseMergeRange(value)).filter((range): range is MergeRange => !!range).map(formatMergeRange))].sort((a, b) => {
    const left = parseMergeRange(a)!
    const right = parseMergeRange(b)!
    return left.startRow - right.startRow || left.startColumn - right.startColumn
  })
}

/** 将 AG Grid 选区字段转换为有序列索引，兼容仅提供起止列的版本。
 * @param selectedFields AG Grid 当前选区中实际暴露的字段
 * @param orderedFields 页面业务列的稳定顺序
 * @param startField 选区起始字段，columns 缺失时使用
 * @param endField 选区结束字段，columns 缺失时使用
 * @returns 0-based 的去重有序列索引
 */
export function resolveMergeColumnIndexes(
  selectedFields: string[],
  orderedFields: string[],
  startField?: string,
  endField?: string,
): number[] {
  const selectedIndexes = [...new Set(selectedFields.map((field) => orderedFields.indexOf(field)).filter((index) => index >= 0))].sort((a, b) => a - b)
  if (selectedIndexes.length > 0) return selectedIndexes
  const startIndex = startField ? orderedFields.indexOf(startField) : -1
  const endIndex = endField ? orderedFields.indexOf(endField) : -1
  if (startIndex < 0 || endIndex < 0) return []
  const first = Math.min(startIndex, endIndex)
  const last = Math.max(startIndex, endIndex)
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset)
}

/** 判断目标合并范围是否与已有范围发生重叠。
 * @param values 已有合并地址列表
 * @param target 待检查的合并地址
 * @returns 存在重叠时返回 true，非法目标返回 true
 */
export function hasMergeOverlap(values: string[], target: string): boolean {
  const next = parseMergeRange(target)
  if (!next) return true
  return values.some((value) => {
    const current = parseMergeRange(value)
    if (!current) return false
    return current.startRow <= next.endRow && current.endRow >= next.startRow && current.startColumn <= next.endColumn && current.endColumn >= next.startColumn
  })
}

/** 从合并范围列表中移除指定范围。
 * @param values 当前合并范围列表
 * @param target 待移除的合并地址
 * @returns 移除后的规范化合并范围列表
 */
export function removeMergeRange(values: string[], target: string): string[] {
  const normalizedTarget = parseMergeRange(target)
  if (!normalizedTarget) return normalizeMergeRanges(values)
  const targetValue = formatMergeRange(normalizedTarget).toUpperCase()
  return normalizeMergeRanges(values).filter((value) => value.toUpperCase() !== targetValue)
}
