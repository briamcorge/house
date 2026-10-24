import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  const m = new Map<string, string>()
  const stub = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true })
})

import {
  captureBugReport,
  getLastCapturedReport,
  installGlobalErrorHandlers,
} from '../src/lib/bug-report/collector'
import { clearQueuedReports, getQueuedReportCount } from '../src/lib/bug-report/queue'
import type { BugReportEnv, BugReportInput } from '../src/lib/bug-report/types'

function env(overrides: Partial<BugReportEnv> = {}): BugReportEnv {
  return {
    now: new Date('2026-10-24T10:00:00.000Z'),
    appVersion: '1.301',
    platform: 'web',
    route: '/collector-test',
    online: true,
    userAgent: 'test-agent',
    language: 'zh-CN',
    lastSyncOkAt: null,
    counts: { bills: 1 },
    actions: [],
    syncLog: [],
    id: `report-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  }
}

function fakeTarget() {
  const listeners: Record<string, Array<(event: any) => void>> = {}
  return {
    listeners,
    addEventListener(type: string, listener: (event: any) => void) {
      ;(listeners[type] ||= []).push(listener)
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== listener)
    },
    emit(type: string, event: any) {
      for (const listener of listeners[type] || []) listener(event)
    },
  }
}

beforeEach(() => {
  clearQueuedReports()
})

describe('全局错误捕获', () => {
  it('捕获 window error，并带上错误名/message/stack', () => {
    const target = fakeTarget()
    const captured: BugReportInput[] = []
    const cleanup = installGlobalErrorHandlers(target as any, (input) => captured.push(input))

    const error = new Error('boom')
    target.emit('error', { error, message: 'boom' })

    expect(captured).toHaveLength(1)
    expect(captured[0].category).toBe('runtime')
    expect(captured[0].message).toBe('boom')
    expect(captured[0].error?.name).toBe('Error')
    expect(captured[0].error?.stack).toContain('boom')

    cleanup()
    target.emit('error', { error: new Error('again'), message: 'again' })
    expect(captured).toHaveLength(1)
  })

  it('捕获 unhandledrejection 的字符串 reason', () => {
    const target = fakeTarget()
    const captured: BugReportInput[] = []
    installGlobalErrorHandlers(target as any, (input) => captured.push(input))

    target.emit('unhandledrejection', { reason: 'async oops' })

    expect(captured).toHaveLength(1)
    expect(captured[0].title).toBe('未处理的 Promise 异常')
    expect(captured[0].message).toBe('async oops')
  })

  it('AbortError / ResizeObserver 噪声被过滤', () => {
    const target = fakeTarget()
    const captured: BugReportInput[] = []
    installGlobalErrorHandlers(target as any, (input) => captured.push(input))

    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    target.emit('unhandledrejection', { reason: abort })
    target.emit('error', { error: new Error('ResizeObserver loop limit exceeded'), message: 'ResizeObserver loop limit exceeded' })

    expect(captured).toHaveLength(0)
  })
})

describe('captureBugReport 本地落盘与去重', () => {
  it('生成报告、写入本地队列、更新 lastCaptured', () => {
    const report = captureBugReport({ title: '测试标题', message: '测试描述' }, env())
    expect(report).not.toBeNull()
    expect(report?.title).toBe('测试标题')
    expect(getQueuedReportCount()).toBe(1)
    expect(getLastCapturedReport()?.clientReportId).toBe(report?.clientReportId)
  })

  it('同一错误指纹 30 秒内不重复入队', () => {
    const e = env({ route: '/dedupe-test', id: 'dedupe-1' })
    const input = { title: '重复测试', message: '相同指纹' }
    const first = captureBugReport(input, e)
    const second = captureBugReport(input, e)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(getQueuedReportCount()).toBe(1)
  })
})
