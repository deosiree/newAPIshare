export interface MenuPositionInput {
  x: number
  y: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}

export interface MenuPosition {
  left: number
  top: number
  maxHeight: number
}

/** 根据视口边界计算右键菜单位置，并限制菜单最大高度。
 * @param input 菜单触发坐标、尺寸和视口信息
 * @returns 菜单左上角坐标及允许的最大高度
 */
export function resolveMenuPosition(input: MenuPositionInput): MenuPosition {
  const margin = input.margin ?? 8
  const maxHeight = Math.max(120, input.viewportHeight - margin * 2)
  const renderedHeight = Math.min(input.height, maxHeight)
  const preferredLeft = input.x + input.width > input.viewportWidth - margin
    ? input.viewportWidth - input.width - margin
    : input.x
  const preferredTop = input.y + renderedHeight > input.viewportHeight - margin
    ? input.y - renderedHeight
    : input.y
  const maxLeft = Math.max(margin, input.viewportWidth - input.width - margin)
  const maxTop = Math.max(margin, input.viewportHeight - renderedHeight - margin)
  return {
    left: Math.min(maxLeft, Math.max(margin, preferredLeft)),
    top: Math.min(maxTop, Math.max(margin, preferredTop)),
    maxHeight,
  }
}
