import { PaymentMethod } from '../types'

export function calculateDays30_360(startDate: Date, endDate: Date): number {
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth()
  let startDay = startDate.getDate()
  
  const endYear = endDate.getFullYear()
  const endMonth = endDate.getMonth()
  let endDay = endDate.getDate()
  
  if (startDay === 31) {
    startDay = 30
  }
  
  if (endDay === 31) {
    if (startDay >= 30) {
      endDay = 30
    }
  }
  
  const years = endYear - startYear
  const months = endMonth - startMonth
  const days = endDay - startDay
  
  const totalDays = years * 360 + months * 30 + days
  
  return Math.max(0, totalDays)
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
  const year = date.getFullYear()
  const month = date.getMonth()      // 0-indexed
  const day = date.getDate()         // 1-indexed

  // 从年初开始算总天数（用30天月）
  let total = month * 30 + (day - 1) + days

  // 处理负数：先减去足够的整年使 total ≥ 0
  let newYear = year
  if (total < 0) {
    const yearsBack = Math.ceil(Math.abs(total) / 360)
    newYear -= yearsBack
    total += yearsBack * 360
  }

  newYear += Math.floor(total / 360)
  const rem = total % 360
  const newMonth = Math.floor(rem / 30)
  const newDay = (rem % 30) + 1

  return new Date(newYear, newMonth, newDay)
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
 * 期数按月份差计算，每期连续（结束+1天=下一期开始）。
 * 例：2026-06-09 ~ 2027-06-08，季付：
 *   第1期: 2026-06-09 ~ 2026-09-08, 应付 2026-06-09, ¥18000
 *   第2期: 2026-09-09 ~ 2026-12-08, 应付 2026-09-09, ¥18000
 *   ...
 */
export function generateRentBills(
  monthlyRent: number,
  contractStart: string,
  contractEnd: string,
  paymentMethod: PaymentMethod,
  advanceDays: number
): DraftBill[] {
  const bills: DraftBill[] = []
  const start = new Date(contractStart)
  const end = new Date(contractEnd)

  // 按月份差计算总月数（30/360规则：一个月=30天）
  const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())

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

  const nPeriods = Math.max(1, Math.ceil(totalMonths / periodMonths))
  const periodDays = periodMonths * 30

  let cursor = new Date(start)

  for (let i = 0; i < nPeriods; i++) {
    const periodStart = i === 0 ? new Date(start) : add30Days(cursor, 1)
    let periodEnd = add30Days(periodStart, periodDays - 1)
    // 最后一期结束日不能超过合同到期日
    if (periodEnd > end) periodEnd = new Date(end)
    // 按实际天数算金额（含头含尾），确保最后一期也精确
    const actualDays = 1 + calculateDays30_360(periodStart, periodEnd)
    const amount = Math.round(monthlyRent / 30 * actualDays * 100) / 100
    // 提前付款从第二期开始，第一期正常收
    const dueDate = i === 0
      ? formatDate(periodStart)
      : formatDate(add30Days(periodStart, -advanceDays))

    bills.push({
      type: 'rent',
      amount,
      dueDate,
      periodStart: formatDate(periodStart),
      periodEnd: formatDate(periodEnd),
      description: `第${i+1}期 ${periodLabel}租 ${formatDate(periodStart)} ~ ${formatDate(periodEnd)}`,
    })

    cursor = periodEnd
  }

  return bills
}
