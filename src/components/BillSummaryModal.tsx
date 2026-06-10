import { useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { Bill } from '../types'
import { X, DollarSign, Calendar, Home, User } from 'lucide-react'

interface BillSummaryModalProps {
  isOpen: boolean
  onClose: () => void
  propertyId?: string
  roomId?: string
}

export default function BillSummaryModal({ isOpen, onClose, propertyId, roomId }: BillSummaryModalProps) {
  const { bills, properties, rooms, tenants, landlordContracts } = useStore()
  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      if (roomId) return b.roomId === roomId
      if (propertyId) return b.propertyId === propertyId
      return false
    })
  }, [bills, propertyId, roomId])

  const typeLabels: Record<string, string> = { rent: '房租', water: '水费', electric: '电费', gas: '燃气费', other: '其他' }

  const getStatusStyle = (status: string) => {
    if (status === 'paid') return 'bg-green-100 text-green-700'
    if (status === 'overdue') return 'bg-red-100 text-red-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  const getStatusLabel = (bill: Bill) => {
    if (bill.status === 'paid') return bill.direction === 'receivable' ? '已收' : '已付'
    if (bill.status === 'overdue') return '已逾期'
    return bill.direction === 'receivable' ? '未收' : '未付'
  }

  const getRoomInfo = (rid?: string) => {
    if (!rid) return ''
    const room = rooms.find(r => r.id === rid)
    if (!room) return ''
    const prop = properties.find(p => p.id === room.propertyId)
    return prop ? `${prop.address} - ${room.label}室` : `${room.label}室`
  }

  const getPropertyAddress = (pid?: string) => {
    if (!pid) return ''
    return properties.find(p => p.id === pid)?.address || ''
  }

  const getTenantName = (tid?: string) => {
    if (!tid) return ''
    return tenants.find(t => t.id === tid)?.name || ''
  }

  const totalAmount = filteredBills.reduce((s, b) => s + b.amount, 0)
  const paidAmount = filteredBills.reduce((s, b) => {
    const paid = b.paidAmount !== undefined ? b.paidAmount : (b.status === 'paid' ? b.amount : 0)
    return s + paid
  }, 0)
  const unpaidCount = filteredBills.filter(b => b.status === 'pending' || b.status === 'overdue').length
  const paidCount = filteredBills.filter(b => b.status === 'paid').length

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-gray-900">账单详情</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-500">
            {roomId ? getRoomInfo(roomId) : propertyId ? getPropertyAddress(propertyId) : ''}
          </p>
          <p className="text-xs text-gray-400">
            {propertyId && (() => {
              const c = landlordContracts.filter(c => c.propertyId === propertyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
              return c ? `合同期：${c.contractStart} ~ ${c.contractEnd}（${c.landlordName || '业主'}）` : ''
            })()}
            {roomId && (() => {
              const t = tenants.find(t => t.roomId === roomId)
              return t ? `合同期：${t.contractStart} ~ ${t.contractEnd}` : ''
            })()}
          </p>
        </div>

        {/* 汇总信息 */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 border-b border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">总计</p>
            <p className="text-lg font-bold text-gray-900">¥{totalAmount.toFixed(0)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">已{roomId ? '收' : '付'}</p>
            <p className="text-lg font-bold text-green-600">¥{paidAmount.toFixed(0)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">未{roomId ? '收' : '付'}</p>
            <p className="text-lg font-bold text-orange-600">¥{(totalAmount - paidAmount).toFixed(0)}</p>
          </div>
        </div>

        {/* 筛选快速入口 */}
        <div className="flex gap-2 px-4 pt-4 pb-2">
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">全部 {filteredBills.length}</span>
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">待处理 {unpaidCount}</span>
          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">已处理 {paidCount}</span>
        </div>

        {/* 账单列表 */}
        <div className="p-4 space-y-2">
          {filteredBills.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">暂无账单</div>
          ) : (
            filteredBills.map(bill => (
              <div key={bill.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{typeLabels[bill.type]}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${getStatusStyle(bill.status)}`}>
                      {getStatusLabel(bill)}
                    </span>
                  </div>
                  <span className="font-bold text-sm">{bill.paidAmount !== undefined && bill.paidAmount < bill.amount
                    ? `¥${bill.paidAmount.toFixed(2)}/¥${bill.amount.toFixed(2)}`
                    : `¥${bill.amount.toFixed(2)}`}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Calendar className="w-3 h-3" />
                  <span>{bill.direction === 'payable' ? '应付日' : '应收日'}：{bill.dueDate}</span>
                  {bill.paidDate && <span className="ml-1">已{roomId ? '收' : '付'}：{bill.paidDate}</span>}
                </div>
                {bill.description && bill.type === 'rent' && (
                  <div className="text-xs text-gray-400 mt-0.5">{bill.description}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
