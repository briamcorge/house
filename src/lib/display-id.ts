// ─── displayId（合同编号）去重 ─────────────────────────────────────────
// 背景：nextDisplayId 在 2026-08-09（提交 0a16ef2）之前只扫描 state.tenants、不扫回收站 →
// 「删除当时编号最大的租客 → 再新建（复用该编号）→ 从回收站恢复那个租客」就会产生重复编号。
// 该类重复不会自行消失，而且会随 Excel 导出/导入（备份恢复）一直传播下去。
//
// ⚠️ displayId 只是给人看的标签：全项目没有任何地方按它查找或判等实体（关联一律走 UUID `id`），
// 所以这里【只改 displayId 一个字段】，不影响房租、账单、利润提取等任何数据。
//
// 规则（确定性，保证多台设备算出同一结果、且重复执行幂等）：
//   1. 同一编号有多条时，保留 createdAt 最早的那条（并列时取 id 字典序小的）
//   2. 其余按顺序改成「当前已占用的最大号 + 1、+2 …」
//      「已占用」包含回收站里可恢复的同类型条目（否则恢复时会再次撞号）

import { TrashItem } from '../types'

type HasDisplayId = { id: string; displayId?: string; createdAt?: string }

/** 该前缀（ZL / DL）当前已占用的最大编号，含回收站里可恢复的同类型条目 */
function maxDisplayNum(prefix: 'ZL' | 'DL', items: HasDisplayId[], trash: TrashItem[]): number {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  const trashType = prefix === 'ZL' ? 'tenant' : 'landlord_contract'
  let max = 0
  const scan = (v: unknown) => {
    if (typeof v !== 'string') return
    const m = v.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  for (const it of items) scan(it.displayId)
  for (const t of trash) {
    if (t.type !== trashType) continue
    // ⚠️ 防御历史脏数据：trash 条目 data 可能缺失/非对象
    const data = t.data as { displayId?: unknown } | null | undefined
    if (data && typeof data === 'object') scan(data.displayId)
  }
  return max
}

/**
 * 把重复的 displayId 改成下一个空闲编号。
 * 无重复时原样返回（同一数组引用，调用方可据此判断"无需处理"）。
 * 有重复时返回新数组，且**只替换 displayId 一个字段**，其余字段原样带过。
 */
export function dedupeDisplayIds<T extends HasDisplayId>(
  items: T[],
  prefix: 'ZL' | 'DL',
  trash: TrashItem[],
): { items: T[]; changed: Array<{ id: string; from: string; to: string }> } {
  const groups = new Map<string, T[]>()
  for (const it of items) {
    const key = String(it.displayId ?? '')
    if (!key) continue
    const g = groups.get(key)
    if (g) g.push(it)
    else groups.set(key, [it])
  }

  let next = maxDisplayNum(prefix, items, trash)
  const patch = new Map<string, string>()
  const changed: Array<{ id: string; from: string; to: string }> = []

  for (const [displayId, list] of groups) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => {
      const ca = String(a.createdAt ?? '')
      const cb = String(b.createdAt ?? '')
      return ca === cb ? String(a.id).localeCompare(String(b.id)) : ca.localeCompare(cb)
    })
    for (const loser of sorted.slice(1)) {
      next += 1
      const to = `${prefix}-${String(next).padStart(4, '0')}`
      patch.set(loser.id, to)
      changed.push({ id: loser.id, from: displayId, to })
    }
  }

  if (patch.size === 0) return { items, changed }
  return {
    items: items.map((it) => {
      const to = patch.get(it.id)
      return to ? ({ ...it, displayId: to } as T) : it
    }),
    changed,
  }
}
