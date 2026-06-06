import { Room, Tenant } from '../types'
import { cn } from '../lib/utils'
import { User } from 'lucide-react'

interface RoomCardProps {
  room: Room
  tenant?: Tenant
  billSummary?: { paid: number; total: number }
  onClick?: () => void
  onClickBill?: () => void
}

export default function RoomCard({ room, tenant, billSummary, onClick, onClickBill }: RoomCardProps) {
  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg',
            room.status === 'occupied' ? 'bg-blue-500' : 'bg-gray-400'
          )}>
            {room.label}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{room.label} 室</h3>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              room.status === 'occupied'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
            )}>
              {room.status === 'occupied' ? '已出租' : '空置'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{room.roomType}</span>
      </div>
      
      {tenant && (
        <div className="pt-3 mt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-600">
          <User className="w-4 h-4 text-gray-400" />
          <span>{tenant.name}</span>
          <span className="text-gray-300">|</span>
          <span>{tenant.phone}</span>
        </div>
      )}
      {billSummary && (
        <div
          onClick={(e) => { e.stopPropagation(); onClickBill?.() }}
          className="mt-2 -mx-4 -mb-4 px-4 py-2.5 bg-gray-50 rounded-b-2xl flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <span className="text-xs text-gray-500">应收账单</span>
          <span className="text-xs font-medium">
            <span className="text-green-600">¥{billSummary.paid.toFixed(0)}</span>
            <span className="text-gray-300 mx-1">/</span>
            <span className="text-gray-900">¥{billSummary.total.toFixed(0)}</span>
            {billSummary.total - billSummary.paid > 0 && (
              <span className="ml-2 text-orange-600">未收 ¥{(billSummary.total - billSummary.paid).toFixed(0)}</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
