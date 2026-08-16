import { useState, useEffect, useRef } from 'react'
import { PaymentMethod } from '../types'
import { X, Calendar, DollarSign, ChevronRight, ChevronLeft, User, Phone, ChevronDown } from 'lucide-react'
import { formatDate, generateRentBills, DraftBill, add30Days, parseDate360, diffDays360 } from '../utils/calculator'

interface LandlordContractModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (bills: DraftBill[], monthlyRent?: number, landlordName?: string, landlordPhone?: string, contractStart?: string, contractEnd?: string, deposit?: number, vacancyAllowance?: number | number[], paymentMethod?: PaymentMethod) => void
  onUpdate?: (bills: DraftBill[], monthlyRent?: number, landlordName?: string, landlordPhone?: string, contractStart?: string, contractEnd?: string, deposit?: number, vacancyAllowance?: number | number[], paymentMethod?: PaymentMethod) => void
  onEditContract?: (bills: DraftBill[], monthlyRent?: number, landlordName?: string, landlordPhone?: string, contractStart?: string, contractEnd?: string, deposit?: number, vacancyAllowance?: number | number[], paymentMethod?: PaymentMethod) => void
  onSaveEdit?: (landlordName?: string, landlordPhone?: string) => void
  propertyAddress: string
  existingRent?: number
  existingPaymentMethod?: PaymentMethod
  existingStart?: string
  existingEnd?: string
  existingDeposit?: number
  existingName?: string
  existingPhone?: string
  existingVacancyAllowance?: number | number[]
  isSimpleEdit?: boolean
  isEditMode?: boolean
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

export default function LandlordContractModal({ isOpen, onClose, onConfirm, onUpdate, onEditContract, onSaveEdit, propertyAddress, existingRent, existingPaymentMethod, existingStart, existingEnd, existingName, existingPhone, existingDeposit, existingVacancyAllowance, isSimpleEdit, isEditMode, isRenewal }: LandlordContractModalProps) {
  const [step, setStep] = useState<Step>('info')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [landlordName, setLandlordName] = useState('')
  const [landlordPhone, setLandlordPhone] = useState('')
  const [contractStart, setContractStart] = useState(formatDate(new Date()))

  // ESC键关闭
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }, [])

  function showError(setter: (msg: string) => void, msg: string) {
    setter(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setter(''), 5000)
  }

  const [contractEnd, setContractEnd] = useState(() => formatDate(add30Days(new Date(), 359)))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('monthly')
  const [error, setError] = useState('')
  const [draftBills, setDraftBills] = useState<DraftBill[]>([])
  const [billKey, setBillKey] = useState(0)
  const [deposit, setDeposit] = useState('')
  // 免租期（空置期）：业主给的免租天数。null=无；数字=每年统一；数组=按年
  const [vacancyPerYear, setVacancyPerYear] = useState(false)
  const [vacancyDays, setVacancyDays] = useState('')           // 每年统一天数
  const [vacancyYearList, setVacancyYearList] = useState<string[]>([''])  // 按年设置 [第1年, 第2年...]
  const [vacancyOpen, setVacancyOpen] = useState(false)        // 免租期下拉

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
      // 预填免租期
      if (Array.isArray(existingVacancyAllowance)) {
        setVacancyPerYear(true)
        setVacancyDays('')
        setVacancyYearList(existingVacancyAllowance.map(String))
      } else if (typeof existingVacancyAllowance === 'number' && existingVacancyAllowance > 0) {
        setVacancyPerYear(false)
        setVacancyDays(String(existingVacancyAllowance))
        setVacancyYearList([''])
      } else {
        setVacancyPerYear(false)
        setVacancyDays('')
        setVacancyYearList([''])
      }
      setError('')
      setDraftBills([])
      setBillKey(0)
    }
  }, [isOpen, existingRent, existingPaymentMethod, existingStart, existingEnd, existingName, existingPhone, existingDeposit, existingVacancyAllowance])

  /** 解析免租期配置：统一数字 或 按年数组 → 每年免租天数数组 */
  const getVacancyPerYearDays = (): number[] | null => {
    if (vacancyPerYear) {
      const list = vacancyYearList.map(v => parseFloat(v) || 0)
      if (list.every(d => d === 0)) return null  // 全为空 = 无免租期
      return list
    }
    const v = parseFloat(vacancyDays)
    return v > 0 ? [v] : null
  }

  /** 计算该合同每年的免租金额：免租天数÷30×月租（向上取整到分） */
  const calcVacancyAmount = (rent: number, days: number): number =>
    Math.round(days / 30 * rent * 100) / 100

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
    // 免租期扣减：按合同起租周年归属，每年免租天数从该年第1期账单起逐期消费（跨期不丢金额）
    const perYear = getVacancyPerYearDays()
    if (perYear && perYear.length > 0) {
      const periodsPerYear = paymentMethod === 'monthly' ? 12
        : paymentMethod === 'bi-monthly' ? 6
        : paymentMethod === 'quarterly' ? 4
        : paymentMethod === 'semi-annual' ? 2 : 1
      const remaining = [...perYear]  // 每期消费后更新剩余免租天数
      bills.forEach((bill, idx) => {
        if (bill.type !== 'rent') return
        const yearIdx = Math.floor(idx / periodsPerYear)
        // 只在该年有免租额度的年份消费；无定义(undefined)时 fallback 到最后一年，0 则跳过
        const allowance = remaining[yearIdx] ?? remaining[remaining.length - 1] ?? 0
        if (allowance <= 0) return
        // 该期实际天数（30/360）
        const periodDays = 1 + diffDays360(parseDate360(bill.periodStart), parseDate360(bill.periodEnd))
        const daysToDeduct = Math.min(allowance, periodDays)
        const deduct = calcVacancyAmount(rent, daysToDeduct)
        bill.amount = Math.max(0, Math.round((bill.amount - deduct) * 100) / 100)
        bill.description = `${bill.description}（含免租${daysToDeduct}天）`
        remaining[yearIdx] = allowance - daysToDeduct
      })
    }
    // 押金：新合同/编辑生成全额；续约按新旧押金差额生成调整账单（旧合同保留，押金延续）
    const depositVal = parseFloat(deposit) || 0
    const oldDeposit = existingDeposit || 0
    if (isRenewal && !isEditMode) {
      const diff = Math.round((depositVal - oldDeposit) * 100) / 100
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
    } else if (depositVal > 0) {
      // 新合同/编辑：生成全额押金账单
      bills.unshift({
        type: 'deposit',
        amount: depositVal,
        dueDate: contractStart,
        periodStart: contractStart,
        periodEnd: contractEnd,
        description: '押金',
      })
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
    const allowance = getVacancyPerYearDays()
    const allowanceVal: number | number[] | undefined =
      allowance === null ? undefined
        : allowance.length === 1 ? allowance[0]
        : allowance
    if (isEditMode) {
      onEditContract?.(draftBills, rent, landlordName.trim() || undefined, landlordPhone.trim() || undefined, contractStart, contractEnd, parseFloat(deposit) || undefined, allowanceVal, paymentMethod)
    } else if (existingRent !== undefined) {
      onUpdate?.(draftBills, rent, landlordName.trim() || undefined, landlordPhone.trim() || undefined, contractStart, contractEnd, parseFloat(deposit) || undefined, allowanceVal, paymentMethod)
    } else {
      onConfirm(draftBills, rent, landlordName.trim() || undefined, landlordPhone.trim() || undefined, contractStart, contractEnd, parseFloat(deposit) || undefined, allowanceVal, paymentMethod)
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
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-4 py-2.5 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {isSimpleEdit ? '编辑合同' : isEditMode ? '编辑合同' : existingRent !== undefined ? '代理续约' : '房屋代理合同'}
          </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isSimpleEdit ? 'bg-blue-600 text-white' : step === 'info' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>1</span>
            <span className="text-xs text-gray-400">合同信息</span>
            {!isSimpleEdit && (<><div className="w-8 h-px bg-gray-300" />
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
            <span className="text-xs text-gray-400">确认账单</span></>)}
          </div>
        </div>

        {step === 'info' && (
          <div className="p-4 space-y-2.5">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-sm text-blue-700 font-medium">{propertyAddress}</p>
              <p className="text-xs text-blue-500 mt-1">{isSimpleEdit ? '编辑业主信息' : isEditMode ? '编辑合同（应付）' : existingRent !== undefined ? '代理续约（应付）' : '房屋代理合同（应付）'}</p>
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
                  disabled={!!existingRent && !isSimpleEdit && !isEditMode}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
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
                  disabled={!!existingRent && !isSimpleEdit && !isEditMode}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  付款方式
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {paymentMethods.map((pm) => (
                    <option key={pm.value} value={pm.value}>{pm.label}</option>
                  ))}
                </select>
              </div>

              {/* 免租期（空置期）：业主给的免租天数 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">免租期</label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="number"
                      value={vacancyDays}
                      onChange={(e) => setVacancyDays(e.target.value)}
                      onFocus={() => setVacancyOpen(true)}
                      onBlur={() => setTimeout(() => setVacancyOpen(false), 150)}
                      placeholder="0"
                      min="0"
                      disabled={vacancyPerYear}
                      className="w-full px-3 py-2.5 pr-9 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <ChevronDown
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                    />
                    {vacancyOpen && (
                      <div className="absolute left-0 right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                        {[30].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setVacancyDays(String(d)); setVacancyOpen(false) }}
                            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-blue-50 ${vacancyDays === String(d) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                          >
                            {d}天
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap shrink-0">
                    <input
                      type="checkbox"
                      checked={vacancyPerYear}
                      onChange={(e) => setVacancyPerYear(e.target.checked)}
                      className="accent-blue-600"
                    />
                    按年设置
                  </label>
                </div>
              </div>
            </div>

            {/* 按年免租期列表 */}
            {vacancyPerYear && (
              <div className="space-y-2">
                {vacancyYearList.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12 shrink-0">第{i + 1}年</span>
                    <input
                      type="number"
                      value={v}
                      onChange={(e) => {
                        const next = [...vacancyYearList]
                        next[i] = e.target.value
                        setVacancyYearList(next)
                      }}
                      placeholder="无"
                      min="0"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">天</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (vacancyYearList.length <= 1) return
                        setVacancyYearList(vacancyYearList.filter((_, j) => j !== i))
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setVacancyYearList([...vacancyYearList, ''])
                    // 添加年份时自动延长合同结束日一年（30/360：+360天）
                    if (contractEnd) {
                      setContractEnd(formatDate(add30Days(new Date(contractEnd), 360)))
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  + 添加年份
                </button>
              </div>
            )}
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

            <div className="bg-orange-50 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-sm text-orange-700 font-medium truncate">{propertyAddress}</span>
              <span className="text-xs text-orange-500 shrink-0">{contractStart}~{contractEnd}</span>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-medium text-gray-700">待生成账单（可修改）</h3>
              {draftBills.map((bill, i) => (
                <div key={`${billKey}-${i}`} className="bg-white rounded-2xl border border-gray-100 p-2.5 shadow-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full mb-1.5 inline-block ${bill.type === 'deposit' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {bill.type === 'deposit' ? '押金' : '房租'}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">应付日</label>
                      <input
                        type="date"
                        defaultValue={bill.dueDate}
                        data-draft-index={i}
                        onChange={(e) => updateDraftBill(i, 'dueDate', e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">金额</label>
                      <input
                        type="number"
                        defaultValue={bill.amount}
                        onChange={(e) => updateDraftBill(i, 'amount', e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm font-medium"
                        step="0.01"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">开始</label>
                      <input
                        type="date"
                        defaultValue={bill.periodStart}
                        data-draft-index={i}
                        onChange={(e) => updateDraftBill(i, 'periodStart', e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">结束</label>
                      <input
                        type="date"
                        defaultValue={bill.periodEnd}
                        data-draft-index={i}
                        onChange={(e) => updateDraftBill(i, 'periodEnd', e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
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
                {isEditMode ? '保存修改并生成新账单' : existingRent !== undefined ? '保存合同修改' : '确认生成应付账单'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
