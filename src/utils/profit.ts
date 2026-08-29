import { Tenant, Bill, Room } from '../types'
import { formatRoomLabel } from '../lib/utils'

/** 30/360 日期解析：每月30天，Feb 28→30，任何31→30 */
function to360(s: string): { y: number; m: number; d: number } {
  const [y, m0, d0] = s.split('-').map(Number)
  const m = m0 - 1
  let d = Math.min(d0, 30)
  if (m === 1) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0)
    if (d0 >= (leap ? 29 : 28)) d = 30
  }
  return { y, m, d }
}

/** 30/360 间隔天数（包含两端）：Feb 28→30 后算差；日期颠倒（a > b）返回 0 防御 */
function days360(a: string, b: string): number {
  const da = to360(a), db = to360(b)
  const days = (db.y - da.y) * 360 + (db.m - da.m) * 30 + (db.d - da.d) + 1
  return days > 0 ? days : 0
}

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
      // 负数房租（退租金等）：从未算过利润，不参与利润计算，仅展示
      continue
    }
    const period = getBillPeriod(bill)
    if (!period) {
      // 无日期正数账单：全额计入调整项
      adjustment += bill.amount
      continue
    }
    const [bs, be] = period
    // 房租交到日由账单事实决定：有退租金账单时，覆盖期不超过退租金起始日 - 1
    // 无退租金账单则不截断（如黄健：已收账单覆盖期即房租交到日）
    const capEnd = effectiveEnd && be > effectiveEnd ? effectiveEnd : be
    const oStart = bs > periodStart ? bs : periodStart
    const oEnd = capEnd < periodEnd ? capEnd : periodEnd
    if (oStart > oEnd) continue
    const ovDays = days360(oStart, oEnd)
    const billDays = days360(bs, be)
    if (billDays <= 0) continue
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
      overlapDays = days360(oStart, oEnd)
    }
  }
  return { proratedRent, adjustment, overlapDays }
}

/** 判断账单是否与某业主周期重叠：
 *  - 房租（rent）：按账单覆盖期匹配（房租分期收取，覆盖期与业主周期对齐）
 *  - 其他（卫管费/违约金等一次性费用）：按应收日/实收日归属单一周期，避免跨周期重复计入
 */
function billOverlapsCycle(bill: Bill, cycleStart: string, cycleEnd: string): boolean {
  const period = getBillPeriod(bill)
  if (period && bill.amount >= 0 && bill.type === 'rent') {
    // 房租按覆盖期匹配
    const [bs, be] = period
    return bs <= cycleEnd && be >= cycleStart
  }
  // 负数账单（退租金等）、卫管费等一次性费用：按实收日归属单一周期（利润只算已收的钱）
  // 实收日唯一，避免应收日与实收日跨周期导致同一笔账单重复计入；无实收日按应收日兜底
  const matchDate = bill.paidDate || bill.dueDate
  return matchDate >= cycleStart && matchDate <= cycleEnd
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
  proratedRent: number          // 按覆盖期分摊的正数房租
  adjustment: number            // 无覆盖期正数账单的补充收入（负数房租退租金等已排除，不参与利润）
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
  const activeBills = allBills.filter(b => b.status !== 'cancelled' && b.status !== 'refunded')
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
      !(b.amount < 0 && b.type === 'rent') &&
      billOverlapsCycle(b, periodStart, periodEnd)
    )
    // 已退租租客：排除未付的正数账单（这些是退租时没清理的遗留账单，含待收和已逾期）
    if (tenant.status === 'ended') {
      periodBills = periodBills.filter(b => !(b.amount > 0 && (b.status === 'pending' || b.status === 'overdue')))
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
      unpaidReasons.push(`${room?.label ? formatRoomLabel(room.label) : '?'} ${tenant.name} 还差 ¥${shortfall.toFixed(2)}`)
    }

    // 卫管费及其他收入：一次性费用，按应收/实收日归属当前周期，全额计入不重复
    const otherFeeBills = periodBills.filter(b =>
      (b.type === 'other' || b.type === 'sublease' || b.type === 'hygiene') &&
      b.status === 'paid' // 利润只算已收的钱（未收费用不参与利润计算，与下方房租 paidRent 同一原则）
    )
    // ⚠️ 金额口径（与 paidRent 保持一致）：已收账单统一按「实收金额」paidAmount || amount 计算。
    // 为什么不会虚增：app 拆单/收款流程从不设置 paidAmount（拆单 = 新开一张 amount=实收额的已付账单），
    // 正常使用下已付账单的 amount 即实收额，与 paidAmount || amount 等价。
    // paidAmount 只在手动编辑账单（BillModal）或 Excel 导入「已付金额」列时出现；
    // 此时若部分收款（paidAmount < amount）仍按 amount 全额算，会高估收入——且下方的收齐门槛
    // （rentPaid / allPaid）只检查房租账单，拦不住其他费用，必须在此按实收算。
    const otherFeePaidAmount = otherFeeBills.reduce((s, b) => s + (b.paidAmount || b.amount), 0)

    // 生成费用明细清单（排除押金），按类型分组合并；非房租账单（卫管费等）按覆盖期分摊到周期
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

    // 房租交到日由账单事实决定：退租金账单的起始日 - 1 = 房租实际交到的最后一天
    // 退租办理日(effectiveEnd 字段)不代表房租交到日，不参与截断（用户明确要求）
    // 无退租金账单（如黄健）→ 不截断，已收账单按覆盖期全额计算
    let effectiveEnd = ''
    if (tenant.status === 'ended') {
      // 注意：不能从 activeBills 找（它已过滤掉 refunded 状态的账单），
      // 退租金账单正是 refunded 状态，从 activeBills 找会永远找不到 → 截断失效
      // 改为从 allBills 找，只排除作废的 cancelled
      const refund = allBills.find(b =>
        b.tenantId === tenant.id && b.amount < 0 && b.type === 'rent' &&
        b.status !== 'cancelled'
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
    // adjustment：正数无覆盖期账单的补充收入；负数房租(退租金等)不参与利润计算，仅展示
    const apportionedRent = proratedRent

    totalIncome += apportionedRent + adjustment + otherFeePaidAmount
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
