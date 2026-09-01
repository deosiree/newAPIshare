/** 单元格文字区域与按钮组的可序列化布局模型。 */
export interface ButtonGroupLayout {
  align: 'left' | 'center' | 'right'
  flow: 'row' | 'column'
  count: number
  gap: number
}

/** 单元格双区域布局模型。 */
export interface CellLayout {
  direction: 'column' | 'row'
  textAlign: 'center'
  buttonGroup: ButtonGroupLayout
}

/** 布局配置的宽松输入类型，用于读取旧文件和用户编辑值。 */
export interface CellLayoutInput {
  direction?: unknown
  textAlign?: unknown
  buttonGroup?: {
    align?: unknown
    flow?: unknown
    count?: unknown
    gap?: unknown
    mode?: unknown
  }
  buttonAlign?: unknown
  buttonFlow?: unknown
  buttonCount?: unknown
  gap?: unknown
}

/** 按钮在栅格中的位置。 */
export interface ButtonGridItem<T> {
  item: T
  row: number
  column: number
}

export const DEFAULT_BUTTON_GROUP_LAYOUT: ButtonGroupLayout = {
  align: 'center',
  flow: 'row',
  count: 1,
  gap: 8,
}

export const DEFAULT_CELL_LAYOUT: CellLayout = {
  direction: 'column',
  textAlign: 'center',
  buttonGroup: DEFAULT_BUTTON_GROUP_LAYOUT,
}

const ALIGN_VALUES = new Set<ButtonGroupLayout['align']>(['left', 'center', 'right'])
const FLOW_VALUES = new Set<ButtonGroupLayout['flow']>(['row', 'column'])

/** 将任意按钮数量归一化到产品允许的 1~100 范围。
 * @param value 外部传入的数量值
 * @returns 合法的按钮数量
 */
function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 1
  return Math.min(100, Math.max(1, value))
}

/** 将按钮组排列模式兼容为每行或每列的通用模型。
 * @param value 新旧版本的排列模式值
 * @returns 通用排列方向
 */
function normalizeFlow(value: unknown): ButtonGroupLayout['flow'] {
  if (value === 'column' || value === 'horizontal' || value === 'grid-column-2') return 'column'
  if (value === 'row' || value === 'vertical' || value === 'grid-row-2') return 'row'
  return 'row'
}

/** 归一化按钮组布局，避免非法配置影响页面渲染。
 * @param input 按钮组布局输入
 * @returns 可安全渲染和持久化的按钮组布局
 */
export function normalizeButtonGroupLayout(input?: CellLayoutInput['buttonGroup'] | CellLayoutInput): ButtonGroupLayout {
  const source = (input ?? {}) as CellLayoutInput['buttonGroup'] & CellLayoutInput
  const align = ALIGN_VALUES.has(source.align as ButtonGroupLayout['align']) ? source.align as ButtonGroupLayout['align'] : 'center'
  const flowValue = source.flow ?? source.mode ?? source.buttonFlow
  const flow = FLOW_VALUES.has(flowValue as ButtonGroupLayout['flow']) ? flowValue as ButtonGroupLayout['flow'] : normalizeFlow(flowValue)
  const count = normalizeCount(source.count ?? source.buttonCount)
  const gapValue = source.gap
  const gap = typeof gapValue === 'number' && Number.isFinite(gapValue) ? Math.min(48, Math.max(0, gapValue)) : 8
  return { align, flow, count, gap }
}

/** 归一化完整单元格布局，并兼容旧的扁平字段格式。
 * @param input 单元格布局输入
 * @returns 可安全渲染和持久化的完整布局
 */
export function normalizeCellLayout(input?: unknown): CellLayout {
  const source = (input ?? {}) as CellLayoutInput
  const direction = source.direction === 'row' ? 'row' : 'column'
  const nested = source.buttonGroup ?? {}
  const buttonGroup = normalizeButtonGroupLayout({
    ...nested,
    align: nested.align ?? source.buttonAlign,
    flow: nested.flow ?? source.buttonFlow,
    count: nested.count ?? source.buttonCount,
    gap: nested.gap ?? source.gap,
  })
  return { direction, textAlign: 'center', buttonGroup }
}

/** 生成单元格布局键。
 * @param uid 行稳定 UID
 * @param field 单元格字段
 * @returns 单元格布局键
 */
export function cellLayoutKey(uid: string, field: string): string {
  return 'cell:' + uid + '|' + field
}

/** 生成列默认布局键。
 * @param field 列字段
 * @returns 列默认布局键
 */
export function columnLayoutKey(field: string): string {
  return 'column:' + field
}

/** 按单元格、列默认、系统默认的优先级解析最终布局。
 * @param layouts 布局记录
 * @param uid 行稳定 UID
 * @param field 单元格字段
 * @returns 当前单元格最终生效布局
 */
export function resolveCellLayout(layouts: Record<string, unknown>, uid: string, field: string): CellLayout {
  const column = layouts[columnLayoutKey(field)]
  const cell = layouts[cellLayoutKey(uid, field)]
  const base = normalizeCellLayout(column ?? DEFAULT_CELL_LAYOUT)
  if (!cell) return base
  const override = (cell ?? {}) as CellLayoutInput
  const nested = override.buttonGroup ?? {}
  return normalizeCellLayout({
    ...base,
    ...override,
    buttonGroup: {
      ...base.buttonGroup,
      ...nested,
      align: nested.align ?? override.buttonAlign ?? base.buttonGroup.align,
      flow: nested.flow ?? override.buttonFlow ?? base.buttonGroup.flow,
      count: nested.count ?? override.buttonCount ?? base.buttonGroup.count,
      gap: nested.gap ?? override.gap ?? base.buttonGroup.gap,
    },
  })
}

/** 序列化布局快照，供撤销快照、调试和跨层传输复用。
 * @param layouts 布局记录
 * @returns JSON 编码后的布局快照
 */
export function serializeCellLayouts(layouts: Record<string, unknown>): string {
  const normalized: Record<string, CellLayout> = {}
  Object.entries(layouts ?? {}).forEach(([key, value]) => {
    if (!key.startsWith('cell:') && !key.startsWith('column:')) return
    normalized[key] = normalizeCellLayout(value)
  })
  return JSON.stringify(normalized)
}

/** 反序列化布局快照，损坏或非布局记录会被忽略。
 * @param payload JSON 字符串或已解析的布局对象
 * @returns 已归一化的布局记录
 */
export function deserializeCellLayouts(payload: unknown): Record<string, CellLayout> {
  let source: unknown = payload
  if (typeof payload === 'string') {
    try { source = JSON.parse(payload) } catch { return {} }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  const layouts: Record<string, CellLayout> = {}
  Object.entries(source as Record<string, unknown>).forEach(([key, value]) => {
    if (!key.startsWith('cell:') && !key.startsWith('column:')) return
    layouts[key] = normalizeCellLayout(value)
  })
  return layouts
}

/** 根据每行 N 个或每列 N 个计算按钮的二维位置。
 * @param items 按钮列表
 * @param layout 按钮组排列配置
 * @returns 带有行列位置且保持业务顺序的按钮列表
 */
export function buildButtonGrid<T>(items: T[], layout: Pick<ButtonGroupLayout, 'flow' | 'count'>): ButtonGridItem<T>[] {
  const count = normalizeCount(layout.count)
  return items.map((item, index) => {
    if (layout.flow === 'column') {
      return { item, row: (index % count) + 1, column: Math.floor(index / count) + 1 }
    }
    return { item, row: Math.floor(index / count) + 1, column: (index % count) + 1 }
  })
}
