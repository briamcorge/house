import type {
  BugCategory,
  BugErrorInfo,
  BugReportContext,
  BugReportEnv,
  BugReportInput,
  BugReportPayload,
} from './types'
import { redactText } from './redact'
import { normalizeRoute } from './route'

const CATEGORY_LABELS: Record<BugCategory, string> = {
  render: '页面渲染异常',
  runtime: '运行异常',
  sync: '同步问题',
  auth: '登录问题',
  import: '导入问题',
  export: '导出问题',
  data: '数据问题',
  ui: '界面/操作问题',
  other: '问题反馈',
}

function createId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function optionalText(value: unknown, maxLen: number): string | undefined {
  const text = redactText(value, maxLen).trim()
  return text || undefined
}

function defaultTitle(category: BugCategory, route: string, error?: BugErrorInfo): string {
  if (error?.name) return `${CATEGORY_LABELS[category]}：${error.name}`
  if (error?.message) return `${CATEGORY_LABELS[category]}：${error.message}`
  return `${CATEGORY_LABELS[category]} · ${route}`
}

function safeCounts(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(key)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (value < 0 || value > 1_000_000) continue
    out[key] = Math.floor(value)
  }
  return out
}

export function buildBugReport(input: BugReportInput, env: BugReportEnv): BugReportPayload {
  const category: BugCategory = input.category ?? (input.error ? 'runtime' : 'other')
  const severity = input.severity ?? (category === 'render' ? 'blocker' : 'normal')
  const route = normalizeRoute(env.route)

  const error: BugErrorInfo = {
    name: input.error?.name ? redactText(input.error.name, 120) : undefined,
    message: input.error?.message ? redactText(input.error.message, 1000) : undefined,
    stack: input.error?.stack ? redactText(input.error.stack, 4000) : undefined,
  }

  const message = redactText(
    input.message?.trim() || error.message || '用户未填写描述',
    2000,
  ).trim()
  const title = redactText(
    input.title?.trim() || defaultTitle(category, route, error),
    120,
  ).trim()

  const context: BugReportContext = {
    appVersion: redactText(env.appVersion, 40),
    platform: env.platform,
    route,
    online: typeof env.online === 'boolean' ? env.online : null,
    userAgent: redactText(env.userAgent, 300),
    language: redactText(env.language, 20),
    lastSyncOkAt: env.lastSyncOkAt ? redactText(env.lastSyncOkAt, 40) : null,
    counts: safeCounts(env.counts),
    actions: env.actions.slice(-30).map((entry) => ({
      at: redactText(entry.at, 40),
      action: redactText(entry.action, 80),
      entity: entry.entity ? redactText(entry.entity, 64) : undefined,
    })),
    syncLog: input.includeSyncLog === false
      ? []
      : env.syncLog.slice(-50).map((entry) => ({
          t: redactText(entry.t, 40),
          event: redactText(entry.event, 80),
          detail: entry.detail ? redactText(entry.detail, 300) : undefined,
        })),
  }

  const payload: BugReportPayload = {
    clientReportId: env.id || createId(),
    createdAt: Number.isNaN(env.now.getTime()) ? new Date().toISOString() : env.now.toISOString(),
    appVersion: redactText(env.appVersion, 40),
    platform: env.platform,
    route,
    category,
    severity,
    title,
    message,
    error,
    context,
  }

  const expected = optionalText(input.expected, 1000)
  if (expected) payload.expected = expected
  const actual = optionalText(input.actual, 1000)
  if (actual) payload.actual = actual
  const componentStack = optionalText(input.componentStack, 2000)
  if (componentStack) payload.componentStack = componentStack

  return payload
}
