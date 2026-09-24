/**
 * 认证错误 → 准确中文文案分类（2026-09-24 修复 · 网络失败误报密码错的回归）
 *
 * 事故：网络被阻断导致登录失败时，UI 统一显示「登录失败，请检查邮箱和密码」，
 * 误导用户以为凭据错误。本用例锁定分类规则，并锁死安全红线：
 * 凭据类错误（invalid_credentials 等）必须原样返回模糊 fallback，不得泄露账号状态。
 */
import { describe, it, expect } from 'vitest'
import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js'
import { getAuthErrorMessage } from '../src/lib/auth-error-message'

describe('getAuthErrorMessage 认证错误中文文案分类', () => {
  it('网络不可达（AuthRetryableFetchError, status 0）→ 提示检查网络', () => {
    const err = new AuthRetryableFetchError('Failed to fetch', 0)
    expect(getAuthErrorMessage(err, '登录失败')).toBe('无法连接服务器，请检查网络后重试')
  })

  it('服务端 5xx（AuthRetryableFetchError, status 503）→ 提示服务暂不可用', () => {
    const err = new AuthRetryableFetchError('Service unavailable', 503)
    expect(getAuthErrorMessage(err, '登录失败')).toBe('服务暂时不可用，请稍后重试')
  })

  it('限流：status 429 → 稍后再试', () => {
    const err = new AuthApiError('Too many requests', 429, 'over_request_rate_limit')
    expect(getAuthErrorMessage(err, '登录失败')).toBe('尝试过于频繁，请稍后再试')
  })

  it('限流：仅凭 code over_email_send_rate_limit 也命中（status 非 429）', () => {
    const err = new AuthApiError('Email rate limit exceeded', 400, 'over_email_send_rate_limit')
    expect(getAuthErrorMessage(err, '发送失败')).toBe('尝试过于频繁，请稍后再试')
  })

  it('弱密码（AuthWeakPasswordError, code weak_password）→ 提示密码强度', () => {
    const err = new AuthWeakPasswordError('Password is too weak', 400, ['length'])
    expect(getAuthErrorMessage(err, '注册失败')).toBe('密码强度不足，请换一个更复杂的密码')
  })

  it('凭据类错误（invalid_credentials）→ 原样返回模糊 fallback（防账号枚举）', () => {
    const err = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
    const fallback = '登录失败，请检查邮箱和密码'
    expect(getAuthErrorMessage(err, fallback)).toBe(fallback)
  })

  it('未知错误 / 普通 Error / null → fallback', () => {
    expect(getAuthErrorMessage(new Error('boom'), '发送失败，请稍后重试')).toBe('发送失败，请稍后重试')
    expect(getAuthErrorMessage(null, '登录失败，请检查邮箱和密码')).toBe('登录失败，请检查邮箱和密码')
  })
})
