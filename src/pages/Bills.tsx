import { useMemo, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Bill, BillDirection } from '../types'
import BillModal from '../components/BillModal'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import { Plus, Search, Edit2, Trash2, MoreVertical, Home, User, ChevronLeft, Droplets, Zap, Flame, Receipt, FileText, AlertTriangle, Wifi, Sparkles, Banknote, Handshake, ArrowLeftRight } from 'lucide-react'

function getDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
function getDaysLater(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function Bills() {
  const { bills, properties, rooms, tenants, landlordContracts, addBill, updateBill, deleteBill } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { direction?: BillDirection | 'all'; status?: Bill['status'] | 'all'; propertyId?: string; contractLabel?: string; filterStatus?: string } | null
  const contractFilter = state?.propertyId || null
  const contractLabel = state?.contractLabel || null
  const [direction, setDirection] = useState<BillDirection | 'all'>(state?.direction || 'receivable')
  const [filterStatus, setFilterStatus] = useState<Bill['status'] | 'refunded'>((state?.filterStatus as any) || state?.status || 'pending')
  const [showModal, setShowModal] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | undefined>()
  const [billMenu, setBillMenu] = useState<string | null>(null)
  const [payConfirmBill, setPayConfirmBill] = useState<Bill | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [showAllBills, setShowAllBills] = useState(false)
  const [dayRange, setDayRange] = useState(30)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null)

  // 自动标记逾期账单（每分钟检测一次）
  useEffect(() => {
    const checkOverdue = () => {
      const today = new Date().toISOString().slice(0, 10)
      const { bills: currentBills, updateBill: updateCurrentBill } = useStore.getState()
      for (const bill of currentBills) {
        if (bill.status === 'pending' && bill.dueDate < today) {
          updateCurrentBill(bill.id, { status: 'overdue' })
        }
      }
    }
    checkOverdue()
    const interval = setInterval(checkOverdue, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (payConfirmBill) {
      setPayAmount(payConfirmBill.amount.toString())
      setPayDate(new Date().toISOString().slice(0, 10))
      const m = payConfirmBill.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
      if (m) {
        setPayPeriodStart(m[1])
        setPayPeriodEnd(m[2])
      } else {
        setPayPeriodStart('')
        setPayPeriodEnd('')
      }
    }
  }, [payConfirmBill])

  function autoFillPayPeriod(paidAmt: number) {
    const bill = payConfirmBill
    if (!bill) return
    const m = bill.description?.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
    if (!m || bill.amount <= 0) return
    const start = new Date(m[1])
    const end = new Date(m[2])
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    if (totalDays <= 0) return
    const covered = Math.round(paidAmt / bill.amount * totalDays)
    const newEnd = new Date(start)
    newEnd.setDate(newEnd.getDate() + covered - 1)
    setPayPeriodStart(m[1])
    setPayPeriodEnd(newEnd.toISOString().slice(0, 10))
  }

  const getPropertyAddress = (pid?: string) => {
    if (!pid) return ''
    return properties.find(p => p.id === pid)?.address || ''
  }

  const getRoomInfo = (rid?: string) => {
    if (!rid) return ''
    const room = rooms.find(r => r.id === rid)
    if (!room) return ''
    const prop = properties.find(p => p.id === room.propertyId)
    return prop ? `${prop.address} - ${room.label}室` : `${room.label}室`
  }

  const getTenantName = (tid?: string) => {
    if (!tid) return ''
    return tenants.find(t => t.id === tid)?.name || ''
  }

  const getLandlordName = (direction: string, propertyId?: string) => {
    if (direction !== 'payable' || !propertyId) return ''
    const contract = landlordContracts.find(
      c => c.propertyId === propertyId && c.status === 'active'
    )
    return contract?.landlordName || ''
  }

  const typeLabels: Record<string, string> = {
    rent: '房租', deposit: '押金', agency: '中介费', sublease: '转租费',
    hygiene: '卫管费', internet: '网费', utilities: '水电燃气费',
    other: '其他费用'
  }
  const typeIcons: Record<string, typeof Home> = {
    rent: FileText, deposit: Banknote, agency: Handshake, sublease: ArrowLeftRight,
    hygiene: Sparkles, internet: Wifi, utilities: Zap,
    other: Receipt
  }

  const statusClasses: Record<string, string> = {
    pending: 'bg-orange-100 text-orange-700',
    paid: 'bg-green-600 text-white',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
    refunded: 'bg-blue-100 text-blue-700',
  }

  const getStatusLabel = (status: Bill['status'] | 'refunded', dir: BillDirection) => {
    if (status === 'refunded') return dir === 'receivable' ? '已退还' : '已退还'
    if (status === 'paid') return dir === 'receivable' ? '✓ 已收' : '✓ 已付'
    if (status === 'pending') return dir === 'receivable' ? '未收' : '未付'
    if (status === 'cancelled') return '已作废'
    return '已逾期'
  }

  const directionLabels: Record<string, string> = {
    receivable: '租客',
    payable: '业主',
  }

  const directionClasses: Record<string, string> = {
    receivable: 'bg-blue-50 text-blue-700',
    payable: 'bg-orange-50 text-orange-700',
  }

  // Filter and sort bills
  const relevantBills = contractFilter
    ? bills.filter(b => b.propertyId === contractFilter && b.direction === 'payable')
    : bills

  const daysAgo = getDaysAgo(dayRange)
  const daysLater = getDaysLater(dayRange)
  const today = new Date().toISOString().slice(0, 10)

  const filteredBills = useMemo(() => {
    // 全局过滤：排除已作废的账单
    const activeBills = relevantBills.filter(b => b.status !== 'cancelled')

    // 合同模式：显示全部，不限制月份
    if (contractFilter) {
      const list = activeBills.filter(b => {
    if (filterStatus === 'refunded') return b.status === 'refunded' || (b.status === 'paid' && b.amount < 0)
        const matchesStatus = filterStatus === 'pending'
          ? (b.status === 'pending' || b.status === 'overdue')
          : filterStatus === 'paid'
            ? b.status === 'paid' && b.amount >= 0
            : b.status === filterStatus
        return matchesStatus
      })
      return list
    }

    // 非合同模式：应用方向 + 状态 + 30天筛选
    const list = activeBills.filter(b => {
      if (direction !== 'all' && b.direction !== direction) return false
      if (filterStatus === 'refunded') return b.status === 'refunded' || (b.status === 'paid' && b.amount < 0)
      const matchesStatus = filterStatus === 'pending'
        ? (b.status === 'pending' || b.status === 'overdue')
        : filterStatus === 'paid'
          ? b.status === 'paid' && b.amount >= 0
          : b.status === filterStatus
      if (!matchesStatus) return false
      // 对于"未收"筛选，排除已退租租客的应收账单
      if (filterStatus === 'pending' && b.direction === 'receivable' && b.tenantId) {
        const tenant = tenants.find(t => t.id === b.tenantId)
        if (tenant?.status === 'ended') return false
      }
      // 天數窗口
      if (!showAllBills) {
        if (filterStatus === 'pending') {
          // 未收/未付：逾期全部显示，未来只显示选定天数内
          if (b.dueDate >= today && b.dueDate > daysLater) return false
        } else {
          // 已收/已付：只显示最近选定天数内
          if (b.dueDate < daysAgo) return false
        }
      }
      return true
    })
    return list
  }, [relevantBills, direction, filterStatus, contractFilter, showAllBills, daysAgo, daysLater, today, tenants])

  const hasMoreBills = useMemo(() => {
    if (showAllBills || contractFilter) return false
    return relevantBills.some(b => b.status !== 'cancelled' && (b.dueDate < daysAgo || b.dueDate > daysLater))
  }, [relevantBills, showAllBills, contractFilter, daysAgo, daysLater])

  // Sorting: 全部按 dueDate 升序（从前往后）
  const displayBills = useMemo(() => {
    return [...filteredBills].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [filteredBills])

  const handleSaveBill = (data: Omit<Bill, 'id' | 'createdAt'>) => {
    if (editingBill) {
      updateBill(editingBill.id, data)
    } else {
      addBill(data)
    }
    setEditingBill(undefined)
    setShowModal(false)
  }

  const handleEditBill = (bill: Bill) => {
    setEditingBill(bill)
    setShowModal(true)
    setBillMenu(null)
  }

  const handleDeleteBill = (id: string) => {
    setDeleteConfirmId(id)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-2">
        <div className="max-w-md mx-auto">
          {contractFilter ? (
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => navigate('/contracts')} className="p-1 hover:bg-gray-100 rounded-lg">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">业主账单</h1>
                <p className="text-xs text-gray-500">{contractLabel}</p>
              </div>
            </div>
          ) : (
            <h1 className="text-xl font-bold text-gray-900 mb-3">账单管理</h1>
          )}

          {/* 总体汇总 + 方向筛选（合同查看模式下隐藏） */}
          <div className={contractFilter ? 'hidden' : ''}>
          <div className="grid grid-cols-5 gap-1 mb-3">
            {(() => {
              const receivablePaid = bills.filter(b => b.direction === 'receivable' && b.status === 'paid' && b.type !== 'deposit' && b.amount >= 0).reduce((s, b) => s + b.amount, 0)
              const receivableRefunded = bills.filter(b => b.direction === 'receivable' && b.status === 'paid' && b.amount < 0).reduce((s, b) => s + Math.abs(b.amount), 0)
              const receivableUnpaid = bills.filter(b =>
                b.direction === 'receivable' &&
                b.status !== 'paid' &&
                b.status !== 'cancelled' &&
                !(b.tenantId && tenants.find(t => t.id === b.tenantId)?.status === 'ended') &&
                b.type !== 'deposit'
              ).reduce((s, b) => s + b.amount, 0)
              const payablePaid = bills.filter(b => b.direction === 'payable' && b.status === 'paid' && b.type !== 'deposit' && b.amount >= 0).reduce((s, b) => s + b.amount, 0)
              const payableUnpaid = bills.filter(b =>
                b.direction === 'payable' &&
                b.status !== 'paid' &&
                b.status !== 'cancelled' &&
                b.type !== 'deposit'
              ).reduce((s, b) => s + b.amount, 0)
              return (
                <>
                  <div className="bg-green-50 rounded-xl p-1.5 text-center">
                    <p className="text-[10px] text-green-600">已收</p>
                    <p className="text-xs font-bold text-green-700">¥{receivablePaid.toFixed(0)}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-1.5 text-center">
                    <p className="text-[10px] text-red-600">未收</p>
                    <p className="text-xs font-bold text-red-700">¥{receivableUnpaid.toFixed(0)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-1.5 text-center">
                    <p className="text-[10px] text-blue-600">已退还</p>
                    <p className="text-xs font-bold text-blue-700">¥{receivableRefunded.toFixed(0)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-1.5 text-center">
                    <p className="text-[10px] text-orange-600">未付</p>
                    <p className="text-xs font-bold text-orange-700">¥{payableUnpaid.toFixed(0)}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-1.5 text-center">
                    <p className="text-[10px] text-purple-600">已付</p>
                    <p className="text-xs font-bold text-purple-700">¥{payablePaid.toFixed(0)}</p>
                  </div>
                </>
              )
            })()}
          </div>
          
          {/* 方向筛选 */}
          <div className="flex gap-2 mb-3">
            {([
              { key: 'all', label: '全部' },
              { key: 'receivable', label: '租客' },
              { key: 'payable', label: '业主' },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setDirection(f.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  direction === f.key
                    ? 'bg-blue-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          </div>

          {/* 状态筛选 */}
          <div className="flex gap-2">
            {([
              { key: 'pending' as const, label: direction === 'payable' ? '未付' : '未收' },
              { key: 'paid' as const, label: direction === 'payable' ? '已付' : '已收' },
              { key: 'refunded' as const, label: '已退还' },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === f.key
                    ? 'bg-blue-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 天数筛选（仅未收/未付显示） */}
          {filterStatus === 'pending' && (
            <div className="flex items-center gap-1 mt-2 ml-1">
              <span className="text-xs text-gray-400 mr-1">显示</span>
              {[7, 15, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDayRange(d)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    dayRange === d
                      ? 'bg-blue-100 text-blue-800'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  逾期+未来{d}天
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            {/* 合同模式下显示全部汇总 */}
            {contractFilter && displayBills.length > 0 && (() => {
              const totalPaid = displayBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
              const totalUnpaid = displayBills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0)
                return (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">{displayBills.length} 笔</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-orange-50 rounded-lg p-2 text-xs">
                        <span className="text-orange-600">未付：</span>
                        <span className="font-medium text-orange-700">¥{totalUnpaid.toFixed(0)}</span>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 text-xs">
                        <span className="text-blue-600">已付：</span>
                        <span className="font-medium text-blue-700">¥{totalPaid.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* 月份汇总 */}
              {(() => {
                const receivableBills = displayBills.filter(b => b.direction === 'receivable')
                const payableBills = displayBills.filter(b => b.direction === 'payable')
                const receivablePaid = receivableBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
                const receivableUnpaid = receivableBills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0)
                const payablePaid = payableBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
                const payableUnpaid = payableBills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0)
                return displayBills.length > 0 ? (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">{displayBills.length} 笔</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded-lg p-2 text-xs">
                        <span className="text-blue-600">已收：</span>
                        <span className="font-medium text-blue-700">¥{receivablePaid.toFixed(0)}</span>
                        <span className="text-blue-400 ml-2">未收：</span>
                        <span className="font-medium text-blue-600">¥{receivableUnpaid.toFixed(0)}</span>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2 text-xs">
                        <span className="text-orange-600">未付：</span>
                        <span className="font-medium text-orange-700">¥{payableUnpaid.toFixed(0)}</span>
                        <span className="text-orange-400 ml-2">已付：</span>
                        <span className="font-medium text-orange-600">¥{payablePaid.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                ) : null
              })()}

              {/* 账单列表 */}
              <div className="space-y-3">
                {displayBills.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-gray-500">暂无匹配账单</p>
                    <p className="text-sm text-gray-400 mt-1">试试调整筛选条件</p>
                  </div>
                ) : (
                    displayBills.map((bill) => {
                    const tenantName = getTenantName(bill.tenantId)
                    const landlordName = getLandlordName(bill.direction, bill.propertyId)
                    return (
                      <div key={bill.id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-5 h-5 rounded flex items-center justify-center ${bill.type === 'rent' ? 'bg-blue-100 text-blue-600' : bill.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : bill.type === 'agency' ? 'bg-amber-100 text-amber-600' : bill.type === 'sublease' ? 'bg-violet-100 text-violet-600' : bill.type === 'hygiene' ? 'bg-pink-100 text-pink-600' : bill.type === 'internet' ? 'bg-purple-100 text-purple-600' : bill.type === 'utilities' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600'}`}>
                                {(() => { const Icon = typeIcons[bill.type] || Receipt; return <Icon className="w-3 h-3" /> })()}
                              </div>
                              <h3 className="font-semibold text-gray-900">{typeLabels[bill.type]}</h3>
                              {bill.status !== 'pending' && (
                                <span className={`rounded-full text-[10px] px-1.5 py-0.5 font-medium ${
                                  bill.status === 'refunded' || (bill.status === 'paid' && bill.amount < 0) ? 'bg-blue-50 text-blue-600' : bill.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                                }`}>
                                  {bill.status === 'refunded' || (bill.status === 'paid' && bill.amount < 0) ? '已退还' : bill.status === 'paid' ? '已收' : '逾期'}
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${directionClasses[bill.direction]}`}>
                                {directionLabels[bill.direction]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xl font-bold text-blue-900">¥{bill.amount.toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {bill.status !== 'paid' && (
                              <button
                                type="button"
                                onClick={() => setPayConfirmBill(bill)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                  bill.direction === 'receivable'
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                }`}
                              >
                                {bill.direction === 'receivable' ? '收款' : '付款'}
                              </button>
                            )}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setBillMenu(billMenu === bill.id ? null : bill.id)
                                }}
                                className="p-1.5 hover:bg-gray-100 rounded-full"
                              >
                                <MoreVertical className="w-5 h-5 text-gray-500" />
                              </button>
                              {billMenu === bill.id && (
                                <>
                                  <div className="fixed inset-0 z-[5]" onClick={() => setBillMenu(null)} />
                                <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[140px] z-[60]">
                                  <button
                                    type="button"
                                    onClick={() => handleEditBill(bill)}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBill(bill.id)}
                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    删除
                                  </button>
                                </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-1.5">
                          {bill.description && (
                            <div className="text-xs text-gray-500 leading-tight">{bill.description}</div>
                          )}
                          {bill.direction === 'payable' && (
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Home className="w-4 h-4 text-gray-400" />
                              <span>{getPropertyAddress(bill.propertyId)}</span>
                            </div>
                          )}
                          {bill.direction === 'receivable' && bill.roomId && (
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Home className="w-4 h-4 text-gray-400" />
                              <span>{getRoomInfo(bill.roomId)}</span>
                            </div>
                          )}
                          {(tenantName || landlordName) && (
                            <div className="flex items-center gap-1.5 text-sm text-gray-600 flex-wrap">
                              <User className="w-4 h-4 text-gray-400" />
                              <span>{tenantName || landlordName}</span>
                              <span className="text-gray-300">·</span>
                              <span>{bill.direction === 'payable' ? '应付日' : '应收日'}：{bill.dueDate}</span>
                              {bill.paidDate && bill.status === 'paid' && (
                                <span className="text-green-600 ml-1">实付：{bill.paidDate}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {hasMoreBills && !showAllBills && (
                <button
                  type="button"
                  onClick={() => setShowAllBills(true)}
                  className="w-full mt-4 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  加载更多（显示所有历史账单）
                </button>
              )}
            </div>

            {/* 总金额 */}
            <div className="mt-4 bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
              <span className="text-sm text-gray-500">
                {displayBills.length} 笔
              </span>
              <span className={`text-lg font-bold ${filterStatus === 'paid' ? 'text-green-700' : filterStatus === 'refunded' ? 'text-blue-700' : 'text-orange-700'}`}>
                ¥{displayBills.reduce((s, b) => s + b.amount, 0).toFixed(0)}
              </span>
            </div>

          <button
            type="button"
            onClick={() => {
              setEditingBill(undefined)
              setShowModal(true)
            }}
            className="w-full mt-6 bg-blue-900 text-white py-4 rounded-2xl font-medium hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            添加账单
          </button>
        </div>
      </div>

      <BillModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSaveBill}
        properties={properties}
        rooms={rooms}
        tenants={tenants}
        editingBill={editingBill}
      />

      {/* 收款/付款确认弹窗 */}
      {payConfirmBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]">
          <div className="bg-white rounded-t-3xl w-full max-w-md">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{(payConfirmBill.direction === 'receivable') ? '收款确认' : '付款确认'}</h2>
              <p className="text-xs text-gray-400 mt-1">可修改本次{payConfirmBill.direction === 'receivable' ? '收款' : '付款'}金额和日期</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">类型</span>
                  <span className="text-sm font-medium">{typeLabels[payConfirmBill.type]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">总金额</span>
                  <span className="text-lg font-bold text-blue-900">¥{payConfirmBill.amount.toFixed(2)}</span>
                </div>
                {payConfirmBill.description && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">期间</span>
                    <span className="text-sm font-medium">{payConfirmBill.description}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">{payConfirmBill.direction === 'receivable' ? '应收日' : '应付日'}</span>
                  <span className="text-sm font-medium">{payConfirmBill.dueDate}</span>
                </div>
                {payConfirmBill.roomId && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">房间</span>
                    <span className="text-sm font-medium">{getRoomInfo(payConfirmBill.roomId)}</span>
                  </div>
                )}
                {payConfirmBill.propertyId && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">房源</span>
                    <span className="text-sm font-medium">{getPropertyAddress(payConfirmBill.propertyId)}</span>
                  </div>
                )}
                {getTenantName(payConfirmBill.tenantId) && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">租客</span>
                    <span className="text-sm font-medium">{getTenantName(payConfirmBill.tenantId)}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">本次{payConfirmBill.direction === 'receivable' ? '收款' : '付款'}</label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => {
                      setPayAmount(e.target.value)
                      const v = parseFloat(e.target.value)
                      if (v > 0 && payConfirmBill && v < payConfirmBill.amount) autoFillPayPeriod(v)
                    }}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                    min="0"
                    max={payConfirmBill.amount}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {payAmount !== '' && payConfirmBill && parseFloat(payAmount) > 0 && parseFloat(payAmount) < payConfirmBill.amount && payPeriodStart && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">开始日</label>
                    <input type="date" value={payPeriodStart} onChange={e => setPayPeriodStart(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">结束日</label>
                    <input type="date" value={payPeriodEnd} onChange={e => setPayPeriodEnd(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm" />
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 rounded-xl px-4 py-2 text-xs text-yellow-700">
                留空本次{payConfirmBill.direction === 'receivable' ? '收款' : '付款'}金额则视为全额{payConfirmBill.direction === 'receivable' ? '收款' : '付款'}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setPayConfirmBill(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200">取消</button>
                <button type="button" onClick={() => {
                  const paidAmt = payAmount !== '' ? parseFloat(payAmount) : undefined
                  if (paidAmt !== undefined && paidAmt > payConfirmBill.amount) {
                    setAlertState({ title: '提示', message: '收款金额不能大于账单金额' })
                    return
                  }
                  const isPartial = paidAmt !== undefined && paidAmt < payConfirmBill.amount
                  if (isPartial) {
                    // 拆单：原账单金额减少，新生成一笔已付账单
                    const remaining = payConfirmBill.amount - paidAmt
                    updateBill(payConfirmBill.id, { amount: remaining, paidDate: undefined })
                    const periodDesc = payPeriodStart && payPeriodEnd
                      ? `${payPeriodStart} ~ ${payPeriodEnd}`
                      : undefined
                    const baseDesc = payConfirmBill.description || ''
                    const newDesc = periodDesc
                      ? baseDesc.replace(/\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/, periodDesc)
                      : baseDesc
                    addBill({
                      propertyId: payConfirmBill.propertyId,
                      roomId: payConfirmBill.roomId,
                      tenantId: payConfirmBill.tenantId,
                      amount: paidAmt,
                      type: payConfirmBill.type,
                      status: 'paid',
                      direction: payConfirmBill.direction,
                      dueDate: payConfirmBill.dueDate,
                      paidDate: payDate || new Date().toISOString().slice(0, 10),
                      description: newDesc,
                    })
                  } else {
                    updateBill(payConfirmBill.id, {
                      status: 'paid',
                      paidDate: payDate || new Date().toISOString().slice(0, 10),
                    })
                  }
                  setPayConfirmBill(null)
                }} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">
                  确认{payConfirmBill.direction === 'receivable' ? '收款' : '付款'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        onClose={() => { setDeleteConfirmId(null); setBillMenu(null) }}
        onConfirm={() => {
          if (deleteConfirmId) deleteBill(deleteConfirmId)
        }}
        title="删除确认"
        message="确定要删除这个账单吗？"
        variant="danger"
      />

      <AlertModal
        isOpen={alertState !== null}
        onClose={() => setAlertState(null)}
        title={alertState?.title || ''}
        message={alertState?.message || ''}
        variant="error"
      />
    </div>
  )
}
