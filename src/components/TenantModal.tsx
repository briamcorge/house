import { useState, useEffect, useMemo, useRef } from 'react'
import { Tenant, Property, Room, PaymentMethod } from '../types'
import { X, User, Phone, Home, Calendar, DollarSign, ChevronRight, ChevronLeft, ChevronDown, Check } from 'lucide-react'
import { formatDate, generateRentBills, DraftBill, add30Days } from '../utils/calculator'
import { useStore } from '../store/useStore'
import { formatRoomLabel } from '../lib/utils'
import ConfirmModal from './ConfirmModal'
import WheelDatePicker from './WheelDatePicker'

interface TenantModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>) => void
  onContractConfirm?: (tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[]) => void
  onContractUpdate?: (tenantId: string, tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[]) => void
  properties: Property[]
  rooms: Room[]
  editingTenant?: Tenant
  selectedRoomId?: string
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

export default function TenantModal({ isOpen, onClose, onSave, onContractConfirm, onContractUpdate, properties, rooms, editingTenant, selectedRoomId, isRenewal }: TenantModalProps) {
  // 错误提示定时清理（组件卸载或重新打开时不再触发 setState）
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }, [])

  function showError(setter: (msg: string) => void, msg: string) {
    setter(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setter(''), 5000)
  }

  const [step, setStep] = useState<Step>('info')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roomId, setRoomId] = useState('')
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

  const [contractEnd, setContractEnd] = useState(() => formatDate(add30Days(new Date(), 359)))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('monthly')
  const [advanceDays, setAdvanceDays] = useState(0)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [showPaymentPicker, setShowPaymentPicker] = useState(false)
  const [showBillSplitPicker, setShowBillSplitPicker] = useState(false)
  const [billSplit, setBillSplit] = useState<'front' | 'rear'>('front')
  const [showRoomPicker, setShowRoomPicker] = useState(false)
  const [monthlyRent, setMonthlyRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositTouched, setDepositTouched] = useState(false)
  const [otherFeeName, setOtherFeeName] = useState('卫管费')
  const [otherFeeAmount, setOtherFeeAmount] = useState('')
  const [error, setError] = useState('')

  const [draftBills, setDraftBills] = useState<DraftBill[]>([])
  const [billKey, setBillKey] = useState(0)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const { landlordContracts, bills } = useStore()

  // 编辑非续约模式：该租客已有的已收/已退应收账单数（重新生成账单会删除这些记录）
  const editingPaidBillCount = useMemo(() => {
    if (!editingTenant || isRenewal) return 0
    return bills.filter(b =>
      b.tenantId === editingTenant.id &&
      b.direction === 'receivable' &&
      (b.status === 'paid' || b.status === 'refunded')
    ).length
  }, [bills, editingTenant, isRenewal])

  // 获取已选房间的业主合同期（参考用）
  const selectedRoomPropertyId = useMemo(() => {
    if (!roomId) return null
    const room = rooms.find(r => r.id === roomId)
    return room?.propertyId || null
  }, [roomId, rooms])

  const currentLandlordContract = useMemo(() => {
    if (!selectedRoomPropertyId) return null
    return landlordContracts
      .filter(c => c.propertyId === selectedRoomPropertyId && c.status === 'active')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null
  }, [selectedRoomPropertyId, landlordContracts])

  const isEditing = !!editingTenant

  // 选择房间后，合同结束期默认取业主合同结束期
  useEffect(() => {
    if (!isEditing && roomId && currentLandlordContract) {
      setContractEnd(currentLandlordContract.contractEnd)
    }
  }, [roomId, currentLandlordContract, isEditing])

  useEffect(() => {
    if (editingTenant) {
      setName(editingTenant.name)
      setPhone(editingTenant.phone || '')
      setRoomId(editingTenant.roomId)
      setContractStart(editingTenant.contractStart)
      setContractEnd(editingTenant.contractEnd)
      setPaymentMethod(editingTenant.paymentMethod)
      setAdvanceDays(editingTenant.advanceDays)
      setBillSplit(editingTenant.billSplit || 'front')
      setMonthlyRent(editingTenant.monthlyRent.toString())
      setDeposit(editingTenant.deposit?.toString() || '')
      setOtherFeeName(editingTenant.otherFeeName || '卫管费')
      setOtherFeeAmount(editingTenant.otherFeeAmount?.toString() || '')
    } else {
      setName('')
      setPhone('')
      setRoomId(selectedRoomId || '')
      const d = new Date()
      setContractStart(formatDate(d))
      // 有选中房间时，合同结束期默认取业主合同结束期
      if (selectedRoomId) {
        const room = rooms.find(r => r.id === selectedRoomId)
        const lc = room ? landlordContracts.find(c => c.propertyId === room.propertyId && c.status === 'active') : null
        setContractEnd(lc ? lc.contractEnd : formatDate(add30Days(d, 359)))
      } else {
        setContractEnd(formatDate(add30Days(d, 359)))
      }
      setPaymentMethod('monthly')
      setAdvanceDays(0)
      setBillSplit('front')
      setMonthlyRent('')
      setDeposit('')
      setOtherFeeName('卫管费')
      setOtherFeeAmount('')
    }
    setError('')
    setStep('info')
    setDepositTouched(false)
  }, [isOpen, editingTenant, selectedRoomId])

  // 续约模式：押金默认按新月租自动调整（保持旧合同的押金倍数，如押一/押二），
  // 用户手动改过押金后不再自动覆盖
  useEffect(() => {
    if (!isRenewal || depositTouched) return
    const oldRent = editingTenant?.monthlyRent
    const oldDeposit = editingTenant?.deposit
    const newRent = parseFloat(monthlyRent)
    if (!oldRent || oldRent <= 0 || !oldDeposit || oldDeposit <= 0 || isNaN(newRent) || newRent <= 0) return
    const ratio = oldDeposit / oldRent
    setDeposit(Math.round(newRent * ratio).toString())
  }, [monthlyRent, isRenewal, depositTouched, editingTenant])

  const getRoomLabel = (rid: string) => {
    const room = rooms.find(r => r.id === rid)
    if (!room) return ''
    const prop = properties.find(p => p.id === room.propertyId)
    return prop ? `${prop.address} - ${formatRoomLabel(room.label)}` : `${formatRoomLabel(room.label)}`
  }

  const selectedRoom = rooms.find(r => r.id === roomId)

  const regenerateBills = (split?: 'front' | 'rear') => {
    const rent = parseFloat(monthlyRent)
    if (isNaN(rent) || rent <= 0) return
    // 生成房租分期账单（不含其他费）
    const rentBills = generateRentBills(
      rent,
      contractStart,
      contractEnd,
      paymentMethod,
      advanceDays,
      split ?? billSplit
    )
    // 押金和其他费用排在最前面
    const extras: DraftBill[] = []
    if (isRenewal) {
      // 续约：比较新旧押金，只生成差额账单
      const oldDeposit = editingTenant?.deposit || 0
      const newDeposit = parseFloat(deposit) || 0
      const diff = newDeposit - oldDeposit
      if (diff > 0) {
        // 押金增加：补收差额
        extras.push({
          type: 'deposit',
          amount: diff,
          dueDate: formatDate(new Date(contractStart)),
          periodStart: contractStart,
          periodEnd: contractEnd,
          description: '押金补收',
        })
      } else if (diff < 0) {
        // 押金减少：退还差额
        // ⚠️ 负数押金账单是正常业务设计（type=deposit, direction=receivable, amount 为负）：
        // 押金余额统计按「押金为正、退押金为负」正确抵减（More.tsx），利润计算排除押金（profit.ts）。
        // 续约降价导致押金减少时，此负数账单用于退还差额，勿视为 bug。
        extras.push({
          type: 'deposit',
          amount: diff, // negative amount = refund
          dueDate: formatDate(new Date(contractStart)),
          periodStart: contractStart,
          periodEnd: contractEnd,
          description: '退押金',
        })
      }
      // diff === 0: 无变化，不生成账单
    } else {
      // 新合同：生成全额押金账单
      const depositVal = parseFloat(deposit)
      if (!isNaN(depositVal) && depositVal > 0) {
        extras.push({
          type: 'deposit',
          amount: depositVal,
          dueDate: formatDate(new Date(contractStart)),
          periodStart: contractStart,
          periodEnd: contractEnd,
          description: '押金',
        })
      }
    }
    const otherFeeVal = parseFloat(otherFeeAmount)
    if (!isNaN(otherFeeVal) && otherFeeVal > 0) {
      extras.push({
        type: 'other',
        amount: otherFeeVal,
        dueDate: formatDate(new Date(contractStart)),
        periodStart: contractStart,
        periodEnd: contractEnd,
        description: otherFeeName,
      })
    }
    setDraftBills([...extras, ...rentBills])
    setBillKey(k => k + 1)
  }

  const handleNext = () => {
    if (!name.trim()) {
      showError(setError, '请输入租客姓名')
      return
    }

    if (!roomId) {
      showError(setError, '请选择房间')
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

    const rent = parseFloat(monthlyRent)
    if (isNaN(rent) || rent <= 0) {
      showError(setError, '请输入月租金')
      return
    }

    // 校验租客合同日期不能超出房屋代理合同
    if (!editingTenant && selectedRoom) {
      const allContracts = useStore.getState().landlordContracts
      const lc = allContracts.filter(c => c.propertyId === selectedRoom.propertyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      if (lc) {
        if (contractStart < lc.contractStart) {
          showError(setError, `租赁合同开始日不能早于代理合同（${lc.contractStart}）`)
          return
        }
        if (contractEnd > lc.contractEnd) {
          showError(setError, `租赁合同结束日不能晚于代理合同（${lc.contractEnd}）`)
          return
        }
      } else {
        showError(setError, '请先签订该房源的业主合同')
        return
      }
    }

    regenerateBills()
    setError('')
    setStep('preview')
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (isEditing) {
      if (!name.trim()) {
        showError(setError, '请输入租客姓名')
        return
      }
      // 与 handleNext 一致的完整校验（防止保存月租0/非法日期等）
      if (!roomId) {
        showError(setError, '请选择房间')
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
      const rent = parseFloat(monthlyRent)
      if (isNaN(rent) || rent <= 0) {
        showError(setError, '请输入月租金')
        return
      }
      // 校验租客合同日期不能超出房屋代理合同（与 handleNext 一致；编辑模式同样校验，防止改出业主合同范围）
      if (selectedRoom) {
        const allContracts = useStore.getState().landlordContracts
        const lc = allContracts.filter(c => c.propertyId === selectedRoom.propertyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        if (lc) {
          if (contractStart < lc.contractStart) {
            showError(setError, `租赁合同开始日不能早于代理合同（${lc.contractStart}）`)
            return
          }
          if (contractEnd > lc.contractEnd) {
            showError(setError, `租赁合同结束日不能晚于代理合同（${lc.contractEnd}）`)
            return
          }
        } else {
          showError(setError, '请先签订该房源的业主合同')
          return
        }
      }
      onSave({
        name: name.trim(),
        phone: phone.trim() || undefined,
        roomId,
        contractStart,
        contractEnd,
        monthlyRent: parseFloat(monthlyRent) || 0,
        paymentMethod,
        advanceDays,
        billSplit,
        deposit: deposit ? parseFloat(deposit) : undefined,
        otherFeeName: otherFeeName === '卫管费' && !otherFeeAmount ? undefined : otherFeeName,
        otherFeeAmount: otherFeeAmount ? parseFloat(otherFeeAmount) : undefined,
        // 编辑已退租租客时保留原状态，避免「复活」为在租（房间状态不一致/一房双租客）
        status: editingTenant?.status ?? 'active',
      })
      onClose()
    }
  }

  const doConfirmContract = () => {
    if (!selectedRoom) return
    if (draftBills.length === 0) {
      showError(setError, '未生成账单，请返回检查合同信息')
      return
    }
    // 预览页金额可被清空/改 0 → 校验非押金账单金额必须 > 0（负数退押金为正常业务，排除 deposit）
    const invalidBill = draftBills.find(b => b.type !== 'deposit' && (!Number.isFinite(b.amount) || b.amount <= 0))
    if (invalidBill) {
      showError(setError, '账单金额必须大于 0，请返回检查')
      return
    }
    const tenantData: Omit<Tenant, 'id' | 'createdAt' | 'displayId'> = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      roomId,
      contractStart,
      contractEnd,
      monthlyRent: parseFloat(monthlyRent) || 0,
      paymentMethod,
      advanceDays,
      billSplit,
      deposit: deposit ? parseFloat(deposit) : undefined,
      otherFeeName: otherFeeName === '卫管费' && !otherFeeAmount ? undefined : otherFeeName,
      otherFeeAmount: otherFeeAmount ? parseFloat(otherFeeAmount) : undefined,
      // 编辑已退租租客时保留原状态，避免「复活」为在租
      status: editingTenant?.status ?? 'active',
    }
    if (editingTenant) {
      onContractUpdate?.(editingTenant.id, tenantData, draftBills)
    } else {
      onContractConfirm?.(tenantData, draftBills)
    }
    onClose()
  }

  const handleConfirmContract = () => {
    // 编辑非续约模式：该租客已有已收/已退账单，重新生成会删除这些记录 → 先弹确认
    if (editingTenant && !isRenewal && editingPaidBillCount > 0) {
      setConfirmRegen(true)
      return
    }
    doConfirmContract()
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
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white px-4 py-2.5 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {isEditing ? '编辑租客' : step === 'info' ? '添加租客' : '预览账单'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'info' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>1</span>
              <span className="text-xs text-gray-400">合同信息</span>
              <div className="w-8 h-px bg-gray-300" />
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
              <span className="text-xs text-gray-400">确认账单</span>
            </div>
          </div>

          {/* 业主合同期参考 */}
          {step === 'info' && currentLandlordContract && (
            <div className="px-4 pt-1 pb-0">
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-xs text-blue-700 flex items-center gap-1.5">
                <Calendar className="w-3 h-3 inline" />
                业主合同期：
                <span className="font-medium">{currentLandlordContract.contractStart} ~ {currentLandlordContract.contractEnd}</span>
                <span className="text-blue-400 ml-1">
                  （{(() => {
                    const s = new Date(currentLandlordContract.contractStart)
                    const e = new Date(currentLandlordContract.contractEnd)
                    const m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
                    return `${m}个月`
                  })()}）
                </span>
              </div>
            </div>
          )}

        {/* Step 1: Info */}
        {step === 'info' && (
          <div className="p-4 space-y-2.5">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Home className="w-4 h-4 inline mr-1" />
                房间
              </label>
              <button
                type="button"
                onClick={() => { if (!selectedRoomId) setShowRoomPicker(true) }}
                className={`w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 ${selectedRoomId ? 'opacity-60' : ''}`}
                disabled={!!selectedRoomId}
              >
                <span className={roomId ? 'text-gray-900 truncate' : 'text-gray-400'}>
                  {roomId ? getRoomLabel(roomId) || '请选择房间' : '请选择房间'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  租客姓名
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：张先生"
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  电话（选填）
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="13800138000"
                  maxLength={11}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  合同开始
                </label>
                <WheelDatePicker
                  value={contractStart}
                  onChange={(v) => setContractStart(v)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  合同结束
                </label>
                <WheelDatePicker
                  value={contractEnd}
                  onChange={(v) => setContractEnd(v)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  月租金（元）
                </label>
                <input
                  type="number"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="2000"
                  min="1"
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">押金（选填）</label>
                <input
                  type="number"
                  value={deposit}
                  onChange={(e) => { setDepositTouched(true); setDeposit(e.target.value) }}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 续约押金调整释义：说明押金自动计算与负数退押金账单是正常业务 */}
            {isRenewal && editingTenant?.deposit ? (
              <div className="col-span-2 -mt-1">
                {(() => {
                  const oldDeposit = editingTenant.deposit || 0
                  const newDeposit = parseFloat(deposit) || 0
                  const diff = Math.round(newDeposit - oldDeposit)
                  if (diff < 0) {
                    return <p className="text-[11px] text-orange-600">押金减少 ¥{Math.abs(diff)}，将自动生成 -¥{Math.abs(diff)} 的退押金账单（负数金额为正常退款）</p>
                  }
                  if (diff > 0) {
                    return <p className="text-[11px] text-gray-400">押金增加 ¥{diff}，将自动生成 +¥{diff} 的押金补收账单</p>
                  }
                  return <p className="text-[11px] text-gray-400">押金已按新月租自动调整，可手动修改</p>
                })()}
              </div>
            ) : null}

            <div className="bg-gray-50 rounded-xl p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">费用名称</label>
                  <input
                    type="text"
                    value={otherFeeName}
                    onChange={(e) => setOtherFeeName(e.target.value)}
                    placeholder="卫管费"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">金额</label>
                  <input
                    type="number"
                    value={otherFeeAmount}
                    onChange={(e) => setOtherFeeAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">合同期内只收一次</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  付款方式
                </label>
                <button
                  type="button"
                  onClick={() => setShowPaymentPicker(true)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <span className="text-gray-900 truncate">{paymentMethods.find(pm => pm.value === paymentMethod)?.label || ''}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">提前付款</label>
                <div className="relative">
                  <input
                    type="number"
                    value={advanceDays === 0 ? '' : advanceDays}
                    onChange={(e) => setAdvanceDays(parseInt(e.target.value) || 0)}
                    onFocus={() => setAdvanceOpen(true)}
                    onBlur={() => setTimeout(() => setAdvanceOpen(false), 150)}
                    min="0"
                    placeholder="0"
                    className="w-full px-4 py-2 pr-9 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <ChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  />
                  {advanceOpen && (
                    <div className="absolute left-0 right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                      {[7, 15, 30].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setAdvanceDays(d); setAdvanceOpen(false) }}
                          className={`w-full px-4 py-2.5 text-left text-sm hover:bg-blue-50 ${advanceDays === d ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                        >
                          {d}天
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button type="button" onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">取消</button>
              {editingTenant && (
                <button type="button" onClick={(e) => { e.preventDefault(); handleSave(e as any) }} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">保存</button>
              )}
              <button type="button" onClick={handleNext} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1">
                下一步 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Bill Preview */}
        {step === 'preview' && (
          <div className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <div className="bg-blue-50 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-sm text-blue-700 truncate">{getRoomLabel(roomId)}</span>
              <span className="text-xs text-blue-500 shrink-0">{contractStart}~{contractEnd}</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">待生成账单（可修改）</h3>
                <button
                  type="button"
                  onClick={() => setShowBillSplitPicker(true)}
                  className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600 flex items-center gap-1"
                >
                  {billSplit === 'front' ? '先整后零' : '先零后整'}
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
              </div>
              {draftBills.map((bill, i) => (
                <div key={`${billKey}-${i}`} className="bg-white rounded-2xl border border-gray-100 p-2.5 shadow-sm">
                  <span className={`text-xs px-2 py-0.5 rounded-full mb-1.5 inline-block ${bill.type === 'other' ? 'bg-purple-100 text-purple-700' : bill.amount < 0 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {bill.type === 'other' ? bill.description || '其他' : bill.description?.split(' ')[0] || '房租'}
                    {bill.amount < 0 && <span className="ml-1">退款</span>}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">应收日</label>
                      <WheelDatePicker
                        defaultValue={bill.dueDate}
                        data-draft-index={i}
                        onChange={(v) => updateDraftBill(i, 'dueDate', v)}
                        className="date-compact flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">金额</label>
                      <input
                        type="number"
                        defaultValue={bill.amount}
                        onChange={(e) => updateDraftBill(i, 'amount', e.target.value)}
                        className={`flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm font-medium ${bill.amount < 0 ? 'text-orange-600' : ''}`}
                        step="0.01"
                      />
                    </div>
                    {bill.type !== 'other' && (
                      <>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">开始</label>
                          <WheelDatePicker
                            defaultValue={bill.periodStart}
                            data-draft-index={i}
                            onChange={(v) => updateDraftBill(i, 'periodStart', v)}
                            className="date-compact flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400 whitespace-nowrap w-10 shrink-0">结束</label>
                          <WheelDatePicker
                            defaultValue={bill.periodEnd}
                            data-draft-index={i}
                            onChange={(v) => updateDraftBill(i, 'periodEnd', v)}
                            className="date-compact flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-xl text-sm"
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
              <span className="text-xl font-bold text-blue-600">
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
                onClick={handleConfirmContract}
                className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                {editingTenant ? '保存合同修改' : '确认签约'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* 房间选择弹窗 */}
    {showRoomPicker && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowRoomPicker(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">选择房间</h3>
            <button type="button" onClick={() => setShowRoomPicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => { setRoomId(''); setShowRoomPicker(false) }}
              className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${roomId === '' ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
            >
              <span className="text-sm text-gray-400">请选择房间</span>
              {roomId === '' && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
            </button>
            {rooms.filter(r => r.status === 'vacant' || r.id === editingTenant?.roomId).map((r) => {
              const isSelected = roomId === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setRoomId(r.id); setShowRoomPicker(false) }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{getRoomLabel(r.id)}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
            {rooms.filter(r => r.status === 'vacant' || r.id === editingTenant?.roomId).length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">暂无可选房间</div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* 付款方式选择弹窗 */}
    {showPaymentPicker && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowPaymentPicker(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">选择付款方式</h3>
            <button type="button" onClick={() => setShowPaymentPicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {paymentMethods.map((pm) => {
              const isSelected = paymentMethod === pm.value
              return (
                <button
                  key={pm.value}
                  type="button"
                  onClick={() => { setPaymentMethod(pm.value as PaymentMethod); setShowPaymentPicker(false) }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{pm.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )}

    {/* 拆单方向选择弹窗 */}
    {showBillSplitPicker && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowBillSplitPicker(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">账单拆分方式</h3>
            <button type="button" onClick={() => setShowBillSplitPicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(['front', 'rear'] as const).map((v) => {
              const isSelected = billSplit === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setBillSplit(v); regenerateBills(v); setShowBillSplitPicker(false) }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{v === 'front' ? '先整后零' : '先零后整'}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )}

    {/* 编辑合同确认：重新生成账单将删除该租客已收/已退账单 */}
    <ConfirmModal
      isOpen={confirmRegen}
      onClose={() => setConfirmRegen(false)}
      onConfirm={() => { setConfirmRegen(false); doConfirmContract() }}
      title="重新生成账单"
      message={`该租客已有 ${editingPaidBillCount} 笔已收/已退账单。保存合同修改将删除这些账单记录（删除后需在账单页手动重新添加），是否继续？`}
      confirmText="继续，删除并重新生成"
      cancelText="取消"
    />
    </>
  )
}
