import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import { useAuth } from './auth-context'
import { useStore } from '../store/useStore'
import { isSupabaseConfigured, saveCloudData, loadCloudData, getSupabase, normalizeCloudData } from './supabase'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface CloudSyncContextValue {
  status: SyncStatus
  lastError: string | null
  saveNow: () => Promise<boolean>
  loadNow: () => Promise<boolean>
}

const CloudSyncContext = createContext<CloudSyncContextValue>({
  status: 'idle',
  lastError: null,
  saveNow: async () => false,
  loadNow: async () => false,
})

// ─── 模块级回调：store 每次变更自动触发保存 ───
let _saveCallback: (() => void) | null = null
let _saveTimer: ReturnType<typeof setTimeout> | null = null
let _loading = false
// 保存进行中被挡住的改动标记：保存完成后重新触发一次，避免丢改动
let _pending = false
// 跳过下一次自动保存（用于主动清空数据等场景，防止把空数据推上云端）
let _skipNextSave = false

/** 主动清空数据前调用：跳过下一次自动保存，防止空数据覆盖云端 */
export function skipNextCloudSave() {
  _skipNextSave = true
}

// 设备锁写入失败标记（B1）：本会话登录时 upsert 到 active_sessions 失败时置位。
// 轮询/保存前验锁发现 token 不匹配时，先抢回锁（自己可能是后登录者），
// 避免被库里遗留下来的旧 token 误判"另一台设备登录"而把自己踢出。
// 正常互踢场景（本机写入成功过）标记为 false → 直接踢出，不会与对方互抢锁。
let _deviceLockWriteFailed = false
export function setDeviceLockWriteFailed(v: boolean) { _deviceLockWriteFailed = v }
export function isDeviceLockWriteFailed() { return _deviceLockWriteFailed }

/** store 每次变更后调用，500ms 内合并多次写入成一次保存 */
export function triggerCloudSave() {
  if (!_saveCallback) return
  if (_loading) {
    // 加载云端数据期间发生变更 → 标记，加载完成后自动重排一次
    _pending = true
    return
  }
  if (_skipNextSave) {
    _skipNextSave = false
    return
  }
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    _saveCallback?.()
  }, 500)
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const saving = useRef(false)

  const doSave = useCallback(async (): Promise<boolean> => {
    if (saving.current || !isSupabaseConfigured() || !user) {
      // 保存进行中被再次触发 → 标记，本次保存完成后自动重排（防止改动被静默丢弃）
      if (saving.current) _pending = true
      return false
    }
    saving.current = true

    // 🔒 设备锁：每次保存前检查 active_sessions，另一台设备登录则踢出
    try {
      const myToken = localStorage.getItem('device_session_token')
      if (myToken) {
        const sb = getSupabase()
        if (sb) {
          const { data, error } = await sb.from('active_sessions')
            .select('session_token')
            .eq('user_id', user.id)
            .maybeSingle()
          if (!error && data && data.session_token !== myToken) {
            if (isDeviceLockWriteFailed()) {
              // B1: 本会话登录时锁写入失败 → 自己才是后登录者，抢回锁再继续保存
              const { error: upErr } = await sb.from('active_sessions')
                .upsert({ user_id: user.id, session_token: myToken })
              if (upErr) {
                console.warn('设备锁抢回失败（拒绝保存）:', upErr.message)
                saving.current = false
                return false
              }
              setDeviceLockWriteFailed(false)
            } else {
              console.log('设备锁：检测到另一台设备登录，拒绝保存并踢出')
              window.dispatchEvent(new CustomEvent('device-kicked'))
              saving.current = false
              return false
            }
          } else if (!error && !data) {
            // B2: 线上本用户行丢失/不存在 → 写回自己的锁（失败不阻断保存）
            const { error: upErr } = await sb.from('active_sessions')
              .upsert({ user_id: user.id, session_token: myToken })
            if (upErr) console.warn('设备锁行恢复失败:', upErr.message)
          }
        }
      }
    } catch { /* active_sessions 查询失败不影响正常使用 */ }

    setStatus('syncing')
    setLastError(null)
    try {
      const state = useStore.getState()
      const ok = await saveCloudData({
        properties: state.properties,
        rooms: state.rooms,
        tenants: state.tenants,
        bills: state.bills,
        landlordContracts: state.landlordContracts,
        profitRecords: state.profitRecords,
        trash: state.trash,
      })
      setStatus(ok ? 'synced' : 'error')
      if (!ok) setLastError('保存失败')
      return ok
    } catch (e) {
      setStatus('error')
      setLastError((e as Error).message || '同步失败')
      return false
    } finally {
      saving.current = false
      // 保存期间有新改动被挡 → 立即重排一次（重新防抖后保存最新状态）
      if (_pending) {
        _pending = false
        triggerCloudSave()
      }
    }
  }, [user])

  const saveNow = useCallback(() => doSave(), [doSave])

  const loadNow = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured() || !user) return false
    setStatus('syncing')
    setLastError(null)
    // 提前置位：加载期间用户若编辑，triggerCloudSave 会被挡并标记 _pending，
    // 加载完成后统一重排一次保存（云端优先：以加载到的云端数据为准）
    _loading = true
    try {
      const cloudData = await loadCloudData()
      if (cloudData) {
        const normalized = normalizeCloudData(cloudData)
        useStore.setState({
          properties: normalized.properties,
          rooms: normalized.rooms,
          tenants: normalized.tenants,
          bills: normalized.bills,
          landlordContracts: normalized.landlordContracts,
          profitRecords: normalized.profitRecords,
          trash: normalized.trash,
        } as any)
        setStatus('synced')
        return true
      }
      setStatus('idle')
      return true
    } catch (e) {
      setStatus('error')
      setLastError((e as Error).message || '加载失败')
      return false
    } finally {
      _loading = false
      // 加载期间有被挡的变更 → 重排一次保存
      if (_pending) {
        _pending = false
        triggerCloudSave()
      }
    }
  }, [user])

  // 注册全局保存回调（store 每次变更都会调用 triggerCloudSave → doSave）
  useEffect(() => {
    _saveCallback = doSave
    return () => { _saveCallback = null }
  }, [doSave])

  // 启动时加载云端数据（仅本地无数据时加载，避免覆盖已有数据）
  useEffect(() => {
    if (!isSupabaseConfigured() || !ready || !user) return
    const state = useStore.getState()
    const hasLocalData = state.properties.length > 0 || state.tenants.length > 0 || state.bills.length > 0
    if (!hasLocalData) {
      loadNow()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user])

  return (
    <CloudSyncContext.Provider value={{ status, lastError, saveNow, loadNow }}>
      {children}
    </CloudSyncContext.Provider>
  )
}

export function useCloudSync() {
  return useContext(CloudSyncContext)
}
