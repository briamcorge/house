import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 临时诊断组件（2026-09-24 手机端 App 登录失败排查专用）
// 目的：把 WebView 内部的真实网络失败类型与耗时暴露到界面上，供截图取证。
// 排查结束后可整文件删除：删掉本文件 + LoginPage 里的 import/两处调用即可。
// ─────────────────────────────────────────────────────────────────────────────

type LogLine = { t: string; text: string }

let lines: LogLine[] = []
let lastFailureAt = 0
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

function push(text: string) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  lines = [...lines, { t, text }]
  notify()
}

/** 把一个错误对象拍平成一行文本：类型 / 原始消息 / 状态码 / 错误码 */
function describeError(e: unknown): string {
  if (!e) return 'unknown'
  const o = e as { name?: string; message?: string; status?: number; code?: string }
  const parts = [o.name || 'Error', o.message || String(e)]
  if (typeof o.status === 'number') parts.push(`status=${o.status}`)
  if (typeof o.code === 'string') parts.push(`code=${o.code}`)
  return parts.join(' ｜ ')
}

/** 记录一次登录失败的原始错误与耗时（登录页调用） */
export function recordAuthFailure(error: unknown, elapsedMs: number) {
  lastFailureAt = Date.now()
  push(`❌ 登录请求失败（耗时 ${elapsedMs}ms）→ ${describeError(error)}`)
}

/**
 * 探测函数：用自带超时的原生 fetch，不经过 lib/supabase.ts 里的 20s 封装，
 * 以便区分「App 的 20 秒超时」和「连接本身失败」。
 */
async function probe(
  label: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<void> {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { cache: 'no-store', ...init, signal: ctrl.signal })
    push(`${label}：HTTP ${r.status}，耗时 ${Date.now() - t0}ms`)
  } catch (e) {
    const el = Date.now() - t0
    const name = (e as { name?: string } | null)?.name
    if (name === 'AbortError') {
      push(`${label}：${timeoutMs}ms 内无任何响应（挂起，被本地超时中断）`)
    } else {
      push(`${label}：失败（耗时 ${el}ms）→ ${describeError(e)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function runDiagnostics(): Promise<void> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  push('──────── 开始诊断 ────────')
  push(`来源 origin：${location.origin}`)
  push(`页面 href：${location.href}`)
  push(`UA：${navigator.userAgent}`)
  push(`navigator.onLine=${String(navigator.onLine)}；Supabase 已配置=${String(isSupabaseConfigured())}`)
  push(`Supabase 地址：${url || '（未配置）'}`)

  if (!url || !key) {
    push('环境变量缺失，跳过网络探测')
    push('──────── 诊断结束 ────────')
    return
  }

  await probe('① Supabase 健康接口（首次，含 TLS 握手）', `${url}/auth/v1/health`, {
    headers: { apikey: key },
  })
  await probe('② Supabase 健康接口（第二次，连接复用）', `${url}/auth/v1/health`, {
    headers: { apikey: key },
  })
  await probe('③ 登录接口（故意错凭据，期望 400）', `${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'diag-probe@example.invalid', password: 'diag-probe-123456' }),
  })
  // 对照组：no-cors 只看「这条线路通不通」，不看响应内容（避免被 CORS 混淆）
  await probe('④ 对照：百度（no-cors 连通性）', 'https://www.baidu.com/favicon.ico', { mode: 'no-cors' }, 15000)
  await probe('⑤ 对照：Cloudflare（no-cors 连通性）', 'https://www.cloudflare.com/cdn-cgi/trace', { mode: 'no-cors' }, 15000)

  push('──────── 诊断结束 ────────')
}

export default function NetworkDiagnostics() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, bump] = useState(0)

  useEffect(() => {
    const fn = () => {
      bump((n) => n + 1)
      // 登录失败时自动展开，省得用户还要手动点开
      if (lastFailureAt) setOpen(true)
    }
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  const handleRun = async () => {
    setOpen(true)
    setBusy(true)
    try {
      await runDiagnostics()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          {open ? '收起诊断信息 ▴' : '网络诊断信息 ▾'}
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={busy}
          className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-300"
        >
          {busy ? '诊断中…' : '运行诊断'}
        </button>
      </div>
      {open && (
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-50 p-2 text-[10px] leading-4 text-gray-600">
          {lines.length === 0
            ? '（点右上「运行诊断」开始；登录失败会自动记录在这里）'
            : lines.map((l) => `${l.t}  ${l.text}`).join('\n')}
        </pre>
      )}
    </div>
  )
}
