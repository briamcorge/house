import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

export { getSupabase }

export function isSupabaseConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return !!url && !!key
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
export async function signUp(email: string, password: string) {
  const sb = getSupabase()
  if (!sb) return { data: null, error: new Error('Supabase 未配置') }
  const { data, error } = await sb.auth.signUp({ email, password })
  return { data, error }
}

// 退出
export async function signOut() {
  const sb = getSupabase()
  if (!sb) return { error: new Error('Supabase 未配置') }
  const { error } = await sb.auth.signOut()
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
