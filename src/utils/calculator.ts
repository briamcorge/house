import { PaymentMethod } from '../types'

// ============================================================
// 30/360 日期类型（纯30天月，不受真实日历限制）
// ============================================================
interface Date360 {
  y: number  // 年份
  m: number  // 月份 0-11
  d: number  // 日期 1-30（31号映射到30号）
}

/** 将 Date 转换为 30/360 日期（31号→30号） */
function toDate360(date: Date): Date360 {
  return {
    y: date.getFullYear(),
    m: date.getMonth(),
    d: Math.min(date.getDate(), 30),
  }
}

/** 从字符串"YYYY-MM-DD"解析 30/360 日期 */
function parseDate360(s: string): Date360 {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m: m - 1, d: Math.min(d, 30) }
}

/** 格式化 30/360 日期为 YYYY-MM-DD */
function formatDate360(d: Date360): string {
  return `${d.y}-${String(d.m + 1).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
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

/** 30/360 日期差（exclusive）：dateA 到 dateB 有多少天 */
function diffDays360(dateA: Date360, dateB: Date360): number {
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
  type: 'rent' | 'other'
  amount: number
  dueDate: string
  periodStart: string
  periodEnd: string
  description?: string
}

/**
 * 按30/360规则生成房租分期账单。
 * 每个月固定30天，一年=360天。
 * 每期连续（结束日+1天=下一期开始日）。
 */
export function generateRentBills(
  monthlyRent: number,
  contractStart: string,
  contractEnd: string,
  paymentMethod: PaymentMethod,
  advanceDays: number
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

  // 按30/360总天数计算期数
  const periodDays = periodMonths * 30
  const totalDays = 1 + diffDays360(start, end)  // inclusive
  const nPeriods = Math.max(1, Math.ceil(totalDays / periodDays))

  let cursor = { ...start }

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
      ? formatDate360(periodStart)
      : formatDate360(add30Days360(periodStart, -advanceDays))

    bills.push({
      type: 'rent',
      amount,
      dueDate,
      periodStart: formatDate360(periodStart),
      periodEnd: formatDate360(periodEnd),
      description: `第${i+1}期 ${periodLabel}租 ${formatDate360(periodStart)} ~ ${formatDate360(periodEnd)}`,
    })

    cursor = periodEnd
  }

  return bills
}
