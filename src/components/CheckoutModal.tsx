import { useState } from 'react'
import { X, DollarSign } from 'lucide-react'

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  tenantName: string
  deposit?: number
  onConfirm: (refunds: { depositRefund: number; rentRefund: number; otherRefund: number; otherName: string }) => void
}

export default function CheckoutModal({ isOpen, onClose, tenantName, deposit, onConfirm }: CheckoutModalProps) {
  const [depositRefund, setDepositRefund] = useState(deposit?.toString() || '0')
  const [rentRefund, setRentRefund] = useState('0')
  const [otherName, setOtherName] = useState('')
  const [otherRefund, setOtherRefund] = useState('0')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]">
      <div className="bg-white rounded-t-3xl w-full max-w-md">
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">退租结算 - {tenantName}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-500">填写退还金额，不退还填0</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <DollarSign className="w-4 h-4 inline mr-1" />
              退还押金
            </label>
            <input type="number" value={depositRefund} onChange={e => setDepositRefund(e.target.value)} min="0" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
            {deposit && <p className="text-xs text-gray-400 mt-1">原押金 ¥{deposit}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <DollarSign className="w-4 h-4 inline mr-1" />
              退还租金
            </label>
            <input type="number" value={rentRefund} onChange={e => setRentRefund(e.target.value)} min="0" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">费用名称</label>
              <input type="text" value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="例如：卫管费" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">退还金额</label>
              <input type="number" value={otherRefund} onChange={e => setOtherRefund(e.target.value)} min="0" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>押金退还</span><span>¥{parseFloat(depositRefund) || 0}</span></div>
            <div className="flex justify-between"><span>租金退还</span><span>¥{parseFloat(rentRefund) || 0}</span></div>
            {otherName && <div className="flex justify-between"><span>{otherName}</span><span>¥{parseFloat(otherRefund) || 0}</span></div>}
            <div className="flex justify-between font-bold border-t pt-1 mt-1">
              <span>合计退还</span>
              <span>¥{((parseFloat(depositRefund) || 0) + (parseFloat(rentRefund) || 0) + (parseFloat(otherRefund) || 0)).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium">取消</button>
            <button type="button" onClick={() => onConfirm({ depositRefund: parseFloat(depositRefund) || 0, rentRefund: parseFloat(rentRefund) || 0, otherRefund: parseFloat(otherRefund) || 0, otherName })} className="flex-[2] py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700">确认退租并退款</button>
          </div>
        </div>
      </div>
    </div>
  )
}
