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
  clearQueuedReports,
  enqueueBugReport,
  getQueuedReportCount,
  listQueuedReports,
  removeQueuedReport,
} from '../src/lib/bug-report/queue'
import type { BugReportPayload } from '../src/lib/bug-report/types'

function payload(id: string, extra: Partial<BugReportPayload> = {}): BugReportPayload {
  return {
    clientReportId: id,
    createdAt: '2026-10-24T10:00:00.000Z',
    appVersion: '1.301',
    platform: 'web',
    route: '/bills',
    category: 'other',
    severity: 'normal',
    title: `报告 ${id}`,
    message: '测试',
    error: {},
    context: {
      appVersion: '1.301',
      platform: 'web',
      route: '/bills',
      online: true,
      userAgent: '',
      language: 'zh-CN',
      lastSyncOkAt: null,
      counts: {},
      actions: [],
      syncLog: [],
    },
    ...extra,
  }
}

beforeEach(() => {
  clearQueuedReports()
})

describe('bug report 本地队列', () => {
  it('入队/读取/删除/清空', () => {
    const first = enqueueBugReport(payload('r-1'))
    expect(first.ok).toBe(true)
    expect(getQueuedReportCount()).toBe(1)
    expect(listQueuedReports()[0].clientReportId).toBe('r-1')

    removeQueuedReport('r-1')
    expect(getQueuedReportCount()).toBe(0)
  })

  it('同一 clientReportId 重复入队不会产生两条', () => {
    enqueueBugReport(payload('r-1'))
    enqueueBugReport(payload('r-1', { message: '更新后的描述' }))
    expect(listQueuedReports()).toHaveLength(1)
    expect(listQueuedReports()[0].message).toBe('更新后的描述')
  })

  it('超过 20 条时丢弃最旧的并返回 dropped', () => {
    let last
    for (let i = 1; i <= 21; i += 1) {
      last = enqueueBugReport(payload(`r-${i}`))
    }
    expect(getQueuedReportCount()).toBe(20)
    expect(listQueuedReports().some((item) => item.clientReportId === 'r-1')).toBe(false)
    expect(listQueuedReports().some((item) => item.clientReportId === 'r-21')).toBe(true)
    expect(last?.dropped).toBe(1)
  })

  it('单条超过 256KB 时拒绝入队', () => {
    const huge = payload('r-huge', { message: 'x'.repeat(300 * 1024) })
    const result = enqueueBugReport(huge)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('too-large')
  })
})
