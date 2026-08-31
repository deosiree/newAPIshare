/** 列定义与字段映射 —— 浏览态/编辑态/Python 工具共用的单一事实源(CSV 表头 = header) */

export interface ColumnDef {
  field: string
  header: string
  type?: 'name' | 'status' | 'rating' | 'apistatus' | 'link'
  /** 私密列:浏览态(未解锁)不渲染 */
  pri?: boolean
  /** 编辑态默认隐藏(右键「显示/隐藏列」可切换,存回 columns.json) */
  hidden?: boolean
  /** 小屏(<=760px)隐藏 */
  hs?: boolean
  width?: number
  align?: 'center' | 'left' | 'right'
  /** 列级样式(编辑态「格式▾」设置,浏览态同步生效) */
  bold?: boolean
  italic?: boolean
  wrap?: boolean
  /** 冻结到左侧 */
  pinned?: 'left'
}

export const BASE_COLUMNS: ColumnDef[] = [
  { field: 'name', header: '公益站', type: 'name' },
  { field: 'status', header: '状态', type: 'status', width: 70 },
  { field: 'rating', header: '评分', type: 'rating', width: 70 },
  { field: 'register', header: '注册', width: 230 },
  { field: 'daily', header: '每日签到', width: 230 },
  { field: 'invite', header: '邀请制', hs: true, width: 230 },
  { field: 'model', header: '模型质量', hs: true, width: 320 },
  { field: 'exp', header: '体验感', pri: true, hs: true, width: 320 },
  { field: 'other', header: '其他', pri: true, hs: true, width: 320 },
  { field: 'other2', header: '其他2·白嫖org', hs: true, width: 320 },
  { field: 'other3', header: '其他3·飞书合集', hs: true, width: 320 },
  { field: 'other4', header: '其他4·幻城导航', hs: true, width: 320 },
  { field: 'verified', header: '验证', width: 70 },
  { field: 'models', header: '模型', pri: true, hs: true, width: 320 },
  { field: 'latency', header: '响应', pri: true, width: 70 },
  { field: 'api_status', header: '渠道状态', type: 'apistatus', pri: true, width: 110 },
  { field: 'url', header: '注册链接', type: 'link', hidden: true },
  { field: 'checkin', header: '签到地址', type: 'link', hidden: true },
]

/** 行级隐藏标记的列(编辑态右键隐藏行时置 1,浏览态过滤);CSV 表头即此字符串 */
export const HIDDEN_ROW_FIELD = 'hidden'
export const HIDDEN_ROW_HEADER = '隐藏'
