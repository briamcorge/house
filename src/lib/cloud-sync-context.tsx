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
        // 数据修复：已退租租客的未付遗留账单 + 补 periodStart/periodEnd
        let { tenants, bills } = cloudData as any
        if (tenants && bills) {
          const endedIds = new Set(tenants.filter((t: any) => t.status === 'ended').map((t: any) => t.id))
          // 删除 ended 租客的 pending 正数账单（退租没清理的遗留）
          const filteredBills = bills.filter((b: any) =>
            !(endedIds.has(b.tenantId) && b.amount > 0 && b.status === 'pending' && b.direction === 'receivable')
          )
          // 给旧账单补 periodStart/periodEnd（云端数据可能没有这些字段）
          const filledBills = filteredBills.map((b: any) => {
            if (b.periodStart || b.periodEnd) return b
            const desc = String(b.description || '')
            const m = desc.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
            if (!m) return b
            return { ...b, periodStart: m[1], periodEnd: m[2] }
          })
          bills = filledBills
          // 给已退租租客补 effectiveEnd（云端数据可能没有）
          tenants = tenants.map((t: any) => {
            if (t.status !== 'ended' || t.effectiveEnd) return t
            // 从退租金账单找实际退租日
            const refund = filledBills.find((b: any) =>
              b.tenantId === t.id && b.amount < 0 && b.type === 'rent'
            )
            if (refund && refund.periodStart) return { ...t, effectiveEnd: refund.periodStart }
            // 没有退租金 → 用合同结束日+1天作为退租日（prev v4 contractEnd 减过1天）
            let ee = String(t.contractEnd || '')
            if (ee) { const d = new Date(ee); d.setDate(d.getDate() + 1); ee = d.toISOString().slice(0, 10) }
            return { ...t, effectiveEnd: ee }
          })
        }
        useStore.setState({
          properties: cloudData.properties,
          rooms: cloudData.rooms,
          tenants: cloudData.tenants,
          bills: bills || cloudData.bills,
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
