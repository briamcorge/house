// ========== 本机回执：删除回执 / 撤回收款回执（2026-10-10 写入闸门误伤修复） ==========
// 两类「有意、但数据本身看不出意图」的操作，推送闸门（checkPushGate）需要本机回执才敢放行：
//   ① 删除回执：编辑租客合同 / 恢复租客 / 恢复业主合同 / 删除利润记录 会删除记录且**不进回收站**；
//   ② 撤回收款回执：已收账单被改回未收/逾期（BillModal 状态切换，UI 上唯一的撤回收款入口）
//      会让付款状态"回退"，与「陈旧设备把已收打回未收」在数据上无法区分。
// 回执只写在本机 localStorage：陈旧设备天然没有回执 → 不会因此被放行（这正是安全性来源）。
//
// 生命周期（与 dirty 标记同节奏，见 cloud-sync-context.tsx）：
//   删除 / 撤销时登记 → 保存成功 / 云端覆盖本地 后清除（clearAllLocalReceipts）。
// 陈旧回执天然无害：条目对应的改动一旦成功入云，云端与本地已一致，闸门不会再问。
//
// 仅存本机，不上云、不进 Zustand persist；读写失败一律静默（同 sync-log.ts 模式）。

const DELETED_KEY = 'property-manager-deleted-ids' // 删除回执
const UNPAID_KEY = 'property-manager-unpaid-ids'   // 撤回收款回执
const MAX_RECEIPT = 2000

function recordIds(key: string, ids: (string | undefined | null)[]) {
  try {
    const clean = ids.filter((x): x is string => typeof x === 'string' && x !== '')
    if (!clean.length) return
    const raw = localStorage.getItem(key)
    const list: string[] = raw ? JSON.parse(raw) : []
    const set = new Set(Array.isArray(list) ? list : [])
    for (const id of clean) set.add(id)
    localStorage.setItem(key, JSON.stringify(Array.from(set).slice(-MAX_RECEIPT)))
  } catch { /* 回执写入失败不影响主流程（闸门会退化为旧行为：拦下并要求人工处理） */ }
}

function readIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.map(String) : [])
  } catch {
    return new Set()
  }
}

function clearKey(key: string) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

/** 登记一批被删除的 id（去重；超过上限只保留最近的） */
export function recordLocalDeletions(ids: (string | undefined | null)[]) { recordIds(DELETED_KEY, ids) }

/** 读取删除回执（闸门规则①③用） */
export function getLocalDeletionReceipt(): Set<string> { return readIds(DELETED_KEY) }

export function clearLocalDeletionReceipt() { clearKey(DELETED_KEY) }

/** 登记一次「撤回收款」（已收 → 未收/逾期）的账单 id */
export function recordLocalUnpay(id: string) { recordIds(UNPAID_KEY, [id]) }

/** 读取撤回收款回执（闸门规则②用） */
export function getLocalUnpayReceipt(): Set<string> { return readIds(UNPAID_KEY) }

export function clearLocalUnpayReceipt() { clearKey(UNPAID_KEY) }

/** 清除全部回执（保存成功 / 云端覆盖本地 / 「以云端为准」逃生口调用） */
export function clearAllLocalReceipts() {
  clearLocalDeletionReceipt()
  clearLocalUnpayReceipt()
}
