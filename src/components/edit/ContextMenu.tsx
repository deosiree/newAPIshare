import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { resolveMenuPosition } from '../../lib/menuPosition'
import type { ButtonDef, Row } from '../../lib/data'

export interface ContextMenuTarget { x: number; y: number; field?: string; rowIndex?: number }
export interface ContextMenuProps {
  target: ContextMenuTarget | null
  row?: Row
  buttons: ButtonDef[]
  onClose: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onSort: (direction: 'asc' | 'desc') => void
  onFilter: () => void
  onAddButton: () => void
  onEditButton: (index: number) => void
  onRemoveButton: () => void
  onCopyButton: () => void
  onCutButton: () => void
  onPasteButton: () => void
  onHideColumn?: () => void
  onHideRow?: () => void
  onUnhideRow?: () => void
  onDeleteRow?: () => void
  onDeleteColumn?: () => void
}

/** 根据菜单目标生成稳定的测量键。
 * @param target 当前右键菜单目标
 * @returns 用于判断定位是否已完成的目标键
 */
function getTargetKey(target: ContextMenuTarget | null): string {
  if (!target) return ''
  return [target.x, target.y, target.field ?? '', target.rowIndex ?? ''].join(':')
}

/** 读取 Portal 菜单的完整内容尺寸并计算视口内位置。
 * @param element 已挂载的菜单元素
 * @param target 菜单触发目标
 * @returns 菜单左上角坐标及允许的最大高度
 */
function measureMenuPosition(element: HTMLDivElement, target: ContextMenuTarget) {
  const rect = element.getBoundingClientRect()
  const contentHeight = Math.max(rect.height, element.scrollHeight)
  return resolveMenuPosition({
    x: target.x,
    y: target.y,
    width: rect.width,
    height: contentHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })
}

/** 自适应右键菜单：负责 Portal 挂载、视口定位、滚动和关闭，不承载业务数据修改。
 * @param props 菜单目标、按钮配置及各项操作回调
 * @returns 有效目标存在时返回 Portal 菜单，否则返回 null
 */
export default function ContextMenu({
  target,
  row,
  buttons,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onSort,
  onFilter,
  onAddButton,
  onEditButton,
  onRemoveButton,
  onCopyButton,
  onCutButton,
  onPasteButton,
  onHideColumn,
  onHideRow,
  onUnhideRow,
  onDeleteRow,
  onDeleteColumn,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const targetKey = getTargetKey(target)
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 240, targetKey: '' })

  /** 测量当前 Portal 菜单，并把定位结果写入状态。
   * @returns 无返回值
   */
  const measure = useCallback((): void => {
    if (!target || !menuRef.current) return
    setPosition({ ...measureMenuPosition(menuRef.current, target), targetKey })
  }, [target, targetKey])

  useLayoutEffect(() => {
    if (!target) return
    measure()
    const frame = window.requestAnimationFrame(measure)
    return () => window.cancelAnimationFrame(frame)
  }, [measure, target])

  useLayoutEffect(() => {
    if (!target) return
    const handleResize = () => measure()
    window.addEventListener('resize', handleResize)
    const observer = typeof ResizeObserver !== 'undefined' && menuRef.current
      ? new ResizeObserver(handleResize)
      : null
    if (observer && menuRef.current) observer.observe(menuRef.current)
    return () => {
      window.removeEventListener('resize', handleResize)
      observer?.disconnect()
    }
  }, [measure, target])

  if (!target || !target.field) return null
  const hasCellTarget = !!row && target.rowIndex != null && target.field !== '__seq'
  return createPortal(
    <div
      ref={menuRef}
      className="ctxmenu"
      style={{
        left: position.left,
        top: position.top,
        maxHeight: position.maxHeight,
        overflowY: 'auto',
        visibility: position.targetKey === targetKey ? 'visible' : 'hidden',
      }}
      onClick={(event) => event.stopPropagation()}
      role="menu"
    >
      {hasCellTarget && <>
        <div className="ctx-label">单元格：{target.field}</div>
        <button onClick={() => { onCut(); onClose() }}>✂️ 剪切内容</button>
        <button onClick={() => { onCopy(); onClose() }}>📄 复制内容</button>
        <button onClick={() => { onPaste(); onClose() }}>📋 粘贴内容</button>
        <div className="ctx-label">排序与筛选</div>
        <button onClick={() => { onSort('asc'); onClose() }}>⬆ 升序</button>
        <button onClick={() => { onSort('desc'); onClose() }}>⬇ 降序</button>
        <button onClick={() => { onFilter(); onClose() }}>🔎 筛选：包含…</button>
        <div className="ctx-label">按钮</div>
        <button onClick={() => { onAddButton(); onClose() }}>➕ 增加按钮…</button>
        {buttons.map((button, index) => (
          <button key={button.label + index} onClick={() => { onEditButton(index); onClose() }}>✏️ 编辑按钮：{button.label}</button>
        ))}
        {buttons.length > 0 && <button onClick={() => { onRemoveButton(); onClose() }}>🗑️ 移除按钮</button>}
        <button onClick={() => { onCopyButton(); onClose() }}>📋 复制按钮</button>
        <button onClick={() => { onCutButton(); onClose() }}>✂️ 剪切按钮</button>
        <button onClick={() => { onPasteButton(); onClose() }}>📎 粘贴按钮</button>
      </>}
      {target.field !== '__seq' && <>
        {hasCellTarget && <hr />}
        <button onClick={() => { onHideColumn?.(); onClose() }}>隐藏此列</button>
        {hasCellTarget && <>
          <button onClick={() => { onHideRow?.(); onClose() }}>隐藏此行</button>
          <button onClick={() => { onUnhideRow?.(); onClose() }}>取消隐藏此行</button>
          <hr />
          <button onClick={() => { onDeleteRow?.(); onClose() }}>删除此行</button>
        </>}
        <button onClick={() => { onDeleteColumn?.(); onClose() }}>删除此列</button>
      </>}
    </div>,
    document.body,
  )
}
