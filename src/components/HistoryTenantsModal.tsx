import { useEffect } from 'react'
import { X, Phone, Calendar, DollarSign, ChevronRight } from 'lucide-react'
import { Tenant } from '../types'

interface HistoryTenantsModalProps {
  isOpen: boolean
  onClose: () => void
  tenants: Tenant[]
  roomLabel: string
  onViewTenant?: (tenantId: string) => void
}

export default function HistoryTenantsModal({ isOpen, onClose, tenants, roomLabel, onViewTenant }: HistoryTenantsModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">历史租客 - {roomLabel}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {tenants.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">暂无历史租客</p>
            </div>
          ) : (
            tenants.map(t => (
              <div
                key={t.id}
                onClick={() => { onViewTenant?.(t.id); onClose() }}
                className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">{t.name}</span>
                    <span className="text-[10px] text-gray-400">#{t.displayId}</span>
                    <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">已退租</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                  {t.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <span>{t.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{t.contractStart} ~ {t.contractEnd}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    <span>¥{t.monthlyRent}/月</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-50">
                  <span className="text-xs text-blue-600">查看合同及交租记录 →</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
