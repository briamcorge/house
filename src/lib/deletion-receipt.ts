// ========== 本机删除回执（2026-10-10 写入闸门误伤修复） ==========
// 有些合法删除设计上不进回收站（编辑租客合同 / 恢复租客 / 恢复业主合同 / 删除利润记录），
// 而推送闸门的"合法删除"豁免此前只认回收站（trash.originalId）→ 这些操作后的第一次
// 保存会被误拦成「记录静默消失」（2026-10-10 审阅发现，见 zcode测试/push-gate-deletions.test.ts）。
//
// 本模块把「非回收站删除」的 id 登记在本机 localStorage，闸门（checkPushGate）把它与
// 回收站、退租暂存（pendingBills）同等视为**合法删除回执**。
//
// 生命周期（与 dirty 标记同节奏，见 cloud-sync-context.tsx）：
//   删除时登记 → 保存成功 / 云端覆盖本地后清除。
// 陈旧回执天然无害：条目对应的删除一旦成功入云，云端也不再有这些 id，闸门规则①不会再问。
//
// 仅存本机，不上云、不进 Zustand persist；读写失败一律静默（同 sync-log.ts 模式）。

const KEY = 'property-manager-deleted-ids'
const MAX_RECEIPT = 2000

/** 登记一批被删除的 id（去重；超过上限只保留最近的） */
export function recordLocalDeletions(ids: (string | undefined | null)[]) {
  try {
    const clean = ids.filter((x): x is string => typeof x === 'string' && x !== '')
    if (!clean.length) return
    const raw = localStorage.getItem(KEY)
    const list: string[] = raw ? JSON.parse(raw) : []
    const set = new Set(Array.isArray(list) ? list : [])
    for (const id of clean) set.add(id)
    localStorage.setItem(KEY, JSON.stringify(Array.from(set).slice(-MAX_RECEIPT)))
  } catch { /* 回执写入失败不影响主流程（闸门会退化为旧行为：拦下并要求人工处理） */ }
}

/** 读取当前回执（闸门用） */
export function getLocalDeletionReceipt(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.map(String) : [])
  } catch {
    return new Set()
  }
}

/** 清除回执（保存成功 / 云端覆盖本地后调用） */
export function clearLocalDeletionReceipt() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
