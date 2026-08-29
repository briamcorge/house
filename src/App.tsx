import { useState, useEffect, useCallback, useRef } from "react";
import { HashRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { AlertTriangle, X, Lock, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useAuth } from "./lib/auth-context";
import { useStore } from "./store/useStore";
import { isSupabaseConfigured, getSupabase, updatePassword, getUserDisabledStatus } from "./lib/supabase";
import { skipNextCloudSave, setDeviceLockWriteFailed, isDeviceLockWriteFailed, useCloudSync } from "./lib/cloud-sync-context";
import { pushAuthDiag } from "./lib/auth-diag";
import Home from "./pages/Home";
import Properties from "./pages/Properties";
import RoomList from "./pages/RoomList";
import RoomDetail from "./pages/RoomDetail";
import Bills from "./pages/Bills";
import Tenants from "./pages/Tenants";
import More from "./pages/More";
import Contracts from "./pages/Contracts";
import Trash from "./pages/Trash";
import Statistics from "./pages/Statistics";
import Admin from "./pages/Admin";
import BottomNav from "./components/BottomNav";
import ErrorBoundary from "./components/ErrorBoundary";
import AuthModal from "./components/AuthModal";
import LoginPage from "./pages/LoginPage";

const STORAGE_KEY = "property-manager-data"
const MAX_STORAGE_BYTES = 5 * 1024 * 1024
const WARN_THRESHOLD = 0.8

// 互斥：同一次设备锁不匹配只处理一次踢出。
// INITIAL_SESSION 检查、doSave 保存前验锁、轮询检查可能几乎同时发现同一个不匹配，
// 各自独立 signOut 会产生 204+403 双登出请求（也是被踢数据被多次清空的放大器）。
let lastKickHandledAt = 0
function shouldHandleKick(): boolean {
  const now = Date.now()
  if (now - lastKickHandledAt < 5000) return false
  lastKickHandledAt = now
  return true
}

function StorageWarning() {
  const [dismissed, setDismissed] = useState(false)
  const [usage, setUsage] = useState(0)

  const checkStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const bytes = new Blob([raw]).size
      setUsage(bytes)
    } catch {
      // localStorage might be full or unavailable
    }
  }, [])

  useEffect(() => {
    checkStorage()
    const interval = setInterval(checkStorage, 30000)
    return () => clearInterval(interval)
  }, [checkStorage])

  if (dismissed) return null

  const ratio = usage / MAX_STORAGE_BYTES
  if (ratio < WARN_THRESHOLD) return null

  const pct = Math.round(ratio * 100)
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-2">
      <div className="max-w-md mx-auto flex items-start gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
        <p className="flex-1 text-yellow-800">
          存储空间使用率 {pct}%（约 {(usage / 1024 / 1024).toFixed(1)}MB / {MAX_STORAGE_BYTES / 1024 / 1024}MB），
          建议 <span className="font-medium">更多 → 数据备份 → 导出Excel</span> 备份后清除旧数据
        </p>
        <button type="button" onClick={() => setDismissed(true)} className="text-yellow-500 hover:text-yellow-700 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function PasswordResetPage({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">密码重置成功</h2>
          <p className="text-sm text-gray-500 mb-4">请使用新密码登录</p>
          <button onClick={onComplete} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
            返回登录
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">设置新密码</h2>
        <p className="text-sm text-gray-500 text-center mb-5">请为你的账号设置一个新密码</p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少8位密码"
                minLength={8}
                className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入新密码"
              minLength={8}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            disabled={loading}
            onClick={async () => {
              if (password !== confirm) { setError('两次密码不一致'); return }
              if (password.length < 8) { setError('密码至少8位'); return }
              setLoading(true); setError('')
              const { error } = await updatePassword(password)
              setLoading(false)
              if (error) { setError(error.message); return }
              setDone(true)
            }}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            重置密码
          </button>
        </div>
      </div>
    </div>
  )
}

/** 登录后自动跳转首页 */
function LoginRedirect({ triggered }: { triggered: boolean }) {
  const navigate = useNavigate()
  const done = useRef(false)
  useEffect(() => {
    if (triggered && !done.current) {
      done.current = true
      navigate('/', { replace: true })
    }
  }, [triggered, navigate])
  return null
}

export default function App() {
  const { user: currentUser, ready: authReady, lastEvent } = useAuth()
  const { status: syncStatus, lastError: syncError } = useCloudSync()
  const [showAuth, setShowAuth] = useState(false)
  const [passwordResetMode, setPasswordResetMode] = useState(false)
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const [deviceTokenReady, setDeviceTokenReady] = useState(false)
  // 在线强制：断网检测 + 被阻止操作提示
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [offlineToast, setOfflineToast] = useState(false)
  const offlineToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 账号被停用提示（登录页/应用页都可见）
  const [disabledNotice, setDisabledNotice] = useState(false)
  const disabledNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const blocked = () => {
      setOfflineToast(true)
      if (offlineToastTimer.current) clearTimeout(offlineToastTimer.current)
      offlineToastTimer.current = setTimeout(() => setOfflineToast(false), 4000)
    }
    window.addEventListener('app-offline-blocked', blocked)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('app-offline-blocked', blocked)
      if (offlineToastTimer.current) clearTimeout(offlineToastTimer.current)
    }
  }, [])

  // 启动时注销所有旧的 Service Worker，避免缓存旧版本
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister().catch(err => console.error('注销 Service Worker 失败:', err))
        }
      }).catch(err => console.error('获取 Service Worker 注册列表失败:', err))
    }
  }, [])

  // 停用检查：账号被管理员停用 → 本地登出 + 顶部提示（异步，不阻塞正常流程）
  const kickDisabledUser = useCallback(async () => {
    try {
      const disabled = await getUserDisabledStatus()
      if (!disabled) return
      setDisabledNotice(true)
      pushAuthDiag({ reason: '账号被停用踢出', detail: currentUser?.email })
      if (disabledNoticeTimer.current) clearTimeout(disabledNoticeTimer.current)
      disabledNoticeTimer.current = setTimeout(() => setDisabledNotice(false), 6000)
      const sb = getSupabase()
      if (sb) {
        skipNextCloudSave()
        sb.auth.signOut({ scope: 'local' }).catch(err => console.error('退出登录失败:', err))
        localStorage.removeItem('device_session_token')
      }
    } catch (err) {
      // 检查失败不阻塞登录（fail-open）
      console.warn('停用状态检查失败:', err)
    }
  }, [])

  // 监听 auth 事件，执行业务逻辑
  useEffect(() => {
    if (!isSupabaseConfigured() || !lastEvent) return

    const sb = getSupabase()
    if (!sb) return

    if (lastEvent === 'INITIAL_SESSION') {
      // 检测是否新的浏览器会话（关过浏览器/标签页）
      // 用 localStorage 而非 sessionStorage：sessionStorage 是每个标签页独立的，
      // 会导致新开标签页被误判为"新会话"而强制登出+清数据（旧 bug）。
      // 老用户迁移：sessionStorage 已有 tab_active 视为非新会话，并写入 localStorage。
      const hasOldSessionTab = !!sessionStorage.getItem('tab_active')
      const isNewBrowserSession = !localStorage.getItem('tab_active') && !hasOldSessionTab

      // 标记当前浏览器"活跃"（跨标签页共享）
      localStorage.setItem('tab_active', '1')

      // 停用检查：会话恢复时也要踢出被停用的账号（异步，不阻塞启动流程）
      if (currentUser) {
        kickDisabledUser()
      }

      if (!currentUser) {
        // 没有用户 → 不清除本地数据（避免误删未同步数据）；
        // 登录后由 SIGNED_IN 按"云端优先"策略统一处理
      } else if (isNewBrowserSession) {
        // 理论上仅在首装/存储被系统清空时出现（登出/被踢已不再删除 tab_active）。
        // 只登出本机会话，不清业务数据（云端为准：重登后云端覆盖）。
        pushAuthDiag({ reason: '新浏览器会话判定（tab_active 丢失）' })
        const sb = getSupabase()
        if (sb) {
          skipNextCloudSave()
          sb.auth.signOut({ scope: 'local' }).catch(err => console.error('退出登录失败:', err))
          localStorage.removeItem('device_session_token')
        }
      } else {
        // 正常会话恢复 → 检查设备锁（严格单设备模式）
        const myToken = localStorage.getItem('device_session_token')
        const sb = getSupabase()
        if (sb && myToken) {
          sb.from('active_sessions')
            .select('session_token')
            .eq('user_id', currentUser.id)
            .maybeSingle()
            .then(({ data, error }) => {
              if (!error && data && data.session_token !== myToken) {
                // 数据库里的 token 跟本地不符 → 另一台设备登录了 → 单设备在线，本机退出
                console.log('检测到另一台设备登录，强制退出')
                // 诊断日志：记录冷启动检查时的双端 token 指纹，用于区分真实互踢与自我竞态
                pushAuthDiag({
                  reason: '设备锁不匹配（冷启动检查）',
                  localToken: myToken,
                  dbToken: data.session_token,
                })
                if (shouldHandleKick()) {
                  skipNextCloudSave()
                  sb.auth.signOut({ scope: 'local' }).catch(err => console.error('退出登录失败:', err))
                  localStorage.removeItem('device_session_token')
                  // 本地业务数据与 tab_active 保留：云端为准（重登后云端覆盖），
                  // 且避免下次冷启动被误判为"新浏览器会话"再次被踢
                }
              } else if (!error && !data) {
                // B2: 线上本用户行丢失/不存在 → 写回自己的锁（自我修复，避免永久同时在线）
                console.warn('设备锁行不存在，写回自己的锁')
                pushAuthDiag({ reason: '设备锁行不存在（B2 写回）', localToken: myToken })
                sb.from('active_sessions')
                  .upsert({ user_id: currentUser.id, session_token: myToken })
                  .then(
                    () => setDeviceTokenReady(true),
                    err => { console.error('设备锁行恢复失败:', err); setDeviceTokenReady(true) }
                  )
                return
              }
              // 刷新/恢复会话路径也必须启动轮询，否则另一台设备登录时本机不会被踢
              // （被踢时已 signOut，currentUser 变为 null，轮询 effect 会自行停止，无副作用）
              setDeviceTokenReady(true)
            }, err => { console.error('设备锁会话检查失败:', err); setDeviceTokenReady(true) })
        } else if (sb && !myToken) {
          // 没有本地 token（可能是旧版本升级来的）→ 写入当前设备为活跃设备
          const deviceToken = crypto.randomUUID()
          localStorage.setItem('device_session_token', deviceToken)
          pushAuthDiag({ reason: '设备锁初始化（本地无 token）', localToken: deviceToken })
          sb.from('active_sessions')
            .upsert({ user_id: currentUser.id, session_token: deviceToken })
            .then(({ error }) => {
              if (error) {
                console.error('设备锁初始化失败:', error)
                // B1: 写入失败标记，验锁发现不匹配时先抢回锁（自己可能是后登录者）
                setDeviceLockWriteFailed(true)
              }
              // 写入完成（无论成败）都启用轮询，由轮询承担后续重试
              setDeviceTokenReady(true)
            }, err => { console.error('设备锁初始化异常:', err); setDeviceLockWriteFailed(true); setDeviceTokenReady(true) })
        }
        // 正常会话恢复 → CloudSyncProvider 自动加载云端数据
      }
    }

    if (lastEvent === 'SIGNED_IN' && currentUser) {
      setShowAuth(false)

      // 停用检查：登录成功但账号已被停用 → 立即登出并提示
      setDisabledNotice(false)
      kickDisabledUser()

      // 生成设备会话 token，写入数据库（严格单设备模式）
      // 优先复用本地已有 token：冷启动恢复会话时 auth-js 也会触发 SIGNED_IN 事件，
      // 若重新生成新 token，会与并发执行的 INITIAL_SESSION 设备锁检查竞态——
      // 检查读到旧 token ≠ 本地新 token → 误判"另一台设备登录"自我踢出（2026-08-29 实锤）。
      // 真正重新登录时本地 token 已被登出/被踢流程删除，此处自然生成新 token，行为不变。
      const existingToken = localStorage.getItem('device_session_token')
      const deviceToken = existingToken || crypto.randomUUID()
      localStorage.setItem('device_session_token', deviceToken)
      pushAuthDiag({ reason: 'SIGNED_IN 写锁', localToken: deviceToken, detail: existingToken ? '复用本地 token' : '生成新 token' })
      const sb = getSupabase()
      if (sb) {
        // 必须 await 写入完成，否则轮询会看到旧 token 把自己踢掉
        sb.from('active_sessions')
          .upsert({ user_id: currentUser.id, session_token: deviceToken })
          .then(({ error }) => {
            if (error) {
              console.error('设备锁写入失败:', error)
              // B1: 写入失败标记，验锁发现不匹配时先抢回锁（自己才是后登录者）
              setDeviceLockWriteFailed(true)
            }
            setDeviceTokenReady(true)
          }, err => { console.error('设备锁写入异常:', err); setDeviceLockWriteFailed(true); setDeviceTokenReady(true) })
      } else {
        setDeviceTokenReady(true)
      }

      // 登录成功后跳转首页
      setJustLoggedIn(true)
      // 数据冲突策略（云端优先）：本地有数据时先查云端——
      // 云端有数据 → 用云端覆盖本地（云端视为同步源）
      // 云端无数据 → 本地数据上传到云端（首次使用/云端被清）
      // 查询失败 → 不覆盖任何一方（本地数据保留，等待后续自动保存）
      const state = useStore.getState()
      const hasLocalData = state.properties.length > 0 || state.tenants.length > 0 || state.bills.length > 0
      if (hasLocalData) {
        import('./lib/supabase').then(async ({ hasCloudData, loadCloudData, saveCloudData, normalizeCloudData }) => {
          try {
            const cloudExists = await hasCloudData()
            const latest = useStore.getState()
            if (cloudExists === null) {
              // 查询失败（网络等）：不动任何数据，避免误覆盖
              console.warn('登录后云端数据检查失败，跳过覆盖')
              return
            }
            if (cloudExists) {
              // 云端优先：用云端数据覆盖本地（含数据修复）
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
              }
            } else {
              // 云端无数据 → 本地上传（云端优先的例外：云端为空）
              await saveCloudData({
                properties: latest.properties,
                rooms: latest.rooms,
                tenants: latest.tenants,
                bills: latest.bills,
                landlordContracts: latest.landlordContracts,
                profitRecords: latest.profitRecords,
                trash: latest.trash,
              })
            }
          } catch (err) {
            console.error('登录后数据同步失败:', err)
          }
        })
      }
      // 本地无数据时，CloudSyncProvider 会自动从云端加载
      // 操作日志
      useStore.setState((s) => ({ auditLogs: [...s.auditLogs, { id: Date.now().toString(), timestamp: new Date().toISOString(), action: 'create', entity: 'auth', details: `${currentUser.email} 登录`, createdAt: new Date().toISOString() }] }))
    }

    if (lastEvent === 'PASSWORD_RECOVERY') {
      setPasswordResetMode(true)
    }

    if (lastEvent === 'SIGNED_OUT') {
      // 诊断日志：记录登出事件（含被动登出/库级会话失效），配合触发点记录可还原完整链条
      pushAuthDiag({ reason: 'SIGNED_OUT 事件', detail: currentUser?.email || '未知用户' })
      // 操作日志（退出前记录）
      useStore.setState((s) => ({ auditLogs: [...s.auditLogs, { id: Date.now().toString(), timestamp: new Date().toISOString(), action: 'delete', entity: 'auth', details: `${currentUser?.email || ''} 退出`, createdAt: new Date().toISOString() }] }))
      // 注意：不清空本地业务数据（云端为准：重登后云端覆盖），
      // 也不删除 tab_active——删除它会导致下次冷启动被误判为
      // "新浏览器会话"而再次被踢（互踢循环放大器，已移除）。
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent])

  // 独立监听 password_recovery（上面 SIGNED_IN 里的判断不生效因为 lastEvent !== 'PASSWORD_RECOVERY'）
  useEffect(() => {
    if (lastEvent === 'PASSWORD_RECOVERY' && currentUser) {
      setPasswordResetMode(true)
    }
  }, [lastEvent, currentUser])

  // 监听 open-auth 事件（从 More.tsx 触发）
  useEffect(() => {
    const openAuthHandler = () => setShowAuth(true)
    window.addEventListener('open-auth', openAuthHandler)
    return () => window.removeEventListener('open-auth', openAuthHandler)
  }, [])

  // 设备锁：监听 cloud-sync 触发的 kick 事件（另一台设备登录时立即踢出）
  useEffect(() => {
    const handler = () => {
      console.log('收到 device-kicked 事件，强制退出')
      pushAuthDiag({ reason: '收到 device-kicked 事件，执行踢出' })
      if (!shouldHandleKick()) return
      const sb = getSupabase()
      if (sb) {
        skipNextCloudSave()
        sb.auth.signOut({ scope: 'local' }).catch(err => console.error('退出登录失败:', err))
        localStorage.removeItem('device_session_token')
        // 本地业务数据与 tab_active 保留：云端为准（重登后云端覆盖），
        // 且避免下次冷启动被误判为"新浏览器会话"再次被踢
      }
    }
    window.addEventListener('device-kicked', handler)
    return () => window.removeEventListener('device-kicked', handler)
  }, [])

  // 设备锁：定时轮询 + 页面可见性检查（解决手机浏览器后台节流问题）
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured() || !deviceTokenReady) return
    const sb = getSupabase()
    if (!sb) return

    const checkDeviceLock = async () => {
      const myToken = localStorage.getItem('device_session_token')
      if (!myToken) return
      try {
        const { data, error } = await sb.from('active_sessions')
          .select('session_token')
          .eq('user_id', currentUser.id)
          .maybeSingle()
        if (!error && data && data.session_token !== myToken) {
          if (isDeviceLockWriteFailed()) {
            // B1: 本会话登录时锁写入失败 → 自己才是后登录者，抢回锁而不是被旧 token 误踢
            const { error: upErr } = await sb.from('active_sessions')
              .upsert({ user_id: currentUser.id, session_token: myToken })
            if (upErr) {
              console.warn('设备锁抢回失败（下轮重试）:', upErr.message)
              return
            }
            console.log('设备锁写入恢复成功')
            setDeviceLockWriteFailed(false)
            return
          }
          console.log('设备锁：检测到另一台设备登录，强制退出')
          pushAuthDiag({
            reason: '设备锁不匹配（轮询/前台检查）',
            localToken: myToken,
            dbToken: data.session_token,
          })
          window.dispatchEvent(new CustomEvent('device-kicked'))
        } else if (!error && !data) {
          // B2: 线上本用户行丢失/不存在 → 写回自己的锁（自我修复，避免永久同时在线）
          const { error: upErr } = await sb.from('active_sessions')
            .upsert({ user_id: currentUser.id, session_token: myToken })
          if (upErr) console.warn('设备锁行恢复失败:', upErr.message)
        } else if (error) {
          console.warn('设备锁查询失败:', error.message)
        }
      } catch (e) {
        console.warn('设备锁查询异常:', e)
      }
    }

    // 定时轮询（每15秒）- token 写入完成后再启动
    let intervalId: ReturnType<typeof setInterval> | null = null
    const timer = setTimeout(() => {
      checkDeviceLock()
      intervalId = setInterval(checkDeviceLock, 15000)
    }, 3000)

    // 页面从后台切回前台时立即检查（解决手机浏览器后台节流）
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('页面恢复可见，检查设备锁')
        checkDeviceLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearTimeout(timer)
      if (intervalId) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [currentUser, deviceTokenReady])

  // Capacitor App：Android 返回键（手势返回/物理返回）
  useEffect(() => {
    let cancelled = false
    let handler: { remove: () => void } | null = null
    import('@capacitor/app').then(({ App: CapacitorApp }) => {
      if (cancelled) return
      return CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back()
        } else {
          const hash = window.location.hash
          const depth = hash.split('/').length - 1
          if (depth > 1) {
            window.history.back()
          } else {
            CapacitorApp.exitApp()
          }
        }
      }).then(h => { handler = h })
    }).catch(() => { /* 非 Capacitor 环境忽略 */ })
    return () => { cancelled = true; handler?.remove() }
  }, [])

  return (
    <Router>
      {/* 账号被停用提示（登录页/应用页都可见） */}
      {disabledNotice && (
        <div className="fixed top-4 left-0 right-0 z-[80] flex justify-center px-4 pointer-events-none">
          <div className="bg-red-600 text-white text-sm rounded-full px-4 py-2 shadow-lg">
            该账号已被停用，请联系管理员
          </div>
        </div>
      )}
      {/* 未登录 → 显示登录页 */}
      {isSupabaseConfigured() && authReady && !currentUser ? (
        <LoginPage onLogin={() => {}} />
      ) : passwordResetMode && currentUser ? (
        <PasswordResetPage onComplete={() => { setPasswordResetMode(false); window.location.href = import.meta.env.BASE_URL }} />
      ) : isSupabaseConfigured() && !authReady ? (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/60 text-sm">加载中...</p>
          </div>
        </div>
      ) : (
        <ErrorBoundary>
          <div className="min-h-screen">
            <LoginRedirect triggered={justLoggedIn} />
            <StorageWarning />
            {/* 在线强制：断网横幅（优先）/ 同步失败横幅 */}
            {!online ? (
              <div className="fixed top-0 left-0 right-0 z-[55] bg-red-600 text-white px-4 py-2 text-sm text-center font-medium">
                ⚠ 当前离线，数据无法同步，新增/修改操作已被阻止
              </div>
            ) : syncStatus === 'error' ? (
              <div className="fixed top-0 left-0 right-0 z-[55] bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700 text-center">
                ⚠ 数据同步失败（{syncError || '未知错误'}），正在自动重试，请保持网络畅通
              </div>
            ) : null}
            {/* 被阻止操作的浮动提示 */}
            {offlineToast && (
              <div className="fixed bottom-24 left-0 right-0 z-[70] flex justify-center px-4 pointer-events-none">
                <div className="bg-gray-900/90 text-white text-sm rounded-full px-4 py-2">
                  网络异常，操作未保存，请检查网络后重试
                </div>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/properties" element={<Properties />} />
              <Route path="/properties/:propertyId" element={<RoomList />} />
              <Route path="/properties/:propertyId/rooms/:roomId" element={<RoomDetail />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/more" element={<More />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
            <BottomNav />
            <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
          </div>
        </ErrorBoundary>
      )}
    </Router>
  );
}
