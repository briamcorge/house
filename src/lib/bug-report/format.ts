import type { BugReportPayload } from './types'

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)
}

export function formatBugReportMarkdown(payload: BugReportPayload): string {
  const lines: string[] = []
  lines.push('# House bug 诊断包')
  lines.push('')
  lines.push('请根据下面的诊断包定位问题。不要要求用户重复描述：先看「用户描述」「最近操作」「错误」和「同步日志」；需要更多信息时再问。')
  lines.push('')
  lines.push('## 基本信息')
  lines.push(`- 报告 ID：${payload.clientReportId}`)
  lines.push(`- 时间：${payload.createdAt}`)
  lines.push(`- 版本：${payload.appVersion}`)
  lines.push(`- 平台：${payload.platform}`)
  lines.push(`- 路由：${payload.route}`)
  lines.push(`- 分类/级别：${payload.category} / ${payload.severity}`)
  lines.push(`- 标题：${payload.title}`)
  lines.push('')
  lines.push('## 用户描述')
  lines.push(payload.message)
  if (payload.expected) {
    lines.push('')
    lines.push('## 预期')
    lines.push(payload.expected)
  }
  if (payload.actual) {
    lines.push('')
    lines.push('## 实际')
    lines.push(payload.actual)
  }
  if (payload.error.name || payload.error.message || payload.error.stack) {
    lines.push('')
    lines.push('## 错误')
    if (payload.error.name) lines.push(`- name：${payload.error.name}`)
    if (payload.error.message) lines.push(`- message：${payload.error.message}`)
    if (payload.error.stack) {
      lines.push('')
      lines.push('```')
      lines.push(payload.error.stack)
      lines.push('```')
    }
  }
  if (payload.componentStack) {
    lines.push('')
    lines.push('## React component stack')
    lines.push('```')
    lines.push(payload.componentStack)
    lines.push('```')
  }
  lines.push('')
  lines.push('## 最近操作')
  if (payload.context.actions.length === 0) {
    lines.push('（暂无显式标记的操作）')
  } else {
    for (const action of payload.context.actions) {
      lines.push(`- ${action.at} · ${action.action}${action.entity ? ` · ${action.entity}` : ''}`)
    }
  }
  lines.push('')
  lines.push(`## 同步日志（${payload.context.syncLog.length} 条）`)
  if (payload.context.syncLog.length === 0) {
    lines.push('（未附带或暂无记录）')
  } else {
    for (const entry of payload.context.syncLog) {
      lines.push(`- ${entry.t} · ${entry.event}${entry.detail ? ` · ${entry.detail}` : ''}`)
    }
  }
  lines.push('')
  lines.push('## 完整诊断数据')
  lines.push('~~~json')
  lines.push(JSON.stringify(payload, null, 2))
  lines.push('~~~')
  lines.push('')
  return lines.join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to textarea */
  }

  try {
    if (typeof document === 'undefined') return false
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export async function downloadTextFile(
  filename: string,
  text: string,
  mime = 'text/markdown;charset=utf-8',
): Promise<boolean> {
  const name = safeFileName(filename)
  const isCapacitor = typeof window !== 'undefined'
    && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

  if (isCapacitor) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')
      const bytes = new TextEncoder().encode(text)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
      }
      const base64 = btoa(binary)
      await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache })
      const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache })
      await Share.share({ title: name, text: 'House bug 诊断包', url: uri })
      await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => {})
      return true
    } catch (error) {
      console.warn('[bug-report] 原生分享失败，降级到浏览器下载:', error)
    }
  }

  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return false
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    setTimeout(() => {
      if (link.parentNode) document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 5000)
    return true
  } catch {
    return false
  }
}
