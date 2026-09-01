// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CellLayoutEditor from './CellLayoutEditor'
import { DEFAULT_CELL_LAYOUT } from '../../lib/cellLayout'

const buttons = [{ label: '按钮1', field: 'url1' }, { label: '按钮2', field: 'url2' }]

describe('CellLayoutEditor', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function renderEditor(onChange = vi.fn()) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root.render(<CellLayoutEditor layout={DEFAULT_CELL_LAYOUT} buttons={buttons} scope="cell" onScopeChange={vi.fn()} onChange={onChange} />)
    })
    return { onChange }
  }

  it('显示文字区域和按钮组区域，并通过右侧投放切换左右布局', () => {
    const { onChange } = renderEditor()
    expect(host.querySelector('[data-testid=layout-text-zone]')?.textContent).toContain('文字区域')
    expect(host.querySelector('[data-testid=layout-button-zone]')?.textContent).toContain('按钮组区域')
    const rightZone = host.querySelector('[data-testid=layout-drop-right]') as HTMLElement
    act(() => rightZone.dispatchEvent(new Event('drop', { bubbles: true })))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ direction: 'row' }))
  })

  it('数量输入限制为 1 到 100，并支持每行/每列配置', () => {
    const { onChange } = renderEditor()
    const input = host.querySelector('[data-testid=layout-count]') as HTMLInputElement
    expect(input.value).toBe('1')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '101')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ buttonGroup: expect.objectContaining({ count: 100 }) }))
    const flow = host.querySelector('[data-testid=layout-flow]') as HTMLSelectElement
    act(() => {
      flow.value = 'column'
      flow.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ buttonGroup: expect.objectContaining({ flow: 'column' }) }))
  })
})