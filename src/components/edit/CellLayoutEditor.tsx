import type { ChangeEvent, DragEvent } from 'react'
import type { ButtonDef } from '../../lib/data'
import { buildButtonGrid, normalizeCellLayout, type ButtonGroupLayout, type CellLayout } from '../../lib/cellLayout'

export interface CellLayoutEditorProps {
  layout: CellLayout
  buttons: ButtonDef[]
  scope: 'cell' | 'column'
  onScopeChange: (scope: 'cell' | 'column') => void
  onChange: (layout: CellLayout) => void
}

/** 编辑单元格文字区与按钮组区的双层布局，并提供可拖拽投放预览。
 * @param props 当前布局、按钮、作用范围及变更回调
 * @returns 布局编辑区域
 */
export default function CellLayoutEditor({ layout, buttons, scope, onScopeChange, onChange }: CellLayoutEditorProps) {
  const resolved = normalizeCellLayout(layout)
  const update = (patch: Partial<CellLayout>): void => {
    onChange(normalizeCellLayout({ ...resolved, ...patch }))
  }
  const updateButtonGroup = (patch: Partial<ButtonGroupLayout>): void => {
    onChange(normalizeCellLayout({ ...resolved, buttonGroup: { ...resolved.buttonGroup, ...patch } }))
  }
  const handleCount = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = Number(event.target.value)
    const count = Number.isInteger(value) ? Math.min(100, Math.max(1, value)) : 1
    onChange(normalizeCellLayout({ ...resolved, buttonGroup: { ...resolved.buttonGroup, count } }))
  }
  const handleDrop = (direction: CellLayout['direction']) => (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
    update({ direction })
  }
  const grid = buildButtonGrid(buttons, resolved.buttonGroup)
  return (
    <section className="cell-layout-editor" aria-label="文字与按钮布局">
      <div className="layout-editor-head">
        <strong>文字/按钮布局</strong>
        <label>作用范围
          <select value={scope} onChange={(event) => onScopeChange(event.target.value as 'cell' | 'column')}>
            <option value="cell">当前单元格</option>
            <option value="column">当前列默认</option>
          </select>
        </label>
      </div>
      <div className="layout-editor-hint">可拖动按钮组到文字右侧或下方切换方向</div>
      <div className="layout-preview-wrap">
        <div className={'layout-preview cell-content-' + resolved.direction}>
          <div className="layout-zone layout-text-zone" data-testid="layout-text-zone" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', 'text')}>
            文字区域
          </div>
          <div
            className="layout-zone layout-button-zone"
            data-testid="layout-button-zone"
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/plain', 'button')}
          >
            <span>按钮组区域</span>
            <span className={'layout-preview-buttons cell-content-buttons-' + resolved.buttonGroup.align} style={{ display: 'grid', gridTemplateColumns: resolved.buttonGroup.flow === 'row' ? 'repeat(' + resolved.buttonGroup.count + ', max-content)' : undefined, gridTemplateRows: resolved.buttonGroup.flow === 'column' ? 'repeat(' + resolved.buttonGroup.count + ', max-content)' : undefined, gap: resolved.buttonGroup.gap }}>
              {grid.map(({ item, row, column }) => <span key={item.label + '|' + item.field} className="mini ck" style={{ gridRow: row, gridColumn: column }}>{item.label}</span>)}
            </span>
          </div>
        </div>
        <div className="layout-drop-zones">
          <div data-testid="layout-drop-right" className="layout-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop('row')}>投放到文字右侧 → 左右布局</div>
          <div data-testid="layout-drop-below" className="layout-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop('column')}>投放到文字下方 ↓ 上下布局</div>
        </div>
      </div>
      <div className="layout-editor-controls">
        <label>按钮组对齐
          <select value={resolved.buttonGroup.align} onChange={(event) => updateButtonGroup({ align: event.target.value as ButtonGroupLayout['align'] })}>
            <option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option>
          </select>
        </label>
        <label>排列方式
          <select data-testid="layout-flow" value={resolved.buttonGroup.flow} onChange={(event) => updateButtonGroup({ flow: event.target.value as ButtonGroupLayout['flow'] })}>
            <option value="row">每行 N 个（行优先）</option><option value="column">每列 N 个（列优先）</option>
          </select>
        </label>
        <label>数量 N
          <input data-testid="layout-count" type="number" min="1" max="100" step="1" value={resolved.buttonGroup.count} onChange={handleCount} />
        </label>
        <label>间距 px
          <input type="number" min="0" max="48" step="1" value={resolved.buttonGroup.gap} onChange={(event) => updateButtonGroup({ gap: Number(event.target.value) })} />
        </label>
      </div>
    </section>
  )
}