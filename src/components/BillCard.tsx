import { Bill } from '../types'
import { cn } from '../lib/utils'
import { Home, Clock, CheckCircle, AlertCircle } from 'lucide-react'

interface BillCardProps {
  bill: Bill
  propertyAddress?: string
}

export default function BillCard({ bill, propertyAddress }: BillCardProps) {
  const statusColors = {
    pending: 'bg-orange-100 text-orange-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700'
  }

  const statusLabels = {
    pending: '待支付',
    paid: '已支付',
    overdue: '已逾期'
  }

  const statusIcons = {
    pending: Clock,
    paid: CheckCircle,
    overdue: AlertCircle
  }

  const typeLabels = {
    rent: '房租',
    water: '水费',
    electric: '电费',
    gas: '燃气费',
    other: '其他'
  }

  const Icon = statusIcons[bill.status]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium', statusColors[bill.status])}>
            {statusLabels[bill.status]}
          </span>
          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
            {typeLabels[bill.type]}
          </span>
        </div>
        <Icon className={cn(
          'w-5 h-5',
          bill.status === 'paid' ? 'text-green-500' :
          bill.status === 'overdue' ? 'text-red-500' : 'text-orange-500'
        )} />
      </div>
      
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xl font-bold text-gray-900">¥{bill.amount.toFixed(2)}</span>
      </div>
      
      {propertyAddress && (
        <div className="flex items-center gap-1 text-sm text-gray-500 mb-2">
          <Home className="w-4 h-4" />
          <span className="truncate">{propertyAddress}</span>
        </div>
      )}
      
      <div className="text-sm text-gray-400">
        到期日: {new Date(bill.dueDate).toLocaleDateString('zh-CN')}
        {bill.paidDate && <span className="ml-2">支付日: {new Date(bill.paidDate).toLocaleDateString('zh-CN')}</span>}
      </div>
    </div>
  )
}