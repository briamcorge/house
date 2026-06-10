import { Room, Tenant } from '../types'
import { cn } from '../lib/utils'
import { User, Calendar, DollarSign } from 'lucide-react'

interface RoomCardProps {
  room: Room
  tenant?: Tenant
  billSummary?: { paid: number; total: number }
  onClick?: () => void
  onClickBill?: () => void
}

const paymentLabels: Record<string, string> = { monthly: '月付', quarterly: '季付', 'semi-annual': '半年付', annual: '年付' }

export default function RoomCard({ room, tenant, billSummary, onClick, onClickBill }: RoomCardProps) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0',
          room.status === 'occupied' ? 'bg-blue-500' : 'bg-gray-400'
        )}>
          {room.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm">{room.label} 室</span>
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              room.status === 'occupied' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
            )}>
              {room.status === 'occupied' ? '在租' : '空置'}
            </span>
            <span className="ml-auto text-[10px] text-gray-400">{room.roomType}</span>
          </div>
          {tenant ? (
            <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-0.5"><User className="w-3 h-3" />{tenant.name}</span>
              <span className="flex items-center gap-0.5"><DollarSign className="w-3 h-3" />¥{tenant.monthlyRent}/月</span>
              <span>{paymentLabels[tenant.paymentMethod] || tenant.paymentMethod}</span>
              <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" />{tenant.contractStart}~{tenant.contractEnd}</span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 mt-0.5">暂无租客</div>
          )}
        </div>
      </div>
      {billSummary && (
        <div
          onClick={(e) => { e.stopPropagation(); onClickBill?.() }}
          className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-xs cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <span className="text-gray-500">账单</span>
          <span>
            <span className="text-green-600 font-medium">¥{billSummary.paid.toFixed(0)}</span>
            <span className="text-gray-300 mx-1">/</span>
            <span className="text-gray-900 font-medium">¥{billSummary.total.toFixed(0)}</span>
            {billSummary.total - billSummary.paid > 0 && (
              <span className="ml-1.5 text-orange-600">未收 ¥{(billSummary.total - billSummary.paid).toFixed(0)}</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
