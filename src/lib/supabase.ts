import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function isSupabaseConfigured() {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

// 注册
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { data, error }
}

// 退出
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// 获取当前用户
export function getCurrentUser() {
  return supabase.auth.getUser()
}

// 监听登录状态变化
export function onAuthChange(callback: (user: any) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null)
  })
}

// 加载云端数据
export async function loadCloudData(): Promise<SupabaseData | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_data')
    .select('data')
    .eq('user_id', user.id)
    .single()

  if (error || !data) return null
  return data.data as SupabaseData
}

// 保存数据到云端
export async function saveCloudData(syncData: SupabaseData): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('user_data')
    .upsert({
      user_id: user.id,
      data: syncData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  return !error
}
