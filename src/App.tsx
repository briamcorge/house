import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { AlertTriangle, X, Lock, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { initSync, hasToken } from "./lib/cloud-sync";
import { useAuth } from "./lib/auth-context";
import { useStore } from "./store/useStore";
import { isSupabaseConfigured, getSupabase, loadCloudData, saveCloudData, updatePassword } from "./lib/supabase";
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
import AuthModal from "./components/AuthModal";
import LoginPage from "./pages/LoginPage";

const STORAGE_KEY = "property-manager-data"
const MAX_STORAGE_BYTES = 5 * 1024 * 1024
const WARN_THRESHOLD = 0.8

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
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
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
                placeholder="至少6位密码"
                minLength={6}
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
              minLength={6}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            disabled={loading}
            onClick={async () => {
              if (password !== confirm) { setError('两次密码不一致'); return }
              if (password.length < 6) { setError('密码至少6位'); return }
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
  const [showAuth, setShowAuth] = useState(false)
  const [passwordResetMode, setPasswordResetMode] = useState(false)
  const [justLoggedIn, setJustLoggedIn] = useState(false)
  const syncTimer = useRef<any>(null)

  // GitHub token sync (backward compat)
  useEffect(() => {
    if (hasToken()) {
      initSync((merged) => {
        useStore.setState(merged as any)
      })
    }
  }, [])

  // 监听 auth 事件，执行业务逻辑
  useEffect(() => {
    if (!isSupabaseConfigured() || !lastEvent) return

    // 标记当前标签页"活跃"
    sessionStorage.setItem('tab_active', '1')

    const sb = getSupabase()
    if (!sb) return

    if (lastEvent === 'INITIAL_SESSION') {
      // 检测是否新的浏览器会话（关过浏览器/标签页）
      if (!currentUser) {
        // 没有用户 → 清除本地数据
        localStorage.removeItem('property-manager-data')
        useStore.setState({
          properties: [], rooms: [], tenants: [], bills: [],
          landlordContracts: [], profitRecords: [], trash: [],
        })
      } else if (!sessionStorage.getItem('tab_active')) {
        // 关过浏览器，session 无效
        sb.auth.signOut()
        localStorage.removeItem('property-manager-data')
        useStore.setState({
          properties: [], rooms: [], tenants: [], bills: [],
          landlordContracts: [], profitRecords: [], trash: [],
        })
      } else {
        // 正常会话恢复 → 加载云端数据
        loadCloudData().then(cloudData => {
          if (cloudData) {
            useStore.setState({
              properties: cloudData.properties,
              rooms: cloudData.rooms,
              tenants: cloudData.tenants,
              bills: cloudData.bills,
              landlordContracts: cloudData.landlordContracts,
              profitRecords: cloudData.profitRecords,
              trash: cloudData.trash,
            } as any)
          }
        })
      }
    }

    if (lastEvent === 'SIGNED_IN' && currentUser) {
      setShowAuth(false)

      // 加载云端数据
      loadCloudData().then(cloudData => {
        if (cloudData) {
          useStore.setState({
            properties: cloudData.properties,
            rooms: cloudData.rooms,
            tenants: cloudData.tenants,
            bills: cloudData.bills,
            landlordContracts: cloudData.landlordContracts,
            profitRecords: cloudData.profitRecords,
            trash: cloudData.trash,
          } as any)
        }
      })

      setJustLoggedIn(true)
    }

    if (lastEvent === 'PASSWORD_RECOVERY') {
      setPasswordResetMode(true)
    }

    if (lastEvent === 'SIGNED_OUT') {
      localStorage.removeItem('property-manager-data')
      useStore.setState({
        properties: [], rooms: [], tenants: [], bills: [],
        landlordContracts: [], profitRecords: [], trash: [],
      })
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

  // Auto-save store changes to Supabase (debounced)
  useEffect(() => {
    if (!isSupabaseConfigured() || !authReady || !currentUser) return

    const unsub = useStore.subscribe((state) => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(() => {
        saveCloudData({
          properties: state.properties,
          rooms: state.rooms,
          tenants: state.tenants,
          bills: state.bills,
          landlordContracts: state.landlordContracts,
          profitRecords: state.profitRecords,
          trash: state.trash,
        })
      }, 3000)
    })

    return () => {
      unsub()
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [authReady, currentUser])

  // 未登录 → 显示登录页
  if (isSupabaseConfigured() && authReady && !currentUser) {
    return <LoginPage onLogin={() => {}} />
  }

  // 密码找回模式
  if (passwordResetMode && currentUser) {
    return <PasswordResetPage onComplete={() => { setPasswordResetMode(false); window.location.href = import.meta.env.BASE_URL }} />
  }

  // Auth 未就绪 → 加载中
  if (isSupabaseConfigured() && !authReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <Router basename="/house">
      <div className="min-h-screen">
        <LoginRedirect triggered={justLoggedIn} />
        <StorageWarning />
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
    </Router>
  );
}
