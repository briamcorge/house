import { useState } from 'react'
import { X, ChevronDown, ChevronRight, FileText, Banknote, Receipt, Calendar, Phone, User } from 'lucide-react'
import type { LandlordContract, Bill } from '../types'

interface LandlordContractDetailModalProps {
  isOpen: boolean
  onClose: () => void
  contract: LandlordContract
  bills: Bill[]
  onEdit: () => void
  onCheckout: () => void
  onDelete: () => void
}

const typeLabels: Record<string, string> = {
  rent: '房租',
  deposit: '押金',
  agency: '中介费',
  sublease: '转租费',
  hygiene: '卫管费',
  internet: '网费',
  utilities: '水电燃气费',
  other: '其他费用',
}

export default function LandlordContractDetailModal({
  isOpen,
  onClose,
  contract,
  bills,
  onEdit,
  onCheckout,
  onDelete,
}: LandlordContractDetailModalProps) {
  const [expanded, setExpanded] = useState(true)

  const contractBills = bills
    .filter(b => b.direction === 'payable')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const paidBills = contractBills.filter(b => b.status === 'paid')
  const paidTotal = paidBills.reduce((s, b) => s + b.amount, 0)
  const pendingCount = contractBills.filter(b => b.status === 'pending').length

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">业主合同详情</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* 合同信息 */}
        <div className="p-4 border-b border-gray-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-base">{contract.landlordName || '业主'}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${contract.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {contract.status === 'active' ? '执行中' : '已结束'}
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            {contract.landlordPhone && (
              <div className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {contract.landlordPhone}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {contract.contractStart} ~ {contract.contractEnd}
            </div>
            <div className="text-gray-700 font-medium">¥{contract.monthlyRent}/月</div>
            {contract.deposit ? (
              <div className="text-blue-600">押金 ¥{contract.deposit}</div>
            ) : null}
          </div>
        </div>

        {/* 账单列表 */}
        <div>
          {/* 折叠头部 */}
          <div
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              <span className="text-sm font-medium text-gray-700">
                应付账单（{contractBills.length} 条）
              </span>
            </div>
            <div className="text-xs text-gray-400">
              <span className="text-green-600">已付 {paidBills.length} 笔 ¥{paidTotal.toFixed(0)}</span>
              {pendingCount > 0 && <span className="text-orange-600 ml-2">待付 {pendingCount} 笔</span>}
            </div>
          </div>

          {/* 账单列表 */}
          {expanded && (
            <div className="border-t border-gray-50 divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {contractBills.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">暂无账单</div>
              ) : (
                contractBills.map(bill => (
                  <div key={bill.id} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${bill.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : bill.type === 'rent' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                          {bill.type === 'deposit' ? <Banknote className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        </div>
                        <span className="font-medium text-sm text-gray-900 truncate">{typeLabels[bill.type] || bill.type}</span>
                        {bill.status !== 'pending' && (
                          <span className={`rounded-full text-[10px] px-1.5 py-0.5 font-medium shrink-0 ${
                            bill.status === 'refunded' ? 'bg-blue-50 text-blue-600' : bill.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                          }`}>
                            {bill.status === 'refunded' ? '已退还' : bill.status === 'paid' ? '已付' : '逾期'}
                          </span>
                        )}
                      </div>
                      <span className={`text-base font-bold ${bill.amount < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                        ¥{bill.amount.toFixed(0)}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-2">
                      {bill.description && <span className="truncate">{bill.description}</span>}
                      {bill.description && <span>·</span>}
                      <span className="shrink-0">
                        {bill.status === 'paid' && bill.paidDate
                          ? `实付日：${bill.paidDate}`
                          : `应收日：${bill.dueDate}`}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="p-4 border-t border-gray-100 flex gap-3">
          {contract.status === 'active' && (
            <>
              <button
                type="button"
                onClick={() => { onEdit(); onClose() }}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700"
              >
                编辑合同
              </button>
              <button
                type="button"
                onClick={() => { onCheckout(); onClose() }}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700"
              >
                退租结算
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => { onDelete(); onClose() }}
            className={`${contract.status === 'active' ? 'flex-1' : 'w-full'} py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200`}
          >
            删除合同
          </button>
        </div>
      </div>
    </div>
  )
}
