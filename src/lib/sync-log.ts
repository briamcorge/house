// ========== 同步日志（2026-09-05 同步可靠性修复） ==========
// 记录云同步全生命周期事件（保存/加载/设备锁/超时/重试），供事后排查。
// 仅存本机 localStorage，不上云、不进 Zustand persist、不写 auth_diag。
// 仿 auth-diag.ts 模式：读写失败一律静默忽略，不影响主流程。
// 9-04 事故教训：同步失败无痕可查，全靠事后推理——有了本日志，异常可直接导出定位。

const SYNC_LOG_KEY = 'sync_log'
const LAST_OK_KEY = 'sync_log_last_ok'
const MAX_SYNC_LOG = 500

export interface SyncLogEntry {
  t: string
  event: string
  detail?: string
}

// 写入一条同步日志（轮转保留最近 MAX_SYNC_LOG 条）
export function pushSyncLog(event: string, detail?: string) {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY)
    const list: SyncLogEntry[] = raw ? JSON.parse(raw) : []
    list.push({ t: new Date().toISOString(), event, detail })
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(list.slice(-MAX_SYNC_LOG)))
  } catch { /* 日志写入失败不影响主流程 */ }
}

export function getSyncLog(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearSyncLog() {
  try { localStorage.removeItem(SYNC_LOG_KEY) } catch { /* ignore */ }
}

// 最后一次保存成功的时间（save_ok 时写入），App 冷启动后仍可读（localStorage 持久化）
export function getLastSyncOkAt(): string | null {
  try { return localStorage.getItem(LAST_OK_KEY) } catch { return null }
}

export function setLastSyncOkAt() {
  try { localStorage.setItem(LAST_OK_KEY, new Date().toISOString()) } catch { /* ignore */ }
}