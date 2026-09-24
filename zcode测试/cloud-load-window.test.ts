/**
 * 登录加载窗口的未同步标记判定（2026-09-24 同步覆盖缺陷修复 · Layer 2 回归）
 *
 * 事故：陈旧本地缓存在首次云端加载完成前被自动写入（checkOverdue 把 pending 改成 overdue），
 * 打上「现在」的未同步标记 → 陈旧本地被误判为「比云端新」→ 整档推云，覆盖云端已付账单。
 *
 * 本用例锁定判定语义：
 * - 加载窗口内打上的标记 → 忽略（允许云端覆盖，符合「加载完成前以云端为准」的产品规则）
 * - 窗口之前（上一会话遗留）的真实未同步改动 → 仍受保护（不得误删）
 * - 无标记 / 不可解析 / 无加载起点 → 保守沿用既有保护
 */
import { describe, it, expect } from 'vitest'
import { isDirtyStampedDuringLoad, isLocalNewerThanCloud } from '../src/lib/supabase'

const t0 = Date.parse('2026-09-24T10:00:00.000Z')

describe('登录加载窗口的未同步标记判定', () => {
  it('窗口内打上的标记 → 忽略，允许云端覆盖', () => {
    expect(isDirtyStampedDuringLoad('2026-09-24T10:00:01.000Z', t0)).toBe(true)
    expect(isDirtyStampedDuringLoad('2026-09-24T10:00:00.000Z', t0)).toBe(true)
  })

  it('窗口之前的真实未同步改动 → 仍受保护（返回 false）', () => {
    expect(isDirtyStampedDuringLoad('2026-09-23T10:00:00.000Z', t0)).toBe(false)
  })

  it('无标记 / 不可解析 / 无加载起点 → 保守沿用既有保护', () => {
    expect(isDirtyStampedDuringLoad(null, t0)).toBe(false)
    expect(isDirtyStampedDuringLoad('not-a-date', t0)).toBe(false)
    expect(isDirtyStampedDuringLoad('2026-09-24T10:00:01.000Z', 0)).toBe(false)
  })

  it('跨格式时间比较不变（本地带毫秒 Z vs 云端 +00:00）', () => {
    expect(isLocalNewerThanCloud('2026-09-24T10:00:01.000Z', '2026-09-24T10:00:00.000000+00:00')).toBe(true)
    expect(isLocalNewerThanCloud('2026-09-24T09:00:00.000Z', '2026-09-24T10:00:00.000000+00:00')).toBe(false)
  })
})
