import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getSupabase, isSupabaseConfigured } from './supabase'

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
      }
    })

    return () => { subscription.unsubscribe() }
  }, [])

  return (
    <AuthContext.Provider value={{ user, ready, lastEvent }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
