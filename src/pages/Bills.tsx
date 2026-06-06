import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Bill, BillDirection } from '../types'
import BillModal from '../components/BillModal'
import { Plus, Search, Edit2, Trash2, MoreVertical, Home, User, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7) // "2026-06"
}

function getMonthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y}年${parseInt(m)}月`
}

export default function Bills() {
  const { bills, properties, rooms, tenants, addBill, updateBill, deleteBill } = useStore()
  const [direction, setDirection] = useState<BillDirection | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<Bill['status'] | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | undefined>()
  const [billMenu, setBillMenu] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState('')

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

  const typeLabels: Record<string, string> = {
    rent: '房租',
    water: '水费',
    electric: '电费',
    gas: '燃气费',
    other: '其他'
  }

  const statusClasses: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700'
  }

  const getStatusLabel = (status: Bill['status'], dir: BillDirection) => {
    if (status === 'paid') return dir === 'receivable' ? '已收' : '已付'
    if (status === 'pending') return dir === 'receivable' ? '未收' : '未付'
    return '已逾期'
  }

  const directionLabels: Record<string, string> = {
    receivable: '应收（租客）',
    payable: '应付（房东）',
  }

  const directionClasses: Record<string, string> = {
    receivable: 'bg-blue-50 text-blue-700',
    payable: 'bg-orange-50 text-orange-700',
  }

  // Filter and group bills
  const allMonthKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const b of bills) keys.add(getMonthKey(b.dueDate))
    const sorted = Array.from(keys).sort((a, b) => b.localeCompare(a))
    if (!currentMonth && sorted.length > 0) {
      // Initialize to latest month
      setTimeout(() => setCurrentMonth(sorted[0]), 0)
    }
    return sorted
  }, [bills, currentMonth])

  // Bills for the currently selected month
  const currentMonthBills = useMemo(() => {
    return bills.filter(b => {
      const mk = getMonthKey(b.dueDate)
      if (mk !== currentMonth) return false
      const matchesDirection = direction === 'all' || b.direction === direction
      const matchesStatus = filterStatus === 'all' || b.status === filterStatus
      return matchesDirection && matchesStatus
    })
  }, [bills, currentMonth, direction, filterStatus])

  const monthIndex = allMonthKeys.indexOf(currentMonth)
  const hasPrev = monthIndex < allMonthKeys.length - 1
  const hasNext = monthIndex > 0

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
    if (confirm('确定要删除这个账单吗？')) {
      deleteBill(id)
      setBillMenu(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-6">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-4">账单管理</h1>
          
          {/* 方向筛选 */}
          <div className="flex gap-2 mb-3">
            {([
              { key: 'all', label: '全部' },
              { key: 'receivable', label: '应收' },
              { key: 'payable', label: '应付' },
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

          {/* 状态筛选 */}
          <div className="flex gap-2">
            {([
              { key: 'all', label: '全部' },
              { key: 'pending', label: direction === 'payable' ? '未付' : '未收' },
              { key: 'paid', label: direction === 'payable' ? '已付' : '已收' },
              { key: 'overdue', label: '已逾期' }
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
        </div>
      </div>

      <div className="px-4 pt-6">
        <div className="max-w-md mx-auto">
          {currentMonth ? (
            <div className="mb-6">
              {/* 月份导航 */}
              <div className="flex items-center justify-between mb-4 bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                <button
                  type="button"
                  onClick={() => hasPrev && setCurrentMonth(allMonthKeys[monthIndex + 1])}
                  className={`p-2 rounded-lg ${hasPrev ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-default'}`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold text-gray-800">{getMonthLabel(currentMonth)}</h2>
                <button
                  type="button"
                  onClick={() => hasNext && setCurrentMonth(allMonthKeys[monthIndex - 1])}
                  className={`p-2 rounded-lg ${hasNext ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-default'}`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* 月份汇总 */}
              {(() => {
                const monthTotal = currentMonthBills.reduce((s, b) => {
                  const paid = b.paidAmount !== undefined ? b.paidAmount : (b.status === 'paid' ? b.amount : 0)
                  return s + paid
                }, 0)
                const monthSum = currentMonthBills.reduce((s, b) => s + b.amount, 0)
                return currentMonthBills.length > 0 ? (
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-sm text-gray-500">{currentMonthBills.length} 笔</span>
                    <span className="text-sm text-gray-500">已收/已付 ¥{monthTotal.toFixed(0)} / 总计 ¥{monthSum.toFixed(0)}</span>
                  </div>
                ) : null
              })()}

              {/* 账单列表 */}
              <div className="space-y-3">
                {currentMonthBills.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-gray-500">该月暂无账单</p>
                    <p className="text-sm text-gray-400 mt-1">试试切换月份或调整筛选条件</p>
                  </div>
                ) : (
                  currentMonthBills.map((bill) => {
                    const tenantName = getTenantName(bill.tenantId)
                    return (
                        <div key={bill.id} className="relative bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900">{typeLabels[bill.type]}</h3>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses[bill.status]}`}>
                                  {getStatusLabel(bill.status, bill.direction)}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${directionClasses[bill.direction]}`}>
                                  {directionLabels[bill.direction]}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-2xl font-bold text-blue-900">
                                  {bill.paidAmount !== undefined && bill.paidAmount < bill.amount
                                    ? `¥${bill.paidAmount.toFixed(2)}/¥${bill.amount.toFixed(2)}`
                                    : `¥${bill.amount.toFixed(2)}`}
                                </p>
                                {bill.paidAmount !== undefined && bill.paidAmount < bill.amount && (
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">部分</span>
                                )}
                              </div>
                            </div>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setBillMenu(billMenu === bill.id ? null : bill.id)
                                }}
                                className="p-2 hover:bg-gray-100 rounded-full"
                              >
                                <MoreVertical className="w-5 h-5 text-gray-500" />
                              </button>
                              {billMenu === bill.id && (
                                <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[140px] z-10">
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
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            {bill.direction === 'payable' && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Home className="w-4 h-4 text-gray-400" />
                                <span>{getPropertyAddress(bill.propertyId)}</span>
                              </div>
                            )}
                            {bill.direction === 'receivable' && bill.roomId && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Home className="w-4 h-4 text-gray-400" />
                                <span>{getRoomInfo(bill.roomId)}</span>
                              </div>
                            )}
                            {tenantName && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <User className="w-4 h-4 text-gray-400" />
                                <span>{tenantName}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span>{bill.direction === 'payable' ? '应付日' : '应收日'}：{bill.dueDate}</span>
                              {bill.paidDate && bill.status === 'paid' && (
                                <span className="text-green-600 ml-2">实付：{bill.paidDate}</span>
                              )}
                            </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-500">暂无账单</p>
              <p className="text-sm text-gray-400 mt-1">点击下方按钮添加账单</p>
            </div>
          )}

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
    </div>
  )
}
