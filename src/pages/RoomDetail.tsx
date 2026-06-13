import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Tenant, Bill } from '../types'
import TenantModal from '../components/TenantModal'
import BillModal from '../components/BillModal'
import CheckoutModal from '../components/CheckoutModal'
import { ChevronLeft, Plus, FileText, Droplets, Zap, Flame, Receipt } from 'lucide-react'
import { add30Days, formatDate } from '../utils/calculator'

export default function RoomDetail() {
  const { propertyId, roomId } = useParams<{ propertyId: string; roomId: string }>()
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, updateTenant, addBill, updateBill, createTenantContract, terminateTenant, editTenantContract, renewTenantContract, deleteTenantAndBills } = useStore()

  const property = properties.find(p => p.id === propertyId)
  const room = rooms.find(r => r.id === roomId)
  const roomTenants = tenants.filter(t => t.roomId === roomId).sort((a, b) => b.contractStart.localeCompare(a.contractStart))

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const selectedTenant = roomTenants.find(t => t.id === selectedTenantId) || roomTenants[0] || null
  const roomBills = bills
    .filter(b => b.roomId === roomId && b.direction === 'receivable' && b.tenantId === selectedTenant?.id)
    .sort((a, b) => {
      const order = { overdue: 0, pending: 1, paid: 2 }
      const cmp = (order[a.status] ?? 99) - (order[b.status] ?? 99)
      if (cmp !== 0) return cmp
      if (a.status === 'overdue') return b.dueDate.localeCompare(a.dueDate)
      if (a.status === 'paid') return (b.paidDate || '').localeCompare(a.paidDate || '')
      return a.dueDate.localeCompare(b.dueDate)
    })
  const [checkoutTenant, setCheckoutTenant] = useState<Tenant | null>(null)
  const [isRenewal, setIsRenewal] = useState(false)
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: string; value: string } | null>(null)
  const [inlineValue, setInlineValue] = useState('')

  const [showTenantModal, setShowTenantModal] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | undefined>()

  const [payConfirmBill, setPayConfirmBill] = useState<Bill | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')

  useEffect(() => {
    if (payConfirmBill) {
      setPayAmount(payConfirmBill.amount.toString())
      setPayDate(new Date().toISOString().slice(0, 10))
    }
  }, [payConfirmBill])

  const typeLabels: Record<string, string> = { rent: '房租', water: '水费', electric: '电费', gas: '燃气费', other: '其他' }
  const typeIcons: Record<string, typeof FileText> = {
    rent: FileText,
    water: Droplets,
    electric: Zap,
    gas: Flame,
    other: Receipt
  }
  const statusClasses: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-500 text-white', overdue: 'bg-red-100 text-red-700' }
  const statusLabels: Record<string, string> = { pending: '未收', paid: '✓ 已收', overdue: '已逾期' }

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
            <button type="button" onClick={() => navigate(`/properties/${propertyId}`)} className="p-1 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{property?.address} - {room.label} 室</h1>
              <p className="text-sm text-gray-500">{room.roomType}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto space-y-6">
          {/* 合同列表 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                <FileText className="w-5 h-5 inline mr-1" />
                合同记录
              </h2>
              {!roomTenants.some(t => t.status === 'active') && (
              <button
                type="button"
                onClick={() => { setEditingTenant(undefined); setShowTenantModal(true) }}
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />新签合同
              </button>
              )}
            </div>

            {roomTenants.length === 0 ? (
              <div className="text-center py-6 bg-white rounded-2xl shadow-sm border border-gray-100">
                <p className="text-gray-500 text-sm">暂无合同</p>
              </div>
            ) : (
              <div className="space-y-2">
                {roomTenants.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTenantId(t.id)}
                    className={`bg-white rounded-xl border p-3 cursor-pointer hover:shadow-sm transition-shadow ${
                      selectedTenant?.id === t.id ? 'border-blue-300 shadow-sm ring-1 ring-blue-200' : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {inlineEdit?.id === t.id && inlineEdit?.field === 'name' ? (
                          <input type="text" value={inlineValue} onChange={e => setInlineValue(e.target.value)}
                            onBlur={() => { if (inlineValue.trim()) updateTenant(t.id, { name: inlineValue.trim() }); setInlineEdit(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') { if (inlineValue.trim()) updateTenant(t.id, { name: inlineValue.trim() }); setInlineEdit(null) }}}
                            className="w-20 px-1 py-0.5 border border-blue-300 rounded text-sm font-medium" autoFocus />
                        ) : (
                          <span onClick={() => { setInlineValue(t.name); setInlineEdit({ id: t.id, field: 'name', value: t.name }) }} className="font-medium text-sm cursor-pointer hover:text-blue-600">{t.name}</span>
                        )}
                        <span className="text-xs text-gray-400">#{t.displayId}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.status === 'active' ? '在租' : '已退租'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setIsRenewal(false); setEditingTenant(t); setShowTenantModal(true) }} className="text-xs text-blue-600 hover:underline">编辑</button>
                        {t.status === 'active' ? (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setIsRenewal(true); setEditingTenant({ ...t, contractStart: formatDate(add30Days(new Date(t.contractEnd), 1)), contractEnd: formatDate(add30Days(new Date(t.contractEnd), 360)) }); setShowTenantModal(true) }} className="text-xs text-green-600 hover:underline">续约</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setCheckoutTenant(t) }} className="text-xs text-red-600 hover:underline">退租</button>
                          </>
                        ) : (
                          <button type="button" onClick={(e) => { e.stopPropagation(); if (confirm(`确定删除该合同及所有账单？`)) { deleteTenantAndBills(t.id, roomId!) } }} className="text-xs text-red-600 hover:underline">删除</button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t.phone && <span className="mr-3">{t.phone}</span>}
                      <span>{t.contractStart} ~ {t.contractEnd}</span>
                      <span className="ml-2 text-gray-400">¥{t.monthlyRent}/月</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 选中合同的租客账单 */}
          {selectedTenant && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  <FileText className="w-5 h-5 inline mr-1" />
                  {selectedTenant.name} 的账单
                </h2>
                <button type="button" onClick={() => setShowBillModal(true)} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  <Plus className="w-4 h-4" />添加
                </button>
              </div>

              <div className="space-y-2">
                {roomBills.length === 0 ? (
                  <div className="text-center py-8 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-gray-500">暂无账单</p>
                  </div>
                ) : (
                  roomBills.map((bill) => (
                    <div key={bill.id} className="relative bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded flex items-center justify-center ${bill.type === 'rent' ? 'bg-blue-100 text-blue-600' : bill.type === 'water' ? 'bg-cyan-100 text-cyan-600' : bill.type === 'electric' ? 'bg-yellow-100 text-yellow-600' : bill.type === 'gas' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>
                            {(() => { const Icon = typeIcons[bill.type] || Receipt; return <Icon className="w-3 h-3" /> })()}
                          </div>
                          <span className="font-medium text-sm text-gray-900">{typeLabels[bill.type]}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${statusClasses[bill.status]}`}>{statusLabels[bill.status]}</span>
                          {bill.status === 'overdue' && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[1]">
                              <span className="rotate-[-6deg] border-[3px] border-orange-500 text-orange-600 bg-orange-50/70 px-4 py-2 rounded-md text-base font-black opacity-75">
                                已逾期{Math.ceil((Date.now() - new Date(bill.dueDate).getTime()) / (1000*60*60*24))}天
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-gray-900">
                            {bill.paidAmount !== undefined && bill.paidAmount < bill.amount
                              ? `¥${bill.paidAmount.toFixed(2)}/¥${bill.amount.toFixed(2)}`
                              : `¥${bill.amount.toFixed(2)}`}
                          </span>
                          {bill.paidAmount !== undefined && bill.paidAmount < bill.amount && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">部分</span>
                          )}
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
                      <div className="text-xs text-gray-400 flex items-center gap-2">
                        {bill.description && <span>{bill.description}</span>}
                        {bill.description && (bill.dueDate || bill.paidDate) && <span>·</span>}
                        <span>应收日：{bill.dueDate}</span>
                        {bill.paidDate && <span>实收：{bill.paidDate}</span>}
                      </div>
                      {bill.status === 'paid' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[1]">
                          <span className="rotate-[-12deg] border-[3px] border-red-500 text-red-500 bg-red-50/70 px-4 py-2 rounded-md text-base font-black opacity-75">
                            ✓ 已收
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
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
      />

      <BillModal
        isOpen={showBillModal}
        onClose={() => setShowBillModal(false)}
        onSave={(data) => { addBill(data); setShowBillModal(false) }}
        properties={properties}
        rooms={rooms}
        tenants={tenants}
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
          // 创建退款账单（用负数表示退还）
          if (refunds.depositRefund > 0) {
            addBill({ roomId: roomId!, tenantId: checkoutTenant.id, amount: -refunds.depositRefund, type: 'other', status: 'paid', direction: 'receivable', paidDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), description: '退押金' })
          }
          if (refunds.rentRefund > 0) {
            addBill({ roomId: roomId!, tenantId: checkoutTenant.id, amount: -refunds.rentRefund, type: 'rent', status: 'paid', direction: 'receivable', paidDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), description: '退租金' })
          }
          if (refunds.otherRefund > 0 && refunds.otherName) {
            addBill({ roomId: roomId!, tenantId: checkoutTenant.id, amount: -refunds.otherRefund, type: 'other', status: 'paid', direction: 'receivable', paidDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), description: `退${refunds.otherName}` })
          }
          terminateTenant(checkoutTenant.id, roomId!)
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
                    onChange={(e) => setPayAmount(e.target.value)}
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
                    const paidAmt = payAmount ? parseFloat(payAmount) : undefined
                    const isPartial = paidAmt !== undefined && paidAmt < payConfirmBill.amount
                    if (isPartial) {
                      const remaining = payConfirmBill.amount - paidAmt
                      updateBill(payConfirmBill.id, { amount: remaining, paidDate: undefined })
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
                        description: payConfirmBill.description,
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

    </div>
  )
}
