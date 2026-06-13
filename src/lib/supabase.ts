import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url = import.meta.env.VITE_SUPABASE_URL || 'https://jvpkqqnfzkkcztkbzpdx.supabase.co'
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2cGtxcW5memtrY3p0a2J6cGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTUzNDEsImV4cCI6MjA5NjY3MTM0MX0.qUyyUzdD9EZE2iYvfGl0NMQOEZaRaUoKPjkq7ZtS9P0'
  _supabase = createClient(url, key)
  return _supabase
}

export { getSupabase }

export function isSupabaseConfigured() {
  return true
}

export type SupabaseData = {
  properties: any[]
  rooms: any[]
  tenants: any[]
  bills: any[]
  landlordContracts: any[]
  profitRecords: any[]
  trash: any[]
}

// 登录
export async function signIn(email: string, password: string) {
  const sb = getSupabase()
  if (!sb) return { data: null, error: new Error('Supabase 未配置') }
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  return { data, error }
}

// 注册
export async function signUp(email: string, password: string, name?: string, phone?: string) {
  const sb = getSupabase()
  if (!sb) return { data: null, error: new Error('Supabase 未配置') }
  const { data, error } = await sb.auth.signUp({ 
    email, 
    password,
    options: { data: { name: name || '', phone: phone || '' } }
  })
  return { data, error }
}

// 退出
export async function signOut() {
  const sb = getSupabase()
  if (!sb) return { error: new Error('Supabase 未配置') }
  const { error } = await sb.auth.signOut()
  return { error }
}

// 忘记密码
export async function resetPassword(email: string) {
  const sb = getSupabase()
  if (!sb) return { error: new Error('Supabase 未配置') }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + import.meta.env.BASE_URL,
  })
  return { error }
}

// 获取当前用户
export function getCurrentUser() {
  const sb = getSupabase()
  if (!sb) return { data: { user: null }, error: null } as any
  return sb.auth.getUser()
}

// 监听登录状态变化
export function onAuthChange(callback: (user: any) => void) {
  const sb = getSupabase()
  if (!sb) return { data: { subscription: { unsubscribe: () => {} } } } as any
  return sb.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null)
  })
}

// 加载云端数据
export async function loadCloudData(): Promise<SupabaseData | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data, error } = await sb
    .from('user_data')
    .select('data')
    .eq('user_id', user.id)
    .single()

  if (error || !data) return null
  return data.data as SupabaseData
}

// 保存数据到云端
export async function saveCloudData(syncData: SupabaseData): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false

  const { error } = await sb
    .from('user_data')
    .upsert({
      user_id: user.id,
      data: syncData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  return !error
}

// ========== 管理员功能 ==========

// 检查指定用户是否是管理员（直接查表，传入 user_id）
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { data, error } = await sb
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .single()
  if (error) return false
  return !!data
}

// 获取所有用户数据（仅管理员可调用）
export async function getAllUserData(): Promise<{ user_id: string; email: string; data: any; updated_at: string }[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_all_user_data')
  if (error) return []
  return data as any[]
}
