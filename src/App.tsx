import { useEffect, useState } from 'react'
import Browse from './views/Browse'
import Edit from './views/Edit'
import { loadSiteData, type SiteData } from './lib/data'

/** 编辑态密钥(Vite 构建期从 .env 注入;Cloudflare Pages 需配同名环境变量) */
export const EDIT_KEY = import.meta.env.VITE_EDIT_KEY as string | undefined

const LS_KEY = 'editkey'
void LS_KEY

/** ?k=<密钥> 解锁(本机记住);?k=off 退出 */
export function useUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => {
    const k = new URLSearchParams(location.search).get('k')
    if (k && k !== 'off') {
      try { sessionStorage.setItem('unlock', k) } catch { /* ignore */ }
    }
    if (k === 'off') {
      try { sessionStorage.removeItem('unlock') } catch { /* ignore */ }
    }
    let saved = ''
    try { saved = sessionStorage.getItem('unlock') ?? '' } catch { /* ignore */ }
    setUnlocked(!!EDIT_KEY && saved === EDIT_KEY)
  }, [])
  return unlocked
}

export function useSiteData(): SiteData | null {
  const [data, setData] = useState<SiteData | null>(null)
  useEffect(() => { loadSiteData().then(setData).catch(console.error) }, [])
  return data
}

export default function App() {
  const unlocked = useUnlocked()
  const data = useSiteData()
  const path = location.pathname.replace(/\/+$/, '')
  if (path.endsWith('/edit')) {
    return <Edit data={data} unlocked={unlocked} />
  }
  return <Browse data={data} unlocked={unlocked} />
}
