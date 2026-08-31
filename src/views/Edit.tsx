import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ModuleRegistry, AllCommunityModule,
  type GridApi, type ColDef,
} from 'ag-grid-community'
import * as XLSX from 'xlsx'
import type { ButtonDef, ButtonsMeta, Row, SiteData, ViewPreset, HighlightRule } from '../lib/data'
import { cellButtons } from '../lib/data'
import { HIDDEN_ROW_FIELD, type ColumnDef } from '../fields'
import { cellStyleFor } from '../lib/data'
import { cellStyleKey, loadWorkbook, type CellStyle } from '../lib/workbook'
import { applyCellStylePatch } from '../lib/editOps'
import { buildColumnWidthsFromState, canReorderRows, moveRowByUid } from '../lib/gridOps'
import EditToolbar from '../components/edit/EditToolbar'
import ContextMenu from '../components/edit/ContextMenu'
import FormatPanel from '../components/edit/FormatPanel'

ModuleRegistry.registerModules([AllCommunityModule])

interface Snap {
  rows: Row[]
  cols: ColumnDef[]
  btns: ButtonsMeta
  views: ViewPreset[]
  rules: HighlightRule[]
  rowH: number
  styles: Record<string, CellStyle>
  rowHeights: Record<number, number>
  columnWidths: Record<string, number>
}
type MenuItem = { x: number; y: number; field?: string; rowIndex?: number }
type Change = { name: string; field: string; fieldLabel: string; old: string; value: string }
type Clip = { kind: 'cell'; value: string; field?: string; rowIndex?: number } | { kind: 'button'; buttons: ButtonDef[] } | null

const SYNC_URL = 'http://localhost:8788'
/** 生成稳定性足够的短行 UID。
 * @returns 新生成的行 UID
 */
const newUid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
const RULE_COLORS = ['#ef444433', '#f59e0b33', '#22c55e33', '#3b82f633', '#a855f733', '#94a3b833']

/** 原生 JS 单元格渲染器:文本 + 按钮 chip(非 React 组件,由 AG Grid 核心实例化) */
let CURRENT_BUTTONS: ButtonsMeta = {}
class BtnCellRenderer {
  eGui!: HTMLDivElement
  init(p: { value?: string; data?: Row; colDef: { field?: string } }) { this.eGui = document.createElement('div'); this.update(p) }
  refresh(p: { value?: string; data?: Row; colDef: { field?: string } }) { this.update(p); return true }
  getGui() { return this.eGui }
  private update(p: { value?: string; data?: Row; colDef: { field?: string } }) {
    this.eGui.innerHTML = ''
    const row = p.data
    if (!row) return
    if (p.value) {
      const t = document.createElement('span')
      t.textContent = String(p.value)
      this.eGui.appendChild(t)
    }
    const btns = cellButtons(row, p.colDef.field ?? '', CURRENT_BUTTONS).filter((b) => row[b.field])
    if (btns.length) {
      const w = document.createElement('span')
      w.className = 'btns btns-inline'
      btns.forEach((b) => {
        const a = document.createElement('a')
        a.className = 'mini ck'
        a.href = row[b.field]
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.textContent = b.label
        w.appendChild(a)
      })
      this.eGui.appendChild(w)
    }
  }
}

/** 工具栏下拉分组(details/summary) */
/** 渲染工具栏的可折叠操作分组。
 * @param props 分组标题和子操作元素
 * @returns 可折叠工具栏分组
 */
function Drop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="drop">
      <summary className="tbtn">{label}</summary>
      <div className="drop-list" onClick={(e) => { const d = e.currentTarget.closest('details'); if (d) d.open = false }}>
        {children}
      </div>
    </details>
  )
}
/** 渲染工具栏分组中的单个操作按钮。
 * @param props 点击回调和按钮内容
 * @returns 工具栏操作按钮
 */
function DropItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="tbtn drop-item" onClick={onClick}>{children}</button>
}

export default function Edit({ data, unlocked }: { data: SiteData | null; unlocked: boolean }) {
  const [rows, setRows] = useState<Row[]>(data?.rows ?? [])
  const [meta, setMeta] = useState<ColumnDef[]>(data?.columns ?? [])
  const [buttons, setButtons] = useState<ButtonsMeta>(data?.buttons ?? {})
  const [views, setViews] = useState<ViewPreset[]>(data?.metaAll?.views ?? [])
  const [rules, setRules] = useState<HighlightRule[]>(data?.metaAll?.rules ?? [])
  const [rowHeight, setRowHeight] = useState(data?.metaAll?.editor?.rowHeight ?? 46)
  const [styles, setStyles] = useState<Record<string, CellStyle>>(data?.styles ?? {})
  const [rowHeights, setRowHeights] = useState<Record<number, number>>(data?.rowHeights ?? {})
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(data?.columnWidths ?? {})
  const [msg, setMsg] = useState('就绪 · 修改后请点「保存」')
  const [menu, setMenu] = useState<MenuItem | null>(null)
  const [srv, setSrv] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: '检查本机同步助手…' })
  const [scan, setScan] = useState<{ changes: Change[]; unmatched: string[] } | null>(null)
  const [selectedCol, setSelectedCol] = useState<string | undefined>(undefined)
  const [fr, setFr] = useState({ open: false, find: '', replace: '', ignoreCase: true })
  const [panel, setPanel] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const [xl, setXl] = useState({ watching: false, syncing: false, last_sync: '', last_error: '' })
  const xlTimer = useRef<number | null>(null)

  const gridRef = useRef<GridApi | null>(null)
  const focusRef = useRef<{ field?: string; rowIndex?: number }>({})
  const past = useRef<Snap[]>([])
  const future = useRef<Snap[]>([])
  const pending = useRef<Snap | null>(null)
  const clip = useRef<Clip>(null)
  const [hist, setHist] = useState({ u: 0, r: 0 })
  const cur = useRef<Snap>({ rows, cols: meta, btns: buttons, views, rules, rowH: rowHeight, styles, rowHeights, columnWidths })
  cur.current = { rows, cols: meta, btns: buttons, views, rules, rowH: rowHeight, styles, rowHeights, columnWidths }
  CURRENT_BUTTONS = buttons

  /* 异步数据到达后填充编辑器 */
  useEffect(() => {
    if (data) {
      setRows(data.rows)
      setMeta(data.columns)
      setButtons(data.buttons ?? {})
      setViews(data.metaAll?.views ?? [])
      setRules(data.metaAll?.rules ?? [])
      setRowHeight(data.metaAll?.editor?.rowHeight ?? 46)
      setStyles(data.styles ?? {})
      setRowHeights(data.rowHeights ?? {})
      setColumnWidths(data.columnWidths ?? {})
      cur.current = { rows: data.rows, cols: data.columns, btns: data.buttons ?? {}, views: data.metaAll?.views ?? [], rules: data.metaAll?.rules ?? [], rowH: data.metaAll?.editor?.rowHeight ?? 46, styles: data.styles ?? {}, rowHeights: data.rowHeights ?? {}, columnWidths: data.columnWidths ?? {} }
      past.current = []; future.current = []
      setHist({ u: 0, r: 0 })
    }
  }, [data])

  const dark = useMemo(
    () => (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches),
    [],
  )

  /* ---------- 撤销/重做 ---------- */
  const pushHist = useCallback(() => {
    setHist({ u: past.current.length, r: future.current.length })
  }, [])
  const mutate = useCallback((fn: (s: Snap) => Partial<Snap>) => {
    past.current.push(structuredClone(cur.current))
    if (past.current.length > 50) past.current.shift()
    future.current = []
    const patch = fn(cur.current)
    const ns: Snap = { ...cur.current, ...patch, styles: patch.styles ?? cur.current.styles, rowHeights: patch.rowHeights ?? cur.current.rowHeights, columnWidths: patch.columnWidths ?? cur.current.columnWidths }
    cur.current = ns
    setRows(ns.rows); setMeta(ns.cols); setButtons(ns.btns)
    setViews(ns.views); setRules(ns.rules); setRowHeight(ns.rowH)
    setStyles(ns.styles); setRowHeights(ns.rowHeights); setColumnWidths(ns.columnWidths)
    pushHist()
  }, [pushHist])
  const undo = useCallback(() => {
    if (!past.current.length) return
    future.current.push(structuredClone(cur.current))
    const s = past.current.pop()!
    cur.current = s
    setRows(s.rows); setMeta(s.cols); setButtons(s.btns)
    setViews(s.views); setRules(s.rules); setRowHeight(s.rowH)
    setStyles(s.styles); setRowHeights(s.rowHeights); setColumnWidths(s.columnWidths)
    pushHist()
  }, [pushHist])
  const redo = useCallback(() => {
    if (!future.current.length) return
    past.current.push(structuredClone(cur.current))
    const s = future.current.pop()!
    cur.current = s
    setRows(s.rows); setMeta(s.cols); setButtons(s.btns)
    setViews(s.views); setRules(s.rules); setRowHeight(s.rowH)
    setStyles(s.styles); setRowHeights(s.rowHeights); setColumnWidths(s.columnWidths)
    pushHist()
  }, [pushHist])

  /* ---------- 网格列定义(行号列 + 列头点击=选中整列;排序走「排序筛选」) ---------- */
  const buttonCols = useMemo(() => {
    const set = new Set<string>()
    Object.keys(buttons.columnDefaults ?? {}).forEach((k) => set.add(k))
    Object.keys(buttons.overrides ?? {}).forEach((k) => {
      const f = k.split('|')[1]
      if (f) set.add(f)
    })
    return set
  }, [buttons])

  /**
   * 读取当前网格排序和筛选状态，供行拖拽限制与保存流程复用。
   * @returns 当前 AG Grid 的排序和筛选状态
   */
  const getRowReorderState = useCallback(() => ({
    sortModel: gridRef.current?.getColumnState().filter((item) => item.sort) ?? [],
    filterModel: gridRef.current?.getFilterModel() ?? {},
  }), [])

  /**
   * 在排序或筛选状态下提示用户不能拖拽原始行顺序。
   * @returns 无返回值
   */
  const notifyRowDragUnavailable = useCallback((): void => {
    if (!canReorderRows(getRowReorderState())) {
      setMsg("排序或筛选状态下不能拖拽行，请先清除排序和筛选")
    }
  }, [getRowReorderState])

  const colDefs: ColDef[] = useMemo(() => {
    const dataCol = (c: ColumnDef): ColDef => ({
      field: c.field,
      headerName: c.header,
      editable: true,
      width: c.width ?? (buttonCols.has(c.field) ? 220 : 150),
      filter: true,
      sortable: true,
      resizable: true,
      hide: !!c.hidden,
      pinned: c.pinned === 'left' ? 'left' : false,
      wrapText: !!c.wrap,
      headerClass: selectedCol === c.field ? 'head-colsel' : undefined,
      cellClassRules: { 'cell-colsel': (p) => selectedCol === p.colDef.field },
      cellStyle: (p: { value?: string; data?: Row }) => {
        const st: Record<string, string | number> = { ...cellStyleFor(p.data ?? {}, c.field, styles) }
        if (c.align === 'center' && !st.textAlign) st.textAlign = 'center'
        if (c.align === 'right' && !st.textAlign) st.textAlign = 'right'
        if (c.bold && !st.fontWeight) st.fontWeight = '600'
        if (c.italic && !st.fontStyle) st.fontStyle = 'italic'
        const rule = rules.find((r) => r.field === c.field && r.value !== '' && r.value === String(p.value ?? '').trim())
        if (rule && !st.backgroundColor) st.backgroundColor = rule.color
        return st
      },
      cellRenderer: buttonCols.has(c.field) ? BtnCellRenderer : undefined,
    })
    return [
      {
        field: '__seq', headerName: '#', width: 54, editable: false, sortable: false, filter: false,
        resizable: false, pinned: 'left',
        rowDrag: () => canReorderRows(getRowReorderState()),
        valueGetter: (p) => String((p.node?.rowIndex ?? 0) + 1),
        onCellClicked: (e) => { e.node?.setSelected(!e.node.isSelected()) },
        onCellMouseDown: notifyRowDragUnavailable,
        cellClass: "rownum-cell",
      },
      ...meta.filter((c) => c.field !== 'uid').map(dataCol),
    ]
  }, [meta, buttons, buttonCols, selectedCol, rules, styles, getRowReorderState, notifyRowDragUnavailable])

  /* ---------- 行与列 ---------- */
  /** 按选中行数插入空白行，并记录为一次可撤销事务。
 * @returns 无返回值
 */
const insertRows = () => {
    const sel = gridRef.current?.getSelectedRows?.() ?? []
    const n = Math.max(sel.length, 1)
    const idx = sel.length ? Math.min(...sel.map((r) => rows.indexOf(r)).filter((i) => i >= 0)) : rows.length
    const blanks = Array.from({ length: n }, () => ({ uid: newUid() }))
    mutate((s) => { const rr = [...s.rows]; rr.splice(idx, 0, ...blanks); return { ...s, rows: rr } })
    setMsg(`已插入 ${n} 行,记得点「保存」`)
  }
  /** 复制选中的数据行并生成新的 UID。
 * @returns 无返回值
 */
const dupRows = () => {
    const sel = gridRef.current?.getSelectedRows?.() ?? []
    if (!sel.length) { alert('请先勾选要复制的行(行首复选框)'); return }
    mutate((s) => {
      const rr = [...s.rows]
      sel.forEach((r) => { const i = rr.indexOf(r); if (i >= 0) rr.splice(i + 1, 0, { ...r, uid: newUid(), name: r.name + ' 副本' }) })
      return { ...s, rows: rr }
    })
    setMsg(`已复制 ${sel.length} 行(保存后生效)`)
  }
  /** 删除选中行或指定行，并支持撤销。
 * @param rowIndex 右键目标行索引
 * @returns 无返回值
 */
const delRow = (rowIndex?: number) => {
    const sel = gridRef.current?.getSelectedRows?.() ?? []
    if (sel.length) {
      if (!confirm(`确定删除选中的 ${sel.length} 行?`)) return
      mutate((s) => ({ ...s, rows: s.rows.filter((r) => !sel.includes(r)) }))
      setMsg(`已删除 ${sel.length} 行(保存后生效)`)
      return
    }
    if (rowIndex == null) { alert('请先勾选要删除的行,或右键目标行'); return }
    if (!confirm('确定删除该行?(可撤销)')) return
    mutate((s) => ({ ...s, rows: s.rows.filter((_, i) => i !== rowIndex) }))
  }
  /** 新增一个空数据列。
 * @returns 无返回值
 */
const addCol = () => {
    const name = window.prompt('新列名(也是 Excel 表头):')
    if (!name) return
    if (meta.some((c) => c.field === name || c.header === name)) { alert('列名已存在'); return }
    mutate((s) => ({ ...s, cols: [...s.cols, { field: name, header: name }] }))
    setMsg(`已添加列「${name}」,记得点「保存」`)
  }
  /** 删除指定或当前选中的数据列。
 * @param field 待删除字段名
 * @returns 无返回值
 */
const delCol = (field?: string) => {
    const f = field ?? selectedCol ?? focusRef.current.field
    if (!f) { alert('请先点击目标列的任意单元格或列头'); return }
    const c = cur.current.cols.find((x) => x.field === f)
    if (!c) return
    if (!confirm(`确定删除列「${c.header}」及其全部数据?(可撤销)`)) return
    mutate((s) => ({
      rows: s.rows.map((r) => { const n = { ...r }; delete n[f]; return n }),
      cols: s.cols.filter((x) => x.field !== f),
      btns: s.btns,
      views: s.views, rules: s.rules, rowH: s.rowH,
    }))
    setSelectedCol(undefined)
    setMsg(`已删除列「${c.header}」(保存后生效)`)
  }
  /** 返回当前编辑目标，单元格优先于列头选择。
   * @returns 当前字段名；未选择时返回 undefined
   */
  const focusedOrSelected = () => focusRef.current.rowIndex != null ? focusRef.current.field : selectedCol

  /** 将样式补丁写入当前单元格或整列，并同步兼容的列级元数据。
   * @param patch 要写入的单元格样式补丁
   * @returns 无返回值
   */
  const updateFocusedStyle = (patch: Partial<CellStyle>): void => {
    const field = focusedOrSelected()
    if (!field) { alert('请先点击目标列头或单元格'); return }
    const rowIndex = focusRef.current.rowIndex
    const isColumnTarget = rowIndex == null && selectedCol != null
    mutate((s) => ({
      styles: applyCellStylePatch(s.styles, s.rows, { rowIndex, field, selectedCol: isColumnTarget ? selectedCol : undefined }, patch),
      cols: isColumnTarget ? s.cols.map((column) => {
        if (column.field !== field) return column
        const next = { ...column }
        if (patch.horizontal) next.align = patch.horizontal
        if (patch.font?.bold !== undefined) next.bold = patch.font.bold
        if (patch.font?.italic !== undefined) next.italic = patch.font.italic
        if (patch.wrapText !== undefined) next.wrap = patch.wrapText
        return next
      }) : s.cols,
    }))
    setMsg('单元格格式已更新，保存后写回 XLSX')
  }

  /** 设置当前目标的水平对齐方式。
   * @param align 水平对齐方式
   * @returns 无返回值
   */
  const setAlign = (align: 'center' | 'left' | 'right'): void => updateFocusedStyle({ horizontal: align })

  /** 切换当前目标的字体或换行样式。
   * @param key 要切换的样式键
   * @returns 无返回值
   */
  const toggleStyle = (key: 'bold' | 'italic' | 'wrapText'): void => {
    const style = focusedStyle
    if (key === 'wrapText') updateFocusedStyle({ wrapText: !style.wrapText })
    else updateFocusedStyle({ font: { [key]: !style.font?.[key] } })
  }

  /** 设置当前目标的垂直对齐方式。
   * @param vertical 垂直对齐方式
   * @returns 无返回值
   */
  const setVertical = (vertical: 'top' | 'middle' | 'bottom'): void => updateFocusedStyle({ vertical })

  /** 设置当前目标的字体颜色。
   * @param color CSS 十六进制颜色
   * @returns 无返回值
   */
  const setFontColor = (color: string | undefined): void => updateFocusedStyle({ font: { color } })

  /** 设置当前目标的背景颜色。
   * @param fillColor CSS 十六进制颜色
   * @returns 无返回值
   */
  const setFillColor = (fillColor: string | undefined): void => updateFocusedStyle({ fillColor })

  const focusedStyle = useMemo<CellStyle>(() => {
    const field = focusedOrSelected()
    if (!field) return {}
    const row = focusRef.current.rowIndex != null ? rows[focusRef.current.rowIndex] : rows[0]
    return row ? styles[cellStyleKey(row.uid, field)] ?? {} : {}
  }, [rows, selectedCol, styles])

  /** 设置当前列的浏览态渲染类型。
 * @param t 列渲染类型
 * @returns 无返回值
 */
const setType = (t: '' | 'status' | 'rating' | 'apistatus') => {
    const f = focusedOrSelected()
    if (!f) { alert('请先点击目标列头或单元格'); return }
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === f ? { ...c, type: t || undefined } : c)) }))
    setMsg(`列类型已切换(保存后生效,浏览态同步)`)
  }
  /** 隐藏指定或当前数据列。
 * @param f 待隐藏字段名
 * @returns 无返回值
 */
const hideCol = (f?: string) => {
    const field = f ?? focusedOrSelected()
    if (!field) { alert('请先点击目标列头或单元格'); return }
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === field ? { ...c, hidden: true } : c)) }))
    setMsg('列已隐藏(浏览态同样不可见;「视图▾→字段面板」可恢复)')
  }
  /** 恢复指定数据列的显示。
 * @param f 待显示字段名
 * @returns 无返回值
 */
const unhideCol = (f: string) => {
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === f ? { ...c, hidden: false } : c)) }))
    setMsg('列已恢复显示')
  }
  /** 切换当前列的冻结状态。
 * @returns 无返回值
 */
const freezeCol = () => {
    const f = focusedOrSelected()
    if (!f) { alert('请先点击目标列头或单元格'); return }
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === f ? { ...c, pinned: c.pinned === 'left' ? undefined : 'left' } : c)) }))
    setMsg('列冻结状态已切换(保存后生效,浏览态同步)')
  }
  /** 切换指定行的隐藏标记。
 * @param rowIndex 目标行索引
 * @param hide 是否隐藏
 * @returns 无返回值
 */
const toggleHideRow = (rowIndex: number | undefined, hide: boolean) => {
    if (rowIndex == null) return
    mutate((s) => ({
      ...s,
      rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [HIDDEN_ROW_FIELD]: hide ? '1' : '' } : r)),
    }))
    setMsg(hide ? '行已隐藏(浏览态不可见)' : '行已取消隐藏')
  }
  /** 编辑当前单元格的超链接文本。
 * @returns 无返回值
 */
const editLink = () => {
    const f = focusRef.current.field
    const rowIndex = focusRef.current.rowIndex
    if (rowIndex == null || !f) { alert('请先点击目标单元格'); return }
    const old = rows[rowIndex]?.[f] ?? ''
    const nv = window.prompt(`编辑「${cur.current.cols.find((c) => c.field === f)?.header ?? f}」:`, old)
    if (nv === null) return
    mutate((s) => ({ ...s, rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [f]: nv } : r)) }))
  }

  /* ---------- 查找替换 ---------- */
  const frCount = useMemo(() => {
    if (!fr.find) return 0
    const needle = fr.ignoreCase ? fr.find.toLowerCase() : fr.find
    let n = 0
    rows.forEach((r) => Object.entries(r).forEach(([k, v]) => {
      if (k === 'uid') return
      const hay = fr.ignoreCase ? String(v ?? '').toLowerCase() : String(v ?? '')
      if (hay.includes(needle)) n++
    }))
    return n
  }, [fr, rows])
  /** 批量替换匹配文本，并将结果写入撤销栈。
 * @returns 无返回值
 */
const replaceAll = () => {
    if (!fr.find) { alert('请输入查找内容'); return }
    const n = frCount
    if (!n) { alert('没有匹配的单元格'); return }
    if (!confirm(`将替换 ${n} 个单元格(可撤销)。继续?`)) return
    mutate((s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const nr: Row = { ...r }
        Object.entries(nr).forEach(([k, v]) => {
          if (k === 'uid') return
          const flags = fr.ignoreCase ? 'gi' : 'g'
          nr[k] = String(v ?? '').replace(new RegExp(fr.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags), fr.replace)
        })
        return nr
      }),
    }))
    setMsg(`已替换 ${n} 个单元格,记得点「保存」`)
    setFr((f) => ({ ...f, open: false }))
  }

  /* ---------- 导入/导出 ---------- */
  /** 导出当前编辑快照为 XLSX 文件。
 * @returns 无返回值
 */
const exportXlsx = () => {
    const aoa: string[][] = [meta.map((c) => c.header)]
    rows.forEach((r) => aoa.push(meta.map((c) => r[c.field] ?? '')))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '公益站')
    XLSX.writeFile(wb, '免费公益站统计合集.xlsx')
  }
  /** 将当前数据导出为备份 CSV 文件。
 * @returns 无返回值
 */
const backupCsv = () => {
    const coldefs = meta.map((c) => [c.field, c.header])
    let head = '\uFEFF隐藏,' + coldefs.map((x) => x[1]).join(',')
    const body = rows.map((r) => ['隐藏', ...coldefs.map(([f]) => `"${String(r[f] ?? '').replace(/"/g, '""')}"`)].join(',')).join('\n')
    const blob = new Blob([head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = '公益站备份.csv'
    a.click()
  }
  /** 导入 XLSX 第一张工作表，连同单元格样式、行高和列宽进入一次事务。
   * @param file 用户选择的 XLSX 文件
   * @returns 无返回值
   */
  /** 导入 XLSX 第一张工作表并覆盖当前编辑数据。
 * @param file 用户选择的 XLSX 文件
 * @returns 无返回值
 */
const importXlsx = (file: File): void => {
    void file.arrayBuffer().then(async (buffer) => {
      try {
        const document = await loadWorkbook(buffer, meta)
        const cols = document.columns.filter((column) => column.field !== 'uid')
        if (!document.rows.length) { alert('表格为空'); return }
        if (!confirm(`导入 ${document.rows.length} 行数据，将覆盖当前表格(可撤销)。继续?`)) return
        mutate((s) => ({ ...s, rows: document.rows, cols, styles: document.styles, rowHeights: document.rowHeights, columnWidths: document.columnWidths }))
        setMsg(`已导入 ${document.rows.length} 行，样式已保留，记得点「保存」`)
      } catch (error) {
        alert('导入失败: ' + (error instanceof Error ? error.message : String(error)))
      }
    })
  }
  /* ---------- 保存 ---------- */
  /* ---------- 保存 ---------- */
  /** 收集当前网格布局并将完整编辑快照写回同步助手。
   * @returns 保存请求完成后的 Promise
   */
  const save = async (): Promise<void> => {
    const snapshot = cur.current
    let cols = snapshot.cols
    const api = gridRef.current
    let nextWidths = { ...snapshot.columnWidths }
    if (api) {
      const state = api.getColumnState()
      const order = state.map((item) => item.colId)
      const hasHidden = snapshot.rows.some((row) => 'hidden' in row)
      cols = snapshot.cols
        .map((column) => {
          const item = state.find((entry) => entry.colId === column.field)
          return item?.width ? { ...column, width: item.width } : column
        })
        .sort((a, b) => {
          const ia = a.hidden ? 9999 : order.indexOf(a.field) < 0 ? 9998 : order.indexOf(a.field)
          const ib = b.hidden ? 9999 : order.indexOf(b.field) < 0 ? 9998 : order.indexOf(b.field)
          return ia - ib
        })
      nextWidths = buildColumnWidthsFromState(cols, state, nextWidths, hasHidden)
    }
    setMsg('保存中…')
    try {
      const r = await fetch(SYNC_URL + '/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: snapshot.rows, columns: cols, updated: new Date().toISOString().slice(0, 10), buttons: snapshot.btns,
          extras: { views: snapshot.views, rules: snapshot.rules, editor: { rowHeight: snapshot.rowH }, styles: snapshot.styles, rowHeights: snapshot.rowHeights, columnWidths: nextWidths },
        }),
      })
      const res = await r.json()
      if (res.ok) {
        setMeta(cols); setColumnWidths(nextWidths)
        setMsg(res.pushed ? '已保存并推送，网站将在约 1 分钟内自动更新 ✓' : `已保存到本地(${res.msg || '未推送'})，请手动 commit+push`)
        past.current = []; future.current = []; pushHist()
      } else {
        const message = res.msg || res.error || '未知错误'
        alert('保存失败: ' + message); setMsg('保存失败: ' + message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      alert('保存失败: 同步助手未启动或网络错误\n' + message); setMsg('保存失败: ' + message)
    }
  }

  /* ---------- New API 同步(阶段3升级为列级映射) ---------- */
  /** 请求同步助手扫描 New API 渠道变更。
 * @returns 无返回值
 */
const scanApi = async () => {
    setMsg('检测 New API 渠道中…(约10秒)')
    try {
      const r = await fetch(SYNC_URL + '/snapshot')
      const data = await r.json()
      setScan({ changes: data.changes ?? [], unmatched: data.unmatched ?? [] })
      setMsg('检测完成,请在弹窗中确认变更')
    } catch {
      alert('检测失败:同步助手无响应。请确认已双击 tools/启动同步工具.bat')
      setMsg('就绪')
    }
  }
  /** 将用户确认的渠道变更提交给同步助手。
 * @param picked 用户确认的变更列表
 * @returns 异步操作完成的 Promise
 */
const applySync = async (picked: Change[]) => {
    if (!picked.length) return
    const r = await fetch(SYNC_URL + '/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: picked }),
    })
    const res = await r.json()
    if (res.ok) {
      setScan(null)
      alert('已写入数据源' + (res.pushed ? '并推送,网站约 1 分钟内更新。' : '(未推送)') + ' 页面即将刷新加载最新数据。')
      location.reload()
    } else {
      alert('写入失败:' + (res.msg || ''))
    }
  }

  /* ---------- Excel/WPS 联动 ---------- */
  /** 轮询同步助手的 Excel 联动状态。
 * @returns 无返回值
 */
const pollXl = () => {
    fetch(SYNC_URL + '/watch-status')
      .then((r) => (r.ok ? r.json() : Promise.reject(0)))
      .then((j) => setXl({ watching: !!j.watching, syncing: !!j.syncing, last_sync: j.last_sync ?? '', last_error: j.last_error ?? '' }))
      .catch(() => setXl((x) => ({ ...x, watching: false, syncing: false, last_error: '助手无响应' })))
  }
  /** 开启或停止本机 Excel/WPS 联动。
 * @returns 异步操作完成的 Promise
 */
const toggleExcel = async () => {
    try {
      if (xl.watching) {
        await fetch(SYNC_URL + '/watch-stop', { method: 'POST' })
        if (xlTimer.current) { clearInterval(xlTimer.current); xlTimer.current = null }
        setXl((x) => ({ ...x, watching: false, syncing: false }))
        setMsg('已停止 Excel 编辑联动')
      } else {
        const r = await fetch(SYNC_URL + '/open-excel', { method: 'POST' })
        const j = await r.json()
        if (!j.ok) throw new Error(j.msg || '打开失败')
        await fetch(SYNC_URL + '/watch-start', { method: 'POST' })
        setXl((x) => ({ ...x, watching: true, last_error: '' }))
        if (xlTimer.current) clearInterval(xlTimer.current)
        xlTimer.current = window.setInterval(pollXl, 3000)
        setMsg('已在 Excel/WPS 中打开 XLSX;保存后自动同步(push)')
        pollXl()
      }
    } catch (e) {
      alert('Excel 联动失败:' + e + '\n请确认同步助手已启动(双击 tools/启动同步工具.bat)')
    }
  }
  useEffect(() => () => { if (xlTimer.current) clearInterval(xlTimer.current) }, [])

  useEffect(() => {
    const preventNativeMenu = (event: MouseEvent): void => { event.preventDefault() }
    document.addEventListener('contextmenu', preventNativeMenu)
    return () => document.removeEventListener('contextmenu', preventNativeMenu)
  }, [])

  /* ---------- 全局效果:同步助手健康检查 ---------- */
  useEffect(() => {
    fetch(SYNC_URL + '/ping')
      .then((r) => (r.ok ? r.json() : Promise.reject(0)))
      .then((j) => {
        if ((j.ver ?? 1) < 3) {
          setSrv({ ok: false, msg: '助手版本过旧 — 请关闭黑窗口重新运行 tools/启动同步工具.bat' })
          return
        }
        setSrv({ ok: true, msg: '已连接' })
        if (j.watching) setXl((x) => ({ ...x, watching: true }))
      })
      .catch(() => setSrv({ ok: false, msg: '未启动 — 双击 tools/启动同步工具.bat' }))
  }, [])

  /* ---------- 全局效果:快捷键和关闭菜单 ---------- */
  useEffect(() => {
    const close = () => setMenu(null)
    const keys = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); void save() }
      else if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
      else if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (e.key === 'Escape') { setMenu(null); setFr((f) => ({ ...f, open: false })); setPanel(false); setFormatOpen(false) }
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', keys)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', keys)
    }
  }, [redo, save, undo])

  /* ---------- 排序与筛选(作用于当前列) ---------- */
  /** 按当前字段应用或清除排序。
 * @param dir 排序方向，传 null 清除排序
 * @returns 无返回值
 */
const sortCol = (dir: 'asc' | 'desc' | null) => {
    const f = focusedOrSelected()
    if (!f || f === '__row') { alert('请先点击目标列头或单元格'); return }
    gridRef.current?.applyColumnState({ state: [{ colId: f, sort: dir }], defaultState: { sort: null } })
    setMsg(dir ? `已按「${f}」${dir === 'asc' ? '升序' : '降序'}排序` : '已清除排序')
  }
  /** 按当前字段应用或清除文本筛选。
 * @param type 筛选类型，传 null 清除筛选
 * @returns 无返回值
 */
const filterCol = (type: 'contains' | 'equals' | null) => {
    const f = focusedOrSelected()
    if (!f || f === '__row') { alert('请先点击目标列头或单元格'); return }
    const api = gridRef.current
    if (!api) return
    const curModel = api.getFilterModel()
    if (type === null) {
      const n = { ...curModel }; delete n[f]
      api.setFilterModel(n)
      setMsg('已清除该列筛选')
      return
    }
    const v = window.prompt(type === 'contains' ? `「${f}」包含文本:` : `「${f}」等于文本:`)
    if (v === null || v === '') return
    api.setFilterModel({ ...curModel, [f]: { filterType: 'text', type, filter: v } })
    setMsg(`已筛选「${f}」`)
  }

  /* ---------- 单元格编辑:开始前快照,结束后入栈 ---------- */
  const onCellEditingStarted = useCallback(() => {
    pending.current = structuredClone(cur.current)
  }, [])
  const onCellValueChanged = useCallback(() => {
    if (pending.current) {
      past.current.push(pending.current)
      if (past.current.length > 50) past.current.shift()
      future.current = []
      pending.current = null
      setRows((prev) => [...prev])
      pushHist()
    }
  }, [pushHist])

  /* ---------- 右键菜单:剪贴板与按钮操作 ---------- */
  /** 复制或剪切指定单元格内容到剪贴板状态。
 * @param rowIndex 目标行索引
 * @param field 目标字段名
 * @param cut 是否在复制后清空原单元格
 * @returns 无返回值
 */
const clipCell = (rowIndex: number, field: string, cut: boolean) => {
    const v = rows[rowIndex]?.[field] ?? ''
    clip.current = { kind: 'cell', value: v, field, rowIndex }
    void navigator.clipboard?.writeText(v).catch(() => {})
    if (cut) mutate((s) => ({ ...s, rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: '' } : r)) }))
    setMsg(cut ? '已剪切单元格内容' : '已复制单元格内容')
  }
  /** 将剪贴板中的单元格内容粘贴到目标位置。
 * @param rowIndex 目标行索引
 * @param field 目标字段名
 * @returns 无返回值
 */
const pasteCell = (rowIndex: number, field: string) => {
    if (clip.current?.kind === 'cell') {
      const v = clip.current.value
      mutate((s) => ({ ...s, rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: v } : r)) }))
      setMsg('已粘贴单元格内容')
      return
    }
    navigator.clipboard?.readText?.()
      .then((t) => {
        if (!t) return
        mutate((s) => ({ ...s, rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: t } : r)) }))
        setMsg('已粘贴系统剪贴板文本')
      })
      .catch(() => alert('剪贴板为空,或浏览器拒绝了读取。请先复制/剪切一次。'))
  }
  const cellBtnsAt = (rowIndex: number, field: string): ButtonDef[] => {
    const r = rows[rowIndex]
    if (!r) return []
    return cellButtons(r, field, buttons)
  }
  const setCellOverride = (rowIndex: number, field: string, value: ButtonDef[] | null) => {
    const r = rows[rowIndex]
    if (!r) return
    const uid = r.uid || newUid()
    const key = uid + '|' + field
    mutate((s) => ({
      rows: s.rows.map((rr, i) => (i === rowIndex && !rr.uid ? { ...rr, uid } : rr)),
      cols: s.cols,
      btns: { ...s.btns, overrides: { ...(s.btns.overrides ?? {}), [key]: value } },
      views: s.views, rules: s.rules, rowH: s.rowH,
    }))
  }
  const addButtonAt = (rowIndex: number, field: string) => {
    const label = window.prompt('按钮文案(如:签到):')
    if (!label) return
    const field2 = window.prompt('链接字段(取哪个字段的值作为链接,如 checkin / url):', 'checkin')
    if (!field2) return
    const existing = cellBtnsAt(rowIndex, field)
    setCellOverride(rowIndex, field, [...existing, { label, field: field2 }])
    setMsg('已添加按钮(保存后生效)')
  }
  const editButtonAt = (rowIndex: number, field: string, idx: number) => {
    const cur_b = cellBtnsAt(rowIndex, field)[idx]
    if (!cur_b) return
    const label = window.prompt('按钮文案:', cur_b.label)
    if (label === null) return
    const field2 = window.prompt('链接字段:', cur_b.field)
    if (field2 === null) return
    const existing = cellBtnsAt(rowIndex, field).slice()
    existing[idx] = { label: label || cur_b.label, field: field2 || cur_b.field }
    setCellOverride(rowIndex, field, existing)
    setMsg('已编辑按钮(保存后生效)')
  }
  const removeButtonAt = (rowIndex: number, field: string) => setCellOverride(rowIndex, field, null)
  const cutButtonAt = (rowIndex: number, field: string) => {
    clip.current = { kind: 'button', buttons: cellBtnsAt(rowIndex, field) }
    removeButtonAt(rowIndex, field)
    setMsg('已剪切按钮 — 可在其他单元格右键粘贴')
  }
  const copyButtonAt = (rowIndex: number, field: string) => {
    clip.current = { kind: 'button', buttons: cellBtnsAt(rowIndex, field) }
    setMsg('已复制按钮 — 可在其他单元格右键粘贴')
  }
  const pasteButtonAt = (rowIndex: number, field: string) => {
    if (clip.current?.kind !== 'button') { alert('剪贴板里没有按钮。请先在某单元格右键「复制按钮/剪切按钮」。'); return }
    setCellOverride(rowIndex, field, clip.current.buttons)
    setMsg('已粘贴按钮(保存后生效)')
  }

  /* ---------- 字段面板 ---------- */
  /** 按方向移动数据列定义。
 * @param field 待移动字段名
 * @param dir 移动方向，-1 向左、1 向右
 * @returns 无返回值
 */
const moveCol = (field: string, dir: -1 | 1) => {
    const visible = meta.filter((c) => c.field !== 'uid')
    const i = visible.findIndex((c) => c.field === field)
    const j = i + dir
    if (i < 0 || j < 0 || j >= visible.length) return
    const order = visible.map((c) => c.field)
    ;[order[i], order[j]] = [order[j], order[i]]
    mutate((s) => ({
      ...s,
      cols: [...s.cols].sort((a, b) => {
        const va = a.field === 'uid' ? -1 : order.indexOf(a.field) < 0 ? 999 : order.indexOf(a.field)
        const vb = b.field === 'uid' ? -1 : order.indexOf(b.field) < 0 ? 999 : order.indexOf(b.field)
        return va - vb
      }),
    }))
  }
  const renameCol = (field: string, header: string) => {
    if (!header.trim()) return
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === field ? { ...c, header: header.trim() } : c)) }))
  }
  const setColPri = (field: string, pri: boolean) => {
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === field ? { ...c, pri } : c)) }))
  }
  const setColType = (field: string, t: string) => {
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === field ? { ...c, type: (t || undefined) as ColumnDef['type'] } : c)) }))
  }

  /* ---------- 视图预设 ---------- */
  /** 保存当前排序、筛选和显隐状态为视图预设。
 * @returns 无返回值
 */
const saveView = () => {
    const name = window.prompt('视图名称(如:仅有效):')
    if (!name) return
    const api = gridRef.current
    const v: ViewPreset = {
      name,
      filterModel: api?.getFilterModel() ?? {},
      sortModel: (api?.getColumnState() ?? []).filter((s) => s.sort).map((s) => ({ colId: s.colId, sort: s.sort! })),
      hiddenFields: meta.filter((c) => c.hidden && c.field !== 'uid').map((c) => c.field),
    }
    setViews((vs) => [...vs.filter((x) => x.name !== name), v])
    setMsg(`视图「${name}」已保存(保存后长期可用)`)
  }
  /** 应用一个视图预设到当前网格。
 * @param v 待应用的视图预设
 * @returns 无返回值
 */
const applyView = (v: ViewPreset) => {
    const api = gridRef.current
    api?.setFilterModel((v.filterModel ?? {}) as never)
    if (v.sortModel?.length) api?.applyColumnState({ state: v.sortModel.map((s) => ({ colId: s.colId, sort: s.sort as 'asc' | 'desc' })), defaultState: { sort: null } })
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === 'uid' ? c : { ...c, hidden: v.hiddenFields.includes(c.field) })) }))
    setMsg(`已切换到视图「${v.name}」`)
  }
  const delView = (name: string) => setViews((vs) => vs.filter((x) => x.name !== name))

  /* ---------- 条件高亮规则 ---------- */
  const addRule = () => {
    const f = focusedOrSelected()
    if (!f) { alert('请先点击目标列头或单元格'); return }
    const value = window.prompt('匹配值(单元格等于该值时高亮):')
    if (value === null || value === '') return
    const color = window.prompt('高亮颜色(HEX,如 #ef444433):', RULE_COLORS[1])
    if (!color) return
    setRules((rs) => [...rs.filter((r) => !(r.field === f && r.value === value)), { field: f, value, color }])
    setMsg('高亮规则已添加(保存后浏览态同步生效)')
  }
  const delRule = (idx: number) => setRules((rs) => rs.filter((_, i) => i !== idx))

  if (!unlocked) {
    return (
      <div className="edit-hint">
        <h2>编辑态需要解锁</h2>
        <p>在网址后加 <code>?k=编辑密钥</code>(密钥见 .env.production 的 VITE_EDIT_KEY),解锁后再回到 <code>/edit</code>。</p>
        <p><a href="/">← 返回浏览态</a></p>
      </div>
    )
  }

  const hiddenCols = meta.filter((c) => c.hidden && c.field !== 'uid')
  const panelCols = meta.filter((c) => c.field !== 'uid')

  /* 右键菜单条目(动态) */
  const mRow = menu?.rowIndex != null ? rows[menu.rowIndex] : undefined
  const mBtns = menu && mRow && menu.field ? cellButtons(mRow, menu.field, buttons) : []

  const excelLabel = xl.syncing ? '⏳ 同步中…' : xl.watching ? '📊 Excel编辑 🟢' : '📊 Excel编辑'
  const excelTitle = xl.last_error ? ('错误:' + xl.last_error) : xl.last_sync ? ('最近同步 ' + xl.last_sync) : '用本机 WPS/Excel 打开 XLSX;保存后自动同步'

  return (
    <div className="page" style={{ maxWidth: '100%' }}>
      <header className="top">
        <h1>编辑态</h1>
        <span className="tag">Excel 式在线编辑</span>
        <a href="/" style={{ marginLeft: 12, color: 'var(--accent)', fontSize: 13 }}>← 浏览态</a>
        <p className="sub">{msg} · 同步助手:{srv.ok ? '✓ ' + srv.msg : '✗ ' + srv.msg}</p>
      </header>

      <EditToolbar
        onSave={() => { void save() }}
        onUndo={undo}
        onRedo={redo}
        canUndo={!!hist.u}
        canRedo={!!hist.r}
        excelLabel={excelLabel}
        excelTitle={excelTitle}
        excelWatching={xl.watching}
        onExcelToggle={() => { void toggleExcel() }}
        onFindReplace={() => setFr((f) => ({ ...f, open: true, find: fr.find || '' }))}
        onFormat={() => setFormatOpen(true)}
      >
        <Drop label="📋 编辑">
          <DropItem onClick={() => { const i = focusRef.current.rowIndex; const f = focusRef.current.field; if (i == null || !f) { alert('请先点击单元格'); return } clipCell(i, f, true) }}>✂️ 剪切当前单元格</DropItem>
          <DropItem onClick={() => { const i = focusRef.current.rowIndex; const f = focusRef.current.field; if (i == null || !f) { alert('请先点击单元格'); return } clipCell(i, f, false) }}>📄 复制当前单元格</DropItem>
          <DropItem onClick={() => { const i = focusRef.current.rowIndex; const f = focusRef.current.field; if (i == null || !f) { alert('请先点击单元格'); return } pasteCell(i, f) }}>📋 粘贴到当前单元格</DropItem>
          <hr />
          <DropItem onClick={() => { const i = focusRef.current.rowIndex; if (i == null) { alert('请先点击行内单元格'); return } const r = rows[i]; void navigator.clipboard?.writeText(JSON.stringify(r, null, 2)).catch(() => {}); setMsg('已复制整行 JSON') }}>{'{ }'} 复制当前行(JSON)</DropItem>
          <DropItem onClick={() => setFr((f) => ({ ...f, open: true }))}>🔍 查找替换…</DropItem>
        </Drop>
        <Drop label="▦ 行与列">
          <DropItem onClick={insertRows}>＋ 插入行(按选中行数)</DropItem>
          <DropItem onClick={dupRows}>⧉ 复制选中行</DropItem>
          <DropItem onClick={() => delRow()}>－ 删除选中行</DropItem>
          <hr />
          <DropItem onClick={addCol}>＋ 插入列</DropItem>
          <DropItem onClick={() => delCol()}>－ 删除当前列</DropItem>
        </Drop>
        <Drop label="🎨 格式">
          <DropItem onClick={() => setAlign('center')}>居中</DropItem>
          <DropItem onClick={() => setAlign('left')}>靠左</DropItem>
          <DropItem onClick={() => setAlign('right')}>靠右</DropItem>
          <hr />
          <DropItem onClick={() => toggleStyle('bold')}>加粗(切换)</DropItem>
          <DropItem onClick={() => toggleStyle('italic')}>斜体(切换)</DropItem>
          <DropItem onClick={() => toggleStyle('wrapText')}>自动换行(切换)</DropItem>
          <hr />
          <DropItem onClick={() => { const v = meta.filter((c) => !c.hidden && c.field !== 'uid'); gridRef.current?.autoSizeColumns(v.map((c) => c.field)); setMsg('列宽已适应内容') }}>列宽: 适应内容</DropItem>
          <DropItem onClick={() => { mutate((s) => ({ ...s, cols: s.cols.map((c) => ({ ...c, width: undefined })) })); setMsg('列宽已重置,保存后记忆') }}>列宽: 重置默认</DropItem>
          <hr />
          <div className="drop-note">行高</div>
          <DropItem onClick={() => { mutate((s) => ({ ...s, rowH: 34 })); setMsg('行高:紧凑(保存后记忆)') }}>紧凑</DropItem>
          <DropItem onClick={() => { mutate((s) => ({ ...s, rowH: 46 })); setMsg('行高:标准(保存后记忆)') }}>标准</DropItem>
          <DropItem onClick={() => { mutate((s) => ({ ...s, rowH: 58 })); setMsg('行高:宽松(保存后记忆)') }}>宽松</DropItem>
        </Drop>
        <Drop label="🔘 组件">
          <div className="drop-note">当前列类型</div>
          <DropItem onClick={() => setType('')}>文本</DropItem>
          <DropItem onClick={() => setType('status')}>状态徽章</DropItem>
          <DropItem onClick={() => setType('rating')}>评分徽章</DropItem>
          <DropItem onClick={() => setType('apistatus')}>渠道状态徽章</DropItem>
          <hr />
          <div className="drop-note">按钮(挂在单元格上)</div>
          <DropItem onClick={() => { const i = focusRef.current.rowIndex; const f = focusedOrSelected(); if (i == null || !f) { alert('请先点击目标单元格'); return } addButtonAt(i, f) }}>＋ 当前列添加按钮</DropItem>
          <DropItem onClick={() => { const i = focusRef.current.rowIndex; const f = focusedOrSelected(); if (i == null || !f) { alert('请先点击目标单元格'); return } removeButtonAt(i, f) }}>－ 移除当前列按钮</DropItem>
          <DropItem onClick={editLink}>✏️ 编辑超链接</DropItem>
        </Drop>
        <Drop label="⚙️ 规则">
          <div className="drop-note">条件高亮(列+匹配值→颜色,浏览态同步)</div>
          <DropItem onClick={addRule}>＋ 添加高亮规则</DropItem>
          {rules.map((r, i) => (
            <div key={i} className="rule-row">
              <span className="rule-dot" style={{ background: r.color }} />
              <span className="rule-txt">{r.field} = {r.value}</span>
              <button className="tbtn rule-del" onClick={() => delRule(i)}>删</button>
            </div>
          ))}
          {rules.length === 0 && <div className="uh-empty">暂无规则</div>}
        </Drop>
        <Drop label="👁 视图">
          <div className="drop-note">视图预设(筛选+排序+显隐组合)</div>
          {views.map((v) => (
            <div key={v.name} className="rule-row">
              <button className="tbtn drop-item grow" onClick={() => applyView(v)}>{v.name}</button>
              <button className="tbtn rule-del" onClick={() => delView(v.name)}>删</button>
            </div>
          ))}
          <DropItem onClick={saveView}>💾 保存当前为视图</DropItem>
          <hr />
          <DropItem onClick={() => setPanel(true)}>字段面板(列管理)</DropItem>
          <div className="drop-note">显示隐藏列</div>
          {hiddenCols.length === 0 && <div className="uh-empty">没有隐藏列</div>}
          {hiddenCols.map((c) => (
            <DropItem key={c.field} onClick={() => unhideCol(c.field)}>{c.header}</DropItem>
          ))}
          <hr />
          <DropItem onClick={() => freezeCol()}>❄️ 冻结/取消冻结当前列</DropItem>
          <DropItem onClick={() => hideCol()}>🙈 隐藏当前列</DropItem>
          <DropItem onClick={() => toggleHideRow(focusRef.current.rowIndex, true)}>🙈 隐藏当前行</DropItem>
        </Drop>
        <Drop label="🔀 排序筛选">
          <div className="drop-note">当前列:{focusedOrSelected() ?? '(未选择)'}</div>
          <DropItem onClick={() => sortCol('asc')}>⬆ 升序</DropItem>
          <DropItem onClick={() => sortCol('desc')}>⬇ 降序</DropItem>
          <DropItem onClick={() => sortCol(null)}>✖ 清除排序</DropItem>
          <hr />
          <DropItem onClick={() => filterCol('contains')}>筛选: 包含…</DropItem>
          <DropItem onClick={() => filterCol('equals')}>筛选: 等于…</DropItem>
          <DropItem onClick={() => filterCol(null)}>✖ 清除筛选</DropItem>
        </Drop>
        <span className="tsep" />
        <Drop label="🔄 数据">
          <DropItem onClick={scanApi}>🔄 同步 New API(检测渠道)</DropItem>
          <hr />
          <label className="tbtn drop-item">📥 导入Excel<input type="file" accept=".xlsx,.xls" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = '' }} /></label>
          <DropItem onClick={exportXlsx}>📤 导出Excel</DropItem>
          <DropItem onClick={backupCsv}>💾 备份CSV下载</DropItem>
        </Drop>
      </EditToolbar>

      <div className="tablewrap" style={{ position: 'relative' }}>
        <div style={{ height: '100%' }}>
        <AgGridReact
          ref={(ref) => { if (ref) gridRef.current = ref.api }}
          className={dark ? 'ag-dark' : undefined}
          rowData={rows}
          columnDefs={colDefs}
          getRowId={(params) => params.data.uid}
          rowDragManaged
          getRowHeight={(params) => rowHeights[(params.node.rowIndex ?? 0) + 2] ?? rowHeight}
          defaultColDef={{ resizable: true, sortable: false, filter: true, minWidth: 60 }}
          rowHeight={rowHeight}
          rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true }}
          onCellValueChanged={onCellValueChanged}
          onCellEditingStarted={onCellEditingStarted}
          onCellClicked={(e) => {
            if (e.colDef.field === '__seq') { e.node?.setSelected(!e.node.isSelected()) }
            else {
              const f = (e.colDef as { field?: string } | undefined)?.field
              if (f) setSelectedCol(f)
              focusRef.current = { field: f, rowIndex: e.rowIndex ?? undefined }
            }
          }}
          onColumnHeaderClicked={(e) => {
            const f = (e.column as unknown as { getColDef?: () => { field?: string } } | undefined)?.getColDef?.()?.field
            if (f) { focusRef.current = { field: f, rowIndex: undefined }; setSelectedCol((prev) => (prev === f ? undefined : f)) }
          }}
          onCellFocused={(e) => {
            const field = (e.column as unknown as { getColDef?: () => { field?: string } } | undefined)?.getColDef?.()?.field
            focusRef.current = { field, rowIndex: e.rowIndex ?? undefined }
          }}
          onCellContextMenu={(e) => {
            e.event?.preventDefault()
            const field = (e.colDef as { field?: string } | undefined)?.field
            setMenu({ x: (e.event as MouseEvent).clientX, y: (e.event as MouseEvent).clientY, field, rowIndex: e.rowIndex ?? undefined })
          }}
          onRowDragEnd={(event) => {
            if (!canReorderRows(getRowReorderState())) {
              notifyRowDragUnavailable()
              return
            }
            const source = event.node.data as Row | undefined
            const target = event.overNode?.data as Row | undefined
            if (!source || !target || source.uid === target.uid) return
            mutate((s) => ({ ...s, rows: moveRowByUid(s.rows, source.uid, target.uid) }))
            setMsg('行顺序已更新，保存后写回 XLSX')
          }}
        />
        </div>
        <ContextMenu
          target={menu}
          row={mRow}
          buttons={mBtns}
          onClose={() => setMenu(null)}
          onCut={() => { if (menu?.rowIndex != null && menu.field) clipCell(menu.rowIndex, menu.field, true) }}
          onCopy={() => { if (menu?.rowIndex != null && menu.field) clipCell(menu.rowIndex, menu.field, false) }}
          onPaste={() => { if (menu?.rowIndex != null && menu.field) pasteCell(menu.rowIndex, menu.field) }}
          onSort={(direction) => sortCol(direction)}
          onFilter={() => filterCol('contains')}
          onAddButton={() => { if (menu?.rowIndex != null && menu.field) addButtonAt(menu.rowIndex, menu.field) }}
          onEditButton={(index) => { if (menu?.rowIndex != null && menu.field) editButtonAt(menu.rowIndex, menu.field, index) }}
          onRemoveButton={() => { if (menu?.rowIndex != null && menu.field) removeButtonAt(menu.rowIndex, menu.field) }}
          onCopyButton={() => { if (menu?.rowIndex != null && menu.field) copyButtonAt(menu.rowIndex, menu.field) }}
          onCutButton={() => { if (menu?.rowIndex != null && menu.field) cutButtonAt(menu.rowIndex, menu.field) }}
          onPasteButton={() => { if (menu?.rowIndex != null && menu.field) pasteButtonAt(menu.rowIndex, menu.field) }}
          onHideColumn={() => { if (menu?.field) hideCol(menu.field) }}
          onHideRow={() => toggleHideRow(menu?.rowIndex, true)}
          onUnhideRow={() => toggleHideRow(menu?.rowIndex, false)}
          onDeleteRow={() => delRow(menu?.rowIndex)}
          onDeleteColumn={() => delCol(menu?.field)}
        />
        {/* 字段面板抽屉 */}
        {panel && (
          <div className="fdrawer">
            <div className="fd-head">
              <b>字段面板</b>
              <button className="tbtn" onClick={() => setPanel(false)}>✕</button>
            </div>
            <div className="fd-body">
              {panelCols.map((c) => (
                <div key={c.field} className="fd-row">
                  <input type="checkbox" checked={!c.hidden} onChange={(e) => { e.target.checked ? unhideCol(c.field) : hideCol(c.field) }} title="显示/隐藏" />
                  <input className="fd-name" defaultValue={c.header} onBlur={(e) => renameCol(c.field, e.target.value)} title="双击列头外可改名;此处改表头" />
                  <select value={c.type ?? ''} onChange={(e) => setColType(c.field, e.target.value)} title="列类型">
                    <option value="">文本</option>
                    <option value="status">状态徽章</option>
                    <option value="rating">评分徽章</option>
                    <option value="apistatus">渠道状态</option>
                  </select>
                  <label title="私列(浏览态不可见)"><input type="checkbox" checked={!!c.pri} onChange={(e) => setColPri(c.field, e.target.checked)} />私</label>
                  <button className="tbtn" onClick={() => moveCol(c.field, -1)}>↑</button>
                  <button className="tbtn" onClick={() => moveCol(c.field, 1)}>↓</button>
                </div>
              ))}
            </div>
            <div className="fd-foot">改动后点「💾 保存」生效并记忆</div>
          </div>
        )}
      </div>

      <FormatPanel
        open={formatOpen}
        style={focusedStyle}
        onClose={() => setFormatOpen(false)}
        onAlign={setAlign}
        onVertical={setVertical}
        onToggle={toggleStyle}
        onColor={setFontColor}
        onFillColor={setFillColor}
      />

      <footer className="foot">
        <span>编辑态 · Ctrl+S 保存 · Ctrl+Z/Y 撤销重做 · 点击列头选中整列/行号选中整行 · 右键更多操作</span>
      </footer>

      {fr.open && (
        <div className="mask" onClick={() => setFr((f) => ({ ...f, open: false }))}>
          <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3>查找替换(全表文本)</h3>
            <div className="mbody fr-body">
              <label>查找<input value={fr.find} onChange={(e) => setFr((f) => ({ ...f, find: e.target.value }))} placeholder="查找文本…" /></label>
              <label>替换为<input value={fr.replace} onChange={(e) => setFr((f) => ({ ...f, replace: e.target.value }))} placeholder="替换为…" /></label>
              <label className="fr-ic"><input type="checkbox" checked={fr.ignoreCase} onChange={(e) => setFr((f) => ({ ...f, ignoreCase: e.target.checked }))} /> 忽略大小写</label>
              <div className="fr-count">匹配 {frCount} 个单元格</div>
            </div>
            <div className="mfoot">
              <span className="grow" />
              <button className="tbtn" onClick={() => setFr((f) => ({ ...f, open: false }))}>关闭</button>
              <button className="tbtn primary" onClick={replaceAll} disabled={!fr.find || !frCount}>全部替换</button>
            </div>
          </div>
        </div>
      )}

      {scan && (
        <div className="mask" onClick={() => setScan(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>同步预览 — 勾选要写入的变更</h3>
            <div className="mbody">
              <table>
                <thead><tr><th></th><th>站点</th><th>字段</th><th>当前值</th><th>检测值</th></tr></thead>
                <tbody>
                  {scan.changes.map((c, i) => (
                    <tr key={i}>
                      <td><input type="checkbox" className="pvck" data-i={i} defaultChecked /></td>
                      <td>{c.name}</td><td>{c.fieldLabel || c.field}</td>
                      <td className="oldv">{c.old || '(空)'}</td><td className="newv">{c.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scan.unmatched.length > 0 && (
                <div className="empty" style={{ textAlign: 'left' }}>未匹配渠道(不写入):{scan.unmatched.join('、')}</div>
              )}
            </div>
            <div className="mfoot">
              <span className="grow" />
              <button className="tbtn" onClick={() => setScan(null)}>放弃</button>
              <button className="tbtn primary" onClick={() => {
                const cks = Array.from(document.querySelectorAll('.pvck')) as HTMLInputElement[]
                const picked = cks.filter((c) => c.checked).map((c) => scan.changes[Number(c.dataset.i)])
                void applySync(picked)
              }}>确认写入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** AG Grid 主题:深浅色由 index.css 的 .ag-dark CSS 变量覆盖实现 */
