import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { dedupeDisplayIds } from './display-id'
import { pushSyncLog } from './sync-log'
import { getLocalDeletionReceipt, getLocalUnpayReceipt } from './deletion-receipt'

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
  const landlordContracts = Array.isArray(cloudData.landlordContracts) ? cloudData.landlordContracts : []
  const trash = Array.isArray(cloudData.trash) ? cloudData.trash : []
  // 重复合同编号（displayId）修复 —— 规则与成因见 lib/display-id.ts。
  // ⚠️ displayId 只是给人看的标签：全项目没有任何地方按它查找/判等实体（关联一律走 UUID id），
  // 所以这里【只改 displayId 一个字段】，不动任何金额、账单、利润数据。
  const tenantFix = dedupeDisplayIds(tenants as { id: string; displayId?: string; createdAt?: string }[], 'ZL', trash as never[])
  const contractFix = dedupeDisplayIds(landlordContracts as { id: string; displayId?: string; createdAt?: string }[], 'DL', trash as never[])
  if (tenantFix.changed.length || contractFix.changed.length) {
    console.warn('[normalizeCloudData] 检测到重复合同编号，已自动改号（只改编号，不动其他数据）:',
      [...tenantFix.changed, ...contractFix.changed])
  }
  return {
    properties: Array.isArray(cloudData.properties) ? cloudData.properties : [],
    rooms: Array.isArray(cloudData.rooms) ? cloudData.rooms : [],
    tenants: tenantFix.items as never,
    bills,
    landlordContracts: contractFix.items as never,
    profitRecords: Array.isArray(cloudData.profitRecords) ? cloudData.profitRecords : [],
    trash,
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
 * 轻量查询云端最后写入时间（updated_at，DB trigger 服务器时钟）。
 * 供 Excel 导入前「文件是否陈旧」核对用（2026-09-06 导入护栏），不拉整档数据。
 * 返回 ISO 字符串；无行/查询失败返回 null（调用方按「无法核对」处理）。
 */
export async function getCloudUpdatedAt(): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data: { user }, error: userError } = await sb.auth.getUser()
  if (userError || !user) return null
  const { data, error } = await sb
    .from('user_data')
    .select('updated_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !data) return null
  return data.updated_at ? String(data.updated_at) : null
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

// 保存数据到云端（全局串行写锁包装，2026-09-06 并发双写修复·第二阶段）
// ⚠️ saveCloudData 有四个调用方：provider doSave、被踢 best-effort 推送、登录后首传、Excel 导入。
// 全部 upsert 都是整文档「后落库者胜」，并发时旧快照晚落地会覆盖新数据（9-05 事故同型）。
// 这里用模块级 promise 链把所有云端写入串成单队列：落库顺序=发起顺序。
// （队列内数据新鲜度由上游保证：doSave 靠 saving.current 串行 + _pending 用最新状态重发；
//   链锁只负责不同调用方之间不再交错。）
let _cloudWriteChain: Promise<unknown> = Promise.resolve()

export function saveCloudData(syncData: SupabaseData, maxRetries = 1): Promise<boolean> {
  const run = () => saveCloudDataInner(syncData, maxRetries)
  // 上一笔无论成败都排在其后（then(run, run)），队列永不断链
  const next = _cloudWriteChain.then(run, run)
  _cloudWriteChain = next.catch(() => undefined)
  return next
}

// ============================================================================
// 云端写入闸门（2026-10-09 第五次覆盖事故后加，用户选「硬拦」）
//
// 事故回放：某设备带着 10-08 之前的旧本地快照登录，被判为「比云端新」后
// 整档 upsert 覆盖云端 → 林世轮租客 + 6 条续约账单消失，已收 15 元网费被打回逾期。
//
// 根因：applyCloudLoad 只防「云端覆盖本地」，反方向的 doSave 是无条件整档 upsert，
// 不检查内容是否比云端更少。本闸门补上这一侧。
//
// 设计要点：
//   1. 只拦截「有财损风险的缩水」，不拦正常编辑（改金额/改日期/新建都不受影响）
//   2. 合法删除有可识别签名：业务数组变小 **且** trash 变大（useStore 所有删除都入 trash）
//   3. 命中即拒绝推送：不更新摘要、不清 dirty、返回 false（调用方据此跳过自动重试）
//   4. 摘要缓存优先用内存，只在本地计数增长时才回读云端（正常保存零额外请求）
// ============================================================================

/** 云端摘要：用于推送前比对，不保存完整数据，只保存判重所需的最小信息 */
type CloudSummary = {
  counts: Record<string, number>
  ids: Record<string, Set<string>>
  paidBillIds: string[]
  /** 有收款日的账单 id → 收款日（用于检测「已收被打回未收」） */
  paidBillDates: Record<string, string>
  trashCount: number
  at: number
}

const BIZ_ARRAYS = ['properties', 'rooms', 'tenants', 'bills', 'landlordContracts', 'profitRecords'] as const
const SUMMARY_FRESH_MS = 5 * 60 * 1000
let _cloudSummary: CloudSummary | null = null

function summarize(syncData: any): CloudSummary {
  const counts: Record<string, number> = {}
  const ids: Record<string, Set<string>> = {}
  const paidBillDates: Record<string, string> = {}
  for (const k of [...BIZ_ARRAYS, 'trash'] as string[]) {
    const arr = Array.isArray(syncData?.[k]) ? syncData[k] : []
    counts[k] = arr.length
    ids[k] = new Set(arr.map((x: any) => String(x?.id ?? '')))
  }
  for (const b of Array.isArray(syncData?.bills) ? syncData.bills : []) {
    const pd = b?.paidDate
    if (pd && typeof pd === 'string' && pd.trim() !== '') paidBillDates[String(b.id)] = pd
  }
  return { counts, ids, paidBillIds: Object.keys(paidBillDates), paidBillDates, trashCount: counts.trash, at: Date.now() }
}

/** 记录一份新的云端摘要（保存成功 / 云端加载成功后调用） */
export function setCloudSummary(syncData: any): void {
  try {
    _cloudSummary = summarize(syncData)
  } catch (e) {
    console.warn('[cloudGuard] 摘要计算失败，已放弃本次摘要:', e)
    _cloudSummary = null
  }
}

export function clearCloudSummary(): void {
  _cloudSummary = null
}

/**
 * 从云端原文建立闸门基线（2026-10-10 口径统一）。
 * ⚠️ 必须先过 normalizeCloudData：归一化会合法清理（退租租客遗留账单等），
 * 直接拿云端原文当基线，会让随后推送"应用实际持有的数据"时被自己误拦。
 * 基线 = 云端数据在应用内的静止形态（与 applyCloudLoad 落库口径一致）。
 */
export function setCloudSummaryFromCloud(cloudData: any): void {
  let normalized: any = cloudData
  try { normalized = normalizeCloudData(cloudData as SupabaseData) } catch (e) { console.warn('[cloudGuard] 云端数据归一化失败，退回原文作基线:', e) }
  setCloudSummary(normalized)
}

type GateResult = { blocked: true; reason: string; details: string[] } | { blocked: false }

/**
 * 推送前闸门：比对本地待推送数据与云端摘要基线（模块级 _cloudSummary）。
 * 命中任一规则 → 拒绝推送（硬拦，用户 2026-10-09 选定）。
 *
 * ⚠️ 基线来自模块级缓存（由 setCloudSummary / setCloudSummaryFromCloud 维护），
 * 不接受外部传入的第二参数——早期版本有个 `summary` 形参，导致生产调用只传一个参数时
 * `!summary` 恒真、闸门静默失效（已被 push-gate.test.ts 抓出并修复）。
 */
export function checkPushGate(syncData: any): GateResult {
  const summary = _cloudSummary
  if (!summary || !summary.ids) return { blocked: false }

  // ── 合法删除回执（2026-10-10 扩展）──────────────────────────────────────
  // 闸门此前只认「回收站里有 originalId」；但有几类删除是设计上不入回收站的，
  // 会把正常业务操作误判成"记录静默消失"（2026-10-10 审阅：编辑租客合同 / 租客退租 /
  // 业主退租 / 恢复租客 / 恢复业主合同 / 删除利润记录 共 6 条路径全被误拦）。现在三类回执并认：
  //   ① 回收站 originalId（原有）；
  //   ② 退租暂存：terminateTenant / terminateLandlordContract 把删掉的账单存进
  //      tenant.pendingBills / contract.pendingBills（恢复时可原样找回）；
  //   ③ 本机删除回执：编辑租客合同 / 恢复租客 / 恢复业主合同 / 删除利润记录
  //      （src/lib/deletion-receipt.ts，保存成功或云端覆盖本地后清除）。
  const legitDeletedIds = new Set<string>()
  const localTrash: any[] = Array.isArray(syncData?.trash) ? syncData.trash : []
  for (const t of localTrash) {
    const id = String(t?.originalId ?? '')
    if (id && id !== 'undefined') legitDeletedIds.add(id)
  }
  for (const key of ['tenants', 'landlordContracts'] as const) {
    const arr: any[] = Array.isArray(syncData?.[key]) ? syncData[key] : []
    for (const rec of arr) {
      const pend: any[] = Array.isArray(rec?.pendingBills) ? rec.pendingBills : []
      for (const b of pend) {
        const id = String(b?.id ?? '')
        if (id && id !== 'undefined') legitDeletedIds.add(id)
      }
    }
  }
  for (const id of getLocalDeletionReceipt()) legitDeletedIds.add(id)

  // 撤回收款回执（2026-10-10 第 3 项）：本机刚执行过「已收 → 未收/逾期」的账单 id，
  // 规则②对它们放行（只豁免付款回退这一件事，不豁免记录消失/数组缩水）。
  // 陈旧设备没有这张回执 → 「陈旧数据把已收打回未收」照旧被拦（事故场景 B 不受影响）。
  const localUnpayIds = getLocalUnpayReceipt()

  /** 合法删除判定：该 id 有回收站 / 退租暂存 / 本机删除回执之一 */
  const isLegitimatelyDeleted = (id: string) => legitDeletedIds.has(id)

  const hits: { rule: string; detail: string }[] = []
  /** 各数组「被回执解释掉」的缺失 id 数（规则③按 id 精确扣减缩水量用） */
  const explainedByArray: Record<string, number> = {}

  // ── 规则 ①：记录静默消失（本地缺失，且不在任何删除回执里）──────────────
  for (const k of BIZ_ARRAYS) {
    const cloudIds = summary.ids[k]
    if (!cloudIds) continue
    const localArr: any[] = Array.isArray(syncData?.[k]) ? syncData[k] : []
    const localIds = new Set(localArr.map((x: any) => String(x?.id ?? '')))
    let missing = 0
    let explained = 0
    const samples: string[] = []
    for (const id of cloudIds) {
      if (localIds.has(id)) continue
      if (isLegitimatelyDeleted(id)) { explained++; continue } // 正常删除，有回执
      missing++
      if (samples.length < 3) samples.push(id.slice(0, 8))
    }
    explainedByArray[k] = explained
    if (missing > 0) {
      hits.push({
        rule: '记录静默消失',
        detail: `${k} 比云端少 ${missing} 条，且不在本地回收站/删除回执（如 ${samples.join(', ')}）`,
      })
    }
  }

  // ── 规则 ②：已收款账单被打回未收 / 消失 ───────────────────────────────
  const localBills: any[] = Array.isArray(syncData?.bills) ? syncData.bills : []
  const localBillById = new Map(localBills.map((b: any) => [String(b?.id ?? ''), b]))
  let regressed = 0
  const regSamples: string[] = []
  for (const id of summary.paidBillIds) {
    const cloudPaidDate = summary.paidBillDates[id]
    // ⚠️ 必须先判回收站：账单被正常删除时 local 为 undefined，
    // 早期写成 `if (local && isLegitimatelyDeleted(id))` 会因 local 为空而短路，
    // 把「已正确进回收站的删除」误判成财损（已被 push-gate.test.ts 抓出）。
    if (isLegitimatelyDeleted(id)) continue
    if (localUnpayIds.has(id)) continue // 本机刚做过「撤回收款」，属合法回退
    const local = localBillById.get(id)
    const localPaid = local?.paidDate
    const lostPaid = !local || localPaid === undefined || localPaid === null || String(localPaid).trim() === ''
    if (lostPaid) {
      regressed++
      if (regSamples.length < 3) regSamples.push(`${id.slice(0, 8)}(云端收款日 ${cloudPaidDate})`)
    }
  }
  if (regressed > 0) {
    hits.push({
      rule: '已收款记录被退回',
      detail: `云端有 ${regressed} 条已收款账单在本地变成「未收款或不存在」（如 ${regSamples.join(', ')}）`,
    })
  }

  // ── 规则 ③：数组缩水，但超出所有删除回执能解释的范围（兜底）────────────
  // 2026-10-10 改为按 id 精确扣减：旧实现只比较 trash 条数增量——退租暂存 / 本机回执
  // 都不增加 trash（会误报），而"删完顺手清空回收站"又会击穿旧补偿算法。
  // 语义：净缩水条数 > 被回执解释的缺失条数 → 还有缩水说不清来历 → 拦。
  let shrinkTotal = 0
  let explainedTotal = 0
  const shrinkDetail: string[] = []
  for (const k of BIZ_ARRAYS) {
    explainedTotal += explainedByArray[k] ?? 0
    const d = (summary.counts[k] ?? 0) - (Array.isArray(syncData?.[k]) ? syncData[k].length : 0)
    if (d > 0) {
      shrinkTotal += d
      shrinkDetail.push(`${k} -${d}`)
    }
  }
  if (shrinkTotal > explainedTotal) {
    hits.push({
      rule: '数组缩水无合法删除解释',
      detail: `${shrinkDetail.join('、')}；回收站/删除回执只解释了其中 ${explainedTotal} 条`,
    })
  }

  if (!hits.length) return { blocked: false }

  const details = hits.map((h) => `${h.rule}：${h.detail}`)
  const reason = `检测到本地数据可能比云端更旧（${hits.map((h) => h.rule).join('；')}），已阻止本次上传以免覆盖云端`
  pushSyncLog('push_gate_blocked', `${reason} ｜ ${details.join(' ｜ ')}`)
  // 摘要可能已陈旧或不一致 → 作废，下次保存会回读云端重建基线
  _cloudSummary = null
  return { blocked: true, reason, details }
}

/** 供 doSave 判定：本次失败是否为闸门拦截（闸门拦截不应触发 10 秒自动重试） */
export class PushGateBlockedError extends Error {
  readonly details: string[]
  constructor(reason: string, details: string[]) {
    super(reason)
    this.name = 'PushGateBlockedError'
    this.details = details
  }
}

// ── 本地快照兜底（2026-10-09 加）─────────────────────────────────────────────
// L1/L2（user_data_history / daily_snapshots）都在同一个 Supabase 项目里，
// 项目一旦不可用则两者同时失效。这里在保存成功后另存一份到本机 localStorage，
// 作为「不依赖云端」的最后一道兜底。只在距上次快照 >3 分钟时写，避免频繁 IO。
export const LOCAL_SNAPSHOT_KEY = 'property-manager-snapshot'
const SNAPSHOT_MIN_INTERVAL_MS = 3 * 60 * 1000

export function writeLocalSnapshot(syncData: any): void {
  try {
    const cur = localStorage.getItem(LOCAL_SNAPSHOT_KEY)
    if (cur) {
      const parsed = JSON.parse(cur)
      const lastAt = Number(parsed?.savedAt) || 0
      if (Date.now() - lastAt < SNAPSHOT_MIN_INTERVAL_MS) return
    }
    const payload = JSON.stringify({ savedAt: Date.now(), data: syncData })
    localStorage.setItem(LOCAL_SNAPSHOT_KEY, payload)
    pushSyncLog('local_snapshot_ok', `本地快照已更新（${Math.round(payload.length / 1024)} KB）`)
  } catch (e) {
    // 配额不足/隐私模式：静默降级，绝不能影响正常保存
    pushSyncLog('local_snapshot_fail', `本地快照写入失败（忽略）：${(e as Error)?.message || e}`)
  }
}

export function readLocalSnapshot(): { savedAt: number; data: any } | null {
  try {
    const cur = localStorage.getItem(LOCAL_SNAPSHOT_KEY)
    return cur ? JSON.parse(cur) : null
  } catch {
    return null
  }
}

// 实际保存实现（仅供 saveCloudData 链内调用，勿直接使用）
// maxRetries 默认 1：getUser 内部（auth-js）对 AuthRetryableFetchError 已有指数退避重试，
// 外层再重试会放大最坏耗时，故只保留 1 次尝试（2026-09-05 Oracle 审查修复）。
async function saveCloudDataInner(syncData: SupabaseData, maxRetries = 1): Promise<boolean> {
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

  // 写入者归因（2026-10-09 事故后加）：把本设备的会话 token 一并写入，
  // 归档触发器会把它记进 user_data_history.writer / writer_next，
  // 这样「某次覆盖是哪台设备干的」可直接查证，不必再靠时间戳反推。
  let lastWriter: string | null = null
  try { lastWriter = localStorage.getItem('device_session_token') } catch { /* SSR/隐私模式忽略 */ }

  // ── 推送前闸门（2026-10-09 事故后加）────────────────────────────────────
  // 摘要可能缺失或过期（>5 分钟）→ 回读一次云端重建基线；否则纯内存比对，零额外请求。
  const summaryStale = !_cloudSummary || Date.now() - _cloudSummary.at > SUMMARY_FRESH_MS
  if (summaryStale) {
    try {
      const { data: cur } = await sb.from('user_data').select('data').eq('user_id', user.id).maybeSingle()
      // 云端原文先归一化再当基线（2026-10-10 口径统一，与加载路径一致；
      // 归一化会合法清理退租遗留账单等，用原文会自我误拦）
      if (cur?.data) setCloudSummaryFromCloud(cur.data as SupabaseData)
    } catch (e) {
      console.warn('[cloudGuard] 回读云端摘要失败，本次跳过闸门:', e)
    }
  }
  const gate = checkPushGate(syncData)
  if (gate.blocked) {
    console.error('[cloudGuard] 已阻止本次上传：', gate.details)
    throw new PushGateBlockedError(gate.reason, gate.details)
  }

  const { data, error } = await sb
    .from('user_data')
    .upsert({
      user_id: user.id,
      data: syncData,
      updated_at: new Date().toISOString(),
      last_writer: lastWriter,
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

  // 保存成功 → 刷新云端摘要基线（闸门下次比对用），并写一份本地快照兜底
  setCloudSummary(syncData)
  writeLocalSnapshot(syncData)

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

/**
 * 加载窗口判定（2026-09-24 同步覆盖缺陷修复 Layer 2）：
 * 在「本次云端加载发起之后」被打上的 dirty 标记，只可能描述对加载前（可能陈旧）数据的改写，
 * 不代表本地持有比云端更新的持久改动 → 不得据此阻止云端覆盖
 * （产品规则：加载完成前的操作以云端为准，加载约 1-2 秒后云端数据会覆盖本地）。
 * 返回 true = 该标记落在本次加载窗口内，判定 kept-local 时应忽略它。
 * 无标记 / 无加载起点 / 无法解析 → 返回 false（保守沿用既有的未同步保护，不误删上一会话遗留的真实改动）。
 */
export function isDirtyStampedDuringLoad(dirtyAt: string | null, loadStartedAt: number): boolean {
  if (!dirtyAt || !loadStartedAt) return false
  const ms = Date.parse(dirtyAt)
  return Number.isFinite(ms) && ms >= loadStartedAt
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

