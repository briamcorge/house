/**
 * 免租期对「利润分摊」与「可支配余额」的影响测试
 *
 * 这两处是本轮改动的核心（profit.ts / balance.ts 都在 AGENTS.md 的红线清单里）：
 * - 利润：分摊分母从「期间总天数」改为「付费天数」，分子用「重叠内付费天数」
 * - 余额：日租分母用付费天数，已住天数只数付费日
 *
 * 关键保证：**没有免租时，两处公式与原实现完全等价**（下面有用例专门锁这一点）。
 * 场景与数字沿用方案讨论时手工推导的那组（单周期差 2000 元的那个例子）。
 */
import { describe, it, expect } from 'vitest'
import { calculatePeriodProfit } from '../src/utils/profit'
import { calcBillRemain, calculateBalance } from '../src/utils/balance'
import { calcCoveredPeriodEnd } from '../src/utils/calculator'
import type { Tenant, Bill, Room } from '../src/types'

const RENT = 3000
/** 账单 2026-01-01 ~ 2026-03-30 共 90 天；免租 30 天 → 账单金额按 60 个付费日计 = 6000 */
const BILL_AMOUNT = 6000

const room: Room = {
  id: 'r1', propertyId: 'p1', label: 'A', roomType: '主卧', status: 'occupied', createdAt: '2026-01-01',
}

function makeTenant(over: Partial<Tenant> = {}): Tenant {
  return {
    id: 't1', displayId: 'ZL-0001', name: '测试租客', roomId: 'r1',
    contractStart: '2026-01-01', contractEnd: '2026-03-30',
    monthlyRent: RENT, paymentMethod: 'quarterly', advanceDays: 0,
    status: 'active', createdAt: '2026-01-01',
    ...over,
  }
}

function makeBill(over: Partial<Bill> = {}): Bill {
  return {
    id: 'b1', roomId: 'r1', tenantId: 't1', amount: BILL_AMOUNT, type: 'rent',
    status: 'paid', direction: 'receivable', dueDate: '2026-01-01',
    periodStart: '2026-01-01', periodEnd: '2026-03-30', createdAt: '2026-01-01',
    ...over,
  }
}

// ============================================================
// 利润分摊
// ============================================================
describe('利润分摊：按付费天数（免租 2026-01-01~2026-01-30）', () => {
  // 业主周期从 2026-02-01 切进来（与租客账期错位，这是常态）
  const CYCLE_START = '2026-02-01'
  const CYCLE_END = '2026-04-30'

  it('有免租：该周期收入 = 6000（6000 × 本次重叠的 60 个付费日 ÷ 期间 60 个付费日）', () => {
    const r = calculatePeriodProfit(
      CYCLE_START, CYCLE_END, 0,
      [makeTenant({ vacancyStart: '2026-01-01', vacancyEnd: '2026-01-30' })],
      [room], [makeBill()],
    )
    expect(r.tenantIncome).toBe(6000)
    expect(r.tenants[0].proratedRent).toBe(6000)
  })

  it('无免租：同一张账单只算 4000（6000 × 60/90）——这就是改前的行为', () => {
    const r = calculatePeriodProfit(CYCLE_START, CYCLE_END, 0, [makeTenant()], [room], [makeBill()])
    expect(r.tenantIncome).toBe(4000)
  })

  it('免租让归属更准：差距源于"折扣是否被均摊到付费日"', () => {
    const withVac = calculatePeriodProfit(CYCLE_START, CYCLE_END, 0, [makeTenant({ vacancyStart: '2026-01-01', vacancyEnd: '2026-01-30' })], [room], [makeBill()])
    const noVac = calculatePeriodProfit(CYCLE_START, CYCLE_END, 0, [makeTenant()], [room], [makeBill()])
    expect(withVac.tenantIncome - noVac.tenantIncome).toBe(2000)
  })

  it('无免租时与原实现等价：房东支出直接扣减，利润 = 收入 − 支出', () => {
    const r = calculatePeriodProfit(CYCLE_START, CYCLE_END, 1500, [makeTenant()], [room], [makeBill()])
    expect(r.profitAmount).toBe(2500) // 4000 - 1500
  })

  it('allPaid 门槛不受分摊口径影响（基准是账单金额，账单已含折扣）', () => {
    const t = makeTenant({ vacancyStart: '2026-01-01', vacancyEnd: '2026-01-30' })
    // 已付 → 交齐
    expect(calculatePeriodProfit(CYCLE_START, CYCLE_END, 0, [t], [room], [makeBill()]).allPaid).toBe(true)
    // 改成未付 → 未交齐（金额仍是折后的 6000）
    const unpaid = calculatePeriodProfit(CYCLE_START, CYCLE_END, 0, [t], [room], [makeBill({ status: 'pending' })])
    expect(unpaid.allPaid).toBe(false)
    expect(unpaid.tenants[0].expectedRent).toBe(6000)
  })

  it('整期免租：该期无收入可归属（不会算出 NaN 或负数）', () => {
    const r = calculatePeriodProfit(
      CYCLE_START, CYCLE_END, 0,
      [makeTenant({ vacancyStart: '2026-01-01', vacancyEnd: '2026-03-30' })],
      [room], [makeBill({ amount: 0 })],
    )
    expect(Number.isFinite(r.tenantIncome)).toBe(true)
    expect(r.tenantIncome).toBe(0)
  })
})

// ============================================================
// 可支配余额
// ============================================================
describe('可支配余额：两段式消耗（今天 2026-02-10）', () => {
  const TODAY = '2026-02-10'
  const VAC = { start: '2026-01-01', end: '2026-01-30' }

  it('有免租：免租 30 天不消耗，付费 10 天按 100/天 → 剩 5000', () => {
    expect(calcBillRemain(makeBill(), TODAY, VAC)).toBe(5000)
  })

  it('无免租：日租 6000/90 = 66.67，已住 40 天 → 剩 3333.33（改前的行为）', () => {
    expect(calcBillRemain(makeBill(), TODAY)).toBe(3333.33)
  })

  it('calculateBalance：传入租客列表后自动按 tenantId 取免租期', () => {
    const t = makeTenant({ vacancyStart: VAC.start, vacancyEnd: VAC.end })
    const withVac = calculateBalance([makeBill()], TODAY, [t])
    const noVac = calculateBalance([makeBill()], TODAY, undefined)
    const noVacTenant = calculateBalance([makeBill()], TODAY, [makeTenant()])
    expect(withVac.tenantRemain).toBe(5000)
    expect(noVac.tenantRemain).toBe(3333.33)
    expect(noVacTenant.tenantRemain).toBe(3333.33) // 租客没免租期 → 与不传等价
  })

  it('不传租客列表 → 与改动前完全一致（默认路径零影响）', () => {
    expect(calculateBalance([makeBill()], TODAY)).toEqual(calculateBalance([makeBill()], TODAY, []))
  })

  it('今天落在免租期内 → 一分钱都没消耗，剩余为全额', () => {
    expect(calcBillRemain(makeBill(), '2026-01-20', VAC)).toBe(6000)
  })

  it('期间已过完 / 整期免租 → 均返回 0 且不为 NaN', () => {
    expect(calcBillRemain(makeBill(), '2026-06-30', VAC)).toBe(0)
    expect(calcBillRemain(makeBill(), TODAY, { start: '2026-01-01', end: '2026-03-30' })).toBe(0)
  })
})

// ============================================================
// 部分收款的覆盖期（第 8 项）
// ============================================================
describe('calcCoveredPeriodEnd：免租天数计入已覆盖', () => {
  it('无免租参数 → 与改动前一致（收一半钱覆盖到期间中点）', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-03-30', 3000, 6000)).toBe('2026-02-15')
  })

  it('有免租 30 天 → 免租日先记上，再按付费天数比例推进覆盖', () => {
    // free=30, paidTotal=60, 收一半 → paidCovered=30 → covered=60 → 2026-02-28（虚拟 2/30 显示为月末）
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-03-30', 3000, 6000, 30)).toBe('2026-02-28')
  })

  it('免租天数超过期间长度 → 不越界（最多覆盖到期间结束日）', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', 100, 1000, 99)).toBe('2026-01-30')
  })
})
