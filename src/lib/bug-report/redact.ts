const URL_RE = /https?:\/\/[^\s"'<>]+/g
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const PHONE_RE = /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g
const ID_CARD_RE = /(?<!\d)\d{17}[\dXx](?!\d)/g
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const SESSION_RE = /sb-[A-Za-z0-9_-]+/g
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const API_KEY_RE = /\b(?:sk|pk|ghp|github_pat|AKIA)[A-Za-z0-9_]{10,}\b/g
const LONG_NUMBER_RE = /\b\d{12,}\b/g
const LABELED_PII_RE = /(租客|姓名|业主|房东)[：:]\s*[^\s，,。；;]+/g

function stripUrlQuery(value: string): string {
  return value.replace(URL_RE, (raw) => {
    try {
      const parsed = new URL(raw)
      return `${parsed.origin}${parsed.pathname}`
    } catch {
      return '[url]'
    }
  })
}

/**
 * 脱敏 + 截断。用于所有进入诊断包的字符串；不要直接上传原始 store / 日志。
 */
export function redactText(value: unknown, maxLen = 2000): string {
  let text = typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value)

  text = stripUrlQuery(text)
  text = text.replace(EMAIL_RE, '[email]')
  // 先处理 18 位身份证，再处理手机号；否则身份证里的 11 位片段会被手机号规则先吃掉。
  text = text.replace(ID_CARD_RE, '[id]')
  text = text.replace(PHONE_RE, '[phone]')
  text = text.replace(JWT_RE, '[jwt]')
  text = text.replace(SESSION_RE, '[session]')
  text = text.replace(BEARER_RE, 'Bearer [redacted]')
  text = text.replace(API_KEY_RE, '[key]')
  text = text.replace(LONG_NUMBER_RE, '[number]')
  text = text.replace(LABELED_PII_RE, '$1：[已隐去]')
  text = text.replace(/\u0000/g, '')

  if (text.length > maxLen) {
    text = `${text.slice(0, maxLen)}…[truncated]`
  }
  return text
}

/**
 * 递归脱敏，限制深度/数组长度/键数量。用于以后扩展 context，避免误传整个 store。
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]'
  if (typeof value === 'string') return redactText(value, 500)
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactDeep(item, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[redactText(key, 80)] = redactDeep(item, depth + 1)
    }
    return out
  }
  return redactText(String(value), 200)
}
