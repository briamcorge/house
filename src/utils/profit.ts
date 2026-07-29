import { Tenant, Bill, Room } from '../types'
import { add30Days, formatDate } from './calculator'

/** 取账单覆盖期：优先从 periodStart/periodEnd 字段，旧数据从 description 正则提取 */
function getBillPeriod(bill: Bill): [string, string] | null {
  if (bill.periodStart && bill.periodEnd) return [bill.periodStart, bill.periodEnd]
  const m = bill.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
  if (m) return [m[1], m[2]]
  return null
}

/** 每张账单按覆盖期分摊计算：正数有日期的按重叠比例摊，负数的全额计入调整项 */
function calcBillBasedRent(
  rentBills: Bill[],
  periodStart: string,
  periodEnd: string,
  effectiveEnd: string, // 实际有效截止日（退租日的次日），正数账单覆盖期不超出此日
): { proratedRent: number; adjustment: number; overlapDays: number } {
  let proratedRent = 0
  let adjustment = 0
  let earliestStart = ''
  let latestEnd = ''
  for (const bill of rentBills) {
    if (bill.amount <= 0) {
      // 负数账单（退租金等）：全额计入调整项，不参与分摊也不影响天数
      adjustment += bill.amount
      continue
    }
    const period = getBillPeriod(bill)
    if (!period) {
      // 无日期正数账单：全额计入调整项
      adjustment += bill.amount
      continue
    }
    const [bs, be] = period
    // 正数房租账单的覆盖期不超过有效截止日（退租当日不占房）
    const capEnd = effectiveEnd && be > effectiveEnd ? effectiveEnd : be
    const oStart = bs > periodStart ? bs : periodStart
    const oEnd = capEnd < periodEnd ? capEnd : periodEnd
    if (oStart > oEnd) continue
    const [osy, osm, osd] = oStart.split('-').map(Number)
    const [oey, oem, oed] = oEnd.split('-').map(Number)
    const ovDays = (oey - osy) * 360 + (oem - osm) * 30 + (oed - osd) + 1
    const [bsy, bsm, bsd] = bs.split('-').map(Number)
    const [bey, bem, bed] = be.split('-').map(Number)
    const billDays = (bey - bsy) * 360 + (bem - bsm) * 30 + (bed - bsd) + 1
    proratedRent += bill.amount * ovDays / billDays
    // 正数账单才计入天数范围
    if (!earliestStart || bs < earliestStart) earliestStart = bs
    if (!latestEnd || oEnd > latestEnd) latestEnd = oEnd
  }
  let overlapDays = 0
  if (earliestStart && latestEnd) {
    const oStart = earliestStart > periodStart ? earliestStart : periodStart
    const oEnd = latestEnd < periodEnd ? latestEnd : periodEnd
    if (oStart <= oEnd) {
      const [osy, osm, osd] = oStart.split('-').map(Number)
      const [oey, oem, oed] = oEnd.split('-').map(Number)
      overlapDays = (oey - osy) * 360 + (oem - osm) * 30 + (oed - osd) + 1
    }
  }
  return { proratedRent, adjustment, overlapDays }
}

/** 判断账单是否与某业主周期重叠 — 按账单覆盖期匹配（优先字段，旧数据从 description 提取） */
function billOverlapsCycle(bill: Bill, cycleStart: string, cycleEnd: string): boolean {
  const period = getBillPeriod(bill)
  if (period) {
    const [bs, be] = period
    return bs <= cycleEnd && be >= cycleStart
  }
  // 无覆盖期的账单（违约金/退款等），用应收日或实收日判断
  if (bill.dueDate >= cycleStart && bill.dueDate <= cycleEnd) return true
  if (bill.paidDate && bill.paidDate >= cycleStart && bill.paidDate <= cycleEnd) return true
  return false
}

export interface FeeGroup {
  type: string       // rent|other|sublease|hygiene|deposit
  label: string      // 显示用名称，如"月租"、"卫管费"
  amount: number     // 账单金额
  count: number      // 合并的账单数
  paid: boolean      // 是否已收
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
  overlapDays: number           // 30/360 重叠天数（用于显示）
  proratedRent: number          // 按覆盖期分摊的房租
  adjustment: number            // 无日期调整（退租金等）
  feeBreakdown: FeeGroup[]      // 所有参与计算的费用（按类型合并）
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
  // 筛选合同期与业主周期有重叠的租客，排除已作废账单
  const activeBills = allBills.filter(b => b.status !== 'cancelled')
  const overlapTenants = propertyTenants.filter(t => {
    return t.contractEnd >= periodStart && t.contractStart <= periodEnd
  })

  let totalIncome = 0
  let allPaid = true
  const unpaidReasons: string[] = []
  const tenantResults: TenantPeriodResult[] = []

  for (const tenant of overlapTenants) {
    // 找该周期内的应收账单 — 按账单实际覆盖期匹配（description 中的起止日）
    let periodBills = activeBills.filter(b =>
      b.tenantId === tenant.id &&
      b.roomId === tenant.roomId &&
      b.direction === 'receivable' &&
      billOverlapsCycle(b, periodStart, periodEnd)
    )
    // 已退租租客：排除未付的正数账单（这些是退租时没清理的遗留账单）
    if (tenant.status === 'ended') {
      periodBills = periodBills.filter(b => !(b.amount > 0 && b.status === 'pending'))
    }

    // 该周期内的房租账单
    const periodRentBills = periodBills.filter(b => b.type === 'rent')
    const expectedRent = periodRentBills.reduce((s, b) => s + b.amount, 0)
    const paidRent = periodRentBills
      .filter(b => b.status === 'paid')
      .reduce((s, b) => s + (b.paidAmount || b.amount), 0)

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

    // 生成费用明细清单（排除押金），按类型分组合并
    const feeGroups = new Map<string, FeeGroup>()
    periodBills
      .filter(b => b.type !== 'deposit')
      .forEach(b => {
        let label = ''
        if (b.type === 'rent') {
          const rentType = b.description?.match(/(季租|月租|半年租|年租)/)?.[1] || '房租'
          label = rentType
        } else if (b.type === 'hygiene') {
          label = '卫管费'
        } else if (b.type === 'sublease') {
          label = '转租费'
        } else if (b.type === 'agency') {
          label = '中介费'
        } else {
          label = b.description || '其他费用'
        }
        const key = `$${b.type}_${label}`
        if (feeGroups.has(key)) {
          const g = feeGroups.get(key)!
          g.amount += b.amount
          g.count += 1
          if (b.status !== 'paid') g.paid = false
        } else {
          feeGroups.set(key, { type: b.type, label, amount: b.amount, count: 1, paid: b.status === 'paid' })
        }
      })
    const feeBreakdown = Array.from(feeGroups.values())

    // 逐张房租账单按覆盖期分摊，退租时截断至退租日
    // 有效截止日 = effectiveEnd - 1（退租日当天不占房）
    let effectiveEnd = ''
    if (tenant.effectiveEnd) {
      const d = new Date(tenant.effectiveEnd)
      d.setDate(d.getDate() - 1)
      effectiveEnd = d.toISOString().slice(0, 10)
    } else if (tenant.status === 'ended') {
      // 旧数据没有 effectiveEnd：从退租金账单推导
      const refund = activeBills.find(b =>
        b.tenantId === tenant.id && b.amount < 0 && b.type === 'rent'
      )
      if (refund) {
        const period = getBillPeriod(refund)
        if (period) {
          const d = new Date(period[0])
          d.setDate(d.getDate() - 1)
          effectiveEnd = d.toISOString().slice(0, 10)
        }
      }
    }
    const summary = calcBillBasedRent(periodRentBills, periodStart, periodEnd, effectiveEnd)
    const overlapDays = summary.overlapDays
    const proratedRent = Math.round(summary.proratedRent)
    const adjustment = Math.round(summary.adjustment)
    const apportionedRent = proratedRent + adjustment

    totalIncome += apportionedRent + otherFeePaidAmount
    if (expectedRent > 0 && !rentPaid) allPaid = false

    // 没有任何收入/支出（周期内无有效账单）则跳过
    if (periodBills.length === 0) continue

    tenantResults.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      roomLabel: room?.label || '?',
      expectedRent,
      paidRent,
      rentPaid,
      otherFeeIncome: otherFeePaidAmount,
      otherFeeName: tenant.otherFeeName || '其他费',
      overlapDays,
      proratedRent,
      adjustment,
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
