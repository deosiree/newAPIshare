import type { ReactNode } from 'react'

export interface EditToolbarProps {
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  excelLabel: string
  excelTitle: string
  excelWatching: boolean
  onExcelToggle: () => void
  onFindReplace: () => void
  onFormat: () => void
  children?: ReactNode
}

/** 编辑工具栏的职责是承载保存、历史、Excel 联动和扩展菜单入口。
 * @param props 工具栏按钮行为及扩展菜单内容
 * @returns 编辑工具栏元素
 */
export default function EditToolbar({
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  excelLabel,
  excelTitle,
  excelWatching,
  onExcelToggle,
  onFindReplace,
  onFormat,
  children,
}: EditToolbarProps) {
  return (
    <div className="etoolbar">
      <button className="tbtn primary" onClick={onSave}>💾 保存</button>
      <button className="tbtn" onClick={onUndo} disabled={!canUndo}>↩ 撤销</button>
      <button className="tbtn" onClick={onRedo} disabled={!canRedo}>↪ 重做</button>
      <span className="tsep" />
      <button className={'tbtn' + (excelWatching ? ' watching' : '')} title={excelTitle} onClick={onExcelToggle}>
        {excelLabel}
      </button>
      <button className="tbtn" onClick={onFindReplace}>🔍 查找替换</button>
      <button className="tbtn" onClick={onFormat}>🎨 格式面板</button>
      {children}
    </div>
  )
}
