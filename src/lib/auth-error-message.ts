import { isAuthRetryableFetchError } from '@supabase/supabase-js'

/** 限流类错误码（auth-js 返回 status 429 时携带） */
const RATE_LIMIT_CODES = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
])

/**
 * 认证错误 → 准确中文文案（2026-09-24）
 *
 * 背景：网络被阻断时登录失败，UI 统一显示「登录失败，请检查邮箱和密码」，误导用户以为密码错。
 * 安全红线（2026-09-06 ad59e79）：不区分「邮箱是否存在/是否未确认/是否被封」——
 * 凭据类错误（invalid_credentials / email_not_confirmed / user_banned 等）一律走 fallback 模糊文案。
 */
export function getAuthErrorMessage(error: unknown, fallback: string): string {
  // 安全窄化读取，避免 as any；非对象/无字段时取 undefined
  const status = (error as { status?: number } | null)?.status
  const code = (error as { code?: string } | null)?.code

  // 1) 网络类：请求失败/超时（auth-js 把 AbortError 重包为 AuthRetryableFetchError，无需单独处理）或 status 0
  if (isAuthRetryableFetchError(error) || status === 0) {
    return status != null && status >= 500
      ? '服务暂时不可用，请稍后重试'
      : '无法连接服务器，请检查网络后重试'
  }

  // 2) 限流类
  if (status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) {
    return '尝试过于频繁，请稍后再试'
  }

  // 3) 弱密码
  if (code === 'weak_password') {
    return '密码强度不足，请换一个更复杂的密码'
  }

  // 4) 其余（含凭据类与未知错误）→ 原样返回模糊文案
  return fallback
}
