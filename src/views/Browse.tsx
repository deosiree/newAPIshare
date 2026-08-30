import { useMemo, useState } from 'react'
import type { Row, SiteData } from '../lib/data'
import type { ColumnDef } from '../fields'
import { cellButtons, isRowHidden } from '../lib/data'

function bucketOf(s?: string): 'ok' | 'dead' | 'unknown' {
  if (s === '有效' || s === '复活了') return 'ok'
  if (s === '失效' || s === '无效') return 'dead'
  return 'unknown'
}

function widthClass(c: ColumnDef): string {
  const w = c.width ?? 0
  return w >= 300 ? 'l' : w >= 120 ? 'm' : ''
}

interface StatusChip { key: string; label: string; test: (s?: string) => boolean }
const STATUS_CHIPS: StatusChip[] = [
  { key: 'all', label: '全部', test: () => true },
  { key: 'ok', label: '有效', test: (s) => bucketOf(s) === 'ok' },
  { key: 'dead', label: '失效/无效', test: (s) => bucketOf(s) === 'dead' },
  { key: 'unknown', label: '未标注', test: (s) => bucketOf(s) === 'unknown' },
]
const RATING_ORDER = ['顶级', '夯', 'NPC', '拉']

export default function Browse({ data, unlocked }: { data: SiteData | null; unlocked: boolean }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [rating, setRating] = useState('all')

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !isRowHidden(r)), [data])

  const visibleCols = useMemo(
    () => (data?.columns ?? []).filter((c) => (unlocked || !c.pri) && !c.hidden && c.type !== 'link'),
    [data, unlocked],
  )

  const ratings = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => { if (r.rating) set.add(r.rating) })
    return Array.from(set).sort((a, b) => {
      const ia = RATING_ORDER.indexOf(a), ib = RATING_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
    })
  }, [rows])

  const stats = useMemo(() => {
    let ok = 0, dead = 0
    const verified: string[] = []
    rows.forEach((r) => {
      const b = bucketOf(r.status)
      if (b === 'ok') ok++
      else if (b === 'dead') dead++
      if (r.verified && !verified.includes(r.verified)) verified.push(r.verified)
    })
    return { ok, dead, verified: verified.join('、') }
  }, [rows])

  const filtered = useMemo(() => rows.filter((r) => {
    const sc = STATUS_CHIPS.find((c) => c.key === status)
    if (sc && !sc.test(r.status)) return false
    if (rating !== 'all' && r.rating !== rating) return false
    if (q) {
      const hay = Object.values(r).join(' ').toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }), [rows, q, status, rating])

  if (!data) {
    return <div className="edit-hint">数据加载中…</div>
  }

  return (
    <div className="page">
      <header className="top">
        <h1>免费公益站统计合集</h1>
        <span className="tag">持续更新中</span>
        {unlocked && <span className="pv">私人视图</span>}
        <p className="sub">
          共 <b>{rows.length}</b> 站 · 有效 <b>{stats.ok}</b> · 失效/无效 <b>{stats.dead}</b>
          {stats.verified && <> · 最近验证 <b>{stats.verified}</b></>}
          {data.updated && <> · 数据更新于 <b>{data.updated}</b></>}
        </p>
      </header>

      <div className="toolbar">
        <div className="bar">
          <input
            id="q" type="search" placeholder="🔍 搜索站名 / 奖励 / 备注…" autoComplete="off"
            value={q} onChange={(e) => setQ(e.target.value.trim())}
          />
          <span className="count">匹配 {filtered.length} / {rows.length} 站</span>
        </div>
        <div className="chips">
          {STATUS_CHIPS.map((c) => {
            const n = rows.filter((r) => c.test(r.status)).length
            return (
              <button key={c.key} className={'chip' + (status === c.key ? ' on' : '')}
                onClick={() => setStatus(c.key)}>
                {c.label}<span className="n">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="chips">
          <button className={'chip' + (rating === 'all' ? ' on' : '')} onClick={() => setRating('all')}>
            全部评分<span className="n">{rows.length}</span>
          </button>
          {ratings.map((r) => {
            const n = rows.filter((x) => x.rating === r).length
            return (
              <button key={r} className={'chip' + (rating === r ? ' on' : '')} onClick={() => setRating(r)}>
                {r}<span className="n">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {visibleCols.map((c) => (
                <th key={c.field} className={[c.type === 'name' ? 'stick' : '', widthClass(c), c.hs ? 'hs' : '', c.type !== 'name' ? 'nw' : ''].join(' ')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: Row, i) => (
              <tr key={i}>
                {visibleCols.map((c) => {
                  const v = r[c.field]
                  const wcls = widthClass(c)
                  const btns = cellButtons(r, c.field, data.buttons).filter((b) => r[b.field])
                  if (c.type === 'name') {
                    return (
                      <td key={c.field} className="stick nw">
                        <span className="sname">{r.name}</span>
                        {btns.length > 0 && (
                          <span className="btns">
                            {btns.map((b) => (
                              <a key={b.label} className="mini reg" href={r[b.field]} target="_blank" rel="noopener noreferrer">{b.label}</a>
                            ))}
                          </span>
                        )}
                      </td>
                    )
                  }
                  if (c.type === 'status') {
                    const b = bucketOf(r.status)
                    return <td key={c.field} className="nw"><span className={'badge b-' + b}>{r.status || '未标注'}</span></td>
                  }
                  if (c.type === 'rating') {
                    if (!r.rating) return <td key={c.field} />
                    return <td key={c.field} className="nw"><span className={'badge r-' + r.rating}>{r.rating}</span></td>
                  }
                  if (c.type === 'apistatus') {
                    if (!v) return <td key={c.field} />
                    const b = String(v).includes('正常') ? 'b-ok' : String(v).includes('异常') ? 'b-dead' : 'b-unk'
                    return <td key={c.field} className="nw"><span className={'badge ' + b}>{v}</span></td>
                  }
                  if (!v && btns.length === 0) return <td key={c.field} />
                  return (
                    <td key={c.field} className={[wcls, c.hs ? 'hs' : ''].join(' ')}>
                      {v && (
                        <span className={String(v).length > 90 ? 'clamp3' : ''} title={String(v).length > 90 ? v : undefined}>{v}</span>
                      )}
                      {btns.length > 0 && (
                        <span className="btns">
                          {btns.map((b) => (
                            <a key={b.label} className="mini ck" href={r[b.field]} target="_blank" rel="noopener noreferrer">{b.label}</a>
                          ))}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={visibleCols.length}><div className="empty">没有匹配的站点,换个关键词或筛选条件试试</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="foot">
        <span>{data.updated ? '数据版本 ' + data.updated : ''}</span>
        <span>数据整理 © 免费公益站统计合集 · 转载请保留出处 · 公益站随时可能跑路,请勿充值</span>
        {unlocked && <a href="/edit">编辑态 →</a>}
        {!unlocked && <a href="/edit">编辑态</a>}
      </footer>
    </div>
  )
}
