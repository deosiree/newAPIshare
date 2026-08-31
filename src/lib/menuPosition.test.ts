import { describe, expect, it } from 'vitest'
import { resolveMenuPosition } from './menuPosition'

describe('resolveMenuPosition', () => {
  it('靠近视口底部时向上显示并限制滚动高度', () => {
    expect(resolveMenuPosition({ x: 700, y: 760, width: 180, height: 240, viewportWidth: 1000, viewportHeight: 800 })).toEqual({
      left: 700, top: 520, maxHeight: 784,
    })
  })

  it('靠近右边界时向左显示，并保留视口边距', () => {
    expect(resolveMenuPosition({ x: 990, y: 100, width: 180, height: 200, viewportWidth: 1000, viewportHeight: 800 })).toEqual({
      left: 812, top: 100, maxHeight: 784,
    })
  })
})

  it('keeps an oversized menu inside the viewport', () => {
    expect(resolveMenuPosition({ x: 200, y: 850, width: 180, height: 622, viewportWidth: 1280, viewportHeight: 720 })).toEqual({
      left: 200, top: 90, maxHeight: 704,
    })
  })
