import { PaymentMethod } from '../types'

// ============================================================
// 30/360 日期类型（纯30天月，不受真实日历限制）
// ============================================================
export interface Date360 {
  y: number  // 年份
  m: number  // 月份 0-11
  d: number  // 日期 1-30（31号映射到30号）
}

/** 将 Date 转换为 30/360 日期（31号→30号，2月28/29→30号） */
function toDate360(date: Date): Date360 {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  let day = Math.min(d, 30)
  if (m === 1) {
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0)
    const febLast = isLeap ? 29 : 28
    if (d >= febLast) day = 30
  }
  return { y, m, d: day }
}

/** 从字符串"YYYY-MM-DD"解析 30/360 日期 */
export function parseDate360(s: string): Date360 {
  const [y, m, d] = s.split('-').map(Number)
  const month = m - 1
  // 30/360规则：每月30天。2月28/29日视为30日，31日视为30日
  let day = Math.min(d, 30)
  if (month === 1) {
    // 2月最后一天（28或29）映射为30号
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0)
    const febLast = isLeap ? 29 : 28
    if (d >= febLast) day = 30
  }
  return { y, m: month, d: day }
}

/** 格式化 30/360 日期为 YYYY-MM-DD */
function formatDate360(d: Date360): string {
  return `${d.y}-${String(d.m + 1).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
}

/** 显示友好的日期：2月29/30→真实2月最后一天（平年28/闰年29），其余不变
 *  注意：必须映射到 2月最后一天（而非 27/28 中间值），
 *  否则反向解析（parseDate360/profit.to360 中 d>=febLast→30）会丢失天数，
 *  导致利润计算的分摊天数错误。映射到月末可保证解析回 30，与原始虚拟日 29/30 等价。 */
function formatDate360Display(d: Date360): string {
  let displayDay = d.d
  if (d.m === 1 && d.d >= 29) {
    // 30/360 中 2 月的第 29、30 天都代表"2月最后一天"（平年28/闰年29）
    const isLeap = (d.y % 4 === 0 && d.y % 100 !== 0) || (d.y % 400 === 0)
    displayDay = isLeap ? 29 : 28
  }
  return `${d.y}-${String(d.m + 1).padStart(2, '0')}-${String(displayDay).padStart(2, '0')}`
}

/** 30/360 日期加法：每月=30天，一年=360天 */
function add30Days360(date: Date360, days: number): Date360 {
  let total = date.m * 30 + (date.d - 1) + days
  let newYear = date.y
  if (total < 0) {
    const yearsBack = Math.ceil(Math.abs(total) / 360)
    newYear -= yearsBack
    total += yearsBack * 360
  }
  newYear += Math.floor(total / 360)
  const rem = total % 360
  return {
    y: newYear,
    m: Math.floor(rem / 30),
    d: (rem % 30) + 1,
  }
}

/** 重复账单到期日：首笔保持原日期不变，后续按 30/360 每月30天顺延。
 *  避免 add30Days 的 toRealDate 溢出问题（2月30日→3月2日、31号回卷） */
export function repeatDueDate(dueDate: string, index: number, periodMonths: number): string {
  if (index === 0) return dueDate
  const d360 = add30Days360(parseDate360(dueDate), index * periodMonths * 30)
  return formatDate360Display(d360)
}

/**
 * 部分收款自动填充：按 30/360 口径（每月30天）推算收款覆盖到的账单结束日。
 * 与 generateRentBills 的期间/金额口径一致，避免真实日历天数与 30/360 不一致导致边界差 1-2 天。
 * periodStart/periodEnd 为账单 description 中的期间日期（YYYY-MM-DD）。
 */
export function calcCoveredPeriodEnd(
  periodStart: string,
  periodEnd: string,
  paidAmt: number,
  billAmount: number,
  freeDays = 0,
): string {
  if (billAmount <= 0 || paidAmt <= 0) return periodEnd
  const start = parseDate360(periodStart)
  const end = parseDate360(periodEnd)
  const totalDays = diffDays360(start, end) + 1
  if (totalDays <= 0) return periodEnd
  // 免租期口径（2026-09 新增）：账单金额只买得到"付费天数"的覆盖，
  // 但免租日应视为已覆盖（客户在免租期内不欠费），所以先记上免租天数再加付费覆盖。
  // 假设免租期位于期间前段——与「客户空置期」的实际用法一致。
  const free = Math.max(0, freeDays)
  const paidTotal = Math.max(1, totalDays - free)
  const paidCovered = Math.round((paidAmt / billAmount) * paidTotal)
  const covered = Math.max(1, Math.min(totalDays, free + paidCovered))
  return formatDate360Display(add30Days360(start, covered - 1))
}

/** 30/360 日期差（exclusive）：dateA 到 dateB 有多少天 */
export function diffDays360(dateA: Date360, dateB: Date360): number {
  const years = dateB.y - dateA.y
  const months = dateB.m - dateA.m
  const days = dateB.d - dateA.d
  return Math.max(0, years * 360 + months * 30 + days)
}

/** 将 30/360 日期转换为真实 Date（供比较用，2月30日→3月2日等） */
function toRealDate(d: Date360): Date {
  return new Date(d.y, d.m, d.d)
}

// ============================================================
// 对外接口（兼容旧签名）
// ============================================================

export function calculateDays30_360(startDate: Date, endDate: Date): number {
  return diffDays360(toDate360(startDate), toDate360(endDate))
}

export function calculateRent30_360(
  monthlyRent: number,
  startDate: Date,
  endDate: Date
): number {
  const days = calculateDays30_360(startDate, endDate)
  const dailyRate = monthlyRent / 30
  return Math.round(days * dailyRate * 100) / 100
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`
}

/**
 * 严格30/360日期加法：每月=30天，一年=360天。
 * 不论真实日历（大月小月2月），始终按30天/月计算。
 */
export function add30Days(date: Date, days: number): Date {
  const d360 = add30Days360(toDate360(date), days)
  return toRealDate(d360)
}

export interface DraftBill {
  type: 'rent' | 'other' | 'deposit'
  amount: number
  dueDate: string
  periodStart: string
  periodEnd: string
  description?: string
  /**
   * 生成时的虚拟日序号（30/360：年*360 + 月*30 + (日-1)）。
   * 仅生成期使用、**不落库**——用途是精确计算天数，绕开"2 月显示映射有损"
   * （虚拟 2月28/29 显示成 02-28 后再解析会变成 30，差 1-2 天）。
   */
  periodStart360?: number
  periodEnd360?: number
}

/** Date360 → 虚拟日序号（可比较、可相减的整数） */
function toIndex360(d: Date360): number {
  return d.y * 360 + d.m * 30 + (d.d - 1)
}

/**
 * 按30/360规则生成房租分期账单。
 * 每个月固定30天，一年=360天。
 * 每期连续（结束日+1天=下一期开始日）。
 *
 * splitMode:
 * - 'front'（默认）先整后零：从合同开始日切整期，零头截在合同末尾
 * - 'rear'  先零后整：从合同结束日往回切整期，零头作为首期
 */
export function generateRentBills(
  monthlyRent: number,
  contractStart: string,
  contractEnd: string,
  paymentMethod: PaymentMethod,
  advanceDays: number,
  splitMode: 'front' | 'rear' = 'front'
): DraftBill[] {
  const bills: DraftBill[] = []
  const start = parseDate360(contractStart)
  const end = parseDate360(contractEnd)

  // 每期月数
  let periodMonths: number
  let periodLabel: string
  switch (paymentMethod) {
    case 'monthly':
      periodMonths = 1
      periodLabel = '月'
      break
    case 'bi-monthly':
      periodMonths = 2
      periodLabel = '二月'
      break
    case 'quarterly':
      periodMonths = 3
      periodLabel = '季'
      break
    case 'semi-annual':
      periodMonths = 6
      periodLabel = '半年'
      break
    case 'annual':
      periodMonths = 12
      periodLabel = '年'
      break
  }

  // 按30/360总天数计算期数（非包含，避免整年多算）
  const periodDays = periodMonths * 30
  // 防御性钳制提前天数：不允许负数（提前付款），且不超过一期长度，
  // 否则后续期账单的到期日会漂移到合同开始日之前（或逐期提前漂移）
  const adv = Math.max(0, Math.min(advanceDays, periodDays))
  const totalDays = diffDays360(start, end)
  const nPeriods = Math.max(1, Math.ceil(totalDays / periodDays))

  let cursor = { ...start }

  if (splitMode === 'rear') {
    // 先零后整：从合同结束日往回切整期，零头作为首期
    // 先算出所有期结束日（从后往前），再倒序生成
    // ⚠️ 期数封顶：与 front 一致用 ceil(总天数/期天数)，避免合同天数恰好是整期
    //    倍数时 while 循环多切一期（产生倒置日期的 1 天多余账单，多收 1 天房租）
    const periodEnds: Date360[] = []
    let pEnd: Date360 = { ...end }
    for (let i = 0; i < nPeriods; i++) {
      periodEnds.push(pEnd)
      const pStart = add30Days360(pEnd, -(periodDays - 1))
      if (pStart.y < start.y || (pStart.y === start.y && pStart.m < start.m) ||
          (pStart.y === start.y && pStart.m === start.m && pStart.d < start.d)) {
        break
      }
      pEnd = add30Days360(pStart, -1)
    }

    for (let i = periodEnds.length - 1; i >= 0; i--) {
      const periodEnd360 = periodEnds[i]
      let periodStart360 = add30Days360(periodEnd360, -(periodDays - 1))
      // 首期（最后一段往前不足整期）从合同开始日补齐
      if (periodStart360.y < start.y || (periodStart360.y === start.y && periodStart360.m < start.m) ||
          (periodStart360.y === start.y && periodStart360.m === start.m && periodStart360.d < start.d)) {
        periodStart360 = { ...start }
      }
      const periodStart = formatDate360Display(periodStart360)
      const periodEnd = formatDate360Display(periodEnd360)
      const actualDays = 1 + diffDays360(periodStart360, periodEnd360)
      const amount = Math.round(monthlyRent / 30 * actualDays * 100) / 100
      // 首期（零头段：周期开始被补齐到合同开始日）应收日 = 合同开始日，与押金同天收
      // 其余整期应收日 = 周期开始 - 提前天数
      const isFirstPeriod =
        periodStart360.y === start.y && periodStart360.m === start.m && periodStart360.d === start.d
      const dueDate = isFirstPeriod
        ? formatDate360Display(periodStart360)
        : formatDate360Display(add30Days360(periodStart360, -adv))

      bills.push({
        type: 'rent',
        amount,
        dueDate,
        periodStart,
        periodEnd,
        description: `第${bills.length + 1}期 ${periodLabel}租 ${periodStart} ~ ${periodEnd}`,
        periodStart360: toIndex360(periodStart360),
        periodEnd360: toIndex360(periodEnd360),
      })
    }

    return bills
  }

  for (let i = 0; i < nPeriods; i++) {
    const periodStart: Date360 = i === 0 ? { ...start } : add30Days360(cursor, 1)
    let periodEnd: Date360 = add30Days360(periodStart, periodDays - 1)
    // 最后一期不超出合同到期日
    if (periodEnd.y > end.y || (periodEnd.y === end.y && periodEnd.m > end.m) ||
        (periodEnd.y === end.y && periodEnd.m === end.m && periodEnd.d > end.d)) {
      periodEnd = { ...end }
    }
    // 用30/360天数算金额
    const actualDays = 1 + diffDays360(periodStart, periodEnd)
    const amount = Math.round(monthlyRent / 30 * actualDays * 100) / 100
    // 提前付款
    const dueDate = i === 0
      ? formatDate360Display(periodStart)
      : formatDate360Display(add30Days360(periodStart, -adv))

    bills.push({
      type: 'rent',
      amount,
      dueDate,
      periodStart: formatDate360Display(periodStart),
      periodEnd: formatDate360Display(periodEnd),
      description: `第${i+1}期 ${periodLabel}租 ${formatDate360Display(periodStart)} ~ ${formatDate360Display(periodEnd)}`,
      periodStart360: toIndex360(periodStart),
      periodEnd360: toIndex360(periodEnd),
    })

    cursor = periodEnd
  }

  return bills
}

// ============================================================
// 租客侧免租期（日期区间）
// ============================================================

/**
 * 统计某期账单期间内落在免租区间的天数（30/360 含首尾）。
 * 无免租 / 入参不合法 / 无重叠 → 0。
 *
 * ⚠️ 本函数用字符串解析日期（与项目其它位置口径一致）。若期间边界是
 * 虚拟 2月28/29，解析会漂移到 30，结果可能差 1-2 天（已知问题、暂不修）。
 * 生成期请改用 applyVacancyAllowance（它优先用无漂移的虚拟日序号）。
 */
export function freeDaysInPeriod(
  periodStart: string,
  periodEnd: string,
  vacancyStart?: string,
  vacancyEnd?: string,
): number {
  if (!periodStart || !periodEnd || !vacancyStart || !vacancyEnd) return 0
  const ps = toIndex360(parseDate360(periodStart))
  const pe = toIndex360(parseDate360(periodEnd))
  const vs = toIndex360(parseDate360(vacancyStart))
  const ve = toIndex360(parseDate360(vacancyEnd))
  const oStart = Math.max(ps, vs)
  const oEnd = Math.min(pe, ve)
  return oEnd >= oStart ? oEnd - oStart + 1 : 0
}

/**
 * 按免租区间扣减各期房租账单金额（做法 A：直接扣减对应期金额，不新增账单）。
 *
 * 规则：逐期取「该期期间 ∩ 免租区间」的天数，扣减 = 天数 ÷ 30 × 月租（四舍五入到分）；
 * 扣减不超过该期原金额（不出负数）；区间跨多期时各期各扣，天然处理跨期。
 * 描述追加"（含免租N天）"，与业主侧写法一致。
 *
 * 免租区间缺失 / 非法（起 > 止）/ 月租非正 → **原样返回**，
 * 保证"没有免租"这条主路径与改动前逐字节一致。
 *
 * 天数优先用生成时写入的虚拟日序号（periodStart360 / periodEnd360），
 * 因此不受"2 月显示映射有损"影响，扣减金额精确。
 */
export function applyVacancyAllowance(
  bills: DraftBill[],
  vacancyStart: string | undefined,
  vacancyEnd: string | undefined,
  monthlyRent: number,
): DraftBill[] {
  if (!vacancyStart || !vacancyEnd) return bills
  if (!(monthlyRent > 0)) return bills
  const vs = toIndex360(parseDate360(vacancyStart))
  const ve = toIndex360(parseDate360(vacancyEnd))
  if (ve < vs) return bills

  return bills.map(bill => {
    const ps = bill.periodStart360 ?? toIndex360(parseDate360(bill.periodStart))
    const pe = bill.periodEnd360 ?? toIndex360(parseDate360(bill.periodEnd))
    const oStart = Math.max(ps, vs)
    const oEnd = Math.min(pe, ve)
    if (oEnd < oStart) return bill
    const freeDays = oEnd - oStart + 1
    const deduct = Math.round((freeDays / 30) * monthlyRent * 100) / 100
    return {
      ...bill,
      amount: Math.max(0, Math.round((bill.amount - deduct) * 100) / 100),
      description: `${bill.description ?? ''}（含免租${freeDays}天）`,
    }
  })
}
