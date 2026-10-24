import type { BugReportPayload } from './types'

const QUEUE_KEY = 'bug_report_queue_v1'
const MAX_QUEUE = 20
const MAX_BYTES = 256 * 1024

export interface EnqueueResult {
  ok: boolean
  count: number
  dropped?: number
  reason?: 'too-large' | 'storage'
}

function isPayload(value: unknown): value is BugReportPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<BugReportPayload>
  return typeof payload.clientReportId === 'string'
    && typeof payload.createdAt === 'string'
    && typeof payload.title === 'string'
    && typeof payload.message === 'string'
    && !!payload.context
}

function byteLength(text: string): number {
  try {
    return new TextEncoder().encode(text).length
  } catch {
    return text.length * 2
  }
}

export function listQueuedReports(): BugReportPayload[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPayload)
  } catch {
    return []
  }
}

export function getQueuedReportCount(): number {
  return listQueuedReports().length
}

export function enqueueBugReport(payload: BugReportPayload): EnqueueResult {
  const queue = listQueuedReports().filter((item) => item.clientReportId !== payload.clientReportId)
  queue.push(payload)

  let dropped = 0
  while (queue.length > MAX_QUEUE) {
    queue.shift()
    dropped += 1
  }

  let text = JSON.stringify(queue)
  while (byteLength(text) > MAX_BYTES && queue.length > 1) {
    queue.shift()
    dropped += 1
    text = JSON.stringify(queue)
  }

  if (byteLength(text) > MAX_BYTES) {
    return { ok: false, count: queue.length, reason: 'too-large' }
  }

  try {
    if (typeof localStorage === 'undefined') {
      return { ok: false, count: queue.length, reason: 'storage' }
    }
    localStorage.setItem(QUEUE_KEY, text)
    return { ok: true, count: queue.length, dropped: dropped || undefined }
  } catch {
    return { ok: false, count: queue.length, reason: 'storage' }
  }
}

export function removeQueuedReport(clientReportId: string): void {
  const queue = listQueuedReports().filter((item) => item.clientReportId !== clientReportId)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    }
  } catch {
    /* ignore */
  }
}

export function clearQueuedReports(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(QUEUE_KEY)
  } catch {
    /* ignore */
  }
}
