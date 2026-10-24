import { useEffect, useState } from 'react'
import { AlertTriangle, Bug, CheckCircle2, Copy, Download, Loader2, Save, X } from 'lucide-react'
import { APP_VERSION } from '../version'
import { captureBugReport, getLastCapturedReport } from '../lib/bug-report/collector'
import { copyText, downloadTextFile, formatBugReportMarkdown } from '../lib/bug-report/format'
import { listQueuedReports, removeQueuedReport } from '../lib/bug-report/queue'
import { getCurrentRoute } from '../lib/bug-report/route'
import type { BugCategory, BugReportPayload, BugSeverity } from '../lib/bug-report/types'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Result = 'idle' | 'saved' | 'copied' | 'copy-failed' | 'storage-failed' | 'duplicate' | 'error'

const CATEGORY_OPTIONS: Array<{ value: BugCategory; label: string }> = [
  { value: 'other', label: '其他' },
  { value: 'ui', label: '界面 / 操作' },
  { value: 'sync', label: '同步' },
  { value: 'import', label: '导入' },
  { value: 'export', label: '导出' },
  { value: 'data', label: '数据 / 账单' },
  { value: 'auth', label: '登录' },
  { value: 'runtime', label: '运行异常' },
  { value: 'render', label: '页面崩溃' },
]

const SEVERITY_OPTIONS: Array<{ value: BugSeverity; label: string }> = [
  { value: 'blocker', label: '严重' },
  { value: 'normal', label: '一般' },
  { value: 'minor', label: '轻微' },
]

export default function BugReportModal({ isOpen, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [category, setCategory] = useState<BugCategory>('other')
  const [severity, setSeverity] = useState<BugSeverity>('normal')
  const [includeSync, setIncludeSync] = useState(true)
  const [markdown, setMarkdown] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result>('idle')
  const [queued, setQueued] = useState<BugReportPayload[]>([])

  useEffect(() => {
    if (!isOpen) return
    setQueued(listQueuedReports())
    const last = getLastCapturedReport()
    setTitle(last?.title || `问题反馈 · ${getCurrentRoute()}`)
    setMessage(last?.message || '')
    setExpected('')
    setActual('')
    setCategory(last?.category || 'other')
    setSeverity(last?.severity || 'normal')
    setIncludeSync(true)
    setMarkdown('')
    setBusy(false)
    setResult('idle')
  }, [isOpen])

  if (!isOpen) return null

  const generate = async (copy: boolean) => {
    setBusy(true)
    setResult('idle')
    try {
      const report = captureBugReport({
        title,
        message,
        expected,
        actual,
        category,
        severity,
        includeSyncLog: includeSync,
      })
      if (!report) {
        setResult('duplicate')
        return
      }

      const nextMarkdown = formatBugReportMarkdown(report)
      setMarkdown(nextMarkdown)

      const queue = listQueuedReports()
      setQueued(queue)
      const persisted = queue.some((item) => item.clientReportId === report.clientReportId)

      if (copy) {
        const ok = await copyText(nextMarkdown)
        setResult(ok ? 'copied' : (persisted ? 'copy-failed' : 'storage-failed'))
      } else {
        setResult(persisted ? 'saved' : 'storage-failed')
      }
    } catch (error) {
      console.warn('[bug-report] 生成失败:', error)
      setResult('error')
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    if (!markdown) return
    const ok = await downloadTextFile(`house-bug-${Date.now()}.md`, markdown)
    if (!ok) setResult('copy-failed')
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[70]">
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">报 bug / 反馈</h2>
              <p className="text-xs text-gray-400 mt-1">
                自动带上版本、路由、最近操作和同步日志；只保存在本机，不会自动上传。
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-700 leading-relaxed">
            你只需要说“哪里不对”。技术上下文由收集器自动带上：版本 v{APP_VERSION}、当前路由 {getCurrentRoute()}、
            最近 30 步显式标记的操作、最近 50 条同步日志。不会自动带租客姓名、电话、身份证。
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如：部分收款后剩余账单日期不对"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">哪里不对</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="一句话即可，例如：这期账单金额不对；点了确认收款后剩余日期没变。"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">预期</label>
              <input
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="应该是什么结果"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">实际</label>
              <input
                value={actual}
                onChange={(event) => setActual(event.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="实际发生了什么"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as BugCategory)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">严重级别</label>
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value as BugSeverity)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={includeSync}
              onChange={(event) => setIncludeSync(event.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            附带最近同步日志（已脱敏）
          </label>

          {result !== 'idle' && (
            <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
              result === 'copied' || result === 'saved'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {result === 'copied' && '诊断包已复制到剪贴板。回到对话里直接粘贴即可，不需要再手打描述。'}
              {result === 'saved' && '诊断包已保存在本机待发送队列。也可以点“复制给 AI”把它粘贴到对话里。'}
              {result === 'copy-failed' && '剪贴板不可用。请展开下方“诊断包预览”手动复制，或点“下载 .md”。'}
              {result === 'storage-failed' && '诊断包已生成，但本地队列写入失败。请展开下方“诊断包预览”手动复制，或点“下载 .md”。'}
              {result === 'duplicate' && '30 秒内刚生成过相同指纹的报告，已防止重复入队；请稍后再试或修改描述。'}
              {result === 'error' && '生成失败，请重试；如果持续失败，先复制诊断日志发给开发者。'}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => generate(true)}
              disabled={busy}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              复制给 AI
            </button>
            <button
              type="button"
              onClick={() => generate(false)}
              disabled={busy}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              仅保存
            </button>
          </div>

          {markdown && (
            <details className="bg-gray-50 rounded-xl p-3">
              <summary className="text-xs font-medium text-gray-600 cursor-pointer select-none">
                诊断包预览（复制前可检查）
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto text-[10px] leading-relaxed text-gray-600 whitespace-pre-wrap break-all">
                {markdown}
              </pre>
              <button
                type="button"
                onClick={download}
                className="mt-2 w-full py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                下载 .md
              </button>
            </details>
          )}

          {queued.length > 0 && (
            <details className="bg-gray-50 rounded-xl p-3">
              <summary className="text-xs font-medium text-gray-600 cursor-pointer select-none">
                本机待发送（{queued.length}）
              </summary>
              <p className="mt-2 text-[11px] text-gray-400 leading-relaxed">
                这些报告只保存在本机，Phase 1 不会自动上传。复制到对话后可以删除。
              </p>
              <div className="mt-2 space-y-2 max-h-56 overflow-auto">
                {[...queued].reverse().map((item) => (
                  <div key={item.clientReportId} className="bg-white border border-gray-100 rounded-lg p-2">
                    <p className="text-xs font-medium text-gray-800 break-all">{item.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })} · v{item.appVersion}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyText(formatBugReportMarkdown(item))
                          setResult(ok ? 'copied' : 'copy-failed')
                        }}
                        className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-medium hover:bg-blue-100"
                      >
                        复制
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeQueuedReport(item.clientReportId)
                          setQueued(listQueuedReports())
                        }}
                        className="flex-1 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-medium hover:bg-gray-200"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex items-start gap-2 text-[11px] text-gray-400 leading-relaxed">
            {result === 'copied' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            <span>
              诊断包包含版本、路由、最近操作、同步日志和实体数量，不含租客姓名、电话、身份证；你手填的“预期/实际”请自己检查，粘贴前可以展开预览确认。
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
