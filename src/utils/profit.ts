import { Tenant, Bill, Room } from '../types'
import { calculateDays30_360, add30Days, formatDate } from './calculator'

/** 判断账单是否与某业主周期重叠 — 按账单 description 中的实际起止日匹配（而非应收日） */
function billOverlapsCycle(bill: Bill, cycleStart: string, cycleEnd: string): boolean {
  // 优先从 description 提取账单覆盖期（格式：... YYYY-MM-DD ~ YYYY-MM-DD）
  const m = bill.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
  if (m) {
    const bs = m[1], be = m[2]
    // 账单覆盖期与业主周期有重叠：账单开始 ≤ 周期结束 AND 账单结束 ≥ 周期开始
    return bs <= cycleEnd && be >= cycleStart
  }
  // 没有描述信息的账单，回退到用应收日判断
  return bill.dueDate >= cycleStart && bill.dueDate <= cycleEnd
}

export interface TenantPeriodResult {
  tenantId: string
  tenantName: string
  roomLabel: string
  overlapDays: number
  apportionedRent: number       // 该期分摊房租
  paidRent: number              // 实际已收房租（该期内）
  rentPaid: boolean             // 是否足额
  otherFeeIncome: number        // 卫管费收入（已付）
  otherFeeName: string
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
 * 按30/360规则分摊租客房租。
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
  const overlapTenants = propertyTenants.filter(t => {
    return t.contractEnd >= periodStart && t.contractStart <= periodEnd
  })

  let totalIncome = 0
  let allPaid = true
  const unpaidReasons: string[] = []
  const tenantResults: TenantPeriodResult[] = []

  for (const tenant of overlapTenants) {
    const overlapStart = tenant.contractStart > periodStart ? tenant.contractStart : periodStart
    const overlapEnd = tenant.contractEnd < periodEnd ? tenant.contractEnd : periodEnd

    // 30/360 含头含尾天数
    const overlapDays = 1 + calculateDays30_360(new Date(overlapStart), new Date(overlapEnd))
    const apportionedRent = Math.round(tenant.monthlyRent / 30 * overlapDays * 100) / 100

    // 找该周期内的应收账单 — 按账单实际覆盖期匹配（description 中的起止日），而非应收日
    const periodBills = allBills.filter(b =>
      b.tenantId === tenant.id &&
      b.roomId === tenant.roomId &&
      b.direction === 'receivable' &&
      billOverlapsCycle(b, periodStart, periodEnd)
    )

    // 已收房租
    const paidRentBills = periodBills.filter(b => b.type === 'rent' && b.status === 'paid')
    const paidRent = paidRentBills.reduce((s, b) => s + b.amount, 0)

    // 检查房租是否足额
    const room = propertyRooms.find(r => r.id === tenant.roomId)
    const rentPaid = paidRent >= apportionedRent - 0.01 // 允许舍入误差
    if (!rentPaid && apportionedRent > 0) {
      const shortfall = apportionedRent - paidRent
      unpaidReasons.push(`${room?.label || '?'}室 ${tenant.name} 还差 ¥${shortfall.toFixed(2)}`)
    }

    // 卫管费：找该周期内已付的other类型账单（排除押金相关）
    const otherFeeBills = periodBills.filter(b =>
      b.type === 'other' &&
      b.status === 'paid'
    )
    const otherFeePaidAmount = otherFeeBills.reduce((s, b) => s + b.amount, 0)

    totalIncome += Math.min(paidRent, apportionedRent) + otherFeePaidAmount
    if (apportionedRent > 0 && !rentPaid) allPaid = false

    tenantResults.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      roomLabel: room?.label || '?',
      overlapDays,
      apportionedRent,
      paidRent,
      rentPaid,
      otherFeeIncome: otherFeePaidAmount,
      otherFeeName: tenant.otherFeeName || '其他费',
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
