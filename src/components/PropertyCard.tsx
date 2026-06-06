import { Property } from '../types'
import { Building2, DoorOpen } from 'lucide-react'

interface PropertyCardProps {
  property: Property
  roomCount: number
  billSummary?: { paid: number; total: number }
  onClick?: () => void
  onClickBill?: () => void
}

export default function PropertyCard({ property, roomCount, billSummary, onClick, onClickBill }: PropertyCardProps) {
  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
          <Building2 className="w-6 h-6 text-white" />
        </div>
        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
          {roomCount} 间房
        </span>
      </div>
      
      <h3 className="font-semibold text-gray-900 mb-2">{property.address}</h3>
      
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <DoorOpen className="w-4 h-4" />
        <span>{roomCount} 间房间</span>
      </div>
      
      <div className="pt-3 mt-3 border-t border-gray-100">
        <p className="text-sm text-gray-400">添加于 {new Date(property.createdAt).toLocaleDateString('zh-CN')}</p>
      </div>
      {billSummary && (
        <div
          onClick={(e) => { e.stopPropagation(); onClickBill?.() }}
          className="mt-2 -mx-4 -mb-4 px-4 py-2.5 bg-gray-50 rounded-b-2xl flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <span className="text-xs text-gray-500">应付账单</span>
          <span className="text-xs font-medium">
            <span className="text-green-600">¥{billSummary.paid.toFixed(0)}</span>
            <span className="text-gray-300 mx-1">/</span>
            <span className="text-gray-900">¥{billSummary.total.toFixed(0)}</span>
            {billSummary.total - billSummary.paid > 0 && (
              <span className="ml-2 text-orange-600">未付 ¥{(billSummary.total - billSummary.paid).toFixed(0)}</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}