/**
 * 租客侧免租期（日期区间）测试
 *
 * 覆盖三层：
 * 1. freeDaysInPeriod  —— 免租天数与期间的交集计算（边界）
 * 2. applyVacancyAllowance —— 扣减规则、跨期、扣到 0、默认路径零变化
 * 3. generateRentBills 新增的虚拟日序号字段是否与金额自洽（3a 的核心保证）
 *
 * ⚠️ 已知问题：期间边界落在虚拟 2月28/29 时，字符串解析会漂移到 30（差 1-2 天）。
 * 本文件里凡涉及该场景的用例都注明"漂移"，生成期用虚拟日序号可绕开它。
 */
import { describe, it, expect } from 'vitest'
import {
  parseDate360,
  diffDays360,
  generateRentBills,
  freeDaysInPeriod,
  applyVacancyAllowance,
  type DraftBill,
} from '../src/utils/calculator'
import type { PaymentMethod } from '../src/types'

const RENT = 3000
const DAY_RATE = RENT / 30 // 100 元/天

const METHODS: PaymentMethod[] = ['monthly', 'bi-monthly', 'quarterly', 'semi-annual', 'annual']

/** 手工构造一张账单（bill360 用虚拟日序号，模拟生成期） */
function makeBill(over: Partial<DraftBill> = {}): DraftBill {
  return {
    type: 'rent',
    amount: RENT,
    dueDate: '2026-01-01',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-30',
    ...over,
  }
}

// ============================================================
// freeDaysInPeriod
// ============================================================
describe('freeDaysInPeriod：免租天数 ∩ 期间天数', () => {
  it('无免租（缺参）→ 0', () => {
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30')).toBe(0)
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30', '2026-01-05', undefined)).toBe(0)
  })

  it('免租区间完全在期间之前 → 0', () => {
    expect(freeDaysInPeriod('2026-02-01', '2026-02-28', '2026-01-01', '2026-01-30')).toBe(0)
  })

  it('免租区间完全在期间之后 → 0', () => {
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30', '2026-03-01', '2026-03-30')).toBe(0)
  })

  it('免租区间覆盖整个期间 → 等于期间天数', () => {
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30', '2025-12-01', '2026-03-30')).toBe(30)
  })

  it('免租单日（起=止）→ 1', () => {
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30', '2026-01-15', '2026-01-15')).toBe(1)
  })

  it('免租区间从期间开头起、中途结束 → 取前缀', () => {
    expect(freeDaysInPeriod('2026-01-11', '2026-02-10', '2026-01-11', '2026-01-30')).toBe(20)
  })

  it('免租区间从期间中途起、延续到期间结束 → 取后缀', () => {
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30', '2026-01-11', '2026-05-30')).toBe(20)
  })

  it('免租区间是期间的中间一段 → 取中段', () => {
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30', '2026-01-11', '2026-01-20')).toBe(10)
  })

  it('非法区间（起 > 止）→ 0', () => {
    expect(freeDaysInPeriod('2026-01-01', '2026-01-30', '2026-01-20', '2026-01-10')).toBe(0)
  })
})

// ============================================================
// applyVacancyAllowance
// ============================================================
describe('applyVacancyAllowance：扣减规则', () => {
  const bills3 = generateRentBills(RENT, '2026-01-01', '2026-03-30', 'monthly', 0)

  it('不传免租 → 返回同一个数组（默认路径零变化）', () => {
    expect(applyVacancyAllowance(bills3, undefined, undefined, RENT)).toBe(bills3)
  })

  it('月租非正 → 原样返回', () => {
    expect(applyVacancyAllowance(bills3, '2026-01-01', '2026-01-10', 0)).toBe(bills3)
    expect(applyVacancyAllowance(bills3, '2026-01-01', '2026-01-10', -100)).toBe(bills3)
  })

  it('非法区间（起 > 止）→ 原样返回', () => {
    expect(applyVacancyAllowance(bills3, '2026-01-20', '2026-01-10', RENT)).toBe(bills3)
  })

  it('免租 10 天（落在首期）→ 首期扣 1000，其余期不动', () => {
    const out = applyVacancyAllowance(bills3, '2026-01-01', '2026-01-10', RENT)
    expect(out).toHaveLength(3)
    expect(out[0].amount).toBe(2000) // 3000 - 10/30*3000
    expect(out[1].amount).toBe(3000)
    expect(out[2].amount).toBe(3000)
  })

  it('描述追加"（含免租N天）"，且不破坏原有期间描述', () => {
    const out = applyVacancyAllowance(bills3, '2026-01-01', '2026-01-10', RENT)
    expect(out[0].description).toContain('第1期')
    expect(out[0].description).toContain('（含免租10天）')
    // 期间描述仍是原来的那对日期
    expect(out[0].description).toMatch(/2026-01-01\s*~\s*2026-01-30/)
    // 未涉及免租的期不加标注
    expect(out[1].description).not.toContain('免租')
  })

  it('免租区间跨期：各期各扣，扣减总额 = 免租天数 ÷ 30 × 月租（守恒）', () => {
    // 2026-01-20 ~ 2026-02-19 在 30/360 下是 30 天（1/20–1/30 共 11 天 + 2/1–2/19 共 19 天）
    const out = applyVacancyAllowance(bills3, '2026-01-20', '2026-02-19', RENT)
    const deducted = bills3.reduce((s, b, i) => s + (b.amount - out[i].amount), 0)
    expect(Math.round(deducted * 100) / 100).toBeCloseTo((30 / 30) * RENT, 2)
    // 逐期核对：第1期扣 11 天、第2期扣 19 天、第3期不动
    expect(bills3[0].amount - out[0].amount).toBe(1100)
    expect(bills3[1].amount - out[1].amount).toBe(1900)
    expect(bills3[2].amount - out[2].amount).toBe(0)
  })

  it('免租天数超过该期金额 → 扣到 0，不出负数', () => {
    const out = applyVacancyAllowance(bills3, '2026-01-01', '2026-06-30', RENT)
    for (const b of out) {
      expect(b.amount).toBe(0)
      expect(b.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('免租区间完全在合同期之外 → 所有期金额不变', () => {
    const out = applyVacancyAllowance(bills3, '2027-01-01', '2027-01-30', RENT)
    expect(out.map(b => b.amount)).toEqual(bills3.map(b => b.amount))
  })

  it('数字有小数（月租 2950）也正确到分', () => {
    const bills = generateRentBills(2950, '2026-01-01', '2026-01-30', 'monthly', 0)
    const out = applyVacancyAllowance(bills, '2026-01-01', '2026-01-10', 2950)
    // 10/30 * 2950 = 983.333... → 983.33
    expect(out[0].amount).toBe(Math.round((2950 - 983.33) * 100) / 100)
  })
})

// ============================================================
// 3a 的核心保证：优先用虚拟日序号，不受 2 月显示映射有损影响
// ============================================================
describe('3a：扣减按真实虚拟期间算，不按有损的字符串', () => {
  it('期间边界落在虚拟 2月28 时，扣减仍按真实的 30 天算', () => {
    // 构造"真实虚拟期间 = 1/29 ~ 2/28（30 天）"的账单，
    // 但字符串只能写成 2026-01-29 ~ 2026-02-28（再解析会变成 2/30 → 32 天）
    const ps360 = 2026 * 360 + 0 * 30 + (29 - 1)
    const pe360 = 2026 * 360 + 1 * 30 + (28 - 1) // 虚拟 2月28，不是 30
    const bill = makeBill({
      amount: RENT,
      dueDate: '2026-01-29',
      periodStart: '2026-01-29',
      periodEnd: '2026-02-28',
      periodStart360: ps360,
      periodEnd360: pe360,
    })

    // 免租 = 用户输入 2026-02-01 ~ 2026-02-28（按项目口径 2/28 → 虚拟 2/30）
    // 真实重叠 = 虚拟 2/1 ~ 2/28 = 28 天 → 扣 28/30*3000 = 2800
    // 若误用字符串：重叠 = 2/1 ~ 2/30 = 30 天 → 扣 3000（会归零）
    const out = applyVacancyAllowance([bill], '2026-02-01', '2026-02-28', RENT)
    expect(out[0].amount).toBe(200)
    expect(out[0].description).toContain('（含免租28天）')
  })

  it('没有虚拟日序号时回退字符串解析（旧数据兼容）', () => {
    const bill = makeBill({ amount: RENT, periodStart: '2026-01-01', periodEnd: '2026-01-30' })
    const out = applyVacancyAllowance([bill], '2026-01-01', '2026-01-10', RENT)
    expect(out[0].amount).toBe(2000)
  })
})

// ============================================================
// 生成器新字段的自洽性（如果哪天接错了，这里会红）
// ============================================================
describe('generateRentBills：虚拟日序号字段与金额自洽', () => {
  const CONTRACTS: Array<[string, string]> = [
    ['2026-01-01', '2026-12-31'],
    ['2026-01-01', '2027-01-01'],
    ['2026-01-29', '2027-01-28'], // 触发 2 月漂移的起租日
    ['2026-01-30', '2027-01-29'],
    ['2026-06-30', '2027-06-29'],
    ['2028-02-01', '2029-01-31'],
  ]

  it('每期 periodEnd360 - periodStart360 + 1 必须等于金额隐含天数', () => {
    for (const [cs, ce] of CONTRACTS) {
      for (const method of METHODS) {
        for (const mode of ['front', 'rear'] as const) {
          const bills = generateRentBills(RENT, cs, ce, method, 0, mode)
          for (const b of bills) {
            const tag = `${cs}~${ce}/${method}/${mode}`
            expect(b.periodStart360, `${tag} 缺 periodStart360`).toBeTypeOf('number')
            expect(b.periodEnd360, `${tag} 缺 periodEnd360`).toBeTypeOf('number')
            const days = b.periodEnd360! - b.periodStart360! + 1
            const fromAmount = Math.round((b.amount / DAY_RATE) * 100) / 100
            expect(days, `${tag} 第${b.description?.slice(0, 3)}期 天数与金额不符`).toBe(fromAmount)
          }
        }
      }
    }
  })

  it('虚拟日序号不受字符串有损影响：2 月边界的期，序号的差与字符串反推的差可能不同', () => {
    // 起租 2026-01-29 的首期真实虚拟期间是 1/29~2/28（30 天）
    const bills = generateRentBills(RENT, '2026-01-29', '2026-06-30', 'monthly', 0)
    const b = bills[0]
    const trueDays = b.periodEnd360! - b.periodStart360! + 1
    const stringDays = 1 + diffDays360(parseDate360(b.periodStart), parseDate360(b.periodEnd))
    expect(trueDays).toBe(30)
    expect(stringDays).toBe(32) // ← 这就是"2 月漂移"：字符串反推多出 2 天
    expect(b.periodEnd).toBe('2026-02-28') // 界面上显示为月末
  })
})
