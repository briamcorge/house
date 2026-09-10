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
 * 计算某张已收/已付账单到今天为止的"未消耗剩余金额"（「可支配余额」的核心）。
 *
 * 口径（2026-09-11 与用户逐条确认，"按天消耗"模型）：
 * - 日租 = 账单原价 ÷ 覆盖期总天数（30/360，含首尾）；如月租 2000 → 66.67/天
 * - 已住天数 = 覆盖期开始 → 今天（含今天，"今天当天算已住"）
 * - 剩余 = 实收金额 − 已住天数 × 日租
 *   例①：月账单 2000、实收 500，今天 6.1 → 500 − 1×66.67 = 433.33
 *   例②：预交 8000 覆盖 3.1~6.30，今天 6.1 已住 91 天 → 8000 − 91×66.67 = 1933.33
 * - 部分收款按实收额消耗，且日租仍按账单原价算（不按实收等比例：500 也按每天 66.67 消耗）
 * - 收款单（正数）住超实收时记 0（收了 500 最多住掉 500，不出负数）
 * - 退款单（负数）不 clamp、按同一规则线性抵减（退未来期间的钱要抵减，随时间递减）
 * - 覆盖期结束 < 今天：已全部住完，剩余 0
 * - 覆盖期开始 > 今天：未开始，剩余 = 实收全额
 * - 无覆盖期（一次性费用如卫管费/网费/中介费、缺期间老账单）：已收即消耗完，剩余 0
 */
export function calcBillRemain(bill: Bill, today: string): number {
  if (bill.status === 'cancelled') return 0
  const received = billAmount(bill) // 实收/实付（部分收款取实收额；负数退款单强制取账单金额）
  if (!Number.isFinite(received)) return 0 // 金额非数字（脏数据）：记 0，避免污染总额成 NaN
  const period = getBillPeriod(bill)
  if (!period) return 0 // 一次性费用：无覆盖期，已收即消耗完
  const [bs, be] = period
  if (be < today) return 0 // 覆盖期已过完：住完，无剩余
  if (bs > today) return received // 未开始：全额未消耗
  const total = days360(bs, be)
  if (total <= 0) return 0
  // 日租按「账单原价」计算（不是实收额的比例），部分收款才能按原价逐日消耗：
  // 例：账单 2000/30 天、实收 500 → 每天消耗 66.67，而不是按 500/30=16.67 等比例
  const original = Number(bill.amount)
  const rate = (Number.isFinite(original) && original !== 0 ? original : received) / total
  const lived = days360(bs, today) // 已住天数（含今天）
  const remain = received - lived * rate
  // 收款单最多消耗到 0（住超实收不记负数）；退款单（负数）保持线性抵减
  const clamped = received > 0 ? Math.max(0, remain) : remain
  return Math.round(clamped * 100) / 100
}

export interface BalanceResult {
  tenantRemain: number   // 已收租客（不含押金）未消耗剩余
  landlordRemain: number // 已付业主（不含押金）未消耗剩余
  balance: number        // 可支配余额 = 租客剩余 - 业主剩余（负数 = 垫钱）
}

/**
 * 实时可支配余额（More 页概览第三个数字，2026-09-11 用户确认恢复启用）：
 * 已收账单剩余（receivable）− 已付账单剩余（payable），均不含押金；负数 = 垫钱。
 *
 * - 每张账单的"剩余"按覆盖期"按天消耗"计算（规则与例子见 calcBillRemain 注释）
 * - 收付两侧对称：已结清（paid/refunded）或录了实收/实付（paidAmount > 0）的参与；
 *   纯待收待付、cancelled 不参与；押金已单独成卡，整体排除
 */
export function calculateBalance(bills: Bill[], today: string): BalanceResult {
  let tenantRemain = 0
  let landlordRemain = 0
  for (const b of bills) {
    if (b.status === 'cancelled') continue
    if (isDepositBill(b)) continue // 押金不算（租客押金要退，业主押金不算支出）
    // 只统计真正动过钱的账单：已结清（paid/refunded）全额；未结清但录了实收/实付金额
    // （paidAmount > 0，手工编辑账单/Excel 导入可产生「待收 + 实收」组合）按实收额参与分摊
    const settled = b.status === 'paid' || b.status === 'refunded'
    const partialPaid = Number(b.paidAmount)
    if (!settled && !(Number.isFinite(partialPaid) && partialPaid > 0)) continue
    if (b.direction === 'receivable') {
      tenantRemain += calcBillRemain(b, today)
    } else if (b.direction === 'payable') {
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

export interface AccountBalanceResult {
  account: number  // 账户余额 = 累计到账 − 累计付出（均不含押金）
  received: number // 累计到账（已收租金/费用 − 退给租客的钱 − 业主退回的钱）
  paid: number     // 累计付出（已付业主租金/费用 − 业主退回的钱）
}

/**
 * 账户余额（真实现金口径：累计到账 − 累计付出，不含押金）。
 *
 * 注：2026-09-11 起 More 页概览第三个数字已改回「可支配余额」（calculateBalance，
 * 按覆盖期按天消耗），本函数暂无调用点，保留仅为对照与兼容。
 *
 * 口径（2026-09-10 与用户确认）：
 * - **押金整体不计入**（用户要求：押金已单独成卡——已收租户押金、已付业主押金），
 *   即：收/退租客押金、付/退业主押金都不影响本数字
 * - 只统计真正动过钱的账单：status = paid / refunded 全额计入；
 *   pending/overdue 若录了实收金额（paidAmount > 0）按实收额计入；cancelled 不算
 * - 退款单是负数金额且带方向：receivable 负数=退给租客（钱出去），
 *   payable 负数=业主退给我们（钱进来），直接按方向带符号累加即可
 * - 与「利润提取」无关：利润提取只写 profitRecords、不生成账单，不参与本计算（用户确认）
 */
export function calculateAccountBalance(bills: Bill[]): AccountBalanceResult {
  let received = 0
  let paid = 0
  for (const b of bills) {
    if (b.status === 'cancelled') continue
    // 已结清（已收/已付/已退）全额计入。
    // 未结清但录了实收金额（> 0）的同样计入——手工建单/编辑账单、Excel 导入可以产生
    // 「待收 + 实收金额」的组合（BillModal 只校验实收 > 0 且 ≤ 账单金额，不改状态），
    // 这笔钱确实到账了，漏掉会让余额偏低（实测录 500 实收时算成 0）。
    const settled = b.status === 'paid' || b.status === 'refunded'
    const partialPaid = Number(b.paidAmount)
    if (!settled && !(Number.isFinite(partialPaid) && partialPaid > 0)) continue
    if (isDepositBill(b)) continue // 押金不计入（已单独成卡）
    const amount = billAmount(b)
    if (!Number.isFinite(amount)) continue
    if (b.direction === 'receivable') received += amount // 退款单为负数，自动抵减
    else if (b.direction === 'payable') paid += amount // 业主退回为负数，自动抵减
  }
  // 只在总额处取整到分，避免逐笔取整导致的累积误差
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    received: round2(received),
    paid: round2(paid),
    account: round2(received - paid),
  }
}
