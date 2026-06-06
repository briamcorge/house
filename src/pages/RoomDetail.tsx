import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Tenant } from '../types'
import TenantModal from '../components/TenantModal'
import BillModal from '../components/BillModal'
import CheckoutModal from '../components/CheckoutModal'
import { ChevronLeft, User, Phone, Calendar, Plus, FileText } from 'lucide-react'
import { add30Days, formatDate } from '../utils/calculator'

export default function RoomDetail() {
  const { propertyId, roomId } = useParams<{ propertyId: string; roomId: string }>()
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, updateTenant, addBill, createTenantContract, terminateTenant, editTenantContract, renewTenantContract, deleteTenantAndBills } = useStore()

  const property = properties.find(p => p.id === propertyId)
  const room = rooms.find(r => r.id === roomId)
  const roomTenants = tenants.filter(t => t.roomId === roomId).sort((a, b) => b.contractStart.localeCompare(a.contractStart))

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const selectedTenant = roomTenants.find(t => t.id === selectedTenantId) || roomTenants[0] || null
  const roomBills = bills.filter(b => b.roomId === roomId && b.direction === 'receivable' && b.tenantId === selectedTenant?.id)
  const [checkoutTenant, setCheckoutTenant] = useState<Tenant | null>(null)
  const [isRenewal, setIsRenewal] = useState(false)
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: string; value: string } | null>(null)
  const [inlineValue, setInlineValue] = useState('')

  const [showTenantModal, setShowTenantModal] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | undefined>()

  const typeLabels: Record<string, string> = { rent: '房租', water: '水费', electric: '电费', gas: '燃气费', other: '其他' }
  const statusClasses: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700' }
  const statusLabels: Record<string, string> = { pending: '未收', paid: '已收', overdue: '已逾期' }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 flex items-center justify-center">
        <p className="text-gray-500">房间不存在</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-6">
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

      <div className="px-4 pt-6">
        <div className="max-w-md mx-auto space-y-6">
          {/* 合同列表 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                <FileText className="w-5 h-5 inline mr-1" />
                合同记录
              </h2>
              <button
                type="button"
                onClick={() => { setEditingTenant(undefined); setShowTenantModal(true) }}
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />新签合同
              </button>
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
                    <div key={bill.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{typeLabels[bill.type]}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses[bill.status]}`}>{statusLabels[bill.status]}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-900">
                            {bill.paidAmount !== undefined && bill.paidAmount < bill.amount
                              ? `¥${bill.paidAmount.toFixed(2)}/¥${bill.amount.toFixed(2)}`
                              : `¥${bill.amount.toFixed(2)}`}
                          </span>
                          {bill.paidAmount !== undefined && bill.paidAmount < bill.amount && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">部分</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {bill.description && <div className="mb-1">{bill.description}</div>}
                        <span>应收日：{bill.dueDate}</span>
                        {bill.paidDate && <span className="ml-2">实收：{bill.paidDate}</span>}
                      </div>
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
    </div>
  )
}
