import { normalizeColumnWidth, normalizeRowHeight } from './gridOps'

/** 根据鼠标纵向位移计算新的行高，并统一应用行高边界。
 * @param startHeight 拖拽开始时的行高
 * @param deltaY 鼠标纵向位移，向下为正
 * @returns 归一化后的行高
 */
export function resizeRowHeight(startHeight: number, deltaY: number): number {
  return normalizeRowHeight(startHeight + deltaY)
}

/** 根据鼠标横向位移计算新的列宽，并统一应用列宽边界。
 * @param startWidth 拖拽开始时的列宽
 * @param deltaX 鼠标横向位移，向右为正
 * @returns 归一化后的列宽
 */
export function resizeColumnWidth(startWidth: number, deltaX: number): number {
  return normalizeColumnWidth(startWidth + deltaX)
}
