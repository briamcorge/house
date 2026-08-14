import { Property } from '../types'
import { User } from 'lucide-react'

interface PropertyCardProps {
  property: Property
  roomCount: number
  occupiedCount: number
  landlordName?: string
  landlordMonthlyRent?: number
  billReceivable?: { paid: number; total: number }
  billPayable?: { paid: number; total: number }
  onClick?: () => void
  onClickBill?: () => void
  showBills?: boolean
}

export default function PropertyCard({
  property, roomCount, occupiedCount, landlordName, landlordMonthlyRent,
  billReceivable, billPayable, onClick, onClickBill, showBills,
}: PropertyCardProps) {
  const hasTenantBills = billReceivable && billReceivable.total > 0
  const hasLandlordBills = billPayable && billPayable.total > 0

  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 pl-3 pr-11 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm truncate">{property.address}</span>
            {property.houseType && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 shrink-0">{property.houseType}</span>
            )}
            {property.area != null && (
              <span className="text-[10px] text-gray-400 shrink-0">{property.area}㎡</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
            {(landlordName || landlordMonthlyRent) && (
              <>
                <User className="w-3 h-3" />
                <span>{landlordName || '业主'} · ¥{landlordMonthlyRent?.toFixed(0) || '?'}/月</span>
                <span className="text-gray-300 mx-0.5">·</span>
              </>
            )}
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 shrink-0">{roomCount}间房 {occupiedCount}间已租</span>
          </div>
        </div>
      </div>

      {showBills !== false && (hasTenantBills || hasLandlordBills) && (
        <div
          onClick={(e) => { e.stopPropagation(); onClickBill?.() }}
          className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-xs cursor-pointer hover:bg-gray-100 transition-colors space-y-0.5"
        >
          {hasTenantBills && (
            <div className="flex items-center gap-3 text-gray-500">
              <span>
                租客 <span className="text-green-600 font-medium">¥{Number(billReceivable!.paid).toFixed(0)}</span>
                <span className="text-gray-300 mx-0.5">/</span>
                <span className="text-gray-900 font-medium">¥{Number(billReceivable!.total).toFixed(0)}</span>
                {Number(billReceivable!.total) - Number(billReceivable!.paid) > 0 && (
                  <span className="ml-1 text-orange-600">未收¥{(Number(billReceivable!.total) - Number(billReceivable!.paid)).toFixed(0)}</span>
                )}
              </span>
            </div>
          )}
          {hasLandlordBills && (
            <div className="flex items-center gap-3 text-gray-500">
              <span>
                业主 <span className="text-green-600 font-medium">¥{Number(billPayable!.paid).toFixed(0)}</span>
                <span className="text-gray-300 mx-0.5">/</span>
                <span className="text-gray-900 font-medium">¥{Number(billPayable!.total).toFixed(0)}</span>
                {Number(billPayable!.total) - Number(billPayable!.paid) > 0 && (
                  <span className="ml-1 text-orange-600">未付¥{(Number(billPayable!.total) - Number(billPayable!.paid)).toFixed(0)}</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}