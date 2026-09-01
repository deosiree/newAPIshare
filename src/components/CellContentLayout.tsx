import type { ButtonDef } from '../lib/data'
import { buildButtonGrid, normalizeCellLayout, type CellLayout } from '../lib/cellLayout'

export interface CellContentLayoutProps {
  text?: string
  buttons?: ButtonDef[]
  layout?: CellLayout
  textClassName?: string
  buttonClassName?: string
  textTitle?: string
  buttonHref?: (button: ButtonDef) => string | undefined
}

/** 渲染单元格中的文字区域和按钮组区域，并统一应用双层布局规则。
 * @param props 文字、按钮、布局及样式参数
 * @returns 可复用的单元格内容布局
 */
export default function CellContentLayout({
  text = '',
  buttons = [],
  layout,
  textClassName,
  buttonClassName = 'mini ck',
  textTitle,
  buttonHref,
}: CellContentLayoutProps) {
  const resolved = normalizeCellLayout(layout)
  const grid = buildButtonGrid(buttons, resolved.buttonGroup)
  if (!text && !buttons.length) return null
  return (
    <div className={'cell-content-layout cell-content-' + resolved.direction} style={{ gap: resolved.buttonGroup.gap }}>
      {text !== '' && <span className={['cell-content-text', textClassName ?? ''].join(' ').trim()} title={textTitle}>{text}</span>}
      {buttons.length > 0 && (
        <span
          className={'cell-content-buttons cell-content-buttons-' + resolved.buttonGroup.align}
          style={{
            gap: resolved.buttonGroup.gap,
            gridTemplateColumns: resolved.buttonGroup.flow === 'row' ? `repeat(${resolved.buttonGroup.count}, max-content)` : undefined,
            gridTemplateRows: resolved.buttonGroup.flow === 'column' ? `repeat(${resolved.buttonGroup.count}, max-content)` : undefined,
          }}
        >
          {grid.map(({ item, row, column }) => (
            <a
              key={item.label + '|' + item.field}
              className={buttonClassName}
              href={buttonHref?.(item) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              data-grid-row={row}
              data-grid-column={column}
              style={{ gridRow: row, gridColumn: column }}
              onClick={(event) => {
                if (!buttonHref?.(item)) event.preventDefault()
              }}
            >
              {item.label}
            </a>
          ))}
        </span>
      )}
    </div>
  )
}
