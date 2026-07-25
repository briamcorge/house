import { useState, useEffect } from 'react'
import { PaymentMethod } from '../types'
import { X, Calendar, DollarSign, ChevronRight, ChevronLeft, User, Phone } from 'lucide-react'
import { formatDate, generateRentBills, DraftBill, add30Days } from '../utils/calculator'

interface LandlordContractModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (bills: DraftBill[], monthlyRent?: number, landlordName?: string, landlordPhone?: string, contractStart?: string, contractEnd?: string, deposit?: number) => void
  onUpdate?: (bills: DraftBill[], monthlyRent?: number, landlordName?: string, landlordPhone?: string, contractStart?: string, contractEnd?: string, deposit?: number) => void
  onSaveEdit?: (landlordName?: string, landlordPhone?: string) => void
  propertyAddress: string
  existingRent?: number
  existingPaymentMethod?: PaymentMethod
  existingStart?: string
  existingEnd?: string
  existingDeposit?: number
  existingName?: string
  existingPhone?: string
  isSimpleEdit?: boolean
  isRenewal?: boolean
}

type Step = 'info' | 'preview'

const paymentMethods: { value: PaymentMethod; label: string }[] = [
          { value: 'monthly', label: '月付' },
          { value: 'bi-monthly', label: '二月付' },
          { value: 'quarterly', label: '季付' },
  { value: 'semi-annual', label: '半年付' },
  { value: 'annual', label: '年付' },
]

function showError(setter: (msg: string) => void, msg: string) {
  setter(msg)
  setTimeout(() => setter(''), 5000)
}

export default function LandlordContractModal({ isOpen, onClose, onConfirm, onUpdate, onSaveEdit, propertyAddress, existingRent, existingPaymentMethod, existingStart, existingEnd, existingName, existingPhone, existingDeposit, isSimpleEdit, isRenewal }: LandlordContractModalProps) {
  const [step, setStep] = useState<Step>('info')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [landlordName, setLandlordName] = useState('')
  const [landlordPhone, setLandlordPhone] = useState('')
  const [contractStart, setContractStart] = useState(formatDate(new Date()))

  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const [contractEnd, setContractEnd] = useState(() => formatDate(add30Days(new Date(), 359)))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('monthly')
  const [error, setError] = useState('')
  const [draftBills, setDraftBills] = useState<DraftBill[]>([])
  const [billKey, setBillKey] = useState(0)
  const [deposit, setDeposit] = useState('')

  useEffect(() => {
    if (isOpen) {
      setStep('info')
      setMonthlyRent(existingRent?.toString() || '')
      setLandlordName(existingName || '')
      setLandlordPhone(existingPhone || '')
      if (isRenewal && existingEnd) {
        const newStart = formatDate(add30Days(new Date(existingEnd), 1))
        setContractStart(newStart)
        setContractEnd(formatDate(add30Days(new Date(newStart), 359)))
      } else {
        setContractStart(existingStart || formatDate(new Date()))
        setContractEnd(existingEnd || formatDate(add30Days(new Date(), 359)))
      }
      setPaymentMethod(existingPaymentMethod || 'monthly')
      setDeposit(existingDeposit?.toString() || '')
      setError('')
      setDraftBills([])
      setBillKey(0)
    }
  }, [isOpen, existingRent, existingPaymentMethod, existingStart, existingEnd, existingName, existingPhone, existingDeposit])

  const regenerateBills = () => {
    const rent = parseFloat(monthlyRent)
    if (isNaN(rent) || rent <= 0) return
    const bills = generateRentBills(
      rent,
      contractStart,
      contractEnd,
      paymentMethod,
      0 // 业主合同无提前付款
    )
    // 有押金则加入账单列表（放在首位，但不占用期数编号）
    const depositVal = parseFloat(deposit)
    if (!isNaN(depositVal) && depositVal > 0) {
      if (isRenewal && existingDeposit !== undefined) {
        const diff = depositVal - existingDeposit
        if (diff > 0) {
          bills.unshift({
            type: 'deposit',
            amount: diff,
            dueDate: contractStart,
            periodStart: contractStart,
            periodEnd: contractEnd,
            description: '押金补收',
          })
        } else if (diff < 0) {
          bills.unshift({
            type: 'deposit',
            amount: diff,
            dueDate: contractStart,
            periodStart: contractStart,
            periodEnd: contractEnd,
            description: '退押金',
          })
        }
        // diff === 0: 无变化，不生成账单
      } else {
        // 新合同：生成全额押金账单
        bills.unshift({
          type: 'deposit',
          amount: depositVal,
          dueDate: contractStart,
          periodStart: contractStart,
          periodEnd: contractEnd,
          description: '押金',
        })
      }
    }
    setDraftBills(bills)
    setBillKey(k => k + 1)
  }

  const handleNext = () => {
    if (!landlordName.trim()) {
      showError(setError, '请输入房东姓名')
      return
    }
    const rent = parseFloat(monthlyRent)
    if (isNaN(rent) || rent <= 0) {
      showError(setError, '请输入有效的月租金')
      return
    }
    if (!contractStart || !contractEnd) {
      showError(setError, '请选择合同日期')
      return
    }
    if (new Date(contractEnd) <= new Date(contractStart)) {
      showError(setError, '合同结束日期必须晚于开始日期')
      return
    }
    regenerateBills()
    setError('')
    setStep('preview')
  }

  const handleConfirm = () => {
    const rent = parseFloat(monthlyRent)
    if (draftBills.length === 0) {
      showError(setError, '未生成账单，请返回检查')
      return
    }
    if (existingRent !== undefined) {
      onUpdate?.(draftBills, rent, landlordName.trim() || undefined, landlordPhone.trim() || undefined, contractStart, contractEnd, parseFloat(deposit) || undefined)
    } else {
      onConfirm(draftBills, rent, landlordName.trim() || undefined, landlordPhone.trim() || undefined, contractStart, contractEnd, parseFloat(deposit) || undefined)
    }
    onClose()
  }

  const updateDraftBill = (index: number, field: 'amount' | 'dueDate' | 'periodStart' | 'periodEnd', value: string) => {
    setDraftBills(prev => {
      const next = [...prev]
      const bill = { ...next[index], [field]: field === 'amount' ? parseFloat(value) || 0 : value }
      // 修改周期起止日时，同步更新 description 中的日期
      if ((field === 'periodStart' || field === 'periodEnd') && bill.type === 'rent' && bill.description) {
        bill.description = bill.description.replace(
          /\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/,
          `${bill.periodStart} ~ ${bill.periodEnd}`
        )
      }
      next[index] = bill
      return next
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isSimpleEdit ? '编辑合同' : existingRent !== undefined ? '代理续约' : '房屋代理合同'}
          </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isSimpleEdit ? 'bg-blue-900 text-white' : step === 'info' ? 'bg-blue-900 text-white' : 'bg-blue-100 text-blue-700'}`}>1</span>
            <span className="text-xs text-gray-400">合同信息</span>
            {!isSimpleEdit && (<><div className="w-8 h-px bg-gray-300" />
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'preview' ? 'bg-blue-900 text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
            <span className="text-xs text-gray-400">确认账单</span></>)}
          </div>
        </div>

        {step === 'info' && (
          <div className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-sm text-blue-700 font-medium">{propertyAddress}</p>
              <p className="text-xs text-blue-500 mt-1">{isSimpleEdit ? '编辑业主信息' : existingRent !== undefined ? '代理续约（应付）' : '房屋代理合同（应付）'}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  房东姓名
                </label>
                <input
                  type="text"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  placeholder="例如：王房东"
                  disabled={!!existingRent && !isSimpleEdit}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-3 h-3 inline mr-1" />
                  电话（选填）
                </label>
                <input
                  type="tel"
                  value={landlordPhone}
                  onChange={(e) => setLandlordPhone(e.target.value)}
                  placeholder="13800138000"
                  maxLength={11}
                  disabled={!!existingRent && !isSimpleEdit}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>

            {!isSimpleEdit && (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  月租金（交给房东）
                </label>
                <input
                  type="number"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="例如：4500"
                  min="1"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  押金（选填）
                </label>
                <input
                  type="number"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="例如：5000"
                  min="0"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  合同开始
                </label>
                <input
                  type="date"
                  value={contractStart}
                  onChange={(e) => setContractStart(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  合同结束
                </label>
                <input
                  type="date"
                  value={contractEnd}
                  onChange={(e) => setContractEnd(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="w-4 h-4 inline mr-1" />
                付款方式
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {paymentMethods.map((pm) => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>
            </div>
            </>)}
            
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              {isSimpleEdit ? (
                <button
                  type="button"
                  onClick={() => { onSaveEdit?.(landlordName.trim() || undefined, landlordPhone.trim() || undefined); onClose() }}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  保存
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                >
                  下一步
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <div className="bg-orange-50 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-orange-700 font-medium">{propertyAddress}</p>
                  <p className="text-xs text-orange-500 mt-1">{contractStart} 至 {contractEnd}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-orange-900">月付房东 ¥{parseFloat(monthlyRent) || 0}</p>
                  <p className="text-xs text-orange-500">{paymentMethods.find(p => p.value === paymentMethod)?.label}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700">待生成账单（可修改）</h3>
              {draftBills.map((bill, i) => (
                <div key={`${billKey}-${i}`} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${bill.type === 'deposit' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {bill.type === 'deposit' ? '押金' : '房租'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">应付日</label>
                      <input
                        type="date"
                        defaultValue={bill.dueDate}
                        data-draft-index={i}
                        onChange={(e) => updateDraftBill(i, 'dueDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">金额</label>
                      <input
                        type="number"
                        defaultValue={bill.amount}
                        onChange={(e) => updateDraftBill(i, 'amount', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium"
                        step="0.01"
                      />
                    </div>
                    {bill.type !== 'deposit' && (
                      <>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">周期开始</label>
                      <input
                        type="date"
                        defaultValue={bill.periodStart}
                        data-draft-index={i}
                        onChange={(e) => updateDraftBill(i, 'periodStart', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">周期结束</label>
                      <input
                        type="date"
                        defaultValue={bill.periodEnd}
                        data-draft-index={i}
                        onChange={(e) => updateDraftBill(i, 'periodEnd', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
              <span className="text-sm text-gray-600">合计</span>
              <span className="text-xl font-bold text-orange-700">
                ¥{draftBills.reduce((s, b) => s + b.amount, 0).toFixed(2)}
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('info')}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                上一步
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                {existingRent !== undefined ? '保存合同修改' : '确认生成应付账单'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
