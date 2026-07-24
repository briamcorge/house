import { Bill } from '../types'
import { Home } from 'lucide-react'

interface BillCardProps {
  bill: Bill
  propertyAddress?: string
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

export default function BillCard({ bill, propertyAddress }: BillCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] font-medium">
          {typeLabels[bill.type]}
        </span>
        {bill.status !== 'pending' && (
          <span className={`rounded-full text-[10px] px-1.5 py-0.5 font-medium ${
            bill.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
          }`}>
            {bill.status === 'paid' ? '已收' : '逾期'}
          </span>
        )}
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
