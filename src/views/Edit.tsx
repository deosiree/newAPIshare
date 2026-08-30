import type { SiteData } from '../lib/data'

/** 编辑态:批次2实现 AG Grid + 工具栏;当前先做门控与占位 */
export default function Edit({ data, unlocked }: { data: SiteData | null; unlocked: boolean }) {
  if (!unlocked) {
    return (
      <div className="edit-hint">
        <h2>编辑态需要解锁</h2>
        <p>
          在网址后加 <code>?k=编辑密钥</code> 访问本页(密钥见 .env 的 VITE_EDIT_KEY)。<br />
          例:<code>{location.origin}/?k=密钥</code> 解锁后再回到 <code>/edit</code>。
        </p>
      </div>
    )
  }
  return (
    <div className="edit-hint">
      <h2>编辑态建设中</h2>
      <p>
        Excel 式编辑表格将在下一批次上线(AG Grid + 工具栏 + xlsx 导入导出)。<br />
        当前数据:{data ? data.rows.length + ' 行' : '加载中'} · 仍可用 GitHub 网页编辑 <code>public/sites.csv</code> 或本机工具更新。
      </p>
      <p><a href="/">← 返回浏览态</a></p>
    </div>
  )
}
