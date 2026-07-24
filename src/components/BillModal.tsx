import { useState, useEffect, useMemo } from 'react'
import { Bill, Property, Tenant, Room, BillDirection } from '../types'
import { X, Home, User, DollarSign, Calendar, FileText } from 'lucide-react'
import { formatDate, add30Days } from '../utils/calculator'

interface BillModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (bill: Omit<Bill, 'id' | 'createdAt'>) => void
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  editingBill?: Bill
  defaultRoomId?: string
  defaultDirection?: BillDirection
}

function showError(setter: (msg: string) => void, msg: string) {
  setter(msg)
  setTimeout(() => setter(''), 5000)
}

export default function BillModal({ isOpen, onClose, onSave, properties, rooms, tenants, editingBill, defaultRoomId, defaultDirection }: BillModalProps) {
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

  const relatedTenants = useMemo(() =>
    roomId ? tenants.filter(t => t.roomId === roomId) : [],
    [tenants, roomId]
  )

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
      // 默认选中本房间的租客
      if (defaultRoomId) {
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
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

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

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum)) {
      showError(setError, '请输入有效的金额')
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
      // 按周期生成多笔账单
      for (let i = 0; i < repeatCount; i++) {
        const nextDue = add30Days(new Date(dueDate), i * repeatInterval * 30)
        onSave({
          ...baseData,
          dueDate: formatDate(nextDue),
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
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Bill['type'])}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
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
                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">请选择房源</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                  <Home className="w-3 h-3 inline mr-0.5" />
                  房间
                </label>
                <select
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value)
                    setTenantId('')
                  }}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">请选择房间</option>
                  {rooms.map((r) => {
                    const prop = properties.find(p => p.id === r.propertyId)
                    return (
                      <option key={r.id} value={r.id}>
                        {prop?.address} - {r.label}室
                      </option>
                    )
                  })}
                </select>
              </div>

              {relatedTenants.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
                    <User className="w-3 h-3 inline mr-0.5" />
                    租客
                  </label>
                  <select
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">请选择租客</option>
                    {relatedTenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
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
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
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
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                <input
                  type="date"
                  value={paidDate || ''}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
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
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <select
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(parseInt(e.target.value))}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white"
                    >
                      <option value={1}>1</option>
                      <option value={3}>3</option>
                      <option value={6}>6</option>
                      <option value={12}>12</option>
                    </select>
                    <span className="text-[11px] text-gray-500">个月</span>
                    <span className="text-[11px] text-gray-500">共</span>
                    <input
                      type="number"
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(parseInt(e.target.value) || 1)}
                      min="1"
                      max="60"
                      className="w-12 px-2 py-1.5 border border-gray-200 rounded-md text-xs"
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
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
