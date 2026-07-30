import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getSupabase, isSupabaseConfigured, updateLastActive } from './supabase'

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED' | 'USER_UPDATED'

interface AuthContextValue {
  user: any | null
  ready: boolean
  /** 最近一次 auth 事件，App.tsx 中用来触发数据加载等副作用 */
  lastEvent: AuthEvent | null
}

const AuthContext = createContext<AuthContextValue>({ user: null, ready: false, lastEvent: null })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [ready, setReady] = useState(false)
  const [lastEvent, setLastEvent] = useState<AuthEvent | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true)
      return
    }

    const sb = getSupabase()
    if (!sb) { setReady(true); return }

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      const ev = event as AuthEvent
      setUser(session?.user || null)
      setLastEvent(ev)

      if (ev === 'INITIAL_SESSION') {
        setReady(true)
        if (session?.user) {
          updateLastActive()
        }
      }
      if (ev === 'SIGNED_IN') {
        updateLastActive()
      }
    })

    return () => { subscription.unsubscribe() }
  }, [])

  // 用户在线时每5分钟更新一次最后活跃时间
  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => updateLastActive(), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, ready, lastEvent }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
