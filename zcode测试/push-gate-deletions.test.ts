import { describe, it, expect, beforeEach, vi } from 'vitest'

// ⚠️ 必须在任何模块（尤其 zustand persist / 删除回执模块）加载前装好 localStorage 桩。
// vi.hoisted 的回调先于本文件所有 import 执行（vitest 的既有机制）。
// ⚠️ 不能"存在就跳过"：本机 Node 自带一个不可用的 localStorage（--localstorage-file 无有效路径，
// setItem 无效），跳过会让 persist 与删除回执全部失效 → 无条件覆盖为内存桩。
vi.hoisted(() => {
  const m = new Map<string, string>()
  const stub = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size },
  }
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true })
  } catch {
    try { (globalThis as any).localStorage = stub } catch { /* ignore */ }
  }
})

import { checkPushGate, setCloudSummary, setCloudSummaryFromCloud } from '../src/lib/supabase'
import { useStore } from '../src/store/useStore'
import { clearLocalDeletionReceipt, getLocalDeletionReceipt, recordLocalDeletions } from '../src/lib/deletion-receipt'

// ============================================================================
// 推送闸门 × 合法删除路径（2026-10-10 误伤修复）
//
// 背景：闸门原先只认「回收站里有 originalId」为合法删除；但 6 条合法路径不入回收站，
// 会被误拦成「记录静默消失」。修复后闸门并认三类回执：回收站 / 退租暂存(pendingBills) /
// 本机删除回执(deletion-receipt)。本文件用**真实 store 动作 + 真实 checkPushGate** 逐条验证，
// 并锁定基线口径（云端原文必须先归一化）与回执生命周期。
// ============================================================================

const bill = (id: string, extra: any = {}) => ({
  id,
  roomId: 'room-1',
  tenantId: 't-1',
  amount: 1000,
  type: 'rent',
  direction: 'receivable',
  status: 'pending',
  dueDate: '2026-11-01',
  description: '第1期 月租',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...extra,
})

const snap = (o: any) => ({
  properties: [], rooms: [], tenants: [], bills: [],
  landlordContracts: [], profitRecords: [], trash: [], ...o,
})

function seedStore(partial: any) {
  useStore.setState({
    properties: [], rooms: [], tenants: [], bills: [], landlordContracts: [], profitRecords: [], trash: [],
    ...partial,
  } as any)
}

function snap7() {
  const s = useStore.getState()
  return {
    properties: s.properties, rooms: s.rooms, tenants: s.tenants, bills: s.bills,
    landlordContracts: s.landlordContracts, profitRecords: s.profitRecords, trash: s.trash,
  }
}

/** 与 doSave 的顺序一致：基线=操作前状态（即"云端"），跑动作，再拿动作后数据过闸门 */
function gateAfter(op: () => void) {
  const before = snap7()
  setCloudSummary(before)
  op()
  return checkPushGate(snap7())
}

beforeEach(() => {
  clearLocalDeletionReceipt()
  seedStore({})
})

describe('闸门 × 六条合法删除路径（修复 1 回归）', () => {
  it('租客退租：删未付账单（暂存 tenant.pendingBills，不入回收站）→ 不拦', () => {
    const room = { id: 'room-1', label: 'A室', status: 'occupied' }
    const t = { id: 't-1', name: '张三', roomId: 'room-1', status: 'active', monthlyRent: 1000, contractStart: '2026-01-01', contractEnd: '2026-12-31', displayId: 'ZL-0001', createdAt: '2026-01-01T00:00:00.000Z' }
    const paid = bill('b-paid', { status: 'paid', paidDate: '2026-10-01' })
    seedStore({ rooms: [room], tenants: [t], bills: [paid, bill('b-1'), bill('b-2')] })

    const r = gateAfter(() => useStore.getState().terminateTenant('t-1', 'room-1', '2026-10-20'))
    expect(r.blocked).toBe(false)
    // 数据侧证据：被删的两张进了租客的 pendingBills（而不是回收站）
    const ended = useStore.getState().tenants.find((x) => x.id === 't-1') as any
    expect((ended?.pendingBills || []).map((b: any) => b.id).sort()).toEqual(['b-1', 'b-2'])
  })

  it('业主退租：删未付应付账单（暂存 contract.pendingBills）→ 不拦', () => {
    const c = { id: 'c-1', propertyId: 'p-1', displayId: 'DL-0001', status: 'active', contractStart: '2026-01-01', contractEnd: '2026-12-31', monthlyRent: 2000, createdAt: '2026-01-01T00:00:00.000Z' }
    const pay = (id: string, extra: any = {}) => ({
      id, propertyId: 'p-1', landlordContractId: 'c-1', amount: 2000, type: 'rent', direction: 'payable',
      status: 'pending', dueDate: '2026-11-01', createdAt: '2026-10-01T00:00:00.000Z', ...extra,
    })
    seedStore({ landlordContracts: [c], bills: [pay('cb-paid', { status: 'paid', paidDate: '2026-10-01' }), pay('cb-1'), pay('cb-2')] })

    const r = gateAfter(() => useStore.getState().terminateLandlordContract('c-1'))
    expect(r.blocked).toBe(false)
    const ended = useStore.getState().landlordContracts.find((x) => x.id === 'c-1') as any
    expect((ended?.pendingBills || []).map((b: any) => b.id).sort()).toEqual(['cb-1', 'cb-2'])
  })

  it('编辑租客合同：旧账单全部删除并重新生成（不入回收站）→ 不拦', () => {
    const t = { id: 't-1', name: '张三', roomId: 'room-1', status: 'active', monthlyRent: 1000, contractStart: '2026-01-01', contractEnd: '2026-12-31', displayId: 'ZL-0001', createdAt: '2026-01-01T00:00:00.000Z' }
    const t2 = { ...t, id: 't-9', name: '李四', displayId: 'ZL-0009' }
    const otherBill = bill('b-other', { tenantId: 't-9', roomId: 'room-9' })
    seedStore({
      tenants: [t, t2],
      bills: [bill('old-paid', { status: 'paid', paidDate: '2026-10-01' }), bill('old-1'), bill('old-2'), otherBill],
    })
    // 22 删 2 生（这里缩到 2 删 1 生，覆盖"新生数量少于删除数量"的关键情形）
    const drafts = [{ amount: 1200, type: 'rent', dueDate: '2026-11-01', description: '第1期 月租' }] as any

    const r = gateAfter(() => useStore.getState().editTenantContract('t-1', { ...t, monthlyRent: 1200 } as any, drafts, 'room-1'))
    expect(r.blocked).toBe(false)
    // 对照断言：旧账单确实消失了（该操作的真实现象），别的租客的账单未受影响
    const ids = useStore.getState().bills.map((b) => b.id)
    expect(ids).not.toContain('old-paid')
    expect(ids).toContain('b-other')
  })

  it('恢复租客：撤销退租时生成的账单（不入回收站）→ 不拦', () => {
    const room = { id: 'room-1', label: 'A室', status: 'vacant' }
    const tEnded = {
      id: 't-1', name: '张三', roomId: 'room-1', status: 'ended', endReason: 'checkout',
      effectiveEnd: '2026-10-20', contractEnd: '2026-12-31', monthlyRent: 1000,
      displayId: 'ZL-0001', createdAt: '2026-01-01T00:00:00.000Z',
      pendingBills: [bill('future-1'), bill('future-2')],
    }
    seedStore({
      rooms: [room],
      tenants: [tEnded],
      bills: [
        bill('refund-1', { description: '退押金', amount: -1000, dueDate: '2026-10-20', paidDate: '2026-10-20' }),
        bill('refund-2', { description: '退租金 2026-10-20', amount: -500, dueDate: '2026-10-20', paidDate: '2026-10-20' }),
      ],
    })

    const r = gateAfter(() => useStore.getState().restoreTenant('t-1', 'room-1'))
    expect(r.blocked).toBe(false)
  })

  it('恢复业主合同：撤销退租时生成的账单（不入回收站）→ 不拦', () => {
    const cEnded = {
      id: 'c-1', propertyId: 'p-1', displayId: 'DL-0001', status: 'ended', endReason: 'checkout',
      contractStart: '2026-01-01', contractEnd: '2026-12-31', monthlyRent: 2000, createdAt: '2026-01-01T00:00:00.000Z',
      pendingBills: [{ id: 'future-cb-1', propertyId: 'p-1', landlordContractId: 'c-1', amount: 2000, type: 'rent', direction: 'payable', status: 'pending', dueDate: '2026-11-01', createdAt: '2026-10-01T00:00:00.000Z' }],
    }
    seedStore({
      landlordContracts: [cEnded],
      bills: [
        { id: 'refund-cb-1', propertyId: 'p-1', landlordContractId: 'c-1', amount: -2000, type: 'rent', direction: 'payable', status: 'pending', dueDate: '2026-10-20', description: '退租金 2026-10-20', createdAt: '2026-10-20T00:00:00.000Z' },
      ],
    })

    const r = gateAfter(() => useStore.getState().restoreLandlordContract('c-1'))
    expect(r.blocked).toBe(false)
  })

  it('删除利润记录（不入回收站）→ 不拦', () => {
    seedStore({
      profitRecords: [
        { id: 'profit-1', propertyId: 'p-1', periodStart: '2026-09-01', periodEnd: '2026-09-30', profitAmount: 100, extractedAt: '2026-10-01' },
        { id: 'profit-2', propertyId: 'p-1', periodStart: '2026-08-01', periodEnd: '2026-08-31', profitAmount: 200, extractedAt: '2026-09-01' },
      ],
    })
    const r = gateAfter(() => useStore.getState().deleteProfitRecord('profit-1'))
    expect(r.blocked).toBe(false)
    expect(useStore.getState().profitRecords.map((p) => p.id)).toEqual(['profit-2'])
  })
})

describe('对照：豁免真的来自回执（防止"永远绿"）', () => {
  it('编辑合同的删除，若把回执清掉 → 拦（证明豁免来自回执而非规则失灵）', () => {
    const t = { id: 't-1', name: '张三', roomId: 'room-1', status: 'active', monthlyRent: 1000, contractStart: '2026-01-01', contractEnd: '2026-12-31', displayId: 'ZL-0001', createdAt: '2026-01-01T00:00:00.000Z' }
    seedStore({ tenants: [t], bills: [bill('old-1'), bill('old-2')] })
    const before = snap7()
    setCloudSummary(before)
    useStore.getState().editTenantContract('t-1', { ...t } as any, [{ amount: 1000, type: 'rent', dueDate: '2026-11-01' }] as any, 'room-1')
    clearLocalDeletionReceipt() // 模拟回执丢失
    const r = checkPushGate(snap7())
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.details.join(' ')).toMatch(/记录静默消失/)
  })

  it('陈旧整档推送（缺记录、无任何回执）→ 拦（2026-10-09 事故同型）', () => {
    const t1 = { id: 't-1', name: '老租客', roomId: 'room-1', status: 'active', monthlyRent: 2200, contractStart: '2026-09-25', contractEnd: '2027-03-14', displayId: 'ZL-0032', createdAt: '2026-10-08T07:53:00.000Z' }
    const t2 = { ...t1, id: 't-2', name: '其他租客', displayId: 'ZL-0001' }
    const linsBills = [
      bill('lb-1', { tenantId: 't-1', status: 'paid', paidDate: '2026-09-28' }),
      bill('lb-2', { tenantId: 't-1' }), bill('lb-3', { tenantId: 't-1' }),
      bill('lb-4', { tenantId: 't-1' }), bill('lb-5', { tenantId: 't-1' }), bill('lb-6', { tenantId: 't-1' }),
    ]
    seedStore({ tenants: [t1, t2], bills: [...linsBills, bill('b-other', { tenantId: 't-2' })] })
    setCloudSummary(snap7())
    // 模拟陈旧设备整档：林世轮与其 6 张账单消失，无回收站、无回执
    seedStore({ tenants: [t2], bills: [bill('b-other', { tenantId: 't-2' })] })
    const r = checkPushGate(snap7())
    expect(r.blocked).toBe(true)
  })
})

describe('闸门基线：云端原文必须先归一化（修复 2 回归）', () => {
  const endedTenant = { id: 't-c', name: '退租客', roomId: 'r-1', status: 'ended', endReason: 'checkout', contractEnd: '2026-09-30', monthlyRent: 1000, displayId: 'ZL-0010', createdAt: '2026-01-01T00:00:00.000Z' }
  // 退租租客遗留的 pending 正数应收账单：normalizeCloudData 会合法清掉
  const leftover = bill('b-leftover', { tenantId: 't-c', roomId: 'r-1' })
  const rawCloud = snap({ tenants: [endedTenant], bills: [leftover] })
  const localAfterLoad = snap({ tenants: [endedTenant], bills: [] })

  it('（旧行为证据）云端原文当基线 → 自我误拦', () => {
    setCloudSummary(rawCloud)
    expect(checkPushGate(localAfterLoad).blocked).toBe(true)
  })

  it('setCloudSummaryFromCloud（先归一化）→ 不拦', () => {
    setCloudSummaryFromCloud(rawCloud)
    expect(checkPushGate(localAfterLoad).blocked).toBe(false)
  })

  it('kept-local 口径：陈旧本地（缺记录）对归一化云端基线 → 拦（堵住 10-09 同型通道）', () => {
    const cloud = snap({ tenants: [endedTenant, { ...endedTenant, id: 't-new', name: '新租客', status: 'active', endReason: undefined }], bills: [] })
    setCloudSummaryFromCloud(cloud)
    const stale = snap({ tenants: [endedTenant], bills: [] })
    expect(checkPushGate(stale).blocked).toBe(true)
  })

  it('kept-local 口径：本地是云端超集（真实未同步新改动）→ 放行（不误伤合法"本地优先"）', () => {
    const cloud = snap({ bills: [bill('x-1')] })
    setCloudSummaryFromCloud(cloud)
    const newerLocal = snap({ bills: [bill('x-1'), bill('x-2', { createdAt: '2026-10-10T00:00:00.000Z' })] })
    expect(checkPushGate(newerLocal).blocked).toBe(false)
  })
})

describe('规则③重写：缩水必须被回执按 id 解释', () => {
  const cloud = snap({ bills: [bill('a-1'), bill('a-2'), bill('a-3')] })

  it('缩水超出解释 → 拦，且 details 报出规则③', () => {
    setCloudSummary(cloud)
    recordLocalDeletions(['a-1', 'a-2'])
    const r = checkPushGate(snap({ bills: [] }))
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.details.join(' ')).toMatch(/数组缩水无合法删除解释/)
  })

  it('缩水全部被解释 → 放行', () => {
    setCloudSummary(cloud)
    recordLocalDeletions(['a-1', 'a-2', 'a-3'])
    expect(checkPushGate(snap({ bills: [] })).blocked).toBe(false)
  })
})

describe('回执生命周期', () => {
  it('登记→豁免；清除→恢复拦截（同一缺失账单的两种结果）', () => {
    const cloud = snap({ bills: [bill('x-1')] })
    const local = snap({ bills: [] })

    setCloudSummary(cloud)
    expect(checkPushGate(local).blocked).toBe(true)
    expect(getLocalDeletionReceipt().size).toBe(0)

    // 命中后基线会作废（设计如此）→ 重建基线再验证豁免
    recordLocalDeletions(['x-1'])
    expect(getLocalDeletionReceipt().has('x-1')).toBe(true)
    setCloudSummary(cloud)
    expect(checkPushGate(local).blocked).toBe(false)

    clearLocalDeletionReceipt()
    setCloudSummary(cloud)
    expect(checkPushGate(local).blocked).toBe(true)
  })
})
