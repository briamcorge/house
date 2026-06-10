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

/** 从 GitHub raw 下载（无需令牌） */
export async function downloadData(): Promise<SyncData | null> {
  const url = `${RAW_BASE}/${CLOUD_CONFIG.owner}/${CLOUD_CONFIG.repo}/${CLOUD_CONFIG.branch}/${CLOUD_CONFIG.filePath}`
  const res = await fetch(url, { cache: 'no-cache' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`下载失败: ${res.status}`)
  return res.json()
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
