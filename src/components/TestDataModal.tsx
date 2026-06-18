import { useState, useEffect, useCallback } from 'react'
import { X, AlertTriangle, Shield, Download, CheckCircle2, XCircle, FileSpreadsheet, RotateCcw, Beaker } from 'lucide-react'
import { useStore } from '../store/useStore'
import { generateTestData, verifyTestData, getTestDataSummary, VerificationReport } from '../utils/testDataGenerator'
import { useAuth } from '../lib/auth-context'

interface TestDataModalProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'welcome' | 'backup' | 'generating' | 'done'

const STORAGE_SNAPSHOT_KEY = 'property-manager-data-pre-test'

export default function TestDataModal({ isOpen, onClose }: TestDataModalProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [snapshotSaved, setSnapshotSaved] = useState(false)
  const [report, setReport] = useState<VerificationReport | null>(null)
  const [summary, setSummary] = useState<string[]>([])
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)
  const { user: currentUser } = useAuth()

  // 重置状态
  const reset = useCallback(() => {
    setStep('welcome')
    setBackupConfirmed(false)
    setSnapshotSaved(false)
    setReport(null)
    setSummary([])
    setError('')
    setGenerated(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(reset, 300)
      return () => clearTimeout(timer)
    }
    reset()
  }, [isOpen, reset])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'generating') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose, step])

  // 保存 localStorage 快照
  const handleSnapshot = () => {
    try {
      const data = localStorage.getItem('property-manager-data')
      if (data) {
        localStorage.setItem(STORAGE_SNAPSHOT_KEY, data)
        setSnapshotSaved(true)
        setError('')
      } else {
        setError('未找到可备份的数据')
      }
    } catch {
      setError('本地快照备份失败，请重试')
    }
  }

  // 恢复快照
  const handleRestore = () => {
    try {
      const snapshot = localStorage.getItem(STORAGE_SNAPSHOT_KEY)
      if (snapshot) {
        localStorage.setItem('property-manager-data', snapshot)
        localStorage.removeItem(STORAGE_SNAPSHOT_KEY)
        window.location.reload()
      } else {
        setError('未找到备份快照')
      }
    } catch {
      setError('恢复失败，请重试')
    }
  }

  // 生成测试数据
  const handleGenerate = () => {
    setStep('generating')
    setError('')

    try {
      // 保存备份快照（如果没有手动保存过）
      if (!snapshotSaved) {
        const data = localStorage.getItem('property-manager-data')
        if (data) localStorage.setItem(STORAGE_SNAPSHOT_KEY, data)
      }

      // 生成完整测试数据
      const testState = generateTestData()

      // 原子替换 store 状态（不触发云同步）
      useStore.setState({
        properties: testState.properties,
        rooms: testState.rooms,
        tenants: testState.tenants,
        bills: testState.bills,
        landlordContracts: testState.landlordContracts,
        profitRecords: testState.profitRecords,
        trash: testState.trash,
        auditLogs: [],
      })

      setSummary(getTestDataSummary(testState))
      setGenerated(true)
      setStep('done')
    } catch (e) {
      setError(`生成失败: ${e instanceof Error ? e.message : '未知错误'}`)
      setStep('backup')
    }
  }

  // 运行自检
  const handleVerify = () => {
    try {
      const state = useStore.getState()
      const result = verifyTestData(state)
      setReport(result)
    } catch (e) {
      setError(`验证失败: ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  if (!isOpen) return null

  const isLoggedIn = !!currentUser

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={(e) => { if (step !== 'generating') onClose(); e.stopPropagation() }}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">生成测试数据</h2>
            </div>
            <button onClick={onClose} disabled={step === 'generating'} className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* 步骤指示器 */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step !== 'welcome' ? 'bg-green-500 text-white' : 'bg-purple-600 text-white'}`}>1</div>
            <div className={`h-0.5 flex-1 ${step !== 'welcome' ? 'bg-green-400' : 'bg-gray-200'}`} />
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'done' ? 'bg-green-500 text-white' : step === 'backup' || step === 'generating' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
            <div className={`h-0.5 flex-1 ${step === 'done' ? 'bg-green-400' : 'bg-gray-200'}`} />
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'done' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>3</div>
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-400 px-0.5">
            <span data-testid="step-label">备份</span>
            <span data-testid="step-label">生成</span>
            <span data-testid="step-label">验证</span>
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* ---- 错误提示 ---- */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ==== STEP 1: 欢迎 / 备份 ==== */}
          {(step === 'welcome' || step === 'backup') && (
            <>
              {/* 云端警告 */}
              {isLoggedIn && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">⚠️ 已登录云端</p>
                    <p>你当前已登录账号 "{currentUser?.user_metadata?.name || currentUser?.email}"。测试数据会同步到云端，覆盖现有云端备份。</p>
                    <p className="mt-1 text-xs text-amber-600">建议备份数据后再继续。</p>
                  </div>
                </div>
              )}

              {/* 备份说明 */}
              <div className="bg-blue-50 rounded-xl p-3">
                <h3 className="text-sm font-medium text-blue-800 mb-2">生成测试数据前将自动：</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li className="flex items-start gap-1.5">
                    <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>创建 localStorage 快照备份，可直接恢复</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>可选：导出 Excel 文件保存到电脑</span>
                  </li>
                </ul>
              </div>

              {/* 操作按钮 */}
              <div className="space-y-2">
                {/* 保存快照 */}
                <button
                  onClick={handleSnapshot}
                  className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${snapshotSaved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  <Shield className="w-4 h-4" />
                  {snapshotSaved ? '✓ 快照已保存' : '📸 保存本地快照'}
                </button>

                {/* 生成测试数据 */}
                <button
                  onClick={handleGenerate}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Beaker className="w-4 h-4" />
                  生成测试数据
                </button>
              </div>

              {step === 'welcome' && !generated && (
                <p className="text-xs text-gray-400 text-center pt-1">测试数据将替换当前系统所有数据。请确保已备份。</p>
              )}
            </>
          )}

          {/* ==== STEP 2: 生成中 ==== */}
          {step === 'generating' && (
            <div className="py-8 text-center space-y-3">
              <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-gray-600">正在生成测试数据…</p>
              <p className="text-xs text-gray-400">包含 2 套房源、5 间房间、4 位租客、多份账单等</p>
            </div>
          )}

          {/* ==== STEP 3: 完成 ==== */}
          {step === 'done' && (
            <>
              {/* 数据概要 */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-800 text-sm">测试数据已生成</span>
                </div>
                <ul className="space-y-0.5">
                  {summary.map((line, i) => (
                    <li key={i} className="text-xs text-green-700">{line}</li>
                  ))}
                </ul>
              </div>

              {/* 验证报告 */}
              <div className="space-y-2">
                <button
                  onClick={handleVerify}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {report ? '重新运行自检' : '运行自检'}
                </button>

                {!report && (
                  <p className="text-xs text-gray-400 text-center">可选 — 验证数据是否符合预期</p>
                )}

                {report && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* 报告头部 — 汇总 */}
                    <div className={`px-4 py-3 flex items-center justify-between ${report.passed === report.total ? 'bg-green-50' : 'bg-amber-50'}`}>
                      <div className="flex items-center gap-2">
                        {report.passed === report.total
                          ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                          : <XCircle className="w-5 h-5 text-amber-600" />
                        }
                        <span className={`text-sm font-medium ${report.passed === report.total ? 'text-green-800' : 'text-amber-800'}`}>
                          {report.passed === report.total ? '全部通过' : `${report.total - report.passed} 项未通过`}
                        </span>
                      </div>
                      <span className={`text-xs font-bold ${report.passed === report.total ? 'text-green-600' : 'text-amber-600'}`}>
                        {report.passed}/{report.total}
                      </span>
                    </div>

                    {/* 报告列表 */}
                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                      {report.items.map((item, i) => (
                        <div key={i} className={`px-4 py-2 flex items-start gap-2 ${item.passed ? '' : 'bg-red-50'}`}>
                          {item.passed
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                            : <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-gray-500">{item.category}</span>
                              <span className="text-xs text-gray-800">{item.name}</span>
                            </div>
                            {!item.passed && (
                              <div className="text-xs text-red-600 mt-0.5">
                                实际: {item.actual} &nbsp;|&nbsp; 预期: {item.expected}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 恢复数据 */}
              {snapshotSaved && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4" />
                    恢复原数据
                  </h3>
                  <p className="text-xs text-gray-500 mb-2">测试完毕后，点击下方按钮恢复备份数据（页面将重新加载）</p>
                  <button
                    onClick={handleRestore}
                    className="w-full py-2.5 bg-gray-600 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    恢复备份快照
                  </button>
                </div>
              )}

              {/* 完成按钮 */}
              <button
                onClick={onClose}
                className="w-full py-3 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                完成
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
