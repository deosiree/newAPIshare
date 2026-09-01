import { describe, expect, it } from 'vitest'
import { resizeColumnWidth, resizeRowHeight } from './resizeOps'

describe('resizeOps', () => {
  it('按鼠标位移调整行高并限制边界', () => {
    expect(resizeRowHeight(46, 20)).toBe(66)
    expect(resizeRowHeight(46, -100)).toBe(24)
    expect(resizeRowHeight(980, 100)).toBe(1000)
  })

  it('按鼠标位移调整列宽并限制边界', () => {
    expect(resizeColumnWidth(120, 30)).toBe(150)
    expect(resizeColumnWidth(120, -100)).toBe(40)
    expect(resizeColumnWidth(980, 100)).toBe(1000)
  })
})
