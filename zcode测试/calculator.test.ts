/**
 * calculator.ts 测试 —— 30/360 日期运算与房租分期账单生成
 *
 * 设计原则（2026-09-13 约定）：
 * 1. 期望值来自业务规则与源码注释里记录的实测值，**不**从当前代码输出反抄
 *    （反抄会把 bug 一起锁死成"规格"）。
 * 2. 优先断言"性质"而非"数字"：守恒、连续、往返还原、幂等。
 *    性质由机器穷举输入去撞，能覆盖人想不到的边界。
 * 3. 不依赖真实时钟、时区、随机数 —— 本文件不出现 Date.now()。
 * 4. 历史 bug 锚点：每个断言对应的历史问题写在用例注释里，
 *    失败时能立刻知道它在保护什么。
 *
 * 私有函数（formatDate360Display / add30Days360 等 5 个）不做 export，
 * 因此全部通过公开入口（generateRentBills / repeatDueDate / calcCoveredPeriodEnd）间接覆盖 ——
 * 这样测试不需要改动 src/ 任何一行。
 */
import { describe, it, expect } from 'vitest'
import {
  parseDate360,
  diffDays360,
  add30Days,
  repeatDueDate,
  calcCoveredPeriodEnd,
  calculateDays30_360,
  calculateRent30_360,
  formatDate,
  formatCurrency,
  generateRentBills,
} from '../src/utils/calculator'
import type { Date360 } from '../src/utils/calculator'
import type { PaymentMethod } from '../src/types'

const RENT = 3000
const d360 = (y: number, m: number, d: number): Date360 => ({ y, m, d })

const METHODS: PaymentMethod[] = ['monthly', 'bi-monthly', 'quarterly', 'semi-annual', 'annual']
const ALL_MODES = ['front', 'rear'] as const

/** 用于不变量的合同样本：含整年、恰好整期倍数、2 月末边界、跨闰年 2 月、短合同 */
const CONTRACTS: Array<[string, string, string]> = [
  ['2026-01-01', '2026-12-31', '普通整年（月末起止）'],
  ['2026-01-01', '2027-01-01', '恰好 360 天（整期倍数，历史 bug 锚点）'],
  ['2026-01-29', '2027-01-28', '起租日落在 2 月末边界（30/360 显示映射敏感）'],
  ['2026-03-15', '2027-03-14', '月中起租跨年'],
  ['2028-02-01', '2029-01-31', '跨闰年 2 月'],
  ['2026-06-30', '2026-07-30', '短合同（30 天）'],
]

/** 已知缺陷：虚拟 2 月 28/29 日显示后再解析会漂移到 30，导致期间边界无法无损往返 */
const DRIFT_CONTRACT = '2026-01-29~2027-01-28'

// ============================================================
// parseDate360
// ============================================================
describe('parseDate360', () => {
  it('普通日期原样解析，月份转为 0-11', () => {
    expect(parseDate360('2026-03-15')).toEqual(d360(2026, 2, 15))
  })

  it('大月 31 号映射为虚拟 30 号', () => {
    expect(parseDate360('2026-03-31').d).toBe(30)
  })

  it('30 号保持 30 号', () => {
    expect(parseDate360('2026-03-30').d).toBe(30)
  })

  it('平年 2月28 映射为虚拟 30 号', () => {
    expect(parseDate360('2026-02-28')).toEqual(d360(2026, 1, 30))
  })

  it('闰年 2月29 映射为虚拟 30 号', () => {
    expect(parseDate360('2028-02-29')).toEqual(d360(2028, 1, 30))
  })

  it('2月27 不触发映射（保持 27）', () => {
    expect(parseDate360('2026-02-27')).toEqual(d360(2026, 1, 27))
  })

  it('闰年 2月28 不映射（该年 2 月有 29 天，28 号不是月末）', () => {
    expect(parseDate360('2028-02-28')).toEqual(d360(2028, 1, 28))
  })

  it('世纪闰年 2000-02-28 不映射（2000 是闰年）', () => {
    expect(parseDate360('2000-02-28')).toEqual(d360(2000, 1, 28))
  })

  it('非闰世纪年 1900-02-28 映射为 30（1900 不是闰年）', () => {
    expect(parseDate360('1900-02-28')).toEqual(d360(1900, 1, 30))
  })
})

// ============================================================
// diffDays360（exclusive，且负数钳 0）
// ============================================================
describe('diffDays360', () => {
  it('同一日期差为 0（不含尾）', () => {
    expect(diffDays360(d360(2026, 2, 15), d360(2026, 2, 15))).toBe(0)
  })

  it('同一月内按实际日差（1/1 → 1/31 = 29）', () => {
    expect(diffDays360(parseDate360('2026-01-01'), parseDate360('2026-01-31'))).toBe(29)
  })

  it('跨月按 30 天/月（1/1 → 4/1 = 90）', () => {
    expect(diffDays360(parseDate360('2026-01-01'), parseDate360('2026-04-01'))).toBe(90)
  })

  it('整年为 360 天', () => {
    expect(diffDays360(parseDate360('2026-01-01'), parseDate360('2027-01-01'))).toBe(360)
  })

  it('跨 2 月仍按 30 天计（1/1 → 3/1 = 60）', () => {
    expect(diffDays360(parseDate360('2026-01-01'), parseDate360('2026-03-01'))).toBe(60)
  })

  it('日期颠倒时钳为 0，不返回负数（防御）', () => {
    expect(diffDays360(parseDate360('2026-02-01'), parseDate360('2026-01-01'))).toBe(0)
  })
})

// ============================================================
// add30Days（公开入口，返回真实 Date）
// ============================================================
describe('add30Days', () => {
  it('加 30 天 = 下一虚拟月同日', () => {
    expect(formatDate(add30Days(new Date(2026, 0, 1), 30))).toBe('2026-02-01')
  })

  it('加 360 天 = 次年同日', () => {
    expect(formatDate(add30Days(new Date(2026, 0, 1), 360))).toBe('2027-01-01')
  })

  it('加 0 天不变', () => {
    expect(formatDate(add30Days(new Date(2026, 0, 1), 0))).toBe('2026-01-01')
  })

  it('负数天数跨年回退（-1 天 = 上月末，验证借位分支）', () => {
    expect(formatDate(add30Days(new Date(2026, 0, 1), -1))).toBe('2025-12-30')
  })

  it('大跨度加 1000 天', () => {
    expect(formatDate(add30Days(new Date(2026, 0, 1), 1000))).toBe('2028-10-11')
  })
})

// ============================================================
// repeatDueDate
// ============================================================
describe('repeatDueDate', () => {
  it('index=0 保持原始到期日不变', () => {
    expect(repeatDueDate('2026-01-15', 0, 1)).toBe('2026-01-15')
  })

  it('月付第二期顺延 30 天', () => {
    expect(repeatDueDate('2026-01-15', 1, 1)).toBe('2026-02-15')
  })

  it('季付第二期顺延 90 天', () => {
    expect(repeatDueDate('2026-01-15', 1, 3)).toBe('2026-04-15')
  })

  it('半年付第三期顺延 360 天 = 次年同期', () => {
    expect(repeatDueDate('2026-01-15', 2, 6)).toBe('2027-01-15')
  })

  it('年付第二期跨年', () => {
    expect(repeatDueDate('2026-06-30', 1, 12)).toBe('2027-06-30')
  })

  it('1/31 起租：第二期不产生 3月2日 溢出（本函数存在的理由）', () => {
    // 注释 calculator.ts:78-79：避免 toRealDate 溢出（2月30日→3月2日、31号回卷）
    expect(repeatDueDate('2026-01-31', 1, 1)).toBe('2026-02-28')
  })
})

// ============================================================
// calcCoveredPeriodEnd
// ============================================================
describe('calcCoveredPeriodEnd', () => {
  it('全额收款 → 覆盖到期间结束日', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', 1000, 1000)).toBe('2026-01-30')
  })

  it('半额收款 → 覆盖到期间中点', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', 500, 1000)).toBe('2026-01-15')
  })

  it('只收 1/30 的金额 → 只覆盖第 1 天', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', 1000 / 30, 1000)).toBe('2026-01-01')
  })

  it('收款为 0 → 原样返回期间结束日（防御）', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', 0, 1000)).toBe('2026-01-30')
  })

  it('账单金额为 0 → 原样返回（防除零）', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', 500, 0)).toBe('2026-01-30')
  })

  it('负数收款 → 原样返回（防御）', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', -100, 1000)).toBe('2026-01-30')
  })

  it('收款超过账单额 → 钳到期间结束日，不越界', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-30', 5000, 1000)).toBe('2026-01-30')
  })

  it('单日期间（起=止）不报错', () => {
    expect(calcCoveredPeriodEnd('2026-01-01', '2026-01-01', 100, 100)).toBe('2026-01-01')
  })
})

// ============================================================
// 兼容旧签名的接口
// ============================================================
describe('calculateDays30_360 / calculateRent30_360', () => {
  it('一个月按 30 天', () => {
    expect(calculateDays30_360(new Date(2026, 0, 1), new Date(2026, 1, 1))).toBe(30)
  })

  it('整年 360 天', () => {
    expect(calculateDays30_360(new Date(2026, 0, 1), new Date(2027, 0, 1))).toBe(360)
  })

  it('月租 3000 整月 = 3000.00', () => {
    expect(calculateRent30_360(3000, new Date(2026, 0, 1), new Date(2026, 1, 1))).toBe(3000)
  })

  it('月租 3000 半月 = 1500.00', () => {
    expect(calculateRent30_360(3000, new Date(2026, 0, 1), new Date(2026, 0, 16))).toBe(1500)
  })
})

describe('formatDate / formatCurrency', () => {
  it('formatDate 月/日补零', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('formatDate 双位数不受影响', () => {
    expect(formatDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('formatCurrency 保留两位小数', () => {
    expect(formatCurrency(1500)).toBe('¥1500.00')
  })

  it('formatCurrency 负数带符号', () => {
    expect(formatCurrency(-100.5)).toBe('¥-100.50')
  })
})

// ============================================================
// generateRentBills —— 具体值断言
// ============================================================
describe('generateRentBills 具体值', () => {
  it('月付：12 期，各期 30 天，每期金额 = 月租', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-12-31', 'monthly', 0)
    expect(bills).toHaveLength(12)
    expect(bills.every(b => b.type === 'rent')).toBe(true)
    expect(bills.map(b => b.amount)).toEqual(Array(12).fill(RENT))
  })

  it('季付：恰好 360 天合同只切 4 期，且末期补齐到合同结束日（含尾）', () => {
    // 两个锚点：
    // ① 历史 bug：合同天数恰好整期倍数时 while 多切一期，产生倒置日期的 1 天多余账单 → 期数必须仍是 4（不能变 5）
    // ② 2026-09 口径统一：铺期原本"只截断不补齐"，末期会停在结束日前一天（少收 1 天），
    //    而少不少取决于付款方式的期长 → 同一合同换个付款方式总额就变。
    //    统一补齐后总天数恒为「跨度 + 1」（含尾）= 361 天，末期因此是 91 天、金额 9100。
    const bills = generateRentBills(RENT, '2026-01-01', '2027-01-01', 'quarterly', 0)
    expect(bills).toHaveLength(4)
    expect(bills.map(b => b.amount)).toEqual([9000, 9000, 9000, 9100])
    expect(bills[3].periodStart).toBe('2026-10-01')
    expect(bills[3].periodEnd).toBe('2027-01-01')
  })

  it('季付 rear 切分：恰好 360 天同样只切 4 期（历史 bug 的第二处）', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2027-01-01', 'quarterly', 0, 'rear')
    expect(bills).toHaveLength(4)
  })

  it('5 种付款方式的期数与描述标签（front，360 天合同）', () => {
    const expected: Array<[PaymentMethod, number, string]> = [
      ['monthly', 12, '月租'],
      ['bi-monthly', 6, '二月租'],
      ['quarterly', 4, '季租'],
      ['semi-annual', 2, '半年租'],
      ['annual', 1, '年租'],
    ]
    for (const [method, count, label] of expected) {
      const bills = generateRentBills(RENT, '2026-01-01', '2027-01-01', method, 0)
      expect(bills, method).toHaveLength(count)
      expect(bills[0].description, method).toContain(`第1期 ${label}`)
    }
  })

  it('提前天数：首期不收提前，后续期 = 期开始日 − 提前天数', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-12-31', 'monthly', 10)
    expect(bills[0].dueDate).toBe('2026-01-01')
    // 第 2 期期间起点为虚拟 2/1，提前 10 天 → 虚拟 1/21
    expect(bills[1].dueDate).toBe('2026-01-21')
  })

  it('提前天数超过一期长度时被钳制（不越过合同开始日）', () => {
    // 注释 calculator.ts:207-209：钳制防止后续期到期日漂移到合同开始日之前
    const bills = generateRentBills(RENT, '2026-01-01', '2026-12-31', 'monthly', 999)
    expect(bills[1].dueDate).toBe('2026-01-01')
  })

  it('负数提前天数被钳为 0（到期日 = 期开始日）', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-12-31', 'monthly', -5)
    expect(bills[1].dueDate).toBe(bills[1].periodStart)
  })

  it('1 天合同：至少 1 期，金额 = 月租/30', () => {
    const bills = generateRentBills(RENT, '2026-03-01', '2026-03-01', 'monthly', 0)
    expect(bills).toHaveLength(1)
    expect(bills[0].amount).toBe(100)
  })

  it('29 天合同：1 期，金额按 29 天', () => {
    const bills = generateRentBills(RENT, '2026-03-01', '2026-03-29', 'monthly', 0)
    expect(bills).toHaveLength(1)
    expect(bills[0].amount).toBe(2900)
  })

  it('平年跨 2 月：期间边界显示为 2 月末，不出现 2月30日', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-03-31', 'monthly', 0)
    expect(bills[1].periodStart).toBe('2026-02-01')
    expect(bills[1].periodEnd).toBe('2026-02-28')
  })

  it('闰年跨 2 月：期间边界显示为 2月29', () => {
    const bills = generateRentBills(RENT, '2028-01-01', '2028-03-31', 'monthly', 0)
    expect(bills[1].periodEnd).toBe('2028-02-29')
  })
})

// ============================================================
// generateRentBills —— 不变量（机器穷举 5 方式 × 2 模式 × 6 合同）
// ============================================================
describe('generateRentBills 不变量：金额守恒', () => {
  for (const [cs, ce, desc] of CONTRACTS) {
    for (const mode of ALL_MODES) {
      it(`${mode} / ${cs}~${ce}（${desc}）：各期金额为正、有限，且之和 = 月租 ÷ 30 × 覆盖天数`, () => {
        for (const method of METHODS) {
          const bills = generateRentBills(RENT, cs, ce, method, 0, mode)
          const tag = `${method}/${mode}/${cs}~${ce}`

          expect(bills.length, tag).toBeGreaterThan(0)
          for (const b of bills) {
            expect(Number.isFinite(b.amount), `${tag} 金额应为有限数`).toBe(true)
            expect(b.amount, `${tag} 各期金额必须为正`).toBeGreaterThan(0)
            expect(b.periodStart, `${tag} 期间起不能为空`).toBeTruthy()
            expect(b.periodEnd, `${tag} 期间止不能为空`).toBeTruthy()
          }

          // 守恒：切分不创造也不丢失金额
          const tiled = 1 + diffDays360(parseDate360(bills[0].periodStart), parseDate360(bills[bills.length - 1].periodEnd))
          const expectedSum = Math.round((RENT / 30) * tiled * 100) / 100
          const sum = Math.round(bills.reduce((s, b) => s + b.amount, 0) * 100) / 100
          expect(sum, `${tag} 金额之和应等于 月租/30 × ${tiled} 天`).toBeCloseTo(expectedSum, 2)
        }
      })
    }
  }
})

describe('generateRentBills 不变量：期间连续、不重叠、不遗漏', () => {
  for (const [cs, ce, desc] of CONTRACTS) {
    for (const mode of ALL_MODES) {
      const tag = `${mode}/${cs}~${ce}`
      const isDrift = `${cs}~${ce}` === DRIFT_CONTRACT
      const runner = isDrift ? it.fails : it
      runner(`${tag}（${desc}）：相邻期首尾相接，无空隙无重叠`, () => {
        // 已知缺陷：该合同会产生"虚拟 2月28"边界，显示后再解析漂移至 2月30，
        // 导致相邻期之间凭空多出 1-2 天。详见本文件末尾"已知缺陷"用例。
        for (const method of METHODS) {
          const bills = generateRentBills(RENT, cs, ce, method, 0, mode)
          for (let i = 1; i < bills.length; i++) {
            const prevEnd = parseDate360(bills[i - 1].periodEnd)
            // 虚拟日 d 恒在 1..30（parseDate360 已钳制）：
            // d = 30 → 下一虚拟月初；d < 30 → 同日 +1
            const normalized = prevEnd.d >= 30
              ? { y: prevEnd.m === 11 ? prevEnd.y + 1 : prevEnd.y, m: (prevEnd.m + 1) % 12, d: 1 }
              : { y: prevEnd.y, m: prevEnd.m, d: prevEnd.d + 1 }
            expect(parseDate360(bills[i].periodStart), `${tag}/${method} 第${i + 1}期起点应紧接上一期终点`).toEqual(normalized)
          }
        }
      })
    }
  }
})

describe('generateRentBills 不变量：覆盖合同首尾', () => {
  for (const [cs, ce, desc] of CONTRACTS) {
    it(`front：首期起点 = 合同开始日 / rear：末期终点 = 合同结束日（${desc}）`, () => {
      for (const method of METHODS) {
        const front = generateRentBills(RENT, cs, ce, method, 0, 'front')
        expect(parseDate360(front[0].periodStart), `front/${method} 首期起点应为合同开始日`).toEqual(parseDate360(cs))

        const rear = generateRentBills(RENT, cs, ce, method, 0, 'rear')
        expect(parseDate360(rear[rear.length - 1].periodEnd), `rear/${method} 末期终点应为合同结束日`).toEqual(parseDate360(ce))
      }
    })
  }
})

// ============================================================
// 核心不变量：同一合同的总天数必须与付款方式无关
// （2026-09 口径统一后新增。此前"跨度能被期长整除"时会少一天，
//   表现为月付 210 / 季付 211 这类"同一合同总额随付款方式漂移"。）
// ============================================================
describe('不变量：同一合同 × 5 付款方式 × front/rear 的总天数必须全部相同', () => {
  const CASES: Array<[string, string, string]> = [
    ['2026-01-01', '2026-08-01', '跨度 210：能被 30/60 整除，不能被 90 整除'],
    ['2026-03-01', '2026-11-01', '跨度 240：能被 30/60 整除，不能被 90 整除'],
    ['2026-01-01', '2027-01-01', '跨度 360：能被全部期长整除'],
    ['2026-01-01', '2026-12-31', '跨度 359：全部除不尽（与实际合同的常态写法一致）'],
    ['2026-06-30', '2027-02-28', '跨度 240 且起租日在月末'],
  ]

  for (const [cs, ce, desc] of CASES) {
    it(`${cs}~${ce}（${desc}）：总额与付款方式无关，且 = 跨度 + 1 天`, () => {
      const detail: string[] = []
      for (const method of METHODS) {
        for (const mode of ALL_MODES) {
          const bills = generateRentBills(RENT, cs, ce, method, 0, mode)
          // RENT = 3000 → 日租 100 元整，各期金额都是 100 的整数倍 → 天数是精确整数，不受取整噪声影响
          const days = Math.round(bills.reduce((s, b) => s + b.amount / (RENT / 30), 0) * 100) / 100
          detail.push(`${method}/${mode}=${days}`)
        }
      }
      const dayValues = detail.map(d => Number(d.split('=')[1]))
      expect(new Set(dayValues).size, `各方式总天数应完全一致，实际：${detail.join(' ')}`).toBe(1)
      const span = diffDays360(parseDate360(cs), parseDate360(ce))
      expect(dayValues[0], `${cs}~${ce} 总天数应 = 跨度 + 1（含尾）`).toBe(span + 1)
    })
  }
})

// ============================================================
// 已知缺陷锚点（当前必须失败；修复后会"意外通过"，提醒移除 .fails）
// ============================================================
describe('已知缺陷', () => {
  it('虚拟 2 月 30 号这一档是无损的：显示为月末后能还原回 30', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-03-31', 'monthly', 0)
    expect(bills[1].periodEnd).toBe('2026-02-28')
    expect(parseDate360(bills[1].periodEnd)).toEqual(d360(2026, 1, 30))
  })

  it.fails('虚拟 2 月 28/29 号无法无损往返（28 与 29 都显示成 02-28，回解析一律变成 30）', () => {
    // 起租 2026-01-29 的首期真实虚拟期间是 1/29 ~ 2/28，账单里写成 "2026-02-28"；
    // 由于 parseDate360 把 2 月 >=28 的日期一律映射为 30，
    // 这段期间被外部程序（profit.ts / balance.ts 的 to360）读回时会变成 2/30，
    // 分摊天数被撑大 1-2 天 → 利润/余额按错误比例计算。
    const bills = generateRentBills(RENT, '2026-01-29', '2026-06-30', 'monthly', 0)
    expect(bills[0].periodEnd).toBe('2026-02-28')
    expect(parseDate360(bills[0].periodEnd)).toEqual(d360(2026, 1, 28))
  })
})

// ============================================================
// 变异测试补强（首轮变异得分 76.74%，以下用例针对存活变异集中的分支）
// ============================================================

// 存活最集中的一处：toDate360 的 2 月/闰年分支（20 个变异）
// 原有真实 Date 用例只用了 1 月与 3 月，从未喂过 2 月，该分支整段未被覆盖。
describe('真实 Date 的 2 月映射（calculateDays30_360）', () => {
  it('平年 2月28 视为月末（到 3/1 只差 1 天）', () => {
    expect(calculateDays30_360(new Date(2026, 1, 28), new Date(2026, 2, 1))).toBe(1)
  })

  it('闰年 2月28 不是月末（2028 年 2 月有 29 天，到 3/1 差 3 天）', () => {
    expect(calculateDays30_360(new Date(2028, 1, 28), new Date(2028, 2, 1))).toBe(3)
  })

  it('闰年 2月29 视为月末（到 3/1 差 1 天）', () => {
    expect(calculateDays30_360(new Date(2028, 1, 29), new Date(2028, 2, 1))).toBe(1)
  })

  it('平年 2月27 不是月末（到 3/1 差 4 天）', () => {
    expect(calculateDays30_360(new Date(2026, 1, 27), new Date(2026, 2, 1))).toBe(4)
  })

  it('非 2 月的 28 号不做月末映射（1/28 到 2/1 差 3 天）', () => {
    expect(calculateDays30_360(new Date(2026, 0, 28), new Date(2026, 1, 1))).toBe(3)
  })

  it('31 号映射为 30 号（1/31 到 2/1 差 1 天）', () => {
    expect(calculateDays30_360(new Date(2026, 0, 31), new Date(2026, 1, 1))).toBe(1)
  })

  it('世纪闰年 2000-02-29 视为月末', () => {
    expect(calculateDays30_360(new Date(2000, 1, 29), new Date(2000, 2, 1))).toBe(1)
  })

  it('非闰世纪年 1900-02-28 视为月末（1900 不是闰年）', () => {
    expect(calculateDays30_360(new Date(1900, 1, 28), new Date(1900, 2, 1))).toBe(1)
  })
})

describe('add30Days 负数借位跨多年', () => {
  it('回退 400 天走 yearsBack 循环（退回两年前）', () => {
    expect(formatDate(add30Days(new Date(2026, 0, 1), -400))).toBe('2024-11-21')
  })
})

describe('repeatDueDate 首期不做事后映射', () => {
  it('index=0 时 31 号原样返回，不被映射成 30 号', () => {
    expect(repeatDueDate('2026-01-31', 0, 1)).toBe('2026-01-31')
  })
})

describe('显示映射：虚拟 2月29 也映射为月末（而非显示 29 号）', () => {
  it('起租 2026-01-29 的第 2 期起点是虚拟 2/29，显示为 2/28', () => {
    const bills = generateRentBills(RENT, '2026-01-29', '2026-06-30', 'monthly', 0)
    expect(bills[1].periodStart).toBe('2026-02-28')
  })
})

// 存活次集中处：末期截断与 rear 首期补齐（约 30 个变异）
// 原有合同样本恰好都是整期倍数，截断/补齐分支从未触发。
describe('末期被截断（合同末尾不足一整期）', () => {
  it('front：末期金额按剩余天数，期间不越过合同结束日', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-03-15', 'monthly', 0)
    expect(bills).toHaveLength(3)
    expect(bills.map(b => b.amount)).toEqual([3000, 3000, 1500])
    expect(bills[2].periodStart).toBe('2026-03-01')
    expect(bills[2].periodEnd).toBe('2026-03-15')
  })

  it('rear：首期为不足整期的零头，起点从合同开始日补齐', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-03-15', 'monthly', 0, 'rear')
    expect(bills).toHaveLength(3)
    expect(bills.map(b => b.amount)).toEqual([1500, 3000, 3000])
    expect(bills[0].periodStart).toBe('2026-01-01')
    expect(bills[0].periodEnd).toBe('2026-01-15')
    expect(bills[2].periodEnd).toBe('2026-03-15')
  })

  it('front：季付末期不足一季（合同 224 天 → 3 期，末期为 45 天）', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-08-15', 'quarterly', 0)
    expect(bills).toHaveLength(3)
    expect(bills.map(b => b.amount)).toEqual([9000, 9000, 4500])
    expect(bills[2].periodEnd).toBe('2026-08-15')
  })

  it('front：年付的末期截断（1 年零 20 天）', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2027-01-20', 'annual', 0)
    expect(bills).toHaveLength(2)
    expect(bills[0].amount).toBe(36000)
    expect(bills[1].periodStart).toBe('2027-01-01')
    expect(bills[1].periodEnd).toBe('2027-01-20')
  })

  it('rear：季付末期不足一季时同样从合同开始日补齐', () => {
    const bills = generateRentBills(RENT, '2026-01-01', '2026-08-15', 'quarterly', 0, 'rear')
    expect(bills).toHaveLength(3)
    expect(bills[0].periodStart).toBe('2026-01-01')
    expect(bills[2].periodEnd).toBe('2026-08-15')
  })
})
