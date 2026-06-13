import { useState, useEffect } from 'react'
import { APP_VERSION } from '../version'
import { checkForUpdate, UpdateInfo } from '../lib/version-check'
import { Cloud, Download, X, Loader2 } from 'lucide-react'

export default function UpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 延迟几秒检查，不影响首屏加载
    const timer = setTimeout(async () => {
      const info = await checkForUpdate()
      setUpdate(info)
      setLoading(false)
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  if (loading || dismissed || !update?.hasUpdate) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-blue-100 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">有新版本可用</h3>
              <button type="button" onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600 -mr-1 -mt-1 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              当前 v{update.currentVersion} → v{update.latestVersion}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              请到 GitHub Releases 页面下载最新 APK 安装
            </p>
            <a
              href={update.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              前往下载
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
