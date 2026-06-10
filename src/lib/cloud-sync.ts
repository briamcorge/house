import { CLOUD_CONFIG } from '../config'

const API_BASE = 'https://gitcode.com/api/v1'
const PROJECT = `${CLOUD_CONFIG.owner}%2F${CLOUD_CONFIG.repo}`

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
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const decoder = new TextDecoder()
  return decoder.decode(bytes)
}

interface SyncData {
  properties: unknown[]
  rooms: unknown[]
  tenants: unknown[]
  bills: unknown[]
  landlordContracts: unknown[]
  profitRecords: unknown[]
  trash: unknown[]
  syncTimestamp: string
}

/** Fetch cloud data (no auth needed for public repo raw URL) */
export async function downloadData(): Promise<SyncData | null> {
  const url = `https://gitcode.com/${CLOUD_CONFIG.owner}/${CLOUD_CONFIG.repo}/raw/${CLOUD_CONFIG.branch}/${CLOUD_CONFIG.filePath}`
  const res = await fetch(url, { cache: 'no-cache' })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`下载失败: ${res.status}`)
  }
  return res.json()
}

/** Check cloud metadata without downloading full data */
export async function checkCloudData(): Promise<{ exists: boolean; updatedAt: string | null }> {
  const url = `${API_BASE}/projects/${PROJECT}/repository/files/${encodeURIComponent(CLOUD_CONFIG.filePath)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (res.status === 404) return { exists: false, updatedAt: null }
  if (!res.ok) return { exists: false, updatedAt: null }
  const data = await res.json()
  return { exists: true, updatedAt: data.last_commit?.committed_date || null }
}

/** Upload full state to GitCode. Requires token for write API. */
export async function uploadData(
  syncData: SyncData,
  token: string
): Promise<void> {
  const content = JSON.stringify(syncData)
  const encoded = base64Encode(content)

  const url = `${API_BASE}/projects/${PROJECT}/repository/files/${encodeURIComponent(CLOUD_CONFIG.filePath)}`

  const body = {
    branch: CLOUD_CONFIG.branch,
    content: encoded,
    encoding: 'base64',
    commit_message: `sync ${new Date().toISOString().slice(0, 16)}`,
  }

  // Try create (POST) first, then update (PUT) if exists
  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (res.status === 409) {
    // File exists, use PUT to update
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`上传失败 (${res.status}): ${text}`)
  }
}

// Token management (stored in localStorage, not in Zustand store)
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

// Sync timestamp (to track last local sync time)
const SYNC_TS_KEY = 'house-last-sync-ts'

export function getLastSyncTimestamp(): string | null {
  return localStorage.getItem(SYNC_TS_KEY)
}

export function setLastSyncTimestamp(ts: string): void {
  localStorage.setItem(SYNC_TS_KEY, ts)
}

// Debounced auto-sync
let syncTimer: ReturnType<typeof setTimeout> | null = null
let lastUploaded: string | null = null

export function triggerSync(data: SyncData): void {
  if (!hasToken()) return

  // Skip if data hasn't changed since last upload
  const currentHash = JSON.stringify(data)
  if (currentHash === lastUploaded) return

  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    try {
      await uploadData(data, getToken())
      lastUploaded = currentHash
      setLastSyncTimestamp(new Date().toISOString())
    } catch {
      // Silent fail - retry on next mutation
    }
  }, 3000)
}
