import { useState , useEffect } from 'react'
import { X, DollarSign, Calendar } from 'lucide-react'

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  tenantName: string
  deposit?: number
  /** 该租客已收房租的覆盖期结束日（房租实际交到日），用于自动填充退租金结束日 */
  rentPaidEnd?: string
  onConfirm: (refunds: { depositRefund: number; rentRefund: number; otherRefund: number; otherName: string; penalty: number; checkoutDate: string; rentRefundStart: string; rentRefundEnd: string }) => void
}

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export default function CheckoutModal({ isOpen, onClose, tenantName, deposit, rentPaidEnd, onConfirm }: CheckoutModalProps) {
  const [depositRefund, setDepositRefund] = useState(deposit?.toString() || '0')
  const [rentRefund, setRentRefund] = useState('0')
  const [otherName, setOtherName] = useState('')
  const [otherRefund, setOtherRefund] = useState('0')
  const [penalty, setPenalty] = useState('0')
  const [checkoutDate, setCheckoutDate] = useState(todayStr())
  const [rentRefundStart, setRentRefundStart] = useState('')
  const [rentRefundEnd, setRentRefundEnd] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  function showError(msg: string) {
    setError(msg)
    setTimeout(() => setError(''), 5000)
  }

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 bg-white p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">退租结算 - {tenantName}</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-gray-500">填写退还金额，不退还填0</p>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                退租日期
              </label>
              <input type="date" value={checkoutDate} onChange={e => setCheckoutDate(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="w-4 h-4 inline mr-1" />
                退还押金
              </label>
              <input type="number" value={depositRefund} onChange={e => setDepositRefund(e.target.value)} min="0" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
              {deposit && <p className="text-xs text-gray-400 mt-1">原押金 ¥{deposit}</p>}
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-2">退租日期为办理退租手续的日期，不影响已收房租（以账单覆盖期为准）</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="w-4 h-4 inline mr-1" />
                退还租金
              </label>
              <input type="number" value={rentRefund} onChange={e => { setRentRefund(e.target.value); if (parseFloat(e.target.value) > 0) { if (!rentRefundStart) setRentRefundStart(checkoutDate); if (!rentRefundEnd) { if (rentPaidEnd && rentPaidEnd >= checkoutDate) { setRentRefundEnd(rentPaidEnd) } else { const d = new Date(checkoutDate); d.setDate(d.getDate() + 60); setRentRefundEnd(d.toISOString().slice(0,10)) } } } }} min="0" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="w-4 h-4 inline mr-1" />
                违约金
              </label>
              <input type="number" value={penalty} onChange={e => setPenalty(e.target.value)} min="0" className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
              <p className="text-xs text-gray-400 mt-1">违约不退还的押金、转租费</p>
            </div>
          </div>

          {parseFloat(rentRefund) > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">退款开始日</label>
                <input type="date" value={rentRefundStart} onChange={e => setRentRefundStart(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">退款结束日</label>
                <input type="date" value={rentRefundEnd} onChange={e => setRentRefundEnd(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
              </div>
            </div>
          )}

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
            {parseFloat(penalty) > 0 && <div className="flex justify-between text-orange-700"><span>违约金</span><span>¥{parseFloat(penalty)}</span></div>}
            <div className="flex justify-between font-bold border-t pt-1 mt-1">
              <span>合计退还</span>
              <span>¥{((parseFloat(depositRefund) || 0) + (parseFloat(rentRefund) || 0) + (parseFloat(otherRefund) || 0)).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium">取消</button>
            <button type="button" onClick={() => {
              const d = parseFloat(depositRefund)
              const r = parseFloat(rentRefund)
              const o = parseFloat(otherRefund)
              const p = parseFloat(penalty)
              if (isNaN(d) || isNaN(r) || isNaN(o) || isNaN(p)) {
                showError('请输入有效的数字金额')
                return
              }
              if (deposit && d > deposit) {
                showError('押金退还不能超过 ¥' + deposit)
                return
              }
              if (r > 0 && (!rentRefundStart || !rentRefundEnd)) {
                showError('填写退还租金后，请填写退款开始日和结束日')
                return
              }
              if (r > 0 && rentRefundStart > rentRefundEnd) {
                showError('退款开始日不能晚于结束日')
                return
              }
              onConfirm({ depositRefund: d, rentRefund: r, otherRefund: o, otherName, penalty: p, checkoutDate, rentRefundStart, rentRefundEnd })
            }} className="flex-[2] py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700">确认退租并退款</button>
          </div>
        </div>
      </div>
    </div>
  )
}
