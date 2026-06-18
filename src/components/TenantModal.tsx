import { useState, useEffect, useMemo } from 'react'
import { Tenant, Property, Room, PaymentMethod } from '../types'
import { X, User, Phone, Home, Calendar, DollarSign, ChevronRight, ChevronLeft } from 'lucide-react'
import { formatDate, generateRentBills, DraftBill, add30Days } from '../utils/calculator'
import { useStore } from '../store/useStore'

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

export default function TenantModal({ isOpen, onClose, onSave, onContractConfirm, onContractUpdate, properties, rooms, editingTenant, selectedRoomId }: TenantModalProps) {
  const [step, setStep] = useState<Step>('info')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roomId, setRoomId] = useState('')
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
  const [advanceDays, setAdvanceDays] = useState(0)
  const [monthlyRent, setMonthlyRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [otherFeeName, setOtherFeeName] = useState('卫管费')
  const [otherFeeAmount, setOtherFeeAmount] = useState('')
  const [error, setError] = useState('')

  const [draftBills, setDraftBills] = useState<DraftBill[]>([])
  const [billKey, setBillKey] = useState(0)
  const { landlordContracts } = useStore()

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
      setMonthlyRent('')
      setDeposit('')
      setOtherFeeName('卫管费')
      setOtherFeeAmount('')
    }
    setError('')
    setStep('info')
  }, [isOpen, editingTenant, selectedRoomId])

  const getRoomLabel = (rid: string) => {
    const room = rooms.find(r => r.id === rid)
    if (!room) return ''
    const prop = properties.find(p => p.id === room.propertyId)
    return prop ? `${prop.address} - ${room.label}室` : `${room.label}室`
  }

  const selectedRoom = rooms.find(r => r.id === roomId)

  const regenerateBills = () => {
    const rent = parseFloat(monthlyRent)
    if (isNaN(rent) || rent <= 0) return
    // 生成房租分期账单（不含其他费）
    const rentBills = generateRentBills(
      rent,
      contractStart,
      contractEnd,
      paymentMethod,
      advanceDays
    )
    // 押金和其他费用排在最前面
    const extras: DraftBill[] = []
    const depositVal = parseFloat(deposit)
    if (!isNaN(depositVal) && depositVal > 0) {
      extras.push({
        type: 'other',
        amount: depositVal,
        dueDate: formatDate(new Date(contractStart)),
        periodStart: contractStart,
        periodEnd: contractEnd,
        description: '押金',
      })
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
      onSave({
        name: name.trim(),
        phone: phone.trim() || undefined,
        roomId,
        contractStart,
        contractEnd,
        monthlyRent: parseFloat(monthlyRent) || 0,
        paymentMethod,
        advanceDays,
        deposit: deposit ? parseFloat(deposit) : undefined,
        otherFeeName: otherFeeName === '卫管费' && !otherFeeAmount ? undefined : otherFeeName,
        otherFeeAmount: otherFeeAmount ? parseFloat(otherFeeAmount) : undefined,
        status: 'active',
      })
      onClose()
    }
  }

  const handleConfirmContract = () => {
    if (!selectedRoom) return
    if (draftBills.length === 0) {
      showError(setError, '未生成账单，请返回检查合同信息')
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
      deposit: deposit ? parseFloat(deposit) : undefined,
      otherFeeName: otherFeeName === '卫管费' && !otherFeeAmount ? undefined : otherFeeName,
      otherFeeAmount: otherFeeAmount ? parseFloat(otherFeeAmount) : undefined,
      status: 'active',
    }
    if (editingTenant) {
      onContractUpdate?.(editingTenant.id, tenantData, draftBills)
    } else {
      onContractConfirm?.(tenantData, draftBills)
    }
    onClose()
  }

  const updateDraftBill = (index: number, field: 'amount' | 'dueDate' | 'periodStart' | 'periodEnd', value: string) => {
    setDraftBills(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: field === 'amount' ? parseFloat(value) || 0 : value }
      return next
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white p-4 border-b border-gray-100 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? '编辑租客' : step === 'info' ? '添加租客' : '预览账单'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'info' ? 'bg-blue-900 text-white' : 'bg-blue-100 text-blue-700'}`}>1</span>
              <span className="text-xs text-gray-400">合同信息</span>
              <div className="w-8 h-px bg-gray-300" />
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 'preview' ? 'bg-blue-900 text-white' : 'bg-gray-200 text-gray-400'}`}>2</span>
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
          <div className="p-4 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Home className="w-4 h-4 inline mr-1" />
                房间
              </label>
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={!!selectedRoomId}
              >
                <option value="">请选择房间</option>
                {rooms.filter(r => r.status === 'vacant' || r.id === editingTenant?.roomId).map((r) => (
                  <option key={r.id} value={r.id}>
                    {getRoomLabel(r.id)}
                  </option>
                ))}
              </select>
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

            <div className="grid grid-cols-2 gap-3">
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">押金（选填）</label>
                <input
                  type="number"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">费用名称</label>
                  <input
                    type="text"
                    value={otherFeeName}
                    onChange={(e) => setOtherFeeName(e.target.value)}
                    placeholder="卫管费"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">合同期内只收一次</p>
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {paymentMethods.map((pm) => (
                    <option key={pm.value} value={pm.value}>{pm.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">提前付款</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={advanceDays}
                    onChange={(e) => setAdvanceDays(parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-16 px-2 py-3 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">天</span>
                  <select
                    value={advanceDays}
                    onChange={(e) => setAdvanceDays(parseInt(e.target.value) || 0)}
                    className="flex-1 px-2 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value={0}>无</option>
                    <option value={7}>7天</option>
                    <option value={15}>15天</option>
                    <option value={30}>30天</option>
                  </select>
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

            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-blue-700">{getRoomLabel(roomId)}</p>
                  <p className="text-xs text-blue-500 mt-1">{contractStart} 至 {contractEnd}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-blue-900">{paymentMethods.find(p => p.value === paymentMethod)?.label}</p>
                  <p className="text-xs text-blue-500">提前{advanceDays === 0 ? '无' : `${advanceDays}天`}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700">待生成账单（可修改）</h3>
              {draftBills.map((bill, i) => (
                <div key={`${billKey}-${i}`} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${bill.type === 'other' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {bill.type === 'other' ? bill.description || '其他' : bill.description?.split(' ')[0] || '房租'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">应收日</label>
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
                    {bill.type !== 'other' && (
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
              <span className="text-xl font-bold text-blue-900">
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
  )
}
