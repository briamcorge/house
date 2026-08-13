import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { RoomLabel } from '../types'
import { formatRoomLabel } from '../lib/utils'
import RoomCard from '../components/RoomCard'
import RoomModal from '../components/RoomModal'
import TenantModal from '../components/TenantModal'
import BillSummaryModal from '../components/BillSummaryModal'
import HistoryTenantsModal from '../components/HistoryTenantsModal'
import LandlordContractModal from '../components/LandlordContractModal'
import LandlordCheckoutModal from '../components/LandlordCheckoutModal'
import LandlordContractDetailModal from '../components/LandlordContractDetailModal'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import { Plus, ChevronLeft, MoreVertical, UserPlus, Trash2, History } from 'lucide-react'

export default function RoomList() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts, addRoom, addTenant, addBill, deleteBill, addLandlordContract, updateLandlordContract, deleteLandlordContract, terminateLandlordContract, restoreLandlordContract, editTenantContract, createTenantContract, deleteRoom } = useStore()

  const property = properties.find(p => p.id === propertyId)
  const propertyRooms = rooms.filter(r => r.propertyId === propertyId)
  // 判断业主合同是否为续约旧合同（endReason='renew' 或 被其他合同的 previousTenantId 指向的旧合同已被替代）
  const isRenewedContract = (c: { id: string; endReason?: 'renew' | 'checkout' }) =>
    c.endReason === 'renew' || landlordContracts.some(x => x.previousContractId === c.id)
  const getTenantForRoom = (rid: string) => {
    const roomTenants = tenants.filter(t => t.roomId === rid)
    // 只返回在租的租客，空房间不展示旧租客信息（已退租的可在历史租客中查看）
    return roomTenants.find(t => t.status === 'active')
  }

  const [showModal, setShowModal] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [tenantRoomId, setTenantRoomId] = useState<string | null>(null)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [roomMenu, setRoomMenu] = useState<string | null>(null)
  const [summaryRoomId, setSummaryRoomId] = useState<string | null>(null)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [renewContractId, setRenewContractId] = useState<string | null>(null)
  const [historyRoomId, setHistoryRoomId] = useState<string | null>(null)
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: 'name' | 'phone'; value: string } | null>(null)
  const [editInlineValue, setEditInlineValue] = useState('')
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null)
  const [contractConfirm, setContractConfirm] = useState<{ id: string; action: 'terminate' | 'delete' } | null>(null)
  const [landlordCheckout, setLandlordCheckout] = useState<{ id: string; name: string; deposit: number } | null>(null)
  const [detailContractId, setDetailContractId] = useState<string | null>(null)
  const [roomDeleteConfirm, setRoomDeleteConfirm] = useState<{ roomId: string; label: string } | null>(null)
  const [menuOpenContractId, setMenuOpenContractId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'rooms' | 'contracts'>('rooms')

  if (!property) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 flex items-center justify-center">
        <p className="text-gray-500">房源不存在</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-2">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/properties')}
              className="p-1 hover:bg-gray-100 rounded-lg shrink-0"
            >
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{property.address}</h1>
              <p className="text-sm text-gray-500">{propertyRooms.length} 间房间</p>
            </div>
            {activeTab === 'rooms' && (
              <button
                type="button"
                onClick={() => {
                  setEditingRoomId(null);
                  setShowModal(true)
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 transition-colors shrink-0"
              >
                 <Plus className="w-3.5 h-3.5" />
                添加
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto">
          {/* Tab 切换 */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-3">
            <button
              type="button"
              onClick={() => setActiveTab('rooms')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'rooms' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              房间列表（{propertyRooms.length}）
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contracts')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'contracts' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
            >
              业主
            </button>
          </div>

          {/* 业主合同 Tab */}
          {activeTab === 'contracts' && (
          <div className="mb-4">
            {(() => {
              const propContracts = landlordContracts.filter(c => c.propertyId === propertyId)
              if (propContracts.length === 0) {
                return <p className="text-sm text-gray-400">暂无业主合同</p>
              }
              return (
                <div className="space-y-2">
                  {propContracts.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setDetailContractId(c.id)}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {inlineEdit?.id === c.id && inlineEdit?.field === 'name' ? (
                            <input type="text" value={editInlineValue} onChange={e => setEditInlineValue(e.target.value)}
                              onBlur={() => { if (editInlineValue.trim()) updateLandlordContract(c.id, { landlordName: editInlineValue.trim() }); setInlineEdit(null) }}
                              onKeyDown={e => { if (e.key === 'Enter') { if (editInlineValue.trim()) updateLandlordContract(c.id, { landlordName: editInlineValue.trim() }); setInlineEdit(null) }}}
                              className="w-24 px-1 py-0.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                          ) : (
                            <span onClick={e => { e.stopPropagation(); setEditInlineValue(c.landlordName || ''); setInlineEdit({ id: c.id, field: 'name', value: c.landlordName || '' }) }} className="cursor-pointer hover:text-blue-600" title="点击修改">{c.landlordName || '业主'}</span>
                          )} · ¥{c.monthlyRent}/月
                        </span>
                        <div className="flex items-center gap-1 relative">
                          <button type="button" onClick={e => { e.stopPropagation(); setMenuOpenContractId(menuOpenContractId === c.id ? null : c.id) }} className="text-xs px-1.5 py-1 rounded-lg text-gray-500 hover:bg-gray-100 whitespace-nowrap">操作 ▾</button>
                          {menuOpenContractId === c.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setMenuOpenContractId(null); }} />
                              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 min-w-[88px]" onClick={e => e.stopPropagation()}>
                                <button type="button" onClick={e => { e.stopPropagation(); setMenuOpenContractId(null); setEditContractId(c.id) }} className="block w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">编辑</button>
                                {c.status === 'active' && (
                                  <button type="button" onClick={e => { e.stopPropagation(); setMenuOpenContractId(null); setRenewContractId(c.id) }} className="block w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-gray-50">续约</button>
                                )}
                                {c.status === 'active' ? (
                                  <button type="button" onClick={e => { e.stopPropagation(); setMenuOpenContractId(null); if (c.deposit) setLandlordCheckout({ id: c.id, name: c.landlordName || '业主', deposit: c.deposit }); else setContractConfirm({ id: c.id, action: 'terminate' }) }} className="block w-full text-left px-3 py-1.5 text-xs text-orange-600 hover:bg-gray-50">退租</button>
                                ) : !isRenewedContract(c) ? (
                                  <button type="button" onClick={e => { e.stopPropagation(); setMenuOpenContractId(null); restoreLandlordContract(c.id) }} className="block w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-gray-50">恢复</button>
                                ) : null}
                                <div className="border-t border-gray-50 my-1" />
                                <button type="button" onClick={e => { e.stopPropagation(); setMenuOpenContractId(null); setContractConfirm({ id: c.id, action: 'delete' }) }} className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-gray-50">删除</button>
                              </div>
                            </>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${c.status === 'active' ? 'text-green-700 bg-green-100' : isRenewedContract(c) ? 'text-indigo-600 bg-indigo-100' : 'text-gray-500 bg-gray-100'}`}>{c.status === 'active' ? '执行中' : isRenewedContract(c) ? '已续约' : '已结束'}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {inlineEdit?.id === c.id && inlineEdit?.field === 'phone' ? (
                          <input type="tel" value={editInlineValue} onChange={e => setEditInlineValue(e.target.value)}
                            onBlur={() => { updateLandlordContract(c.id, { landlordPhone: editInlineValue || undefined }); setInlineEdit(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') { updateLandlordContract(c.id, { landlordPhone: editInlineValue || undefined }); setInlineEdit(null) }}}
                            className="w-28 px-1 py-0.5 border border-blue-300 rounded text-xs mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                        ) : c.landlordPhone ? (
                          <span onClick={e => { e.stopPropagation(); setEditInlineValue(c.landlordPhone || ''); setInlineEdit({ id: c.id, field: 'phone', value: c.landlordPhone || '' }) }} className="cursor-pointer hover:text-blue-600 mr-2" title="点击修改">{c.landlordPhone}</span>
                        ) : null}
                        {c.contractStart} ~ {c.contractEnd}
                      </p>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
          )}

          {/* 房间 Tab */}
          {activeTab === 'rooms' && (
          <div className="space-y-2">
            {propertyRooms.map((room) => (
              <div key={room.id} className="relative group">
                <RoomCard
                  room={room}
                  tenant={getTenantForRoom(room.id)}
                  onClick={() => navigate(`/properties/${propertyId}/rooms/${room.id}`)}
                  billSummary={(() => {
                    const activeTenant = getTenantForRoom(room.id)
                    if (!activeTenant) return undefined
                    const roomBills = bills.filter(b => b.roomId === room.id && b.tenantId === activeTenant.id && b.status !== 'cancelled' && b.type !== 'deposit')
                    const total = roomBills.reduce((s, b) => s + b.amount, 0)
                    const paid = roomBills.reduce((s, b) => {
                      const p = (b.paidAmount !== undefined && b.paidAmount > 0) ? b.paidAmount : (b.status === 'paid' ? b.amount : 0)
                      return s + p
                    }, 0)
                    return total > 0 ? { paid, total } : undefined
                  })()}
                  onClickBill={() => setSummaryRoomId(room.id)}
                />
                <div className="absolute top-2 right-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setRoomMenu(roomMenu === room.id ? null : room.id) }}
                    className="p-1.5 hover:bg-white/80 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4 text-gray-400" />
                  </button>
                  {roomMenu === room.id && (
                    <>
                      <div className="fixed inset-0 z-[5]" onClick={e => { e.stopPropagation(); setRoomMenu(null); }} />
                    <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[150px] z-[60]">
                      {!getTenantForRoom(room.id) && (
                        <button
                          type="button"
                          onClick={() => {
                            setTenantRoomId(room.id)
                            setEditingTenantId(null)
                            setRoomMenu(null)
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                        >
                          <UserPlus className="w-4 h-4" />
                          新签合同
                        </button>
                      )}
                      {tenants.filter(t => t.roomId === room.id && t.status === 'ended').length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setHistoryRoomId(room.id); setRoomMenu(null) }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <History className="w-4 h-4" />
                          历史租客
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRoomMenu(null)
                          const roomTenants = tenants.filter(t => t.roomId === room.id)
                          if (roomTenants.length > 0) {
                            setAlertState({ title: '提示', message: '该房间存在租客记录，请先删除租客后再删除房间' })
                            return
                          }
                          setRoomDeleteConfirm({ roomId: room.id, label: room.label })
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        删除房间
                      </button>
                    </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {propertyRooms.length === 0 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-500">暂无房间</p>
                <p className="text-sm text-gray-400 mt-1">点击下方按钮添加房间</p>
              </div>
            )}
          </div>
          )}

        </div>
      </div>

      <RoomModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={(data) => {
          addRoom(data)
          setShowModal(false)
        }}
        propertyId={propertyId!}
        editingRoom={editingRoomId ? rooms.find(r => r.id === editingRoomId) : undefined}
        usedLabels={propertyRooms.map(r => r.label) as RoomLabel[]}
      />
      <TenantModal
        isOpen={tenantRoomId !== null}
        onClose={() => { setTenantRoomId(null); setEditingTenantId(null) }}
        onSave={(data) => {
          addTenant(data)
          useStore.getState().updateRoom(tenantRoomId!, { status: 'occupied' })
          setTenantRoomId(null)
        }}
        onContractConfirm={(tenantData, draftBills) => {
          createTenantContract(tenantData, draftBills, tenantRoomId!)
          setTenantRoomId(null)
        }}
        onContractUpdate={(tenantId, data, draftBills) => {
          editTenantContract(tenantId, data, draftBills, tenantRoomId!)
          setTenantRoomId(null)
          setEditingTenantId(null)
        }}
        properties={properties}
        rooms={rooms}
        editingTenant={editingTenantId ? tenants.find(t => t.id === editingTenantId) : undefined}
        selectedRoomId={tenantRoomId || undefined}
      />
      <BillSummaryModal
        isOpen={summaryRoomId !== null}
        onClose={() => setSummaryRoomId(null)}
        roomId={summaryRoomId || undefined}
      />
      <LandlordContractModal
        isOpen={editContractId !== null || renewContractId !== null}
        onClose={() => { setEditContractId(null); setRenewContractId(null) }}
        onConfirm={(draftBills, rent, name, phone, cs, ce, deposit, vacancyAllowance) => {
          const contractId = addLandlordContract({ propertyId: propertyId!, landlordName: name, landlordPhone: phone, monthlyRent: rent || 0, paymentMethod: 'quarterly', contractStart: cs || '', contractEnd: ce || '', status: 'active', deposit: deposit, vacancyAllowance })
          draftBills.forEach((bill) => {
            addBill({ propertyId: propertyId!, landlordContractId: contractId, amount: bill.amount, type: bill.type === 'deposit' ? 'deposit' : 'rent', status: 'pending', direction: 'payable', dueDate: bill.dueDate, description: bill.description, periodStart: bill.periodStart, periodEnd: bill.periodEnd })
          })
          setEditContractId(null); setRenewContractId(null)
        }}
        onUpdate={(draftBills, rent, name, phone, cs, ce, deposit, vacancyAllowance) => {
          const cid = renewContractId
          if (!cid) return
          // 续约：旧合同被替代（不是退租），新建合同并绑定
          const oldContract = landlordContracts.find(c => c.id === cid)
          if (oldContract) {
            updateLandlordContract(oldContract.id, { status: 'ended', endReason: 'renew' })
          }
          const contractId = addLandlordContract({ propertyId: propertyId!, landlordName: name, landlordPhone: phone, monthlyRent: rent || 0, paymentMethod: 'quarterly', contractStart: cs || '', contractEnd: ce || '', status: 'active', deposit: deposit, previousContractId: oldContract?.id, vacancyAllowance })
          draftBills.forEach((bill) => {
            addBill({ propertyId: propertyId!, landlordContractId: contractId, amount: bill.amount, type: bill.type === 'deposit' ? 'deposit' : 'rent', status: 'pending', direction: 'payable', dueDate: bill.dueDate, description: `[续约] ${bill.description}`, periodStart: bill.periodStart, periodEnd: bill.periodEnd })
          })
          setEditContractId(null); setRenewContractId(null)
        }}
        onEditContract={(draftBills, rent, name, phone, cs, ce, deposit, vacancyAllowance) => {
          const cid = editContractId
          if (!cid) return
          // 编辑合同：原地更新合同字段（不结束旧合同、不新建合同）
          updateLandlordContract(cid, {
            monthlyRent: rent || 0,
            landlordName: name,
            landlordPhone: phone,
            contractStart: cs,
            contractEnd: ce,
            deposit,
            vacancyAllowance,
          })
          // 老账单全部删除（含已收/已付，由用户手动重新认账）
          bills.filter(b => b.landlordContractId === cid).forEach(b => deleteBill(b.id))
          // 生成新账单（含押金全额/调整）
          draftBills.forEach((bill) => {
            addBill({ propertyId: propertyId!, landlordContractId: cid, amount: bill.amount, type: bill.type === 'deposit' ? 'deposit' : 'rent', status: 'pending', direction: 'payable', dueDate: bill.dueDate, description: bill.description, periodStart: bill.periodStart, periodEnd: bill.periodEnd })
          })
          setEditContractId(null); setRenewContractId(null)
        }}
        isEditMode={editContractId !== null}
        isRenewal={renewContractId !== null}
        propertyAddress={property?.address || ''}
        existingRent={editContractId || renewContractId ? landlordContracts.find(c => c.id === (editContractId || renewContractId))?.monthlyRent : undefined}
        existingPaymentMethod={editContractId || renewContractId ? landlordContracts.find(c => c.id === (editContractId || renewContractId))?.paymentMethod : undefined}
        existingStart={editContractId || renewContractId ? landlordContracts.find(c => c.id === (editContractId || renewContractId))?.contractStart : undefined}
        existingEnd={editContractId || renewContractId ? landlordContracts.find(c => c.id === (editContractId || renewContractId))?.contractEnd : undefined}
        existingDeposit={editContractId || renewContractId ? landlordContracts.find(c => c.id === (editContractId || renewContractId))?.deposit : undefined}
        existingVacancyAllowance={editContractId || renewContractId ? landlordContracts.find(c => c.id === (editContractId || renewContractId))?.vacancyAllowance : undefined}
        existingName={editContractId || renewContractId ? landlordContracts.find(c => c.id === (editContractId || renewContractId))?.landlordName : undefined}
        existingPhone={editContractId ? landlordContracts.find(c => c.id === editContractId)?.landlordPhone : undefined}
      />
      <HistoryTenantsModal
        isOpen={historyRoomId !== null}
        onClose={() => setHistoryRoomId(null)}
        tenants={tenants.filter(t => t.roomId === historyRoomId && t.status === 'ended')}
        roomLabel={formatRoomLabel(rooms.find(r => r.id === historyRoomId)?.label)}
      />

      <LandlordCheckoutModal
        isOpen={landlordCheckout !== null}
        onClose={() => setLandlordCheckout(null)}
        landlordName={landlordCheckout?.name || ''}
        deposit={landlordCheckout?.deposit}
        onConfirm={(refunds) => {
          if (!landlordCheckout) return
          const dt = refunds.checkoutDate
          const cid = landlordCheckout.id
          if (refunds.depositRefund > 0) {
            addBill({ propertyId: propertyId!, landlordContractId: cid, amount: -refunds.depositRefund, type: 'deposit', status: 'refunded', direction: 'payable', paidDate: dt, dueDate: dt, description: '退押金' })
          }
          if (refunds.penalty > 0) {
            addBill({ propertyId: propertyId!, amount: refunds.penalty, type: 'other', status: 'paid', direction: 'receivable', paidDate: dt, dueDate: dt, description: '业主违约金' })
          }
          if (refunds.rentRefund > 0) {
            const desc = refunds.rentRefundStart && refunds.rentRefundEnd
              ? `退租金 ${refunds.rentRefundStart} ~ ${refunds.rentRefundEnd}`
              : '退租金'
            addBill({ propertyId: propertyId!, landlordContractId: cid, amount: -refunds.rentRefund, type: 'rent', status: 'refunded', direction: 'payable', paidDate: dt, dueDate: dt, description: desc, periodStart: refunds.rentRefundStart, periodEnd: refunds.rentRefundEnd })
          }
          terminateLandlordContract(landlordCheckout.id)
          setLandlordCheckout(null)
        }}
      />

      <LandlordContractDetailModal
        isOpen={detailContractId !== null}
        onClose={() => setDetailContractId(null)}
        contract={landlordContracts.find(c => c.id === detailContractId)!}
        bills={bills}
        onEdit={() => { if (detailContractId) setEditContractId(detailContractId) }}
        onCheckout={() => {
          const c = landlordContracts.find(c => c.id === detailContractId)
          if (!c) return
          if (c.deposit) {
            setLandlordCheckout({ id: c.id, name: c.landlordName || '业主', deposit: c.deposit })
          } else {
            setContractConfirm({ id: c.id, action: 'terminate' })
          }
        }}
        onDelete={() => { if (detailContractId) setContractConfirm({ id: detailContractId, action: 'delete' }) }}
      />

      <ConfirmModal
        isOpen={contractConfirm !== null}
        onClose={() => setContractConfirm(null)}
        onConfirm={() => {
          if (contractConfirm?.action === 'terminate') {
            terminateLandlordContract(contractConfirm.id)
          } else if (contractConfirm?.action === 'delete') {
            deleteLandlordContract(contractConfirm.id, propertyId!)
          }
        }}
        title={contractConfirm?.action === 'terminate' ? '退租确认' : '删除确认'}
        message={contractConfirm?.action === 'terminate' ? '确定退租？合同标记为已结束，未付账单将一并删除（恢复合同可找回）。' : '确定删除该合同及所有应付账单？'}
        variant="danger"
      />

      <ConfirmModal
        isOpen={roomDeleteConfirm !== null}
        onClose={() => setRoomDeleteConfirm(null)}
        onConfirm={() => {
          if (roomDeleteConfirm) deleteRoom(roomDeleteConfirm.roomId)
        }}
        title="删除确认"
        message={roomDeleteConfirm ? `确定删除${formatRoomLabel(roomDeleteConfirm.label)}？` : ''}
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
