import { Tenant, Bill, Room } from '../types'
import { add30Days, formatDate } from './calculator'

/** 判断账单是否与某业主周期重叠 — 按账单 description 中的实际起止日匹配（而非应收日） */
function billOverlapsCycle(bill: Bill, cycleStart: string, cycleEnd: string): boolean {
  // 优先从 description 提取账单覆盖期（格式：... YYYY-MM-DD ~ YYYY-MM-DD）
  const m = bill.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
  if (m) {
    const bs = m[1], be = m[2]
    // 账单覆盖期与业主周期有重叠：账单开始 ≤ 周期结束 AND 账单结束 ≥ 周期开始
    return bs <= cycleEnd && be >= cycleStart
  }
  // 没有描述信息的账单，用应收日或实收日判断（适用违约金/减免/返费等无日期段的账单）
  if (bill.dueDate >= cycleStart && bill.dueDate <= cycleEnd) return true
  if (bill.paidDate && bill.paidDate >= cycleStart && bill.paidDate <= cycleEnd) return true
  return false
}

export interface FeeBreakdownItem {
  type: string       // rent|other|sublease|hygiene|deposit
  label: string      // 显示用名称，如"季租"、"卫管费"
  amount: number     // 账单金额
  paid: boolean      // 是否已收
  paidAmount: number // 实收金额（如果是已收状态）
  description?: string // 完整描述，含日期范围
}

export interface TenantPeriodResult {
  tenantId: string
  tenantName: string
  roomLabel: string
  expectedRent: number          // 该账单周期内房租账单总额
  paidRent: number              // 实际已收房租（该期内）
  rentPaid: boolean             // 是否足额
  otherFeeIncome: number        // 卫管费收入（已付）
  otherFeeName: string
  feeBreakdown: FeeBreakdownItem[]  // 所有参与计算的费用明细
}

export interface PeriodProfitResult {
  cycleStart: string
  cycleEnd: string
  landlordExpense: number       // 该期付业主金额
  tenantIncome: number          // 该期租客总收入
  profitAmount: number          // 利润
  allPaid: boolean              // 所有租客房租是否交齐
  tenants: TenantPeriodResult[]
  unpaidReasons: string[]       // 未交齐的原因
}

/**
 * 计算某套房在某个业主周期内的利润。
 * 按账单实际金额加总租客收入（不分摊、不按天折算）。
 * 押金不算利润，卫管费算利润。
 * 只有所有租客在该周期内的房租都交齐了，才算可分配利润。
 */
export function calculatePeriodProfit(
  periodStart: string,
  periodEnd: string,
  landlordPaidAmount: number,
  propertyTenants: Tenant[],
  propertyRooms: Room[],
  allBills: Bill[],
): PeriodProfitResult {
  // 筛选合同期与业主周期有重叠的租客
  const overlapTenants = propertyTenants.filter(t => {
    return t.contractEnd >= periodStart && t.contractStart <= periodEnd
  })

  let totalIncome = 0
  let allPaid = true
  const unpaidReasons: string[] = []
  const tenantResults: TenantPeriodResult[] = []

  for (const tenant of overlapTenants) {
    // 找该周期内的应收账单 — 按账单实际覆盖期匹配（description 中的起止日）
    const periodBills = allBills.filter(b =>
      b.tenantId === tenant.id &&
      b.roomId === tenant.roomId &&
      b.direction === 'receivable' &&
      billOverlapsCycle(b, periodStart, periodEnd)
    )

    // 该周期内的房租账单
    const periodRentBills = periodBills.filter(b => b.type === 'rent')
    const expectedRent = periodRentBills.reduce((s, b) => s + b.amount, 0)
    const paidRent = periodRentBills
      .filter(b => b.status === 'paid')
      .reduce((s, b) => s + (b.paidAmount ?? b.amount), 0)

    // 检查房租是否足额：按账单金额总和判断，不按天分摊
    const room = propertyRooms.find(r => r.id === tenant.roomId)
    const rentPaid = expectedRent > 0 && paidRent >= expectedRent - 0.01
    if (!rentPaid && expectedRent > 0) {
      const shortfall = expectedRent - paidRent
      unpaidReasons.push(`${room?.label || '?'}室 ${tenant.name} 还差 ¥${shortfall.toFixed(2)}`)
    }

    // 卫管费及其他收入：找该周期内已付的other/sublease/hygiene类型账单
    const otherFeeBills = periodBills.filter(b =>
      (b.type === 'other' || b.type === 'sublease' || b.type === 'hygiene') &&
      b.status === 'paid'
    )
    const otherFeePaidAmount = otherFeeBills.reduce((s, b) => s + b.amount, 0)

    // 生成费用明细清单（排除押金）
    const feeBreakdown: FeeBreakdownItem[] = periodBills
      .filter(b => b.type !== 'deposit')
      .map(b => ({
        type: b.type,
        label: b.type === 'rent' ? (b.description?.match(/(季租|月租|半年租|年租)/)?.[1] || '房租')
          : b.type === 'hygiene' ? '卫管费'
          : b.type === 'sublease' ? '转租费'
          : b.type === 'agency' ? '中介费'
          : b.description || '其他费用',
        amount: b.amount,
        paid: b.status === 'paid',
        paidAmount: b.status === 'paid' ? (b.paidAmount ?? b.amount) : 0,
        description: b.description,
      }))

    totalIncome += paidRent + otherFeePaidAmount
    if (expectedRent > 0 && !rentPaid) allPaid = false

    tenantResults.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      roomLabel: room?.label || '?',
      expectedRent,
      paidRent,
      rentPaid,
      otherFeeIncome: otherFeePaidAmount,
      otherFeeName: tenant.otherFeeName || '其他费',
      feeBreakdown,
    })
  }

  const profitAmount = Math.round((totalIncome - landlordPaidAmount) * 100) / 100

  return {
    cycleStart: periodStart,
    cycleEnd: periodEnd,
    landlordExpense: landlordPaidAmount,
    tenantIncome: totalIncome,
    profitAmount,
    allPaid,
    tenants: tenantResults,
    unpaidReasons,
  }
}

/**
 * 按业主账单周期划分，计算该房源所有周期的利润。
 */
export function calculateAllCycles(
  propertyId: string,
  cycles: { cycleStart: string; cycleEnd: string; landlordPaid: number }[],
  tenants: Tenant[],
  rooms: Room[],
  bills: Bill[],
): PeriodProfitResult[] {
  const propertyTenants = tenants.filter(t =>
    rooms.filter(r => r.propertyId === propertyId).some(r => r.id === t.roomId)
  )
  const propertyRooms = rooms.filter(r => r.propertyId === propertyId)

  return cycles.map(cycle =>
    calculatePeriodProfit(
      cycle.cycleStart,
      cycle.cycleEnd,
      cycle.landlordPaid,
      propertyTenants,
      propertyRooms,
      bills,
    )
  )
}

/**
 * 根据业主合同付款方式和业主应付账单，生成所有周期列表。
 */
export function generateCycles(
  paymentMethod: string,
  startDate: string,
  payableBills: Bill[],
): { cycleStart: string; cycleEnd: string; landlordPaid: number }[] {
  const periodMonths = paymentMethod === 'monthly' ? 1
    : paymentMethod === 'bi-monthly' ? 2
    : paymentMethod === 'quarterly' ? 3
    : paymentMethod === 'semi-annual' ? 6
    : 12
  const periodDays = periodMonths * 30

  const cycles: { cycleStart: string; cycleEnd: string; landlordPaid: number }[] = []
  const lastBillDate = payableBills.length > 0
    ? payableBills[payableBills.length - 1].dueDate
    : startDate

  let cursor = new Date(startDate)
  while (formatDate(cursor) <= lastBillDate) {
    const cs = formatDate(cursor)
    const ce = formatDate(add30Days(cursor, periodDays - 1))

    const paid = payableBills
      .filter(b => b.status === 'paid')
      .filter(b => b.type !== 'deposit')
      .filter(b => billOverlapsCycle(b, cs, ce))
      .reduce((s, b) => s + b.amount, 0)

    cycles.push({ cycleStart: cs, cycleEnd: ce, landlordPaid: paid })

    cursor = add30Days(cursor, periodDays)
  }

  return cycles
}
