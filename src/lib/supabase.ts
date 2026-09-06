import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

// ⏱️ 网络请求超时（2026-09-05 同步可靠性修复）
// 此前所有请求无超时：请求挂起 → saving.current/_loading 卡死 → 后续保存被静默吞掉（9-04 事故根因）。
// 通过 createClient 的 global.fetch 包装，所有经 supabase client 的请求（含认证/设备锁/数据读写）
// 超时后 AbortController.abort() → fetch reject → 走现有失败链（红横幅 + 10s 重试 + 拦截操作）。
const FETCH_TIMEOUT_MS = 20000

function createTimeoutFetch(): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const signal = init?.signal
    if (signal) {
      // 尊重调用方传入的 signal（supabase-js 可能自带取消）
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', () => controller.abort())
    }
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
  }
}

function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  // 凭据只从环境变量读取（.env），不再内置硬编码回退
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key, { global: { fetch: createTimeoutFetch() } })
  return _supabase
}

export { getSupabase }

export function isSupabaseConfigured() {
  return !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY
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

// 退出（local scope：只登出本设备会话，不吊销其他设备的 refresh token。
// 全局登出会连坐另一台已登录设备，是"互踢循环"的根源之一）
export async function signOut() {
  const sb = getSupabase()
  if (!sb) return { error: new Error('Supabase 未配置') }
  const { error } = await sb.auth.signOut({ scope: 'local' })
  return { error }
}

// 忘记密码
export async function resetPassword(email: string) {
  const sb = getSupabase()
  if (!sb) return { error: new Error('Supabase 未配置') }
  // 使用当前域名 + base path，确保链接能正确跳回应用
  // 如 https://briamcorge.github.io/house/
  const redirectTo = window.location.origin + import.meta.env.BASE_URL
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
  return { error }
}

// 更新密码（密码找回后使用）
export async function updatePassword(newPassword: string) {
  const sb = getSupabase()
  if (!sb) return { error: new Error('Supabase 未配置') }
  const { error } = await sb.auth.updateUser({ password: newPassword })
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

export type CloudDataResult = {
  data: SupabaseData
  updatedAt: string | null
}

// 加载云端数据
export async function loadCloudData(): Promise<CloudDataResult | null> {  const sb = getSupabase()
  if (!sb) {
    console.error('[loadCloudData] Supabase 未配置')
    return null
  }

  const { data: { user }, error: userError } = await sb.auth.getUser()
  if (userError || !user) {
    console.error('[loadCloudData] 用户未登录:', userError || 'user is null')
    return null
  }

  console.log('[loadCloudData] 开始加载用户数据:', user.id)

  const { data, error } = await sb
    .from('user_data')
    .select('data, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()  // 使用 maybeSingle 代替 single，0 行时返回 null 而不是报错

  if (error) {
    console.error('[loadCloudData] 加载失败:', error)
    console.error('[loadCloudData] 错误详情:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    return null
  }
  
  if (!data) {
    console.log('[loadCloudData] 云端无数据 (data is null)')
    return null
  }

  console.log('[loadCloudData] 原始响应:', {
    hasData: !!data.data,
    dataType: typeof data.data,
    updated_at: data.updated_at,
  })

  const cloudData = data.data as SupabaseData
  
  // 验证数据结构
  if (!cloudData || typeof cloudData !== 'object') {
    console.error('[loadCloudData] 数据格式错误:', cloudData)
    return null
  }

  console.log('[loadCloudData] 加载成功:', {
    properties: cloudData.properties?.length || 0,
    rooms: cloudData.rooms?.length || 0,
    tenants: cloudData.tenants?.length || 0,
    bills: cloudData.bills?.length || 0,
    landlordContracts: cloudData.landlordContracts?.length || 0,
    profitRecords: cloudData.profitRecords?.length || 0,
    trash: cloudData.trash?.length || 0,
  })
  
  return { data: cloudData, updatedAt: data.updated_at || null }
}

/**
 * 云端数据修复：已退租租客的未付遗留账单 + 补 periodStart/periodEnd + effectiveEnd + landlordContractId。
 * 云端数据可能缺失这些字段（旧版本写入），加载时统一修复。
 */
export function normalizeCloudData(cloudData: SupabaseData): SupabaseData {
  // 防御：云端数据字段可能缺失或类型异常（被污染/损坏），一律降级为空数组，
  // 避免后续 .filter/.map 对非数组抛 TypeError 导致启动崩溃（2026-09-06 M5 加固）
  let tenants = Array.isArray(cloudData.tenants) ? cloudData.tenants : []
  let bills = Array.isArray(cloudData.bills) ? cloudData.bills : []
  if (tenants && bills) {
    // ⚠️ 只删除"退租(checkout)"租客的 pending 正数账单（退租没清理的遗留）。
    // 续约(renew)租客的未付账单必须保留（2026-09-03 用户确认：续约后旧合同未付账单依然有效，继续收款）。
    // endReason 为空（旧数据无法确认）时保守不删——删除不可逆，宁可多显示未收，也不误删续约账单。
    const checkoutIds = new Set(
      tenants.filter((t: any) => t.status === 'ended' && t.endReason === 'checkout').map((t: any) => t.id)
    )
    const filteredBills = bills.filter((b: any) =>
      !(checkoutIds.has(b.tenantId) && b.amount > 0 && b.status === 'pending' && b.direction === 'receivable')
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
    // 给旧应付账单补 landlordContractId（按 propertyId + dueDate 落在合同日期范围内匹配）
    const contracts = cloudData.landlordContracts || []
    bills = bills.map((b: any) => {
      if (b.direction !== 'payable' || b.landlordContractId) return b
      const c = contracts.find((c: any) =>
        String(c.propertyId) === String(b.propertyId) &&
        String(b.dueDate || '') >= String(c.contractStart || '') &&
        String(b.dueDate || '') <= String(c.contractEnd || '')
      )
      return c ? { ...b, landlordContractId: c.id } : b
    })
  }
  return {
    properties: Array.isArray(cloudData.properties) ? cloudData.properties : [],
    rooms: Array.isArray(cloudData.rooms) ? cloudData.rooms : [],
    tenants,
    bills,
    landlordContracts: Array.isArray(cloudData.landlordContracts) ? cloudData.landlordContracts : [],
    profitRecords: Array.isArray(cloudData.profitRecords) ? cloudData.profitRecords : [],
    trash: Array.isArray(cloudData.trash) ? cloudData.trash : [],
  }
}

/**
 * 检查云端是否有该用户的数据。
 * 返回 true/false；查询失败（网络错误等）返回 null，调用方应避免据此覆盖任何一方。
 */
export async function hasCloudData(): Promise<boolean | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data: { user }, error: userError } = await sb.auth.getUser()
  if (userError || !user) return null
  const { data, error } = await sb
    .from('user_data')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return null
  return !!data
}

/**
 * 获取当前登录用户是否被停用（登录后调用，用于阻止被停用用户使用）。
 * 返回 true 表示 disabled === true；行不存在 / 查询出错 / 未登录一律返回 false。
 * 永不抛异常。
 */
export async function getUserDisabledStatus(): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { data: { user }, error: userError } = await sb.auth.getUser()
  if (userError || !user) return false
  const { data, error } = await sb
    .from('user_data')
    .select('disabled')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !data) return false
  return data.disabled === true
}

// 更新最后活跃时间（登录后调用，供 Admin 页展示"最后活跃"）。
// 失败静默（不影响主流程），SECURITY DEFINER 函数内部 update_last_active 已 set search_path。
export async function updateLastActive(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  try {
    await sb.rpc('update_last_active')
  } catch (e) {
    console.warn('[updateLastActive] 更新最后活跃时间失败（忽略）:', e)
  }
}

// 保存数据到云端
// maxRetries 默认 1：getUser 内部（auth-js）对 AuthRetryableFetchError 已有指数退避重试，
// 外层再重试会放大最坏耗时（3 次 × 20s 超时 = 60s+，超过 doSave 的 30s watchdog），
// 故外层只保留 1 次尝试（2026-09-05 Oracle 审查修复）。
export async function saveCloudData(syncData: SupabaseData, maxRetries = 1): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) {
    console.error('[saveCloudData] Supabase 未配置')
    return false
  }

  // 重试机制：等待 session 恢复（特别是页面刷新后）
  let user: any = null
  let userError: any = null
  
  for (let i = 0; i < maxRetries; i++) {
    const result = await sb.auth.getUser()
    user = result.data?.user
    userError = result.error
    
    if (user) break
    
    console.warn(`[saveCloudData] 第 ${i + 1} 次尝试获取用户失败，等待 500ms...`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  if (userError || !user) {
    console.error('[saveCloudData] 用户未登录（重试后仍失败）:', userError || 'user is null')
    // ⚠️ session 已过期/无效（Auth 类错误或 401/403）：通知 UI 提示重新登录，
    // 避免用户陷入「保存永远失败却不知道为什么」的无提示循环。
    // ⚠️ 2026-09-05 Oracle 审查修复：不得用 /auth/i 模糊匹配——
    // 超时(AbortError)会被 auth-js 包装为 AuthRetryableFetchError（name 含 "Auth"），
    // 模糊匹配会把「网络超时」误判为「登录已过期」→ 误踢用户回登录页。
    // 只认明确的认证错误类型（AuthApiError/AuthSessionMissingError/AuthInvalidJwtError）或 401/403。
    const isAuthError = !!userError && (
      (typeof (userError as any).status === 'number' && ((userError as any).status === 401 || (userError as any).status === 403)) ||
      (typeof (userError as any).name === 'string' && ['AuthApiError', 'AuthSessionMissingError', 'AuthInvalidJwtError', 'AuthUnknownError'].includes((userError as any).name)) ||
      (typeof (userError as any).message === 'string' && /session|token|jwt|not found|invalid/i.test((userError as any).message))
    )
    if (isAuthError) {
      window.dispatchEvent(new CustomEvent('auth-session-expired'))
    }
    return false
  }

  console.log('[saveCloudData] 开始保存用户数据:', user.id, {
    properties: syncData.properties.length,
    rooms: syncData.rooms.length,
    tenants: syncData.tenants.length,
    bills: syncData.bills.length,
  })

  const { data, error } = await sb
    .from('user_data')
    .upsert({
      user_id: user.id,
      data: syncData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('[saveCloudData] 保存失败:', error)
    return false
  }

  console.log('[saveCloudData] 保存成功:', data)
  
  // 验证：立即读取刚保存的数据
  console.log('[saveCloudData] 验证保存结果...')
  const { data: verifyData, error: verifyError } = await sb
    .from('user_data')
    .select('data, updated_at')
    .eq('user_id', user.id)
    .single()
  
  if (verifyError) {
    console.error('[saveCloudData] 验证失败:', verifyError)
    return false
  }
  
  if (verifyData) {
    const savedData = verifyData.data as SupabaseData
    console.log('[saveCloudData] ✅ 验证成功:', {
      properties: savedData.properties.length,
      rooms: savedData.rooms.length,
      tenants: savedData.tenants.length,
      bills: savedData.bills.length,
      updated_at: verifyData.updated_at,
    })
  }
  
  return true
}

// ========== 本地未同步数据标记（2026-09-03 修复；2026-09-06 A1 语义修正） ==========
// 每次业务操作写入时间戳（useStore 的 set 包装，覆盖崩溃/掉电窗口）；
// 保存成功后立即清除（cloud-sync-context doSave ok 分支），云端覆盖本地成功后也清除。
// 标记语义 = 「存在尚未确认同步到云端的本地改动」。
// 旧语义「每次操作都打、保存成功也不清」是 9-05 网页版用陈旧本地覆盖云端新数据的根因
// （陈旧设备带着永不过期的标记，把自己的旧整文档冒充"比云端新"推上云）。
// 加载时若标记比云端 updated_at 新 → 禁止云端旧数据覆盖本地（保留本地并推云），
// 这是 8-28 / 9-03 两次事故（云端旧覆盖本地新）的放大器修复。
export const LOCAL_DIRTY_KEY = 'property-manager-dirty-at'

export function getLocalDirtyAt(): string | null {
  try { return localStorage.getItem(LOCAL_DIRTY_KEY) } catch { return null }
}

export function setLocalDirtyAt() {
  try { localStorage.setItem(LOCAL_DIRTY_KEY, new Date().toISOString()) } catch { /* ignore */ }
}

export function clearLocalDirty() {
  try { localStorage.removeItem(LOCAL_DIRTY_KEY) } catch { /* ignore */ }
}

/**
 * 跨设备时间比较（2026-09-06 事故修复 A4）：
 * dirtyAt 与云端 updated_at 均为 ISO 字符串但格式不对称（本地 '…xxx.123Z'，
 * PostgREST 常返回 '…xxx.123456+00:00' 或 'Z'），字典序比较会把近值一律判为「本地新」，
 * 导致陈旧本地被误认为比云端新而推云覆盖。这里一律先解析为 epoch 毫秒再比，
 * 解析失败才退回字符串比较。返回 true = 本地存在比云端更新的未同步改动。
 */
export function isLocalNewerThanCloud(dirtyAt: string | null, cloudUpdatedAt: string | null): boolean {
  if (!dirtyAt || !cloudUpdatedAt) return false
  const d = Date.parse(dirtyAt)
  const c = Date.parse(cloudUpdatedAt)
  if (!Number.isNaN(d) && !Number.isNaN(c)) return d > c
  return dirtyAt > cloudUpdatedAt
}

// ========== 管理员功能 ==========

// 检查指定用户是否是管理员（先 RPC 绕过 RLS，失败则直查表）
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  // RPC 函数有 SECURITY DEFINER，绕过 RLS
  const { data, error } = await sb.rpc('is_admin')
  if (!error) return !!data
  // 备用：直查表
  const { data: row } = await sb
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!row
}

// 获取所有用户数据（仅管理员可调用）
export async function getAllUserData(): Promise<{ user_id: string; email: string; data: any; updated_at: string; last_active_at: string | null; disabled: boolean }[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_all_user_data')
  if (error) return []
  return data as any[]
}

// 管理员停用/启用用户
export async function setUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { error } = await sb.rpc('set_user_disabled', { target_user_id: userId, is_disabled: disabled })
  return !error
}

