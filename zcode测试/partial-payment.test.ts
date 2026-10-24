import { describe, it, expect, beforeEach, vi } from 'vitest'

// 与 push-gate-deletions.test.ts 相同：必须先装 localStorage 桩，再加载 store/persist。
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

import { planPartialPayment } from '../src/utils/payment-split'
import { useStore } from '../src/store/useStore'
import { checkPushGate, setCloudSummary } from '../src/lib/supabase'
import { clearAllLocalReceipts } from '../src/lib/deletion-receipt'
import { calculatePeriodProfit } from '../src/utils/profit'

const bill = (extra: any = {}) => ({
  id: 'b-1',
  propertyId: 'p-1',
  roomId: 'room-1',
  tenantId: 't-1',
  amount: 1000,
  type: 'rent',
  direction: 'receivable',
  status: 'pending',
  dueDate: '2026-11-01',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  description: '第1期 月租 2026-11-01 ~ 2026-11-30',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...extra,
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

function baseInput(overrides: any = {}) {
  return {
    bill: bill(),
    paidAmount: 400,
    paidDate: '2026-10-24',
    today: '2026-10-24',
    payPeriodStart: '2026-11-01',
    payPeriodEnd: '2026-11-12',
    remainingDueDate: '2026-12-15',
    ...overrides,
  }
}

beforeEach(() => {
  clearAllLocalReceipts()
  seedStore({})
})

describe('planPartialPayment', () => {
  it('剩余金额留在原账单，已收部分新开一张已付账单，且不写 paidAmount', () => {
    const plan = planPartialPayment(baseInput())

    expect(plan.remainingAmount).toBe(600)
    expect(plan.remainingPatch).toMatchObject({
      amount: 600,
      paidDate: undefined,
      dueDate: '2026-12-15',
      status: 'pending',
      periodStart: '2026-11-13',
      periodEnd: '2026-11-30',
    })
    expect(plan.remainingPatch.description).toBe('第1期 月租 2026-11-13 ~ 2026-11-30')

    expect(plan.paidBill).toMatchObject({
      amount: 400,
      status: 'paid',
      dueDate: '2026-11-01',
      paidDate: '2026-10-24',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-12',
    })
    expect(plan.paidBill.description).toBe('第1期 月租 2026-11-01 ~ 2026-11-12')
    expect((plan.paidBill as any).paidAmount).toBeUndefined()
  })

  it('剩余应缴日早于今天 → overdue；等于今天 → pending', () => {
    expect(planPartialPayment(baseInput({ remainingDueDate: '2026-10-23' })).remainingPatch.status).toBe('overdue')
    expect(planPartialPayment(baseInput({ remainingDueDate: '2026-10-24' })).remainingPatch.status).toBe('pending')
    expect(planPartialPayment(baseInput({ remainingDueDate: '2026-10-25' })).remainingPatch.status).toBe('pending')
  })

  it('未传剩余应缴日时不改 dueDate/status（非房租路径保持原行为）', () => {
    const plan = planPartialPayment(baseInput({ remainingDueDate: undefined }))
    expect(plan.remainingPatch.dueDate).toBeUndefined()
    expect(plan.remainingPatch.status).toBeUndefined()
    expect(plan.remainingPatch.amount).toBe(600)
  })

  it('原账单没有期间时不生成剩余期间，但金额和 dueDate 仍生效', () => {
    const noPeriod = bill({
      periodStart: undefined,
      periodEnd: undefined,
      description: '第1期 月租',
    })
    const plan = planPartialPayment(baseInput({ bill: noPeriod }))
    expect(plan.remainingRange).toBeUndefined()
    expect(plan.remainingPatch.periodStart).toBeUndefined()
    expect(plan.remainingPatch.periodEnd).toBeUndefined()
    expect(plan.remainingPatch.description).toBeUndefined()
    expect(plan.remainingPatch.dueDate).toBe('2026-12-15')
  })

  it('剩余期间反置时保留原元数据（本次已覆盖整期）', () => {
    const plan = planPartialPayment(baseInput({
      paidAmount: 995,
      payPeriodEnd: '2026-11-30',
    }))
    expect(plan.remainingAmount).toBe(5)
    expect(plan.remainingRange).toBeUndefined()
    expect(plan.remainingPatch.periodStart).toBeUndefined()
    expect(plan.remainingPatch.periodEnd).toBeUndefined()
  })

  it('多次拆分按分四舍五入，不产生浮点残留', () => {
    const plan = planPartialPayment(baseInput({
      bill: bill({ amount: 100 }),
      paidAmount: 33.33,
    }))
    expect(plan.remainingAmount).toBe(66.67)
  })

  it('全额/非法金额/已收账单/非法日期会被拒绝', () => {
    expect(() => planPartialPayment(baseInput({ paidAmount: 1000 }))).toThrow()
    expect(() => planPartialPayment(baseInput({ paidAmount: 0 }))).toThrow()
    expect(() => planPartialPayment(baseInput({ bill: bill({ status: 'paid' }) }))).toThrow()
    expect(() => planPartialPayment(baseInput({ bill: bill({ status: 'refunded' }) }))).toThrow()
    expect(() => planPartialPayment(baseInput({ remainingDueDate: '2026/12/15' }))).toThrow()
  })

  it('已取消账单保留 cancelled，不被日期改成 pending', () => {
    const plan = planPartialPayment(baseInput({ bill: bill({ status: 'cancelled' }) }))
    expect(plan.remainingPatch.status).toBe('cancelled')
  })
})

describe('部分收款 + 真实 store + 推送闸门', () => {
  it('两次 action 后：原账单剩 600、新账单已收 400，且闸门不拦', () => {
    seedStore({ bills: [bill()] })

    const before = snap7()
    setCloudSummary(before)

    const plan = planPartialPayment(baseInput())
    const okUpdate = useStore.getState().updateBill('b-1', plan.remainingPatch)
    const okAdd = useStore.getState().addBill(plan.paidBill)

    expect(okUpdate).toBe(true)
    expect(okAdd).toBe(true)

    const bills = useStore.getState().bills
    expect(bills).toHaveLength(2)

    const remaining = bills.find(b => b.id === 'b-1')!
    expect(remaining.amount).toBe(600)
    expect(remaining.paidDate).toBeUndefined()
    expect(remaining.dueDate).toBe('2026-12-15')
    expect(remaining.status).toBe('pending')

    const paid = bills.find(b => b.id !== 'b-1')!
    expect(paid.amount).toBe(400)
    expect(paid.status).toBe('paid')
    expect(paid.paidDate).toBe('2026-10-24')
    expect(paid.dueDate).toBe('2026-11-01')
    expect(paid.paidAmount).toBeUndefined()

    expect(checkPushGate(snap7()).blocked).toBe(false)
  })

  it('原账单已逾期，改成未来应缴日后同步回到 pending', () => {
    seedStore({ bills: [bill({ status: 'overdue' })] })
    const plan = planPartialPayment(baseInput())
    useStore.getState().updateBill('b-1', plan.remainingPatch)
    const remaining = useStore.getState().bills.find(b => b.id === 'b-1')!
    expect(remaining.status).toBe('pending')
  })

  it('改剩余应缴日期/pending-overdue 不影响房租利润计算', () => {
    const tenant = {
      id: 't-1', displayId: 'ZL-0001', name: '张三', roomId: 'room-1',
      contractStart: '2026-01-01', contractEnd: '2026-12-31',
      monthlyRent: 1000, paymentMethod: 'monthly', advanceDays: 0,
      status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
    }
    const room = {
      id: 'room-1', propertyId: 'p-1', label: 'A', roomType: '',
      status: 'occupied', createdAt: '2026-01-01T00:00:00.000Z',
    }
    const paidPart = bill({
      id: 'b-paid', amount: 400, status: 'paid', paidDate: '2026-11-12',
      periodStart: '2026-11-01', periodEnd: '2026-11-12',
      description: '第1期 月租 2026-11-01 ~ 2026-11-12',
    })
    const remaining = bill({
      id: 'b-remaining', amount: 600, status: 'overdue', dueDate: '2025-01-01',
      periodStart: '2026-11-13', periodEnd: '2026-11-30',
      description: '第1期 月租 2026-11-13 ~ 2026-11-30',
    })

    const before = calculatePeriodProfit(
      '2026-11-01', '2026-11-30', 0, [tenant as any], [room as any], [paidPart as any, remaining as any],
    )
    const after = calculatePeriodProfit(
      '2026-11-01', '2026-11-30', 0, [tenant as any], [room as any],
      [paidPart as any, { ...remaining, status: 'pending', dueDate: '2026-12-15' } as any],
    )

    expect(after.profitAmount).toBe(before.profitAmount)
    expect(after.tenantIncome).toBe(before.tenantIncome)
    expect(after.allPaid).toBe(before.allPaid)
  })
})
