import { Bill } from '../types'

/** 30/360 日期解析：每月30天，Feb 28→30，任何31→30（与 profit.ts 一致） */
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

/** 30/360 间隔天数（不含首尾差值，与覆盖期剩余计算匹配） */
function days360(a: string, b: string): number {
  const da = to360(a), db = to360(b)
  return (db.y - da.y) * 360 + (db.m - da.m) * 30 + (db.d - da.d)
}

/** 取账单覆盖期：优先 periodStart/periodEnd，旧数据从 description 提取 */
function getBillPeriod(bill: Bill): [string, string] | null {
  if (bill.periodStart && bill.periodEnd) return [bill.periodStart, bill.periodEnd]
  const m = bill.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
  if (m) return [m[1], m[2]]
  return null
}

/** 判断是否押金账单（type=deposit 或 description 含「押金」） */
export function isDepositBill(bill: Bill): boolean {
  return bill.type === 'deposit' || (bill.description as string)?.includes('押金') || false
}

/**
 * 计算某张已收/已付账单到今天为止的"未消耗剩余金额"。
 * - 无覆盖期（一次性费用如卫管费/网费）：已收即消耗完，剩余 0
 * - 覆盖期结束 <= 今天：已全部消耗，剩余 0
 * - 覆盖期开始 > 今天：未开始，剩余 = 全额
 * - 覆盖期包含今天：剩余 = 金额 × (结束-今天)/(结束-开始)（30/360）
 */
export function calcBillRemain(bill: Bill, today: string): number {
  if (bill.status === 'cancelled') return 0
  const amount = Number(bill.paidAmount ?? bill.amount)
  const period = getBillPeriod(bill)
  if (!period) return 0 // 一次性费用：无覆盖期，已消耗
  const [bs, be] = period
  if (be <= today) return 0 // 已全部到期
  if (bs > today) return amount // 未开始，全额未消耗
  const total = days360(bs, be)
  if (total <= 0) return 0
  const remain = amount * days360(today, be) / total
  return Math.round(remain * 100) / 100
}

export interface BalanceResult {
  tenantRemain: number   // 已收租客（不含押金）未消耗剩余
  landlordRemain: number // 已付业主（不含押金）未消耗剩余
  balance: number        // 可支配余额 = 租客剩余 - 业主剩余（负数 = 垫钱）
}

/**
 * 实时可支配余额：
 * 已收账单剩余（direction=receivable, 已收/已退, 不含押金）− 已付账单剩余（direction=payable, 已付, 不含押金）
 */
export function calculateBalance(bills: Bill[], today: string): BalanceResult {
  let tenantRemain = 0
  let landlordRemain = 0
  for (const b of bills) {
    if (isDepositBill(b)) continue // 押金不算（租客押金要退，业主押金不算支出）
    if (b.direction === 'receivable' && (b.status === 'paid' || b.status === 'refunded')) {
      tenantRemain += calcBillRemain(b, today)
    } else if (b.direction === 'payable' && b.status === 'paid') {
      landlordRemain += calcBillRemain(b, today)
    }
  }
  tenantRemain = Math.round(tenantRemain * 100) / 100
  landlordRemain = Math.round(landlordRemain * 100) / 100
  return {
    tenantRemain,
    landlordRemain,
    balance: Math.round((tenantRemain - landlordRemain) * 100) / 100,
  }
}
