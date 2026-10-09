import { describe, it, expect } from 'vitest'
import { checkPushGate, setCloudSummary } from '../src/lib/supabase'

// 推送前闸门测试（2026-10-09 第五次覆盖事故后加）
//
// 事故场景（真实数据）：云端 214 条账单 / 29 租客，其中 15 元网费已收款（收款日 2026-10-09）。
// 某设备带着 10-08 之前的旧快照推送 → 变成 208 条账单 / 28 租客，网费打回 30 元逾期无收款日。
// 闸门必须拦下这种推送，同时不能误拦正常操作。

const paid = (id: string, amount: number, paidDate: string) => ({
  id, amount, status: 'paid', paidDate, type: 'internet', direction: 'receivable',
})
const pending = (id: string, amount: number) => ({
  id, amount, status: 'pending', paidDate: '', type: 'rent', direction: 'receivable',
})
const tenant = (id: string, name = 'T') => ({ id, name, status: 'active' })
const trashItem = (originalId: string, type = 'bill') => ({ id: 'trash-' + originalId, originalId, type, data: {} })

function snap(opts: { bills: any[]; tenants?: any[]; trash?: any[] }) {
  return {
    properties: [], rooms: [],
    tenants: opts.tenants ?? [],
    bills: opts.bills,
    landlordContracts: [], profitRecords: [],
    trash: opts.trash ?? [],
  }
}

/** 建立云端基线，再检查本地待推送数据 */
function gate(cloud: ReturnType<typeof snap>, local: ReturnType<typeof snap>) {
  setCloudSummary(cloud)
  return checkPushGate(local)
}

describe('checkPushGate —— 推送前闸门', () => {
  it('无基线时放行（不误拦首次推送）', () => {
    const r = gate(snap({ bills: [] }), snap({ bills: [pending('b1', 100)] }))
    expect(r.blocked).toBe(false)
  })

  it('正常编辑金额（30→15）放行 —— 记录仍在，不算丢失', () => {
    const r = gate(
      snap({ bills: [pending('b1', 30)] }),
      snap({ bills: [{ id: 'b1', amount: 15, status: 'pending', paidDate: '' }] }),
    )
    expect(r.blocked).toBe(false)
  })

  it('正常新增放行', () => {
    const r = gate(
      snap({ bills: [pending('b1', 100)] }),
      snap({ bills: [pending('b1', 100), pending('b2', 200)] }),
    )
    expect(r.blocked).toBe(false)
  })

  it('正常收款（补上 paidDate）放行', () => {
    const r = gate(snap({ bills: [pending('b1', 15)] }), snap({ bills: [paid('b1', 15, '2026-10-09')] }))
    expect(r.blocked).toBe(false)
  })

  it('【事故场景 A】记录静默消失 → 拦截', () => {
    const r = gate(
      snap({
        tenants: [tenant('t-linshilun'), tenant('t-other')],
        bills: [paid('b-net', 15, '2026-10-09'), pending('b-r1', 2200), pending('b-r2', 2200)],
      }),
      // 旧快照：少了林世轮、少了两条账单，回收站里也没有它们
      snap({ tenants: [tenant('t-other')], bills: [paid('b-net', 15, '2026-10-09')] }),
    )
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.details.join(' ')).toMatch(/记录静默消失/)
  })

  it('【事故场景 B】已收款账单被打回未收 → 拦截', () => {
    const r = gate(
      snap({ bills: [paid('b-net', 15, '2026-10-09'), pending('b2', 2200)] }),
      snap({ bills: [{ id: 'b-net', amount: 30, status: 'overdue', paidDate: '' }, pending('b2', 2200)] }),
    )
    expect(r.blocked).toBe(true)
    if (r.blocked) expect(r.details.join(' ')).toMatch(/已收款记录被退回/)
  })

  it('合法删除（进回收站）放行', () => {
    const r = gate(
      snap({ bills: [pending('b1', 100), pending('b2', 200)] }),
      snap({ bills: [pending('b2', 200)], trash: [trashItem('b1')] }),
    )
    expect(r.blocked).toBe(false)
  })

  it('删除已收账单但正确进回收站 → 放行（不误拦有解释的删除）', () => {
    const r = gate(
      snap({ bills: [paid('b1', 15, '2026-10-09')] }),
      snap({ bills: [], trash: [trashItem('b1')] }),
    )
    expect(r.blocked).toBe(false)
  })

  it('整租客连同账单消失 → 拦截（对应林世轮那次）', () => {
    const r = gate(
      snap({ tenants: [tenant('t1'), tenant('t2')], bills: [pending('b1', 1), pending('b2', 2)] }),
      snap({ tenants: [tenant('t1')], bills: [pending('b1', 1)] }),
    )
    expect(r.blocked).toBe(true)
  })

  it('拦截后基线被作废，下次保存会重新回读云端（不连着误拦）', () => {
    const cloud = snap({ bills: [paid('b1', 15, '2026-10-09')] })
    setCloudSummary(cloud)
    expect(checkPushGate(snap({ bills: [] })).blocked).toBe(true)
    // 基线已被 checkPushGate 作废 → 再查一次应为放行（等 doSave 回读云端重建）
    expect(checkPushGate(snap({ bills: [] })).blocked).toBe(false)
  })
})
