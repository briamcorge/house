import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { BillDirection } from '../types'
import { X, DollarSign, Calendar, Home, User } from 'lucide-react'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  direction: BillDirection
}

export default function PaymentModal({ isOpen, onClose, direction }: PaymentModalProps) {
  const { bills, properties, rooms, tenants, updateBill, addBill } = useStore()
  const [payments, setPayments] = useState<Record<string, { paidAmount: string; paidDate: string }>>({})

  const unpaidBills = useMemo(() =>
    bills.filter(b => b.direction === direction && (b.status === 'pending' || b.status === 'overdue')),
    [bills, direction]
  )

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

  const typeLabels: Record<string, string> = {
    rent: '房租', water: '水费', electric: '电费', gas: '燃气费', internet: '网费', hygiene: '卫管费', other: '其他'
  }

  const title = direction === 'receivable' ? '收款' : '付款'
  const statusLabel = direction === 'receivable' ? '未收' : '未付'

  const handlePaymentChange = (billId: string, field: 'paidAmount' | 'paidDate', value: string) => {
    setPayments(prev => ({
      ...prev,
      [billId]: { ...prev[billId], [field]: value }
    }))
  }

  const handleConfirmAll = () => {
    let count = 0
    for (const bill of unpaidBills) {
      const payment = payments[bill.id] as { paidAmount?: string; paidDate?: string } | undefined
      if (payment?.paidDate) {
        const inputAmt = payment.paidAmount ? parseFloat(payment.paidAmount) : bill.amount
        const isPartial = inputAmt > 0 && inputAmt < bill.amount
        if (isPartial) {
          // 拆单：原账单金额减少，新生成一笔已付账单
          const remaining = bill.amount - inputAmt
          updateBill(bill.id, { amount: remaining, paidDate: undefined, paidAmount: undefined })
          addBill({
            propertyId: bill.propertyId,
            roomId: bill.roomId,
            tenantId: bill.tenantId,
            amount: inputAmt,
            type: bill.type,
            status: 'paid',
            direction: bill.direction,
            dueDate: bill.dueDate,
            paidDate: payment.paidDate,
            description: bill.description,
          })
        } else {
          updateBill(bill.id, {
            status: 'paid',
            paidDate: payment.paidDate,
          })
        }
        count++
      }
    }
    if (count > 0) {
      alert(`已确认 ${count} 笔${title}`)
      onClose()
    } else {
      alert('请至少填写一笔付款日期')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]">
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {direction === 'receivable' ? '💰 收款' : '💳 付款'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{unpaidBills.length} 笔{statusLabel}账单</p>
        </div>

        <div className="p-4 space-y-3">
          {unpaidBills.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">暂无{statusLabel}账单</div>
          ) : (
            unpaidBills.map(bill => {
              const payment = payments[bill.id] as { paidAmount?: string; paidDate?: string } | undefined
              return (
                <div key={bill.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">{typeLabels[bill.type]}</span>
                        <span className="text-xs text-gray-400">¥{bill.amount.toFixed(2)}</span>
                      </div>
                      <span className="text-xs text-gray-400">应收日：{bill.dueDate}</span>
                    </div>
                  {bill.direction === 'receivable' && bill.roomId && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <Home className="w-3 h-3" />
                      <span>{getRoomInfo(bill.roomId)}</span>
                      {bill.tenantId && <><span className="text-gray-300">|</span><User className="w-3 h-3" /><span>{getTenantName(bill.tenantId)}</span></>}
                    </div>
                  )}
                  {bill.direction === 'payable' && bill.propertyId && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <Home className="w-3 h-3" />
                      <span>{getPropertyAddress(bill.propertyId)}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        <DollarSign className="w-3 h-3 inline" />
                        本次{title}金额
                      </label>
                      <input
                        type="number"
                        placeholder={`¥${bill.amount.toFixed(2)}`}
                        value={payment?.paidAmount ?? ''}
                        onChange={(e) => handlePaymentChange(bill.id, 'paidAmount', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        <Calendar className="w-3 h-3 inline" />
                        {title}日期
                      </label>
                      <input
                        type="date"
                        value={payment?.paidDate ?? ''}
                        onChange={(e) => handlePaymentChange(bill.id, 'paidDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {unpaidBills.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmAll}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              确认{title}（{unpaidBills.filter(b => payments[b.id]?.paidDate).length}/{unpaidBills.length}）
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
