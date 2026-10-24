import { Bill } from '../types'
import { formatDateLocal } from '../lib/utils'

const PERIOD_RE = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/

export interface PartialPaymentPlanInput {
  bill: Bill
  paidAmount: number
  paidDate: string
  /** 本地今天（YYYY-MM-DD），用于派生剩余账单是 pending 还是 overdue */
  today: string
  payPeriodStart?: string
  payPeriodEnd?: string
  /** 仅房租应收传入；其他账单留空，保持原有 dueDate/status 不变 */
  remainingDueDate?: string
}

export interface PartialPaymentPlan {
  remainingAmount: number
  remainingPatch: Partial<Bill>
  paidBill: Omit<Bill, 'id' | 'createdAt'>
  remainingRange?: { start: string; end: string }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 部分收款/付款的纯计算：原账单保留剩余金额，另外生成一笔已收/已付账单。
 * 不写 paidAmount（拆单口径见 AGENTS.md），不改变已收新账单的 dueDate。
 */
export function planPartialPayment(input: PartialPaymentPlanInput): PartialPaymentPlan {
  const { bill, paidAmount, paidDate, today, payPeriodStart, payPeriodEnd } = input

  if (bill.status === 'paid' || bill.status === 'refunded') {
    throw new Error('已收/已退款账单不能再拆分')
  }
  if (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount >= bill.amount) {
    throw new Error('部分收款金额必须大于 0 且小于账单金额')
  }

  const remainingAmount = roundMoney(bill.amount - paidAmount)
  if (remainingAmount <= 0) {
    throw new Error('剩余金额必须大于 0')
  }

  let remainingRange: { start: string; end: string } | undefined
  if (payPeriodStart && payPeriodEnd) {
    const origEnd = bill.periodEnd || bill.description?.match(PERIOD_RE)?.[2]
    if (origEnd) {
      const nextDay = new Date(payPeriodEnd)
      nextDay.setDate(nextDay.getDate() + 1)
      const start = formatDateLocal(nextDay)
      // 剩余期间反置时（本次收款已覆盖整期）保留原元数据，避免该期房租在利润里凭空消失。
      if (start <= origEnd) {
        remainingRange = { start, end: origEnd }
      }
    }
  }

  const baseDesc = bill.description || ''
  const remainingPatch: Partial<Bill> = {
    amount: remainingAmount,
    paidDate: undefined,
  }

  if (remainingRange) {
    remainingPatch.periodStart = remainingRange.start
    remainingPatch.periodEnd = remainingRange.end
    remainingPatch.description = baseDesc.replace(
      PERIOD_RE,
      `${remainingRange.start} ~ ${remainingRange.end}`,
    )
  }

  const remainingDueDate = input.remainingDueDate?.trim() || undefined
  if (remainingDueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(remainingDueDate)) {
      throw new Error('剩余应缴日期格式必须是 YYYY-MM-DD')
    }
    remainingPatch.dueDate = remainingDueDate
    remainingPatch.status = bill.status === 'cancelled'
      ? 'cancelled'
      : (remainingDueDate < today ? 'overdue' : 'pending')
  }

  const periodDesc = payPeriodStart && payPeriodEnd
    ? `${payPeriodStart} ~ ${payPeriodEnd}`
    : undefined

  const paidBill: Omit<Bill, 'id' | 'createdAt'> = {
    propertyId: bill.propertyId,
    roomId: bill.roomId,
    tenantId: bill.tenantId,
    amount: paidAmount,
    type: bill.type,
    status: 'paid',
    direction: bill.direction,
    dueDate: bill.dueDate,
    paidDate,
    description: periodDesc ? baseDesc.replace(PERIOD_RE, periodDesc) : baseDesc,
    periodStart: payPeriodStart || bill.periodStart,
    periodEnd: payPeriodEnd || bill.periodEnd,
    landlordContractId: bill.landlordContractId,
  }

  return { remainingAmount, remainingPatch, paidBill, remainingRange }
}
