import type { CellStyle } from '../../lib/workbook'

export interface FormatPanelProps {
  open: boolean
  style: CellStyle
  onClose: () => void
  onAlign: (value: 'left' | 'center' | 'right') => void
  onVertical: (value: 'top' | 'middle' | 'bottom') => void
  onToggle: (key: 'bold' | 'italic' | 'wrapText') => void
  onColor: (value: string | undefined) => void
  onFillColor: (value: string | undefined) => void
}

/** 单元格格式面板的职责是编辑 Excel 可持久化的基础样式，不负责保存文件。
 * @param props 面板开关、当前样式和样式操作回调
 * @returns 打开时返回格式面板，否则返回 null
 */
export default function FormatPanel({ open, style, onClose, onAlign, onVertical, onToggle, onColor, onFillColor }: FormatPanelProps) {
  if (!open) return null
  return (
    <aside className="format-panel" aria-label="单元格格式">
      <div className="fd-head"><strong>单元格格式</strong><button className="tbtn" onClick={onClose}>关闭</button></div>
      <div className="format-body">
        <label>字体颜色<input type="color" value={style.font?.color ?? '#000000'} onChange={(event) => onColor(event.target.value)} /></label>
        <label>背景颜色<input type="color" value={style.fillColor ?? '#ffffff'} onChange={(event) => onFillColor(event.target.value)} /></label>
        <div className="format-actions"><button className={'tbtn' + (style.font?.bold ? ' active' : '')} onClick={() => onToggle('bold')}>加粗</button><button className={'tbtn' + (style.font?.italic ? ' active' : '')} onClick={() => onToggle('italic')}>斜体</button><button className={'tbtn' + (style.wrapText ? ' active' : '')} onClick={() => onToggle('wrapText')}>换行</button></div>
        <div className="format-actions"><button className="tbtn" onClick={() => onColor(undefined)}>清除字体色</button><button className="tbtn" onClick={() => onFillColor(undefined)}>清除背景</button></div>
        <div className="format-actions"><button className="tbtn" onClick={() => onAlign('left')}>左对齐</button><button className="tbtn" onClick={() => onAlign('center')}>居中</button><button className="tbtn" onClick={() => onAlign('right')}>右对齐</button></div>
        <div className="format-actions"><button className="tbtn" onClick={() => onVertical('top')}>顶部</button><button className="tbtn" onClick={() => onVertical('middle')}>居中</button><button className="tbtn" onClick={() => onVertical('bottom')}>底部</button></div>
      </div>
    </aside>
  )
}
