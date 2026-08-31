// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContextMenu from './ContextMenu'

const noop = vi.fn()

function props() {
  return {
    target: { x: 200, y: 850, field: 'name', rowIndex: 0 },
    row: { uid: 'row-1', name: '示例' },
    buttons: [],
    onClose: noop,
    onCut: noop,
    onCopy: noop,
    onPaste: noop,
    onSort: noop,
    onFilter: noop,
    onAddButton: noop,
    onEditButton: noop,
    onRemoveButton: noop,
    onCopyButton: noop,
    onCutButton: noop,
    onPasteButton: noop,
  }
}

describe('ContextMenu', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let previousRect: typeof HTMLElement.prototype.getBoundingClientRect
  let previousScrollHeight: PropertyDescriptor | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    HTMLElement.prototype.getBoundingClientRect = previousRect
    if (previousScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', previousScrollHeight)
    vi.restoreAllMocks()
  })

  it('首次打开底部超高菜单时按完整内容高度向上定位', async () => {
    previousRect = HTMLElement.prototype.getBoundingClientRect
    previousScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 })
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('ctxmenu')) {
        return { width: 180, height: 240, top: 8, left: 8, right: 188, bottom: 248 } as DOMRect
      }
      return previousRect.call(this)
    }
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() {
      return this.classList.contains('ctxmenu') ? 622 : 0
    } })

    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => { root.render(<ContextMenu {...props()} />) })

    const menu = document.body.querySelector('.ctxmenu') as HTMLElement
    expect(menu.style.top).toBe('90px')
    expect(menu.style.maxHeight).toBe('704px')
    expect(menu.style.overflowY).toBe('auto')
  })
})
