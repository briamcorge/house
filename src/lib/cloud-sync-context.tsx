import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import { useAuth } from './auth-context'
import { useStore } from '../store/useStore'
import { isSupabaseConfigured, saveCloudData, loadCloudData, getSupabase } from './supabase'

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

/** store 每次变更后调用，500ms 内合并多次写入成一次保存 */
export function triggerCloudSave() {
  if (!_saveCallback || _loading) return
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveCallback?.()
  }, 500)
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const saving = useRef(false)

  const doSave = useCallback(async (): Promise<boolean> => {
    if (saving.current || !isSupabaseConfigured() || !user) return false
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
            console.log('设备锁：检测到另一台设备登录，拒绝保存并踢出')
            window.dispatchEvent(new CustomEvent('device-kicked'))
            saving.current = false
            return false
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
    }
  }, [user])

  const saveNow = useCallback(() => doSave(), [doSave])

  const loadNow = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured() || !user) return false
    setStatus('syncing')
    setLastError(null)
    try {
      const cloudData = await loadCloudData()
      if (cloudData) {
        _loading = true
        useStore.setState({
          properties: cloudData.properties,
          rooms: cloudData.rooms,
          tenants: cloudData.tenants,
          bills: cloudData.bills,
          landlordContracts: cloudData.landlordContracts,
          profitRecords: cloudData.profitRecords,
          trash: cloudData.trash,
        } as any)
        _loading = false
        setStatus('synced')
        return true
      }
      setStatus('idle')
      return true
    } catch (e) {
      _loading = false
      setStatus('error')
      setLastError((e as Error).message || '加载失败')
      return false
    }
  }, [user])

  // 注册全局保存回调（store 每次变更都会调用 triggerCloudSave → doSave）
  useEffect(() => {
    _saveCallback = doSave
    return () => { _saveCallback = null }
  }, [doSave])

  // 启动时加载云端数据（仅首次登录，刷新不重复拉取，避免覆盖本地新数据）
  useEffect(() => {
    if (!isSupabaseConfigured() || !ready || !user) return
    const flagKey = `cloud_init_loaded_${user.id}`
    if (sessionStorage.getItem(flagKey)) return
    sessionStorage.setItem(flagKey, '1')
    loadNow()
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
