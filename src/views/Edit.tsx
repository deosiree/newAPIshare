import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ModuleRegistry, AllCommunityModule,
  type GridApi, type ColDef,
} from 'ag-grid-community'
import * as XLSX from 'xlsx'
import type { SiteData } from '../lib/data'
import { HIDDEN_ROW_FIELD, type ColumnDef } from '../fields'

ModuleRegistry.registerModules([AllCommunityModule])

type Row = Record<string, string>
type Snap = { rows: Row[]; cols: ColumnDef[] }
type MenuItem = { x: number; y: number; field?: string; rowIndex?: number }
type Change = { name: string; field: string; fieldLabel: string; old: string; value: string }

const SYNC_URL = 'http://localhost:8788'

export default function Edit({ data, unlocked }: { data: SiteData | null; unlocked: boolean }) {
  const [rows, setRows] = useState<Row[]>(data?.rows ?? [])
  const [meta, setMeta] = useState<ColumnDef[]>(data?.columns ?? [])
  const [msg, setMsg] = useState('就绪 · 修改后请点「保存」')
  const [menu, setMenu] = useState<MenuItem | null>(null)
  const [srv, setSrv] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: '检查本机同步助手…' })
  const [scan, setScan] = useState<{ changes: Change[]; unmatched: string[] } | null>(null)
  const [quickStatus, setQuickStatus] = useState('all')
  const [quickRating, setQuickRating] = useState('all')

  const gridRef = useRef<GridApi | null>(null)
  const focusRef = useRef<{ field?: string; rowIndex?: number }>({})
  const past = useRef<Snap[]>([])
  const future = useRef<Snap[]>([])
  const pending = useRef<Snap | null>(null)
  const [hist, setHist] = useState({ u: 0, r: 0 })
  const cur = useRef<Snap>({ rows, cols: meta })
  cur.current = { rows, cols: meta }

  /* 异步数据到达后填充编辑器 */
  useEffect(() => {
    if (data) {
      setRows(data.rows)
      setMeta(data.columns)
      cur.current = { rows: data.rows, cols: data.columns }
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
  const mutate = useCallback((fn: (s: Snap) => Snap) => {
    past.current.push(structuredClone(cur.current))
    if (past.current.length > 50) past.current.shift()
    future.current = []
    const ns = fn(cur.current)
    cur.current = ns
    setRows(ns.rows)
    setMeta(ns.cols)
    pushHist()
  }, [pushHist])
  const undo = useCallback(() => {
    if (!past.current.length) return
    future.current.push(structuredClone(cur.current))
    const s = past.current.pop()!
    cur.current = s
    setRows(s.rows); setMeta(s.cols)
    pushHist()
  }, [pushHist])
  const redo = useCallback(() => {
    if (!future.current.length) return
    past.current.push(structuredClone(cur.current))
    const s = future.current.pop()!
    cur.current = s
    setRows(s.rows); setMeta(s.cols)
    pushHist()
  }, [pushHist])

  /* ---------- 网格列定义 ---------- */
  const colDefs: ColDef[] = useMemo(() => meta.filter((c) => !c.hidden).map((c) => ({
    field: c.field,
    headerName: c.header,
    editable: true,
    width: c.width ?? 150,
    filter: true,
    cellStyle: c.align === 'center' ? { textAlign: 'center' } : undefined,
  })), [meta])

  /* ---------- 工具栏动作 ---------- */
  const addRow = () => mutate((s) => ({ ...s, rows: [...s.rows, {}] }))
  const addCol = () => {
    const name = window.prompt('新列名(也是 CSV 表头):')
    if (!name) return
    if (meta.some((c) => c.field === name || c.header === name)) { alert('列名已存在'); return }
    mutate((s) => ({ ...s, cols: [...s.cols, { field: name, header: name }] }))
    setMsg(`已添加列「${name}」,记得点「保存」`)
  }
  const delRow = () => {
    const sel = gridRef.current?.getSelectedRows?.() ?? []
    if (!sel.length) { alert('请先勾选要删除的行(行首复选框)'); return }
    if (!confirm(`确定删除选中的 ${sel.length} 行?`)) return
    mutate((s) => ({ ...s, rows: s.rows.filter((r) => !sel.includes(r)) }))
    setMsg(`已删除 ${sel.length} 行(保存后生效)`)
  }
  const delCol = (field?: string) => {
    const f = field ?? focusRef.current.field
    if (!f) { alert('请先点击目标列的任意单元格(该列成为「当前列」)'); return }
    const c = cur.current.cols.find((x) => x.field === f)
    if (!c) return
    if (!confirm(`确定删除列「${c.header}」及其全部数据?(可撤销)`)) return
    mutate((s) => ({
      rows: s.rows.map((r) => { const n = { ...r }; delete n[f]; return n }),
      cols: s.cols.filter((x) => x.field !== f),
    }))
    setMsg(`已删除列「${c.header}」(保存后生效)`)
  }
  const setAlign = (align: 'center' | 'left') => {
    const f = focusRef.current.field
    if (!f) { alert('请先点击目标列的任意单元格'); return }
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === f ? { ...c, align: align === 'left' ? undefined : align } : c)) }))
    setMsg(`列已设为${align === 'center' ? '居中' : '靠左'}(保存后生效)`)
  }
  const hideCol = (f?: string) => {
    const field = f ?? focusRef.current.field
    if (!field) { alert('请先点击目标列的任意单元格'); return }
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === field ? { ...c, hidden: true } : c)) }))
    setMsg('列已隐藏(浏览态同样不可见;可用「显示列」恢复)')
  }
  const unhideCol = (f: string) => {
    mutate((s) => ({ ...s, cols: s.cols.map((c) => (c.field === f ? { ...c, hidden: false } : c)) }))
    setMsg('列已恢复显示')
  }
  const toggleHideRow = (rowIndex: number | undefined, hide: boolean) => {
    if (rowIndex == null) return
    mutate((s) => ({
      ...s,
      rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [HIDDEN_ROW_FIELD]: hide ? '1' : '' } : r)),
    }))
    setMsg(hide ? '行已隐藏(浏览态不可见)' : '行已取消隐藏')
  }
  const editLink = () => {
    const f = focusRef.current.field
    const rowIndex = focusRef.current.rowIndex
    if (rowIndex == null || !f) { alert('请先点击「注册链接」或「签到地址」列的单元格'); return }
    const old = rows[rowIndex]?.[f] ?? ''
    const nv = window.prompt(`编辑「${cur.current.cols.find((c) => c.field === f)?.header ?? f}」:`, old)
    if (nv === null) return
    mutate((s) => ({ ...s, rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [f]: nv } : r)) }))
  }
  const exportXlsx = () => {
    const aoa: string[][] = [meta.map((c) => c.header)]
    rows.forEach((r) => aoa.push(meta.map((c) => r[c.field] ?? '')))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '公益站')
    XLSX.writeFile(wb, '免费公益站统计合集.xlsx')
  }
  const importXlsx = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
        if (!aoa.length) { alert('表格为空'); return }
        const fileHeaders = (aoa[0] as string[]).map((h) => String(h).trim())
        const cols: ColumnDef[] = fileHeaders.map((h) => {
          const ex = meta.find((c) => c.header === h)
          return ex ?? { field: h, header: h }
        })
        const newRows: Row[] = (aoa.slice(1) as string[][])
          .filter((line) => line.some((v) => String(v).trim() !== ''))
          .map((line) => {
            const r: Row = {}
            cols.forEach((c, i) => { r[c.field] = String(line[i] ?? '').trim() })
            return r
          })
        if (!confirm(`导入 ${newRows.length} 行数据,将覆盖当前表格(可撤销)。继续?`)) return
        mutate(() => ({ rows: newRows, cols }))
        setMsg(`已导入 ${newRows.length} 行,记得点「保存」`)
      } catch (e) {
        alert('导入失败:' + e)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  /* ---------- 保存 ---------- */
  const save = async () => {
    let cols = cur.current.cols
    const api = gridRef.current
    if (api) {
      const state = api.getColumnState()
      const order = state.map((s) => s.colId)
      cols = meta
        .map((c) => {
          const st = state.find((s) => s.colId === c.field)
          return st?.width ? { ...c, width: st.width } : c
        })
        .sort((a, b) => {
          const ia = a.hidden ? 9999 : order.indexOf(a.field) < 0 ? 9998 : order.indexOf(a.field)
          const ib = b.hidden ? 9999 : order.indexOf(b.field) < 0 ? 9998 : order.indexOf(b.field)
          return ia - ib
        })
    }
    setMsg('保存中…')
    try {
      const r = await fetch(SYNC_URL + '/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, columns: cols, updated: new Date().toISOString().slice(0, 10) }),
      })
      const res = await r.json()
      if (res.ok) {
        setMsg(res.pushed ? '已保存并推送,网站约 1 分钟内自动更新 ✓' : `已保存到本地(${res.msg || '未推送'}),请手动 commit+push`)
        past.current = []; future.current = []; pushHist()
      } else {
        setMsg('保存失败:' + (res.msg || '未知错误'))
      }
    } catch {
      setMsg('保存失败:同步助手未启动(双击 tools/启动同步工具.bat)')
    }
  }

  /* ---------- New API 同步 ---------- */
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

  useEffect(() => {
    fetch(SYNC_URL + '/ping')
      .then((r) => (r.ok ? r.json() : Promise.reject(0)))
      .then(() => setSrv({ ok: true, msg: '已连接' }))
      .catch(() => setSrv({ ok: false, msg: '未启动 — 双击 tools/启动同步工具.bat' }))
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const applyQuickFilter = (field: string, v: string) => {
    if (!gridRef.current) return
    const curModel = gridRef.current.getFilterModel()
    if (v === 'all') {
      const n = { ...curModel }; delete n[field]
      gridRef.current.setFilterModel(n)
    } else {
      gridRef.current.setFilterModel({ ...curModel, [field]: { filterType: 'text', type: 'equals', filter: v } })
    }
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

  if (!unlocked) {
    return (
      <div className="edit-hint">
        <h2>编辑态需要解锁</h2>
        <p>在网址后加 <code>?k=编辑密钥</code>(密钥见 .env 的 VITE_EDIT_KEY),解锁后再回到 <code>/edit</code>。</p>
        <p><a href="/">← 返回浏览态</a></p>
      </div>
    )
  }

  const hiddenCols = meta.filter((c) => c.hidden)
  const ratingOptions = Array.from(new Set(rows.map((r) => r.rating).filter(Boolean)))
  const statusOptions = ['有效', '失效', '无效', '复活了']

  return (
    <div className="page" style={{ maxWidth: '100%' }}>
      <header className="top">
        <h1>编辑态</h1>
        <span className="tag">Excel 式在线编辑</span>
        <a href="/" style={{ marginLeft: 12, color: 'var(--accent)', fontSize: 13 }}>← 浏览态</a>
        <p className="sub">{msg} · 同步助手:{srv.ok ? '✓ ' + srv.msg : '✗ ' + srv.msg}</p>
      </header>

      <div className="etoolbar">
        <button className="tbtn primary" onClick={save}>💾 保存</button>
        <button className="tbtn" onClick={undo} disabled={!hist.u}>↩ 撤销</button>
        <button className="tbtn" onClick={redo} disabled={!hist.r}>↪ 重做</button>
        <span className="tsep" />
        <label className="tbtn">📥 导入Excel<input type="file" accept=".xlsx,.xls" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = '' }} /></label>
        <button className="tbtn" onClick={exportXlsx}>📤 导出Excel</button>
        <button className="tbtn" onClick={editLink}>🔗 超链接</button>
        <span className="tsep" />
        <button className="tbtn" onClick={addRow}>＋ 行</button>
        <button className="tbtn" onClick={addCol}>＋ 列</button>
        <button className="tbtn" onClick={delRow}>－ 行</button>
        <button className="tbtn" onClick={() => delCol()}>－ 列</button>
        <span className="tsep" />
        <button className="tbtn" onClick={() => setAlign('center')}>居中</button>
        <button className="tbtn" onClick={() => setAlign('left')}>靠左</button>
        <span className="tsep" />
        <select className="tsel" value={quickStatus} onChange={(e) => { setQuickStatus(e.target.value); applyQuickFilter('status', e.target.value) }}>
          <option value="all">状态:全部</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="tsel" value={quickRating} onChange={(e) => { setQuickRating(e.target.value); applyQuickFilter('rating', e.target.value) }}>
          <option value="all">评分:全部</option>
          {ratingOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <details className="unhide">
          <summary className="tbtn">显示列({hiddenCols.length})</summary>
          <div className="unhide-list">
            {hiddenCols.length === 0 && <div className="uh-empty">没有隐藏列</div>}
            {hiddenCols.map((c) => (
              <button key={c.field} className="tbtn" onClick={() => unhideCol(c.field)}>{c.header}</button>
            ))}
          </div>
        </details>
        <span className="tsep" />
        <button className="tbtn" onClick={scanApi}>🔄 同步 New API</button>
      </div>

      <div className="tablewrap" style={{ position: 'relative' }}>
        <div style={{ height: '100%' }}>
        <AgGridReact
          ref={(ref) => { if (ref) gridRef.current = ref.api }}
          className={dark ? 'ag-dark' : undefined}
          rowData={rows}
          columnDefs={colDefs}
          defaultColDef={{ resizable: true, sortable: true, filter: true, minWidth: 70 }}
          rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true }}
          onCellValueChanged={onCellValueChanged}
          onCellEditingStarted={onCellEditingStarted}
          onCellFocused={(e) => {
            const field = (e.column as unknown as { getColDef?: () => { field?: string } } | undefined)?.getColDef?.()?.field
            focusRef.current = { field, rowIndex: e.rowIndex ?? undefined }
          }}
          onCellContextMenu={(e) => {
            e.event?.preventDefault()
            const field = (e.colDef as { field?: string } | undefined)?.field
            setMenu({ x: (e.event as MouseEvent).clientX, y: (e.event as MouseEvent).clientY, field, rowIndex: e.rowIndex ?? undefined })
          }}
        />
        </div>
        {menu && (
          <div className="ctxmenu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { hideCol(menu.field); setMenu(null) }}>隐藏此列</button>
            <button onClick={() => { toggleHideRow(menu.rowIndex, true); setMenu(null) }}>隐藏此行</button>
            <button onClick={() => { toggleHideRow(menu.rowIndex, false); setMenu(null) }}>取消隐藏此行</button>
            <hr />
            <button onClick={() => { delRow(); setMenu(null) }}>删除此行</button>
            <button onClick={() => { delCol(menu.field); setMenu(null) }}>删除此列</button>
          </div>
        )}
      </div>

      <footer className="foot">
        <span>编辑态 · 保存写入 public/sites.csv 并自动 push · 隐藏行/列对浏览态同样生效 · 改列宽/拖列序后保存即记忆</span>
      </footer>

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
