import { describe, it, expect } from 'vitest'
import { buildBugReport } from '../src/lib/bug-report/payload'
import type { BugReportEnv } from '../src/lib/bug-report/types'

function env(overrides: Partial<BugReportEnv> = {}): BugReportEnv {
  return {
    now: new Date('2026-10-24T10:00:00.000Z'),
    appVersion: '1.301',
    platform: 'web',
    route: '#/bills/123e4567-e89b-12d3-a456-426614174000?token=abc',
    online: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    language: 'zh-CN',
    lastSyncOkAt: '2026-10-24T09:00:00.000Z',
    counts: { bills: 3, tenants: 2, bad_key: 1, negative: -1 },
    actions: [
      { at: '2026-10-24T09:59:00.000Z', action: 'bill.confirm-payment', entity: 'bill-1' },
    ],
    syncLog: [
      { t: '2026-10-24T09:58:00.000Z', event: 'save_fail', detail: 'email test@example.com phone 13800138000' },
    ],
    id: 'fixed-report-id',
    ...overrides,
  }
}

describe('buildBugReport', () => {
  it('生成固定 ID、版本、路由、默认标题和描述', () => {
    const payload = buildBugReport({}, env())
    expect(payload.clientReportId).toBe('fixed-report-id')
    expect(payload.createdAt).toBe('2026-10-24T10:00:00.000Z')
    expect(payload.appVersion).toBe('1.301')
    expect(payload.platform).toBe('web')
    expect(payload.route).toBe('/bills/:id')
    expect(payload.category).toBe('other')
    expect(payload.severity).toBe('normal')
    expect(payload.title).toBe('问题反馈 · /bills/:id')
    expect(payload.message).toBe('用户未填写描述')
  })

  it('错误信息进入 error 字段，render 默认 blocker', () => {
    const payload = buildBugReport({
      category: 'render',
      error: { name: 'TypeError', message: 'x is undefined', stack: 'TypeError: x is undefined\n at App' },
      componentStack: '\n    at App\n    at Root',
    }, env())
    expect(payload.severity).toBe('blocker')
    expect(payload.error.name).toBe('TypeError')
    expect(payload.error.message).toBe('x is undefined')
    expect(payload.componentStack).toContain('at App')
  })

  it('同步日志默认附带并脱敏；关闭开关后为空', () => {
    const withLog = buildBugReport({}, env())
    expect(withLog.context.syncLog).toHaveLength(1)
    expect(withLog.context.syncLog[0].detail).not.toContain('test@example.com')
    expect(withLog.context.syncLog[0].detail).not.toContain('13800138000')

    const withoutLog = buildBugReport({ includeSyncLog: false }, env())
    expect(withoutLog.context.syncLog).toHaveLength(0)
  })

  it('counts 只保留合法非负数字键', () => {
    const payload = buildBugReport({}, env())
    expect(payload.context.counts).toEqual({ bills: 3, tenants: 2 })
    expect(payload.context.counts.bad_key).toBeUndefined()
    expect(payload.context.counts.negative).toBeUndefined()
  })

  it('用户填写的预期/实际会脱敏；空值不写入字段', () => {
    const payload = buildBugReport({
      expected: '应该显示 100',
      actual: '显示了 0，联系 test@example.com',
      title: '账单金额不对',
      message: '这期账单不对，租客：张三',
    }, env())
    expect(payload.title).toBe('账单金额不对')
    expect(payload.actual).not.toContain('test@example.com')
    expect(payload.actual).toContain('[email]')
    expect(payload.message).toContain('租客：[已隐去]')
  })

  it('超长 stack 被截断', () => {
    const payload = buildBugReport({
      error: { name: 'Error', message: 'boom', stack: 'x'.repeat(5000) },
    }, env())
    expect(payload.error.stack?.length).toBeLessThan(4100)
    expect(payload.error.stack).toContain('…[truncated]')
  })
})
