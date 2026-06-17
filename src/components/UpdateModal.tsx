import { Download, Loader2, Smartphone } from 'lucide-react'
import { useState } from 'react'

interface UpdateModalProps {
  version: string
  notes: string
  onUpdate: () => Promise<void>
  onDismiss?: () => void
  forceUpdate?: boolean
}

export default function UpdateModal({
  version,
  notes,
  onUpdate,
  onDismiss,
  forceUpdate = true, // 默认强制更新
}: UpdateModalProps) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  const handleUpdate = async () => {
    setDownloading(true)
    setError('')
    try {
      await onUpdate()
    } catch (e) {
      setError((e as Error).message || '下载失败，请检查网络后重试')
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Smartphone className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          发现新版本 v{version}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {forceUpdate ? '请更新到最新版本以继续使用' : '是否更新到最新版本？'}
        </p>

        {notes && (
          <div className="bg-gray-50 rounded-xl p-3 mb-4 text-left">
            <p className="text-xs text-gray-600 leading-relaxed">{notes}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleUpdate}
          disabled={downloading}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {downloading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              下载中...
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              立即更新
            </>
          )}
        </button>

        {!forceUpdate && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={downloading}
            className="mt-2 text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            稍后再说
          </button>
        )}
      </div>
    </div>
  )
}
