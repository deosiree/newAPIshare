/** 数据加载:public/sites.csv(唯一数据源) + public/columns.json(列布局元数据) */
import Papa from 'papaparse'
import { BASE_COLUMNS, HIDDEN_ROW_HEADER, HIDDEN_ROW_FIELD, type ColumnDef } from '../fields'

export type Row = Record<string, string>

export interface ColumnsMeta {
  updated?: string
  columns: ColumnDef[]
}

export interface SiteData {
  rows: Row[]
  columns: ColumnDef[]
  updated?: string
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export async function loadSiteData(): Promise<SiteData> {
  const [csvText, colsText] = await Promise.all([
    fetch('./sites.csv').then((r) => {
      if (!r.ok) throw new Error('sites.csv 加载失败: ' + r.status)
      return r.text()
    }),
    fetch('./columns.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ])

  const parsed = Papa.parse<Row>(stripBom(csvText), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => stripBom(h).trim(),
  })

  const meta = (colsText as ColumnsMeta | null) ?? { columns: BASE_COLUMNS }
  const byHeader = new Map(meta.columns.map((c) => [c.header, c]))
  const baseByHeader = new Map(BASE_COLUMNS.map((c) => [c.header, c]))
  // 以 CSV 实际表头为准装配列(表头 → 字段),columns.json 提供顺序与元数据
  const headers = (parsed.meta.fields ?? []).filter((h) => h && h !== HIDDEN_ROW_HEADER)
  const columns: ColumnDef[] = headers.map((h) => {
    const def = byHeader.get(h)
    const base = baseByHeader.get(h)
    return {
      field: def?.field ?? base?.field ?? h,
      header: h,
      type: def?.type ?? base?.type,
      pri: def?.pri ?? base?.pri,
      hidden: def?.hidden ?? base?.hidden,
      hs: def?.hs ?? base?.hs,
      width: def?.width ?? base?.width,
    }
  })
  // 行键统一从中文表头转成字段名(hidden 列 → HIDDEN_ROW_FIELD),与 fields.ts 对齐
  const headerToField = new Map<string, string>([
    [HIDDEN_ROW_HEADER, HIDDEN_ROW_FIELD],
    ...columns.map((c) => [c.header, c.field] as [string, string]),
  ])
  const rows: Row[] = parsed.data.map((r) => {
    const out: Row = {}
    Object.entries(r).forEach(([k, v]) => {
      out[headerToField.get(k) ?? k] = v ?? ''
    })
    return out
  })
  return { rows, columns, updated: meta.updated }
}

export function isRowHidden(r: Row): boolean {
  return r[HIDDEN_ROW_FIELD] === '1'
}
