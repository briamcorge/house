export type BugCategory =
  | 'render'
  | 'runtime'
  | 'sync'
  | 'auth'
  | 'import'
  | 'export'
  | 'data'
  | 'ui'
  | 'other'

export type BugSeverity = 'blocker' | 'normal' | 'minor'

export type BugPlatform = 'web' | 'android'

export interface BugErrorInfo {
  name?: string
  message?: string
  stack?: string
}

export interface BugActionEntry {
  at: string
  action: string
  entity?: string
}

export interface BugSyncLogEntry {
  t: string
  event: string
  detail?: string
}

export interface BugReportInput {
  title?: string
  message?: string
  expected?: string
  actual?: string
  category?: BugCategory
  severity?: BugSeverity
  error?: BugErrorInfo
  componentStack?: string
  /** 默认 true；手动上报时可由用户取消勾选 */
  includeSyncLog?: boolean
}

export interface BugReportContext {
  appVersion: string
  platform: BugPlatform
  route: string
  online: boolean | null
  userAgent: string
  language: string
  lastSyncOkAt: string | null
  counts: Record<string, number>
  actions: BugActionEntry[]
  syncLog: BugSyncLogEntry[]
}

export interface BugReportPayload {
  clientReportId: string
  createdAt: string
  appVersion: string
  platform: BugPlatform
  route: string
  category: BugCategory
  severity: BugSeverity
  title: string
  message: string
  expected?: string
  actual?: string
  error: BugErrorInfo
  componentStack?: string
  context: BugReportContext
}

export interface BugReportEnv {
  now: Date
  appVersion: string
  platform: BugPlatform
  route: string
  online: boolean | null
  userAgent: string
  language: string
  lastSyncOkAt: string | null
  counts: Record<string, number>
  actions: BugActionEntry[]
  syncLog: BugSyncLogEntry[]
  /** 测试用；生产不传，由 buildBugReport 生成 */
  id?: string
}
