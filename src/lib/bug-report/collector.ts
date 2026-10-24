import { APP_VERSION } from '../../version'
import { useStore } from '../../store/useStore'
import { getLastSyncOkAt, getSyncLog } from '../sync-log'
import { getBugActions } from './actions'
import { buildBugReport } from './payload'
import { enqueueBugReport } from './queue'
import { getCurrentRoute } from './route'
import type {
  BugErrorInfo,
  BugPlatform,
  BugReportEnv,
  BugReportInput,
  BugReportPayload,
} from './types'

const DEDUPE_MS = 30_000
const recentFingerprints = new Map<string, number>()

let capturing = false
let lastCaptured: BugReportPayload | null = null

export function getLastCapturedReport(): BugReportPayload | null {
  return lastCaptured
}

export function clearLastCapturedReport(): void {
  lastCaptured = null
}

function detectPlatform(): BugPlatform {
  try {
    if (typeof window === 'undefined') return 'web'
    const capacitor = (window as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
    }).Capacitor
    if (!capacitor?.isNativePlatform?.()) return 'web'
    return capacitor.getPlatform?.() === 'android' ? 'android' : 'web'
  } catch {
    return 'web'
  }
}

function getCounts(): Record<string, number> {
  try {
    const state = useStore.getState()
    return {
      properties: state.properties.length,
      rooms: state.rooms.length,
      tenants: state.tenants.length,
      bills: state.bills.length,
      landlordContracts: state.landlordContracts.length,
      profitRecords: state.profitRecords.length,
      trash: state.trash.length,
    }
  } catch {
    return {}
  }
}

function createEnv(): BugReportEnv {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  return {
    now: new Date(),
    appVersion: APP_VERSION,
    platform: detectPlatform(),
    route: getCurrentRoute(),
    online: typeof nav?.onLine === 'boolean' ? nav.onLine : null,
    userAgent: nav?.userAgent ?? '',
    language: nav?.language ?? '',
    lastSyncOkAt: getLastSyncOkAt(),
    counts: getCounts(),
    actions: getBugActions(),
    syncLog: getSyncLog(),
  }
}

function hash(input: string): string {
  let value = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0).toString(36)
}

function fingerprint(payload: BugReportPayload): string {
  return hash([
    payload.category,
    payload.error.name ?? '',
    payload.error.message ?? '',
    payload.error.stack?.split('\n')[0] ?? '',
    payload.route,
  ].join('|'))
}

function isDuplicate(value: string, now: number): boolean {
  for (const [key, at] of recentFingerprints) {
    if (now - at > DEDUPE_MS) recentFingerprints.delete(key)
  }
  const last = recentFingerprints.get(value)
  if (last !== undefined && now - last <= DEDUPE_MS) return true

  recentFingerprints.set(value, now)
  while (recentFingerprints.size > 50) {
    const oldest = recentFingerprints.keys().next().value
    if (!oldest) break
    recentFingerprints.delete(oldest)
  }
  return false
}

/**
 * 生成并落本地队列；Phase 1 不上传。
 * 返回 null 表示被去重或收集器自身异常，不阻塞调用方。
 */
export function captureBugReport(
  input: BugReportInput,
  env?: BugReportEnv,
): BugReportPayload | null {
  if (capturing) return null
  capturing = true
  try {
    const finalEnv = env ?? createEnv()
    const payload = buildBugReport(input, finalEnv)
    if (isDuplicate(fingerprint(payload), finalEnv.now.getTime())) return null

    enqueueBugReport(payload)
    lastCaptured = payload

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bug-report-captured', { detail: payload }))
      }
    } catch {
      /* 事件通知失败不影响报告 */
    }
    return payload
  } catch (error) {
    console.warn('[bug-report] 收集失败:', error)
    return null
  } finally {
    capturing = false
  }
}

export function captureBoundaryError(
  error: Error,
  componentStack?: string,
): BugReportPayload | null {
  return captureBugReport({
    category: 'render',
    severity: 'blocker',
    title: `页面渲染异常：${error.name || 'Error'}`,
    message: error.message || '页面渲染异常',
    error: { name: error.name, message: error.message, stack: error.stack },
    componentStack,
  })
}

interface ErrorTarget {
  addEventListener(type: string, listener: (event: Event) => void): void
  removeEventListener(type: string, listener: (event: Event) => void): void
}

const observedTargets = new WeakSet<object>()

function isIgnored(message: string, name?: string): boolean {
  if (name === 'AbortError') return true
  return /AbortError|The user aborted|operation was aborted|ResizeObserver loop/i.test(message)
}

function errorInfo(reason: unknown): BugErrorInfo {
  if (reason instanceof Error) {
    return { name: reason.name, message: reason.message, stack: reason.stack }
  }
  if (typeof reason === 'string') {
    return { name: 'Error', message: reason }
  }
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const value = reason as { name?: unknown; message?: unknown; stack?: unknown }
    return {
      name: typeof value.name === 'string' ? value.name : 'Error',
      message: typeof value.message === 'string' ? value.message : String(value.message ?? ''),
      stack: typeof value.stack === 'string' ? value.stack : undefined,
    }
  }
  return { name: 'Error', message: String(reason ?? '未知错误') }
}

/**
 * 安装 window 级错误捕获；返回 cleanup。
 * Phase 1 只落本地队列，不发起任何网络请求。
 */
export function installGlobalErrorHandlers(
  target: ErrorTarget = window,
  capture: (input: BugReportInput) => void = (input) => { captureBugReport(input) },
): () => void {
  if (observedTargets.has(target)) return () => {}
  observedTargets.add(target)

  const onError = (event: Event) => {
    const raw = event as Event & { error?: unknown; message?: string }
    const info = raw.error instanceof Error
      ? errorInfo(raw.error)
      : { name: 'Error', message: raw.message || 'Script error' }
    if (!info.message || isIgnored(info.message, info.name)) return
    capture({
      category: 'runtime',
      severity: 'normal',
      title: `运行异常：${info.name || 'Error'}`,
      message: info.message,
      error: info,
    })
  }

  const onUnhandledRejection = (event: Event) => {
    const raw = event as Event & { reason?: unknown }
    const info = errorInfo(raw.reason)
    if (!info.message || isIgnored(info.message, info.name)) return
    capture({
      category: 'runtime',
      severity: 'normal',
      title: '未处理的 Promise 异常',
      message: info.message,
      error: info,
    })
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
    observedTargets.delete(target)
  }
}
