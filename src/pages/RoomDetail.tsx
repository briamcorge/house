import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Tenant, Bill } from '../types'
import TenantModal from '../components/TenantModal'
import BillModal from '../components/BillModal'
import CheckoutModal from '../components/CheckoutModal'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import { ChevronLeft, ChevronDown, ChevronRight, User, Phone, Calendar, Plus, FileText, Droplets, Zap, Flame, Receipt, Wifi, Sparkles, MoreVertical, History, Banknote, Handshake, ArrowLeftRight } from 'lucide-react'
import HistoryTenantsModal from '../components/HistoryTenantsModal'
import { add30Days, formatDate } from '../utils/calculator'

export default function RoomDetail() {
  const { propertyId, roomId } = useParams<{ propertyId: string; roomId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const selectedTenantId = (location.state as { selectedTenantId?: string } | null)?.selectedTenantId
  const { properties, rooms, tenants, bills, updateTenant, addBill, updateBill, createTenantContract, terminateTenant, editTenantContract, renewTenantContract, deleteTenantAndBills, changeTenantRoom } = useStore()

  const property = properties.find(p => p.id === propertyId)
  const room = rooms.find(r => r.id === roomId)
  const roomTenants = tenants.filter(t => t.roomId === roomId).sort((a, b) => b.contractStart.localeCompare(a.contractStart))
  const activeTenant = roomTenants.find(t => t.status === 'active')
  const selectedTenant = selectedTenantId ? roomTenants.find(t => t.id === selectedTenantId) : undefined
  const [deleteConfirm, setDeleteConfirm] = useState<{ tenantId: string; isEnded: boolean } | null>(null)
  // 显示租客列表：在租租客 + 如果有选中的已退租租客也一起显示
  const displayTenants = selectedTenant && selectedTenant.status === 'ended'
    ? [...roomTenants.filter(t => t.status === 'active'), selectedTenant]
    : roomTenants.filter(t => t.status === 'active')
  const hasDisplayTenants = displayTenants.length > 0

  // 每个合同的账单折叠状态
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set())
  const toggleContract = (id: string) => {
    setExpandedContracts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 续约链：按 previousTenantId 串联，标记每份合同在续约链中的序号
  const contractGenerations = new Map<string, number>()
  roomTenants.forEach(t => {
    if (!t.previousTenantId) {
      contractGenerations.set(t.id, 1)
    }
  })
  // 第二遍：将有 previousTenantId 的设为上一份 + 1
  let changed = true
  while (changed) {
    changed = false
    roomTenants.forEach(t => {
      if (t.previousTenantId && contractGenerations.has(t.previousTenantId) && !contractGenerations.has(t.id)) {
        contractGenerations.set(t.id, (contractGenerations.get(t.previousTenantId) || 0) + 1)
        changed = true
      }
    })
  }
  // 无法追踪续约链的默认为第1代
  roomTenants.forEach(t => {
    if (!contractGenerations.has(t.id)) contractGenerations.set(t.id, 1)
  })

  const [checkoutTenant, setCheckoutTenant] = useState<Tenant | null>(null)
  const [isRenewal, setIsRenewal] = useState(false)
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: string; value: string } | null>(null)
  const [inlineValue, setInlineValue] = useState('')

  const [showTenantModal, setShowTenantModal] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | undefined>()
  const [billModalTenantId, setBillModalTenantId] = useState<string | null>(null)

  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)

  const [payConfirmBill, setPayConfirmBill] = useState<Bill | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null)
  const [showRoomChange, setShowRoomChange] = useState(false)
  const [roomChangeTenant, setRoomChangeTenant] = useState<Tenant | null>(null)
  const [roomChangeTarget, setRoomChangeTarget] = useState('')

  useEffect(() => {
    if (payConfirmBill) {
      setPayAmount(payConfirmBill.amount.toString())
      setPayDate(new Date().toISOString().slice(0, 10))
      // 从 description 提取原有效期
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

  // 部分收款时自动填充有效期
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

  const typeLabels: Record<string, string> = { rent: '房租', deposit: '押金', agency: '中介费', sublease: '转租费', hygiene: '卫管费', internet: '网费', utilities: '水电燃气费', other: '其他费用' }
  const typeIcons: Record<string, typeof FileText> = {
    rent: FileText,
    deposit: Banknote,
    agency: Handshake,
    sublease: ArrowLeftRight,
    hygiene: Sparkles,
    internet: Wifi,
    utilities: Zap,
    other: Receipt,
  }

  /** 获取某份合同的所有账单 */
  function getContractBills(tenant: Tenant): Bill[] {
    return bills
      .filter(b => b.roomId === roomId && b.direction === 'receivable' && b.tenantId === tenant.id)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 flex items-center justify-center">
        <p className="text-gray-500">房间不存在</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate(`/properties/${propertyId}`)} className="p-1 hover:bg-gray-100 rounded-lg shrink-0">
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{property?.address} - {room.label} 室</h1>
              <p className="text-sm text-gray-500">{room.roomType}</p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                className="p-1.5 hover:bg-gray-100 rounded-full"
              >
                <MoreVertical className="w-5 h-5 text-gray-500" />
              </button>
              {showHeaderMenu && (
                <>
                  <div className="fixed inset-0 z-[5]" onClick={() => setShowHeaderMenu(false)} />
                  <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[140px] z-[60]">
                    {roomTenants.some(t => t.status === 'ended') && (
                      <button
                        type="button"
                        onClick={() => { setShowHistoryModal(true); setShowHeaderMenu(false) }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <History className="w-4 h-4" />
                        历史租客
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto space-y-4">
          {/* 合同列表（含可折叠账单） */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                <FileText className="w-5 h-5 inline mr-1" />
                合同记录
              </h2>
              {!hasDisplayTenants && (
                <button
                  type="button"
                  onClick={() => { setEditingTenant(undefined); setShowTenantModal(true) }}
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />新签合同
                </button>
              )}
            </div>

            {!hasDisplayTenants ? (
              <div className="text-center py-10 bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 text-sm mb-3">此房间暂无租客</p>
                <button
                  type="button"
                  onClick={() => { setEditingTenant(undefined); setShowTenantModal(true) }}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100"
                >
                  <Plus className="w-4 h-4" />新签合同
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {displayTenants.map(t => {
                  const gen = contractGenerations.get(t.id) || 1
                  const tb = getContractBills(t)
                  const incomeBills = tb.filter(b => b.type !== 'deposit')
                  const paidCount = incomeBills.filter(b => b.status === 'paid').length
                  const paidTotal = incomeBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0)
                  const pendingCount = incomeBills.filter(b => b.status !== 'paid').length
                  const isExpanded = expandedContracts.has(t.id)

                  return (
                    <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      {/* 合同头部 — 点击展开/折叠账单 */}
                      <div
                        onClick={() => toggleContract(t.id)}
                        className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleContract(t.id) }} className="p-0.5 hover:bg-gray-200 rounded shrink-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                            </button>
                            {inlineEdit?.id === t.id && inlineEdit?.field === 'name' ? (
                              <input type="text" value={inlineValue} onChange={e => setInlineValue(e.target.value)}
                                onBlur={() => { if (inlineValue.trim()) updateTenant(t.id, { name: inlineValue.trim() }); setInlineEdit(null) }}
                                onKeyDown={e => { if (e.key === 'Enter') { if (inlineValue.trim()) updateTenant(t.id, { name: inlineValue.trim() }); setInlineEdit(null) }}}
                                className="w-20 px-1 py-0.5 border border-blue-300 rounded text-sm font-medium" autoFocus onClick={e => e.stopPropagation()} />
                            ) : (
                              <span onClick={(e) => { e.stopPropagation(); setInlineValue(t.name); setInlineEdit({ id: t.id, field: 'name', value: t.name }) }} className="font-medium text-sm cursor-pointer hover:text-blue-600 truncate">{t.name}</span>
                            )}
                            {gen > 1 && (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded shrink-0">续{gen - 1}</span>
                            )}
                            <span className="text-xs text-gray-400 shrink-0">#{t.displayId}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {t.status === 'active' ? '在租' : '已退租'}
                            </span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setIsRenewal(false); setEditingTenant(t); setShowTenantModal(true) }} className="text-xs text-blue-600 hover:underline whitespace-nowrap">编辑</button>
                            {t.status === 'active' ? (
                              <>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setRoomChangeTenant(t); setRoomChangeTarget(''); setShowRoomChange(true) }} className="text-xs text-amber-600 hover:underline whitespace-nowrap">换房</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setIsRenewal(true); setEditingTenant({ ...t, contractStart: formatDate(add30Days(new Date(t.contractEnd), 1)), contractEnd: formatDate(add30Days(new Date(t.contractEnd), 360)) }); setShowTenantModal(true) }} className="text-xs text-green-600 hover:underline whitespace-nowrap">续约</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setCheckoutTenant(t) }} className="text-xs text-red-600 hover:underline whitespace-nowrap">退租</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ tenantId: t.id, isEnded: false }) }} className="text-xs text-red-600 hover:underline whitespace-nowrap">删除</button>
                              </>
                            ) : (
                              <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ tenantId: t.id, isEnded: true }) }} className="text-xs text-red-600 hover:underline whitespace-nowrap">删除</button>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {t.phone && <span>{t.phone}</span>}
                          <span>{t.contractStart} ~ {t.contractEnd}</span>
                          <span className="text-gray-400">¥{t.monthlyRent}/月</span>
                        </div>
                        {/* 折叠时显示账单摘要 */}
                        {!isExpanded && (
                          <div className="flex gap-3 mt-1.5 text-xs">
                            {tb.length > 0 && <span className="text-green-600">已收 {paidCount} 笔 ¥{paidTotal.toFixed(0)}</span>}
                            {pendingCount > 0 && <span className="text-orange-600">待收 {pendingCount} 笔</span>}
                            {t.deposit ? <span className="text-blue-600">押金 ¥{t.deposit}</span> : null}
                          </div>
                        )}
                      </div>

                      {/* 展开的账单列表 */}
                      {isExpanded && (
                        <div className="border-t border-gray-50">
                          {/* 添加账单按钮 */}
                          <div className="px-3 py-1.5 flex items-center justify-between bg-gray-50/50">
                            <span className="text-xs text-gray-400">
                              共 {tb.length} 条 ·
                              <span className="text-green-600 ml-1">已收 {paidCount} 笔 ¥{paidTotal.toFixed(0)}</span>
                              {pendingCount > 0 && <span className="text-orange-600 ml-1">待收 {pendingCount} 笔</span>}
                              {t.deposit ? <span className="text-blue-600 ml-1">押金 ¥{t.deposit}</span> : null}
                            </span>
                            <button
                              type="button"
                              onClick={() => { setBillModalTenantId(t.id); setShowBillModal(true) }}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" />添加账单
                            </button>
                          </div>
                          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                            {tb.length === 0 ? (
                              <div className="p-4 text-center text-xs text-gray-400">暂无账单</div>
                            ) : (
                              tb.map((bill) => (
                                <div key={bill.id} className="p-3 hover:bg-gray-50">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${bill.type === 'rent' ? 'bg-blue-100 text-blue-600' : bill.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : bill.type === 'agency' ? 'bg-amber-100 text-amber-600' : bill.type === 'sublease' ? 'bg-violet-100 text-violet-600' : bill.type === 'hygiene' ? 'bg-pink-100 text-pink-600' : bill.type === 'internet' ? 'bg-purple-100 text-purple-600' : bill.type === 'utilities' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600'}`}>
                                        {(() => { const Icon = typeIcons[bill.type] || Receipt; return <Icon className="w-3 h-3" /> })()}
                                      </div>
                                      <span className="font-medium text-sm text-gray-900 truncate">{typeLabels[bill.type]}</span>
                                      {bill.status !== 'pending' && (
                                        <span className={`rounded-full text-[10px] px-1.5 py-0.5 font-medium shrink-0 ${
                                          bill.status === 'paid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                                        }`}>
                                          {bill.status === 'paid' ? '已收' : '逾期'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-base font-bold text-gray-900">¥{bill.amount.toFixed(0)}</span>
                                      {bill.status !== 'paid' && (
                                        <button
                                          type="button"
                                          onClick={() => setPayConfirmBill(bill)}
                                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-200"
                                        >
                                          收款
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                    {bill.description && <span className="truncate">{bill.description}</span>}
                                    {bill.description && <span>·</span>}
                                    <span className="shrink-0">
                                      {bill.status === 'paid' && bill.paidDate
                                        ? `实收日：${bill.paidDate}`
                                        : `应收日：${bill.dueDate}`}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <TenantModal
        isOpen={showTenantModal}
        onClose={() => setShowTenantModal(false)}
        onSave={(data) => {
          if (editingTenant) { updateTenant(editingTenant.id, data) }
          setEditingTenant(undefined)
          setShowTenantModal(false)
        }}
        onContractConfirm={(tenantData, draftBills) => {
          createTenantContract(tenantData, draftBills, roomId!)
          setShowTenantModal(false)
        }}
        onContractUpdate={(tenantId, tenantData, draftBills) => {
          if (isRenewal) {
            renewTenantContract(tenantId, tenantData, draftBills, roomId!)
          } else {
            editTenantContract(tenantId, tenantData, draftBills, roomId!)
          }
          setEditingTenant(undefined)
          setIsRenewal(false)
          setShowTenantModal(false)
        }}
        properties={properties}
        rooms={rooms}
        editingTenant={editingTenant}
        selectedRoomId={roomId}
        isRenewal={isRenewal}
      />

      <BillModal
        isOpen={showBillModal}
        onClose={() => { setShowBillModal(false); setBillModalTenantId(null) }}
        onSave={(data) => { addBill(data); setShowBillModal(false); setBillModalTenantId(null) }}
        properties={properties}
        rooms={rooms}
        tenants={roomTenants}
        defaultRoomId={roomId}
        defaultDirection="receivable"
      />
      <CheckoutModal
        isOpen={checkoutTenant !== null}
        onClose={() => setCheckoutTenant(null)}
        tenantName={checkoutTenant?.name || ''}
        deposit={checkoutTenant?.deposit}
        onConfirm={(refunds) => {
          if (!checkoutTenant) return
          const checkoutDate = refunds.checkoutDate
          if (refunds.depositRefund > 0) {
            addBill({ roomId: roomId!, tenantId: checkoutTenant.id, amount: -refunds.depositRefund, type: 'deposit', status: 'paid', direction: 'receivable', paidDate: checkoutDate, dueDate: checkoutDate, description: '退押金' })
          }
          if (refunds.penalty > 0) {
            addBill({ roomId: roomId!, tenantId: checkoutTenant.id, amount: refunds.penalty, type: 'other', status: 'paid', direction: 'receivable', paidDate: checkoutDate, dueDate: checkoutDate, description: '违约金' })
          }
          if (refunds.rentRefund > 0) {
            const desc = refunds.rentRefundStart && refunds.rentRefundEnd
              ? `退租金 ${refunds.rentRefundStart} ~ ${refunds.rentRefundEnd}`
              : '退租金'
            addBill({ roomId: roomId!, tenantId: checkoutTenant.id, amount: -refunds.rentRefund, type: 'rent', status: 'paid', direction: 'receivable', paidDate: checkoutDate, dueDate: checkoutDate, description: desc, periodStart: refunds.rentRefundStart, periodEnd: refunds.rentRefundEnd })
          }
          if (refunds.otherRefund > 0 && refunds.otherName) {
            addBill({ roomId: roomId!, tenantId: checkoutTenant.id, amount: -refunds.otherRefund, type: 'other', status: 'paid', direction: 'receivable', paidDate: checkoutDate, dueDate: checkoutDate, description: `退${refunds.otherName}` })
          }
          terminateTenant(checkoutTenant.id, roomId!, checkoutDate)
          setCheckoutTenant(null)
        }}
      />

      {/* 收款确认弹窗 */}
      {payConfirmBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]">
          <div className="bg-white rounded-t-3xl w-full max-w-md">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">收款确认</h2>
              <p className="text-xs text-gray-400 mt-1">可修改本次收款金额和日期</p>
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
                  <span className="text-sm text-gray-500">应收日</span>
                  <span className="text-sm font-medium">{payConfirmBill.dueDate}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">本次收款</label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => {
                      setPayAmount(e.target.value)
                      const v = parseFloat(e.target.value)
                      if (v > 0 && v < payConfirmBill.amount) autoFillPayPeriod(v)
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

              {/* 部分收款时显示有效期 */}
              {payAmount !== '' && parseFloat(payAmount) > 0 && parseFloat(payAmount) < payConfirmBill.amount && payPeriodStart && (
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
                留空本次收款金额则视为全额收款
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPayConfirmBill(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const paidAmt = payAmount !== '' ? parseFloat(payAmount) : undefined
                    if (paidAmt !== undefined && paidAmt > payConfirmBill.amount) {
                      setAlertState({ title: '提示', message: '收款金额不能大于账单金额' })
                      return
                    }
                    const isPartial = paidAmt !== undefined && paidAmt > 0 && paidAmt < payConfirmBill.amount
                    if (isPartial) {
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
                        status: 'paid' as const,
                        direction: payConfirmBill.direction,
                        dueDate: payConfirmBill.dueDate,
                        paidDate: payDate || new Date().toISOString().slice(0, 10),
                        description: newDesc,
                      })
                    } else {
                      updateBill(payConfirmBill.id, {
                        status: 'paid' as const,
                        paidDate: payDate || new Date().toISOString().slice(0, 10),
                      })
                    }
                    setPayConfirmBill(null)
                  }}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
                >
                  确认收款
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <HistoryTenantsModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        tenants={roomTenants.filter(t => t.status === 'ended')}
        roomLabel={`${room.label}室`}
        onViewTenant={(tenantId) => navigate(`/properties/${propertyId}/rooms/${roomId}`, { state: { selectedTenantId: tenantId } })}
      />

      {/* 换房弹窗 */}
      {showRoomChange && roomChangeTenant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[60]">
          <div className="bg-white rounded-t-3xl w-full max-w-md">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">换房</h2>
              <p className="text-xs text-gray-400 mt-1">
                {roomChangeTenant.name} — 当前：{rooms.find(r => r.id === roomChangeTenant.roomId)?.label || '?'}室
              </p>
            </div>
            <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
              {rooms
                .filter(r => r.propertyId === propertyId && r.id !== roomId)
                .map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoomChangeTarget(r.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      roomChangeTarget === r.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium text-sm">{r.label}室</span>
                    <span className={`ml-2 text-xs ${r.status === 'vacant' ? 'text-green-600' : 'text-orange-600'}`}>
                      {r.status === 'vacant' ? '空置' : '已入住'}
                    </span>
                    {r.roomType && <span className="ml-2 text-xs text-gray-400">{r.roomType}</span>}
                  </button>
                ))}
              {rooms.filter(r => r.propertyId === propertyId && r.id !== roomId).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">该房源没有其他房间可选</p>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setShowRoomChange(false); setRoomChangeTenant(null); setRoomChangeTarget('') }}
                className="py-2.5 px-3 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!roomChangeTarget}
                onClick={() => {
                  if (!roomChangeTenant || !roomChangeTarget) return
                  const oldRoom = rooms.find(r => r.id === roomChangeTenant.roomId)
                  const newRoom = rooms.find(r => r.id === roomChangeTarget)
                  changeTenantRoom(roomChangeTenant.id, roomChangeTarget)
                  setShowRoomChange(false)
                  setRoomChangeTenant(null)
                  setRoomChangeTarget('')
                  setAlertState({ title: '成功', message: `已将 ${roomChangeTenant.name} 从 ${oldRoom?.label||'?'}室 换到 ${newRoom?.label||'?'}室` })
                }}
                className={`py-2.5 px-3 rounded-xl font-medium text-sm transition-colors ${
                  roomChangeTarget
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                确认换房
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) deleteTenantAndBills(deleteConfirm.tenantId, roomId!) }}
        title="删除合同"
        message={deleteConfirm?.isEnded ? '确定删除该合同及所有账单？' : '确定删除该合同及所有关联账单？此操作不可撤销！'}
        confirmText="删除"
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
