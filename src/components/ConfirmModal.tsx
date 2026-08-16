import { useEffect } from 'react'
import { X, AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  /** 取消按钮的自定义动作（不传时等同 onClose） */
  onCancel?: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
}

export default function ConfirmModal({ isOpen, onClose, onConfirm, onCancel, title, message, confirmText = '确定', cancelText = '取消', variant = 'danger' }: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${variant === 'danger' ? 'bg-red-100' : 'bg-blue-100'}`}>
              <AlertTriangle className={`w-5 h-5 ${variant === 'danger' ? 'text-red-500' : 'text-blue-500'}`} />
            </div>
            <p className="text-sm text-gray-600 pt-1.5">{message}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { if (onCancel) onCancel(); else onClose() }}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}