import { useState, useEffect, useMemo, useRef } from 'react'
import { Bill, Property, Tenant, Room, BillDirection } from '../types'
import { X, Home, User, DollarSign, Calendar, FileText, Check, ChevronDown } from 'lucide-react'
import { formatDate, repeatDueDate } from '../utils/calculator'
import { formatRoomLabel } from '../lib/utils'
import WheelDatePicker from './WheelDatePicker'

interface BillModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (bill: Omit<Bill, 'id' | 'createdAt'>) => void
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  editingBill?: Bill
  defaultRoomId?: string
  defaultTenantId?: string
  defaultDirection?: BillDirection
}

export default function BillModal({ isOpen, onClose, onSave, properties, rooms, tenants, editingBill, defaultRoomId, defaultTenantId, defaultDirection }: BillModalProps) {
  // 错误提示定时清理（组件卸载或重新打开时不再触发 setState）
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }, [])

  function showError(setter: (msg: string) => void, msg: string) {
    setter(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setter(''), 5000)
  }

  const [direction, setDirection] = useState<BillDirection>('receivable')
  const [propertyId, setPropertyId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [type, setType] = useState<Bill['type']>('rent')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(formatDate(new Date()))
  const [paidDate, setPaidDate] = useState<string | undefined>(undefined)
  const [paidAmount, setPaidAmount] = useState('')
  const [status, setStatus] = useState<Bill['status']>('pending')
  const [error, setError] = useState('')
  const [repeatMode, setRepeatMode] = useState(false)
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatCount, setRepeatCount] = useState(3)
  const [description, setDescription] = useState('')
  const [showPropPickerForBill, setShowPropPickerForBill] = useState(false)
  const [showRoomPickerForBill, setShowRoomPickerForBill] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showTenantPickerForBill, setShowTenantPickerForBill] = useState(false)
  const [showRepeatPicker, setShowRepeatPicker] = useState(false)

  const relatedTenants = useMemo(() =>
    roomId ? tenants.filter(t => t.roomId === roomId) : [],
    [tenants, roomId]
  )

  const selectedRoomLabel = useMemo(() => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return ''
    const prop = properties.find(p => p.id === room.propertyId)
    return `${prop?.address} - ${formatRoomLabel(room.label)}`
  }, [rooms, properties, roomId])

  useEffect(() => {
    if (editingBill) {
      setDirection(editingBill.direction)
      setPropertyId(editingBill.propertyId || '')
      setRoomId(editingBill.roomId || '')
      setTenantId(editingBill.tenantId || '')
      setType(editingBill.type)
      setAmount(editingBill.amount.toString())
      setDueDate(editingBill.dueDate)
      setPaidDate(editingBill.paidDate)
      setPaidAmount(editingBill.paidAmount?.toString() || '')
      setStatus(editingBill.status)
      setDescription(editingBill.description || '')
    } else {
      setDirection(defaultDirection || 'receivable')
      setPropertyId('')
      setRoomId(defaultRoomId || '')
      // 默认选中本房间的租客（优先用传入的 defaultTenantId）
      if (defaultTenantId) {
        setTenantId(defaultTenantId)
      } else if (defaultRoomId) {
        const roomTenant = tenants.filter(t => t.roomId === defaultRoomId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        setTenantId(roomTenant?.id || '')
      } else {
        setTenantId('')
      }
      setType('rent')
      setAmount('')
      setDueDate(formatDate(new Date()))
      setPaidDate(undefined)
      setPaidAmount('')
      setStatus('pending')
      setDescription('')
      setRepeatMode(false)
      setRepeatCount(3)
    }
    setError('')
  }, [isOpen, editingBill, defaultRoomId, defaultDirection])

  // ESC键关闭
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    if (direction === 'payable' && !propertyId) {
      showError(setError, '请选择房源')
      return
    }

    if (direction === 'receivable' && !roomId) {
      showError(setError, '请选择房间')
      return
    }

    // 应收账单必须归属租客（防止孤儿账单：有房间无租客，导致利润计算漏算）
    if (direction === 'receivable' && !tenantId) {
      showError(setError, '请选择租客（应收账单必须归属租客）')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum)) {
      showError(setError, '请输入有效的金额')
      return
    }
    if (amountNum <= 0) {
      showError(setError, '请输入大于 0 的金额')
      return
    }

    if (!dueDate) {
      showError(setError, '请选择应付/应收日期')
      return
    }

    if (status === 'paid' && !paidDate) {
      showError(setError, '请选择实际付款/收款日期')
      return
    }

    if (paidAmount) {
      const paidAmtNum = parseFloat(paidAmount)
      if (isNaN(paidAmtNum) || paidAmtNum <= 0) {
        showError(setError, '实收金额必须大于 0')
        return
      }
      if (paidAmtNum > amountNum) {
        showError(setError, '实收金额不能大于账单金额')
        return
      }
    }

    const baseData = {
      propertyId: direction === 'payable' ? propertyId : undefined,
      roomId: direction === 'receivable' ? roomId : undefined,
      tenantId: tenantId || undefined,
      amount: amountNum,
      type,
      status,
      direction,
      dueDate,
      paidDate: status === 'paid' ? (paidDate || dueDate) : undefined,
      paidAmount: paidAmount ? parseFloat(paidAmount) : undefined,
      description: description || undefined,
    }

    if (repeatMode && !editingBill) {
      // 按周期生成多笔账单（首笔保持原日期，后续按 30/360 顺延，避免 31号/2月 漂移）
      for (let i = 0; i < repeatCount; i++) {
        onSave({
          ...baseData,
          dueDate: repeatDueDate(dueDate, i, repeatInterval),
        })
      }
    } else {
      onSave(baseData)
    }
    onClose()
  }

  const typeLabels: Record<string, string> = {
    rent: direction === 'payable' ? '房租（整栋）' : '房租',
    deposit: '押金',
    agency: '中介费',
    sublease: '转租费',
    hygiene: '卫管费',
    internet: '网费',
    utilities: '水电燃气费',
    other: '其他费用',
  }

  const statusLabels: Record<string, string> = {
    pending: direction === 'payable' ? '未付' : '未收',
    paid: direction === 'payable' ? '已付' : '已收',
    overdue: '已逾期',
  }

  if (!isOpen) return null

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-4 pt-4 pb-1 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-900">{editingBill ? '编辑账单' : '添加账单'}</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex gap-2 bg-gray-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setDirection('receivable')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${direction === 'receivable' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              应收（租客）
            </button>
            <button
              type="button"
              onClick={() => setDirection('payable')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${direction === 'payable' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              应付（房东）
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-3 space-y-2.5">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs">{error}</div>
          )}

          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">账单类型</label>
              <button
                type="button"
                onClick={() => setShowTypePicker(true)}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="text-gray-900 truncate">{typeLabels[type] || '请选择类型'}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                <DollarSign className="w-3 h-3 inline mr-0.5" />
                金额
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="金额"
                className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {direction === 'payable' ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0.5">
                <Home className="w-3 h-3 inline mr-0.5" />
                 房源
              </label>
              <button
                type="button"
                onClick={() => setShowPropPickerForBill(true)}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className={propertyId ? 'text-gray-900 truncate' : 'text-gray-400'}>
                  {propertyId
                    ? properties.find(p => p.id === propertyId)?.address || '请选择房源'
                    : '请选择房源'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  <Home className="w-3 h-3 inline mr-0.5" />
                  房间
                </label>
                <button
                  type="button"
                  onClick={() => setShowRoomPickerForBill(true)}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span className={roomId ? 'text-gray-900 truncate' : 'text-gray-400'}>
                    {roomId ? selectedRoomLabel || '请选择房间' : '请选择房间'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              </div>

              {relatedTenants.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
                    <User className="w-3 h-3 inline mr-0.5" />
                    租客
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTenantPickerForBill(true)}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span className={tenantId ? 'text-gray-900 truncate' : 'text-gray-400'}>
                      {tenantId ? relatedTenants.find(t => t.id === tenantId)?.name || '请选择租客' : '请选择租客'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                </div>
              )}
            </div>
          )}

          {type === 'rent' && (
            <div className="bg-blue-50 rounded-lg px-2.5 py-2">
              <p className="text-[11px] text-blue-600">房租金额直接在「金额」栏填写即可</p>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  <Calendar className="w-3 h-3 inline mr-0.5" />
                  {direction === 'payable' ? '应付日期' : '应收日期'}
                </label>
                <WheelDatePicker
                  value={dueDate}
                  onChange={(v) => setDueDate(v)}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  <FileText className="w-3 h-3 inline mr-0.5" />
                  备注
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="账单期间或备注"
                  rows={3}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="block text-xs font-medium text-gray-700 w-10">状态</label>
            <div className="flex gap-1 flex-1">
              {(['pending', 'paid', 'overdue'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s)
                  if (s === 'paid') setPaidDate(dueDate)
                  else setPaidDate(undefined)
                }}
                className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all ${
                  status === s
                    ? s === 'pending'
                      ? 'bg-yellow-100 text-yellow-700 border border-yellow-500'
                      : s === 'paid'
                      ? 'bg-green-100 text-green-700 border border-green-500'
                      : 'bg-red-100 text-red-700 border border-red-500'
                    : 'bg-gray-100 text-gray-600 border border-transparent'
                }`}
              >
                {statusLabels[s]}
              </button>
            ))}
          </div>
          </div>

          {status === 'paid' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  <Calendar className="w-3 h-3 inline mr-0.5" />
                  实际日期
                </label>
                <WheelDatePicker
                  value={paidDate || ''}
                  onChange={(v) => setPaidDate(v)}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  <DollarSign className="w-3 h-3 inline mr-0.5" />
                  实收金额（留空全额）
                </label>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="留空全额"
                  min="0"
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {!editingBill && (
            <div className="bg-gray-50 rounded-lg px-2.5 py-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={repeatMode}
                    onChange={(e) => setRepeatMode(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300"
                  />
                  <span className="text-[11px] font-medium text-gray-700">重复</span>
                </label>
                {repeatMode && (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[11px] text-gray-500">每</span>
                    <button
                      type="button"
                      onClick={() => setShowRepeatPicker(true)}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 text-center"
                    >
                      {repeatInterval}
                    </button>
                    <span className="text-[11px] text-gray-500">个月</span>
                    <span className="text-[11px] text-gray-500">共</span>
                    <input
                      type="number"
                      value={repeatCount}
                      onChange={(e) => {
              // 钳制到 1-60，防止误输超大值生成海量重复账单（max 属性不阻止输入）
              const v = parseInt(e.target.value)
              setRepeatCount(isNaN(v) ? 1 : Math.min(Math.max(v, 1), 60))
            }}
                      min="1"
                      max="60"
                      className="w-12 px-2 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-gray-500">笔</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* 房源选择弹窗 */}
    {showPropPickerForBill && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowPropPickerForBill(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">选择房源</h3>
            <button type="button" onClick={() => setShowPropPickerForBill(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {properties.map((p) => {
              const isSelected = propertyId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPropertyId(p.id)
                    setShowPropPickerForBill(false)
                  }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{p.address}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
            {properties.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">暂无房源</div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* 房间选择弹窗 */}
    {showRoomPickerForBill && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowRoomPickerForBill(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">选择房间</h3>
            <button type="button" onClick={() => setShowRoomPickerForBill(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rooms.map((r) => {
              const prop = properties.find(p => p.id === r.propertyId)
              const isSelected = roomId === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRoomId(r.id)
                    setTenantId('')
                    setShowRoomPickerForBill(false)
                  }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{prop?.address} - {formatRoomLabel(r.label)}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
            {rooms.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">暂无房间</div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* 账单类型选择弹窗 */}
    {showTypePicker && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowTypePicker(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">选择账单类型</h3>
            <button type="button" onClick={() => setShowTypePicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {Object.entries(typeLabels).map(([key, label]) => {
              const isSelected = type === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setType(key as Bill['type']); setShowTypePicker(false) }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{label}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )}

    {/* 租客选择弹窗 */}
    {showTenantPickerForBill && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowTenantPickerForBill(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">选择租客</h3>
            <button type="button" onClick={() => setShowTenantPickerForBill(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {relatedTenants.map((t) => {
              const isSelected = tenantId === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTenantId(t.id); setShowTenantPickerForBill(false) }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{t.name}</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
            {relatedTenants.length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">暂无租客</div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* 重复间隔选择弹窗 */}
    {showRepeatPicker && (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) setShowRepeatPicker(false) }}>
        <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">重复间隔</h3>
            <button type="button" onClick={() => setShowRepeatPicker(false)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {[1, 3, 6, 12].map((n) => {
              const isSelected = repeatInterval === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setRepeatInterval(n); setShowRepeatPicker(false) }}
                  className={`w-full px-4 py-3 text-left border-b border-gray-50 flex items-center justify-between ${isSelected ? 'bg-blue-100 text-blue-700' : 'active:bg-gray-50'}`}
                >
                  <span className="text-sm truncate">{n} 个月</span>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
