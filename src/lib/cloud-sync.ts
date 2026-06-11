import { CLOUD_CONFIG } from '../config'

const API_BASE = 'https://api.github.com'
const RAW_BASE = 'https://raw.githubusercontent.com'

function base64Encode(str: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64Decode(base64: string): string {
  // GitHub 返回的 base64 每隔 60 字符插了 \n
  const clean = base64.replace(/\n/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const decoder = new TextDecoder()
  return decoder.decode(bytes)
}

export interface SyncData {
  properties: unknown[]
  rooms: unknown[]
  tenants: unknown[]
  bills: unknown[]
  landlordContracts: unknown[]
  profitRecords: unknown[]
  trash: unknown[]
  syncTimestamp: string
}

/** 从 GitHub raw 下载（无令牌，有 CDN 缓存问题） */
export async function downloadData(): Promise<SyncData | null> {
  const url = `${RAW_BASE}/${CLOUD_CONFIG.owner}/${CLOUD_CONFIG.repo}/${CLOUD_CONFIG.branch}/${CLOUD_CONFIG.filePath}`
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`下载失败: ${res.status}`)
  return res.json()
}

/** 从 GitHub Contents API 下载（有令牌，数据实时，无 CDN 缓存问题） */
export async function downloadDataFresh(token: string): Promise<SyncData | null> {
  const url = `${API_BASE}/repos/${CLOUD_CONFIG.owner}/${CLOUD_CONFIG.repo}/contents/${CLOUD_CONFIG.filePath}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`下载失败: ${res.status}`)
  const data = await res.json()
  const decoded = base64Decode(data.content)
  return JSON.parse(decoded)
}

/** 查询云端数据是否存在 */
export async function checkCloudData(): Promise<{ exists: boolean; updatedAt: string | null }> {
  const token = getToken()
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const url = `${API_BASE}/repos/${CLOUD_CONFIG.owner}/${CLOUD_CONFIG.repo}/commits?path=${CLOUD_CONFIG.filePath}&per_page=1`
  const res = await fetch(url, { headers })
  if (!res.ok) return { exists: false, updatedAt: null }
  const commits = await res.json()
  if (!commits.length) return { exists: false, updatedAt: null }
  return { exists: true, updatedAt: commits[0].commit?.committer?.date || null }
}

/** 清空云端数据：上传一个完全空的状态（连 trash 都清掉） */
export async function clearCloudData(token: string): Promise<void> {
  const empty: SyncData = {
    properties: [],
    rooms: [],
    tenants: [],
    bills: [],
    landlordContracts: [],
    profitRecords: [],
    trash: [],
    syncTimestamp: new Date().toISOString(),
  }
  await uploadData(empty, token)
}

/** 上传到 GitHub（Contents API） */
export async function uploadData(syncData: SyncData, token: string): Promise<void> {
  const content = JSON.stringify(syncData)
  const encoded = base64Encode(content)

  const url = `${API_BASE}/repos/${CLOUD_CONFIG.owner}/${CLOUD_CONFIG.repo}/contents/${CLOUD_CONFIG.filePath}`
  const commonHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  }

  // 先查文件是否存在，获取 sha（更新时需要）
  let sha: string | undefined
  const checkRes = await fetch(url, { headers: commonHeaders })
  if (checkRes.ok) {
    const existing = await checkRes.json()
    sha = existing.sha
  }

  // PUT（创建或更新）
  const body: Record<string, unknown> = {
    message: `sync ${new Date().toISOString().slice(0, 16)}`,
    content: encoded,
    branch: CLOUD_CONFIG.branch,
  }
  if (sha) body.sha = sha

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...commonHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`上传失败 (${res.status}): ${text.slice(0, 200)}`)
  }
}

// ─── 令牌管理 ────────────────────────────────────────
const TOKEN_KEY = 'house-cloud-token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function hasToken(): boolean {
  return !!getToken()
}

// ─── 同步时间戳 ──────────────────────────────────────
const SYNC_TS_KEY = 'house-last-sync-ts'

export function getLastSyncTimestamp(): string | null {
  return localStorage.getItem(SYNC_TS_KEY)
}

export function setLastSyncTimestamp(ts: string): void {
  localStorage.setItem(SYNC_TS_KEY, ts)
}

// ─── 合并逻辑（本地优先 + 云端的补 + 回收站过滤） ────

function mergeEntities(
  local: unknown[],
  cloud: unknown[],
  deletedIds: Set<string>,
): unknown[] {
  const localIds = new Set(local.map((i) => (i as { id: string }).id))
  const result = [...local]
  for (const item of cloud) {
    const id = (item as { id: string }).id
    if (!localIds.has(id) && !deletedIds.has(id)) {
      result.push(item)
    }
  }
  return result
}

/** 合并本地与云端数据：本地优先，云端新增的补进来，已删除的不加回 */
export function mergeLocalData(local: SyncData, cloud: SyncData): SyncData {
  // 构建被删除的 ID 集合
  const allTrash = [...(local.trash || []), ...(cloud.trash || [])] as Array<{
    id: string
    type: string
    originalId: string
    data: unknown
    label: string
    deletedAt: string
  }>
  const deletedMap = new Map<string, Set<string>>()
  for (const item of allTrash) {
    if (!deletedMap.has(item.type)) deletedMap.set(item.type, new Set())
    deletedMap.get(item.type)!.add(item.originalId)
  }

  // 合并去重 trash
  const trashMap = new Map<string, unknown>()
  for (const item of allTrash) trashMap.set(item.id, item)

  return {
    properties: mergeEntities(local.properties, cloud.properties, deletedMap.get('property') ?? new Set()),
    rooms: mergeEntities(local.rooms, cloud.rooms, deletedMap.get('room') ?? new Set()),
    tenants: mergeEntities(local.tenants, cloud.tenants, deletedMap.get('tenant') ?? new Set()),
    bills: mergeEntities(local.bills, cloud.bills, deletedMap.get('bill') ?? new Set()),
    landlordContracts: mergeEntities(local.landlordContracts, cloud.landlordContracts, deletedMap.get('landlord_contract') ?? new Set()),
    profitRecords: mergeEntities(local.profitRecords, cloud.profitRecords, deletedMap.get('profit_record') ?? new Set()),
    trash: Array.from(trashMap.values()),
    syncTimestamp: new Date().toISOString(),
  }
}

/** 下载云端 → 合并 → 上传 → 返回合并结果 */
export async function syncUpload(data: SyncData, token: string): Promise<SyncData> {
  const cloud = await downloadDataFresh(token)
  const merged = cloud ? mergeLocalData(data, cloud) : data
  await uploadData(merged, token)
  return merged
}

// ─── 合并逻辑（云端优先 + 本地补丁 + 回收站过滤） ────

function mergeCloudFirst(local: unknown[], cloud: unknown[], deletedIds: Set<string>): unknown[] {
  const cloudIds = new Set(cloud.map((i) => (i as { id: string }).id))
  const result = [...cloud]
  for (const item of local) {
    const id = (item as { id: string }).id
    if (!cloudIds.has(id) && !deletedIds.has(id)) {
      result.push(item)
    }
  }
  return result
}

/** 合并本地与云端数据：云端优先（下载用），本地新增的补进来，已删除的不加回 */
export function mergeCloudData(local: SyncData, cloud: SyncData): SyncData {
  // 构建被删除的 ID 集合
  const allTrash = [...(local.trash || []), ...(cloud.trash || [])] as Array<{
    id: string
    type: string
    originalId: string
    data: unknown
    label: string
    deletedAt: string
  }>
  const deletedMap = new Map<string, Set<string>>()
  for (const item of allTrash) {
    if (!deletedMap.has(item.type)) deletedMap.set(item.type, new Set())
    deletedMap.get(item.type)!.add(item.originalId)
  }

  // 合并去重 trash
  const trashMap = new Map<string, unknown>()
  for (const item of allTrash) trashMap.set(item.id, item)

  return {
    properties: mergeCloudFirst(local.properties, cloud.properties, deletedMap.get('property') ?? new Set()),
    rooms: mergeCloudFirst(local.rooms, cloud.rooms, deletedMap.get('room') ?? new Set()),
    tenants: mergeCloudFirst(local.tenants, cloud.tenants, deletedMap.get('tenant') ?? new Set()),
    bills: mergeCloudFirst(local.bills, cloud.bills, deletedMap.get('bill') ?? new Set()),
    landlordContracts: mergeCloudFirst(local.landlordContracts, cloud.landlordContracts, deletedMap.get('landlord_contract') ?? new Set()),
    profitRecords: mergeCloudFirst(local.profitRecords, cloud.profitRecords, deletedMap.get('profit_record') ?? new Set()),
    trash: Array.from(trashMap.values()),
    syncTimestamp: new Date().toISOString(),
  }
}

/** 启动时自动合并云端数据：下载 → 合并 → 回调写入 store */
export async function initSync(onMerge: (merged: SyncData) => void): Promise<void> {
  try {
    const token = getToken()
    const cloud = token ? await downloadDataFresh(token) : await downloadData()
    if (!cloud || !cloud.properties?.length) return

    // 从 useStore 读取本地数据（动态 import 避免循环依赖）
    const { useStore } = await import('../store/useStore')
    const state = useStore.getState()
    const local: SyncData = {
      properties: state.properties,
      rooms: state.rooms,
      tenants: state.tenants,
      bills: state.bills,
      landlordContracts: state.landlordContracts,
      profitRecords: state.profitRecords,
      trash: state.trash,
      syncTimestamp: '',
    }
    const merged = mergeCloudData(local, cloud)
    onMerge(merged)
  } catch {
    // 启动时静默失败，不影响正常使用
  }
}

// ─── 防抖自动同步 ────────────────────────────────────
let syncTimer: ReturnType<typeof setTimeout> | null = null
let lastUploaded: string | null = null

export function triggerSync(data: SyncData): void {
  if (!hasToken()) return

  // 数据没变就跳过
  const hash = JSON.stringify(data)
  if (hash === lastUploaded) return

  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    try {
      await uploadData(data, getToken())
      lastUploaded = hash
      setLastSyncTimestamp(new Date().toISOString())
    } catch {
      // 静默失败，下次 mutation 重试
    }
  }, 3000)
}

// ─── 启动时从构建时环境变量自动加载令牌 ──────────────
// 如果 VITE_SYNC_TOKEN 在构建时设置（如 GitHub Actions Secret），
// 且 localStorage 中还没有令牌，则自动保存。
// 这样用户无需手动输入，部署后开箱即用。
try {
  const envToken = typeof import.meta.env !== 'undefined' && (import.meta.env as Record<string, unknown>).VITE_SYNC_TOKEN
  if (typeof envToken === 'string' && envToken && !localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, envToken)
  }
} catch {
  // 非 Vite 环境（如测试）忽略
}
