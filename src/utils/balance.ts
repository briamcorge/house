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

/** 30/360 间隔天数（含首尾，与 calculator.ts actualDays 及 profit.ts days360 一致） */
function days360(a: string, b: string): number {
  const da = to360(a), db = to360(b)
  return (db.y - da.y) * 360 + (db.m - da.m) * 30 + (db.d - da.d) + 1
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
 * 取账单实际金额：paidAmount 有效（有限且 > 0）时用实收/实付，否则回退账单金额。
 * 与 profit.ts 的 `paidAmount || amount` 口径一致——旧写法 `paidAmount ?? amount` 在
 * paidAmount 为 0 时会取到 0（Excel 导入可产生这种数据），导致整笔账单被漏算。
 *
 * 例外：金额为负的退款单一律以账单金额为准。实收字段若被填成正数（手工编辑账单、
 * Excel 导入的「已付金额」列都是正数习惯），会把退款方向翻转成收款，双倍虚增余额。
 */
function billAmount(bill: Bill): number {
  const amount = Number(bill.amount)
  if (Number.isFinite(amount) && amount < 0) return amount
  const p = Number(bill.paidAmount)
  return Number.isFinite(p) && p > 0 ? p : amount
}

/**
 * 计算某张已收/已付账单到今天为止的"未消耗剩余金额"。
 * - 无覆盖期（一次性费用如卫管费/网费）：已收即消耗完，剩余 0
 * - 覆盖期结束 < 今天：已全部消耗，剩余 0
 * - 覆盖期开始 > 今天：未开始，剩余 = 全额
 * - 覆盖期包含今天：剩余 = 金额 × (结束-今天+1)/(结束-开始+1)（30/360，含首尾）
 */
export function calcBillRemain(bill: Bill, today: string): number {
  if (bill.status === 'cancelled') return 0
  const amount = billAmount(bill)
  if (!Number.isFinite(amount)) return 0 // 金额非数字（脏数据）：记 0，避免污染总额成 NaN
  const period = getBillPeriod(bill)
  if (!period) return 0 // 一次性费用：无覆盖期，已消耗
  const [bs, be] = period
  // 含首尾口径：末日当天仍有 1 天份额（今天还没被"消耗"），故用 < 而非 <=。
  // 原先用 <= 会在末日一次跳降 2 天份额（前一天 2/30 → 当天 0），与首日按日初语义返回全额不自洽。
  if (be < today) return 0
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
 * 已收账单剩余（direction=receivable, 已收/已退, 不含押金）− 已付账单剩余（direction=payable, 已付/已退, 不含押金）
 *
 * 注：More.tsx 现已改用 calculateCashBalance（真实现金口径），本函数目前无调用点，
 * 保留仅为兼容与对照——收付两侧的 status 过滤必须保持对称（payable 也要收 refunded）。
 */
export function calculateBalance(bills: Bill[], today: string): BalanceResult {
  let tenantRemain = 0
  let landlordRemain = 0
  for (const b of bills) {
    if (isDepositBill(b)) continue // 押金不算（租客押金要退，业主押金不算支出）
    if (b.direction === 'receivable' && (b.status === 'paid' || b.status === 'refunded')) {
      tenantRemain += calcBillRemain(b, today)
    } else if (b.direction === 'payable' && (b.status === 'paid' || b.status === 'refunded')) {
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

export interface CashBalanceResult {
  cash: number            // 手里的钱 = 累计到账 − 累计付出（均不含押金）
  received: number        // 累计到账（已收租金/费用 − 退给租客的钱）
  paid: number            // 累计付出（已付业主租金/费用 − 业主退回的钱）
  prepaidUnearned: number // 其中：租客预交但尚未住到的部分（不含押金，建议留存）
}

/**
 * 手里的钱（真实现金口径，不含押金）：
 *   累计到账（租客已收，退款单为负数自动抵减）
 * − 累计付出（已付业主，业主退回单为负数自动抵减）
 *
 * 与 calculateBalance 的「可支配余额」是两回事：本函数只认钱动没动，
 * 不按覆盖期分摊、不依赖 periodStart/periodEnd，因此手工账单、一次性费用、
 * 缺期间的账单都会如实计入（老口径对它们一律记 0，这是它"有时候不准"的主因）。
 *
 * 口径（与用户确认）：
 * - 押金双向都不计入（租客押金、付业主押金各有单独统计卡）
 * - 只统计真正动过钱的账单：status = paid / refunded 全额计入；
 *   pending/overdue 若录了实收金额（paidAmount > 0）按实收额计入；cancelled 不算
 * - 退款单在数据里是负数金额且带方向：receivable 负数=退给租客（钱出去），
 *   payable 负数=业主退给我们（钱进来），直接按方向带符号累加即可
 */
export function calculateCashBalance(bills: Bill[], today: string): CashBalanceResult {
  let received = 0
  let paid = 0
  let prepaidUnearned = 0
  for (const b of bills) {
    if (b.status === 'cancelled') continue
    // 已结清（已收/已付/已退）全额计入。
    // 未结清但录了实收金额（> 0）的同样计入——手工建单/编辑账单、Excel 导入可以产生
    // 「待收 + 实收金额」的组合（BillModal 只校验实收 > 0 且 ≤ 账单金额，不改状态），
    // 这笔钱确实到账了，旧逻辑会整笔漏掉（实测录 500 实收，cash 仍是 0）。
    const settled = b.status === 'paid' || b.status === 'refunded'
    const partialPaid = Number(b.paidAmount)
    if (!settled && !(Number.isFinite(partialPaid) && partialPaid > 0)) continue
    if (isDepositBill(b)) continue
    const amount = billAmount(b)
    if (!Number.isFinite(amount)) continue
    if (b.direction === 'receivable') {
      received += amount // 退款单为负数，自动抵减
      // 预交未住：已收与已退都要算。退款单是负数、按其覆盖期抵减，漏掉它会让"退掉的租金"
      // 仍被算作租客预交未住（实测：预交半年 12000、退 4/1~6/30 租金 6000，退租后小字虚高整笔 6000，
      // 极端情况下会出现「手里的钱 −6000，其中 7067 是租客预交」这种自相矛盾的显示）。
      prepaidUnearned += calcBillRemain(b, today)
    } else if (b.direction === 'payable') {
      paid += amount // 业主退回为负数，自动抵减
    }
  }
  // 只在总额处取整到分，避免逐笔取整导致的累积误差
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    received: round2(received),
    paid: round2(paid),
    cash: round2(received - paid),
    // 退款额大于剩余预交额（超额退款）时不显示负数：不存在"负的预交未住"
    prepaidUnearned: Math.max(0, round2(prepaidUnearned)),
  }
}
