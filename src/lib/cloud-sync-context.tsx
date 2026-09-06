import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import { useAuth } from './auth-context'
import { useStore } from '../store/useStore'
import { isSupabaseConfigured, saveCloudData, loadCloudData, getSupabase, normalizeCloudData, getLocalDirtyAt, clearLocalDirty, isLocalNewerThanCloud } from './supabase'
import { pushAuthDiag } from './auth-diag'
import { pushSyncLog, setLastSyncOkAt } from './sync-log'

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
// 同步失败自动重试定时器（10 秒后重试，直到成功）
let _retryTimer: ReturnType<typeof setTimeout> | null = null

// ⏱️ 保险丝（2026-09-05 同步可靠性修复）：
// 请求无超时是 9-04 事故根因——请求挂起 → saving.current/_loading 卡死 → 后续保存被静默吞掉。
// 现在网络请求有 20s 超时（supabase.ts createTimeoutFetch），此 watchdog 是兜底：
// 保存/加载整体超过 30s（多段请求叠加）仍卡死时，强制复位标志并报失败。
// 代际令牌（epoch）防重入：watchdog 触发复位后，原流程 finally 若晚到，不得清除新一代的 watchdog，
// 也不得误伤正在进行的正常慢保存（epoch 变化 = 已有新保存开始）。
const WATCHDOG_MS = 30000
let _saveWatchdog: ReturnType<typeof setTimeout> | null = null
let _loadWatchdog: ReturnType<typeof setTimeout> | null = null
let _saveEpoch = 0
let _loadEpoch = 0

function clearSaveWatchdog() {
  if (_saveWatchdog) { clearTimeout(_saveWatchdog); _saveWatchdog = null }
}
function clearLoadWatchdog() {
  if (_loadWatchdog) { clearTimeout(_loadWatchdog); _loadWatchdog = null }
}

// 同步失败标记（模块级契约，2026-09-06 安全加固 M6）：
// 保存失败时置位，业务操作守卫据此阻止新增/修改；
// 保存成功（含 10 秒重试最终成功）时清除。
// 由 useStore 导出的模块级函数管理，不暴露在 window（防 XSS 篡改 DoS/绕过守卫）。
import { setCloudSyncBroken, clearCloudSyncBroken } from '../store/useStore'
const markSyncBroken = () => { setCloudSyncBroken(Date.now()) }
const clearSyncBroken = () => { clearCloudSyncBroken() }

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

/** 同步失败后 10 秒自动重试（在线强制：失败必须重试到成功为止） */
function scheduleSaveRetry() {
  if (_retryTimer) return
  pushSyncLog('save_retry_scheduled', '10秒后自动重试')
  _retryTimer = setTimeout(() => {
    _retryTimer = null
    pushSyncLog('save_retry_fire', '触发自动重试')
    triggerCloudSave()
  }, 10000)
}

function clearSaveRetry() {
  if (_retryTimer) {
    clearTimeout(_retryTimer)
    _retryTimer = null
  }
}

/** store 每次变更后调用：立即保存（50ms 仅用于合并同一次操作内的连续写入，
 *  在线强制下不做长防抖——防止用户操作后快速关 App 导致改动永远留在本地） */
export function triggerCloudSave() {
  if (!_saveCallback) {
    pushSyncLog('save_dropped_nocallback', '保存回调未注册（Provider 未就绪），改动已留在本地待后续同步')
    return
  }
  if (_loading) {
    // 加载云端数据期间发生变更 → 标记，加载完成后自动重排一次
    pushSyncLog('save_deferred_loading', '加载中，保存已排队待加载完成后重排')
    _pending = true
    return
  }
  if (_skipNextSave) {
    _skipNextSave = false
    pushSyncLog('save_skipped_skipnext', '跳过本次自动保存（skipNextCloudSave 已设置，常见于登出/被踢/清空数据流程）')
    return
  }
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    pushSyncLog('save_queued', '保存已排队（50ms防抖）')
    _saveCallback?.()
  }, 50)
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const saving = useRef(false)

  const doSave = useCallback(async (): Promise<boolean> => {
    // 守卫拆分（等价重构，2026-09-05）：原为合并条件，拆分以便同步日志区分跳过原因
    if (saving.current) {
      // 保存进行中被再次触发 → 标记，本次保存完成后自动重排（防止改动被静默丢弃）
      pushSyncLog('save_skipped_busy', '上一次保存尚未结束，本次改动已排队')
      _pending = true
      return false
    }
    if (!isSupabaseConfigured()) {
      pushSyncLog('save_skipped_notconfigured', 'Supabase 未配置')
      return false
    }
    if (!user) {
      pushSyncLog('save_skipped_nouser', '未登录，保存被跳过（改动留在本地）')
      return false
    }
    saving.current = true
    pushSyncLog('save_start', '开始保存')

    // ⏱️ 保险丝：保存整体超过 30s 仍卡死（无超时的请求/多段请求叠加）→ 强制复位并报失败
    const saveEpoch = ++_saveEpoch
    clearSaveWatchdog()
    _saveWatchdog = setTimeout(() => {
      if (saving.current && saveEpoch === _saveEpoch) {
        saving.current = false
        markSyncBroken()
        setStatus('error')
        setLastError('保存超时（30秒未完成），已自动停止等待')
        pushSyncLog('save_timeout', '保存超过30秒未完成，已强制复位并报失败')
        scheduleSaveRetry()
      }
    }, WATCHDOG_MS)

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
                pushSyncLog('device_lock_reclaim_fail', `抢回锁失败: ${upErr.message}`)
                saving.current = false
                clearSaveWatchdog()
                setStatus('error')
                setLastError('设备锁校验失败，10 秒后自动重试')
                scheduleSaveRetry()
                return false
              }
              setDeviceLockWriteFailed(false)
            } else {
              console.log('设备锁：检测到另一台设备登录，推送本地改动后退出')
              pushSyncLog('device_lock_mismatch_kick', '保存前验锁发现另一台设备，推送本地后踢出')
              // 诊断日志：保存前验锁发现不匹配，记录双端 token 指纹
              pushAuthDiag({
                reason: '设备锁不匹配（保存前检查）',
                localToken: myToken,
                dbToken: data.session_token,
              })
              // 最佳努力：把本次改动先推上云端（绕过设备锁、单次尝试），再踢出，避免丢操作。
              // A2（2026-09-06）：仅当本地确有「未同步」标记时才推送——无 dirty 说明本地所有改动
              // 均已成功入云（整文档快照），此时再推 = 把（可能已陈旧的）本地整文档盖掉云端新数据
              // （9-05 事故同型：陈旧设备无脑推云）。有 dirty 才推送，杜绝陈旧覆盖。
              if (getLocalDirtyAt()) {
                try {
                  const st = useStore.getState()
                  await saveCloudData({
                    properties: st.properties,
                    rooms: st.rooms,
                    tenants: st.tenants,
                    bills: st.bills,
                    landlordContracts: st.landlordContracts,
                    profitRecords: st.profitRecords,
                    trash: st.trash,
                  }, 1)
                } catch { /* 推送失败不阻断踢出流程 */ }
              } else {
                pushSyncLog('device_lock_kick_no_dirty', '本地无未同步数据，跳过推送直接踢出')
              }
              window.dispatchEvent(new CustomEvent('device-kicked'))
              saving.current = false
              clearSaveWatchdog()
              return false
            }
          } else if (!error && !data) {
            // B2: 线上本用户行丢失/不存在 → 写回自己的锁（失败不阻断保存）
            const { error: upErr } = await sb.from('active_sessions')
              .upsert({ user_id: user.id, session_token: myToken })
            if (upErr) {
              console.warn('设备锁行恢复失败:', upErr.message)
              pushSyncLog('device_lock_b2_restore_attempt', `锁行恢复失败: ${upErr.message}`)
            } else {
              pushSyncLog('device_lock_b2_restore_attempt', '锁行不存在，已写回')
            }
          }
        }
      }
    } catch (e) {
      // active_sessions 查询失败不影响正常使用，但记录日志（含超时）
      pushSyncLog('device_lock_check_error', `设备锁检查异常: ${(e as Error)?.message || 'unknown'}`)
    }

    // 走到这里 = 锁校验通过/未触发踢出。区分是否实际做了校验（myToken 缺失时未校验）
    if (localStorage.getItem('device_session_token')) {
      pushSyncLog('device_lock_ok', '锁校验通过')
    } else {
      pushSyncLog('device_lock_skipped_notoken', '无 device_session_token，跳过锁校验')
    }

    setStatus('syncing')
    setLastError(null)
    const t0 = Date.now()
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
      const elapsed = Date.now() - t0
      setStatus(ok ? 'synced' : 'error')
      if (!ok) {
        markSyncBroken()
        setLastError('保存失败，10 秒后自动重试')
        pushSyncLog('save_fail', `保存失败（${elapsed}ms），10秒后自动重试`)
        scheduleSaveRetry()
      } else {
        clearSyncBroken()
        clearSaveRetry()
        setLastSyncOkAt()
        // A1（2026-09-06）：保存成功即清除「未同步」标记——整文档快照已入云，
        // 标记语义=「存在未确认同步的本地改动」；继续保留会让陈旧设备冒充"比云端新"
        // （9-05 事故根因：旧语义保存成功也不清，陈旧标记永久有效）。
        // ⚠️ _pending 存在 = 本次快照之后又产生了新改动（busy 排队），本快照不含它，
        // 此时不清除，等 finally 已重排的下一轮保存成功后由该轮清除，避免新改动失去保护。
        if (!_pending) clearLocalDirty()
        pushSyncLog('save_ok', `保存成功（${elapsed}ms）`)
      }
      return ok
    } catch (e) {
      const err = e as Error
      const elapsed = Date.now() - t0
      markSyncBroken()
      setStatus('error')
      // AbortError = 20s 请求超时（supabase.ts createTimeoutFetch abort）→ 友好文案
      const isAbort = err?.name === 'AbortError' || /aborted/i.test(err?.message || '')
      setLastError(isAbort ? '请求超时（20秒无响应），正在自动重试' : (err?.message || '同步失败，10 秒后自动重试'))
      pushSyncLog('save_fail', `${isAbort ? '请求超时(20s)' : err?.message || '未知异常'}（${elapsed}ms）`)
      scheduleSaveRetry()
      return false
    } finally {
      // 代际校验（2026-09-05 Oracle 审查修复）：
      // saving.current 复位也必须有代际校验——watchdog 触发复位后若新保存已开始（epoch 已变），
      // 旧保存的 finally 晚到不得把新保存的 saving.current 复位（否则并发双写/乱序覆盖）
      if (saveEpoch === _saveEpoch) {
        clearSaveWatchdog()
        saving.current = false
        // 保存期间有新改动被挡 → 立即重排一次（重新防抖后保存最新状态）
        if (_pending) {
          _pending = false
          triggerCloudSave()
        }
      }
    }
  }, [user])

  const saveNow = useCallback(() => doSave(), [doSave])

  const loadNow = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured() || !user) return false
    setStatus('syncing')
    setLastError(null)
    pushSyncLog('load_start', '开始加载云端数据')
    // 提前置位：加载期间用户若编辑，triggerCloudSave 会被挡并标记 _pending，
    // 加载完成后统一重排一次保存（云端优先：以加载到的云端数据为准）
    // ⚠️ 设计意图（2026-09-03 用户确认，勿报 bug）：加载完成时用云端数据覆盖本地，
    // 加载瞬间用户刚做的修改会被冲掉——这是「云端为准」的预期行为，不是数据丢失 bug；
    // 重登/刷新后请以云端状态为准，加载完成（约 1-2 秒）后再操作
    _loading = true
    // ⏱️ 保险丝：加载整体超过 30s 仍卡死 → 强制复位并报失败（防 _loading 卡死吞保存）
    const loadEpoch = ++_loadEpoch
    clearLoadWatchdog()
    _loadWatchdog = setTimeout(() => {
      if (_loading && loadEpoch === _loadEpoch) {
        _loading = false
        setStatus('error')
        setLastError('加载超时（30秒未完成），已自动停止等待')
        pushSyncLog('load_timeout', '加载超过30秒未完成，已强制复位')
        if (_pending) {
          _pending = false
          triggerCloudSave()
        }
      }
    }, WATCHDOG_MS)
    try {
      const result = await loadCloudData()
      if (result) {
        const cloudData = result.data
        // ⚠️ 本地未同步数据保护（2026-09-03 数据丢失事故修复）：
        // 本地业务操作时间戳比云端 updated_at 新 → 说明本地有未同步数据（同步断链/失败），
        // 此时禁止云端旧数据覆盖本地——保留本地，自动把本地推上云。
        // （8-28 / 9-03 两次事故都是「云端旧数据覆盖本地新数据」导致操作丢失）
        const dirtyAt = getLocalDirtyAt()
        if (dirtyAt && result.updatedAt && isLocalNewerThanCloud(dirtyAt, result.updatedAt)) {
          console.warn('[loadNow] 本地有比云端新的未同步数据，保留本地并自动同步（跳过云端覆盖）:', { dirtyAt, cloudUpdatedAt: result.updatedAt })
          setStatus('syncing')
          setLastError('检测到本地有比云端新的未同步数据，已保留本地数据并自动重新同步')
          pushSyncLog('load_dirty_keep', `本地有未同步数据（本地=${dirtyAt} 云端=${result.updatedAt}），保留本地并自动推云`)
          window.dispatchEvent(new CustomEvent('local-newer-than-cloud'))
          // 把本地推上云（_loading=true 期间 triggerCloudSave 会被挡 → 标记 _pending → finally 重排保存）
          triggerCloudSave()
          return true
        }
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
        // 本地已被云端数据替换 → 清除未同步标记
        clearLocalDirty()
        setStatus('synced')
        pushSyncLog('load_cloud_overwrite', '云端数据覆盖本地完成')
        return true
      }
      setStatus('idle')
      pushSyncLog('load_nodata', '云端无数据（result 为 null，可能是无数据或查询失败）')
      return true
    } catch (e) {
      setStatus('error')
      setLastError((e as Error).message || '加载失败')
      pushSyncLog('load_fail', `加载失败: ${(e as Error)?.message || 'unknown'}`)
      return false
    } finally {
      // 代际校验：仅当没有新一代加载开始时才复位（防旧 load 晚到污染新 load 状态）
      if (loadEpoch === _loadEpoch) {
        clearLoadWatchdog()
        _loading = false
        // 加载期间有被挡的变更 → 重排一次保存
        if (_pending) {
          _pending = false
          triggerCloudSave()
        }
      }
    }
  }, [user])

  // 注册全局保存回调（store 每次变更都会调用 triggerCloudSave → doSave）
  useEffect(() => {
    _saveCallback = doSave
    return () => { _saveCallback = null }
  }, [doSave])

  // 启动时无条件拉取云端数据（在线强制：云端为唯一权威，本地只是缓存；
  // 云端无数据时 loadNow 跳过覆盖，仅云端有数据才覆盖本地）
  useEffect(() => {
    if (!isSupabaseConfigured() || !ready || !user) return
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
