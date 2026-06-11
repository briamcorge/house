import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { RoomLabel } from '../types'
import RoomCard from '../components/RoomCard'
import RoomModal from '../components/RoomModal'
import TenantModal from '../components/TenantModal'
import BillSummaryModal from '../components/BillSummaryModal'
import LandlordContractModal from '../components/LandlordContractModal'
import { Plus, ChevronLeft, MoreVertical, UserPlus, FileText } from 'lucide-react'

export default function RoomList() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const navigate = useNavigate()
  const { properties, rooms, tenants, bills, landlordContracts, addRoom, addTenant, addBill, addLandlordContract, updateLandlordContract, deleteLandlordContract, terminateLandlordContract, deleteTenantAndBills, editTenantContract, renewTenantContract, createTenantContract } = useStore()

  const property = properties.find(p => p.id === propertyId)
  const propertyRooms = rooms.filter(r => r.propertyId === propertyId)
  const getTenantForRoom = (rid: string) => {
    const roomTenants = tenants.filter(t => t.roomId === rid)
    // 优先返回在租的，如果没有在租的返回最新的
    return roomTenants.find(t => t.status === 'active') || roomTenants[roomTenants.length - 1]
  }

  const [showModal, setShowModal] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [tenantRoomId, setTenantRoomId] = useState<string | null>(null)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [roomMenu, setRoomMenu] = useState<string | null>(null)
  const [summaryRoomId, setSummaryRoomId] = useState<string | null>(null)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: 'name' | 'phone'; value: string } | null>(null)
  const [editNameValue, setEditNameValue] = useState('')

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
              <h1 className="text-xl font-bold text-gray-900 truncate">{property.address}</h1>
              <p className="text-sm text-gray-500">{propertyRooms.length} 间房间</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingRoomId(null);
                setShowModal(true)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              添加房间
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto">
          {/* 业主合同记录 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-gray-800">
                <FileText className="w-4 h-4 inline mr-1" />
                业主合同记录
              </h2>
            </div>
            {(() => {
              const propContracts = landlordContracts.filter(c => c.propertyId === propertyId)
              if (propContracts.length === 0) {
                return <p className="text-sm text-gray-400">暂无业主合同</p>
              }
              return (
                <div className="space-y-2">
                  {propContracts.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {inlineEdit?.id === c.id && inlineEdit?.field === 'name' ? (
                            <input type="text" value={editNameValue} onChange={e => setEditNameValue(e.target.value)}
                              onBlur={() => { if (editNameValue.trim()) updateLandlordContract(c.id, { landlordName: editNameValue.trim() }); setInlineEdit(null) }}
                              onKeyDown={e => { if (e.key === 'Enter') { if (editNameValue.trim()) updateLandlordContract(c.id, { landlordName: editNameValue.trim() }); setInlineEdit(null) }}}
                              className="w-24 px-1 py-0.5 border border-blue-300 rounded text-sm" autoFocus />
                          ) : (
                            <span onClick={() => { setEditNameValue(c.landlordName || ''); setInlineEdit({ id: c.id, field: 'name', value: c.landlordName || '' }) }} className="cursor-pointer hover:text-blue-600" title="点击修改">{c.landlordName || '业主'}</span>
                          )} · ¥{c.monthlyRent}/月
                        </span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEditContractId(c.id)} className="text-xs text-blue-600 hover:underline">编辑</button>
                          {c.status === 'active' ? (
                            <button type="button" onClick={() => { if (confirm('确定退租？合同标记为已结束，账单保留。')) { terminateLandlordContract(c.id) } }} className="text-xs text-orange-600 hover:underline">退租</button>
                          ) : null}
                          <button type="button" onClick={() => { if (confirm('确定删除该合同及所有应付账单？')) { deleteLandlordContract(c.id, propertyId!) } }} className="text-xs text-red-600 hover:underline">删除</button>
                          <span className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">{c.status === 'active' ? '执行中' : '已结束'}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {inlineEdit?.id === c.id && inlineEdit?.field === 'phone' ? (
                          <input type="tel" value={editNameValue} onChange={e => setEditNameValue(e.target.value)}
                            onBlur={() => { updateLandlordContract(c.id, { landlordPhone: editNameValue || undefined }); setInlineEdit(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') { updateLandlordContract(c.id, { landlordPhone: editNameValue || undefined }); setInlineEdit(null) }}}
                            className="w-28 px-1 py-0.5 border border-blue-300 rounded text-xs mr-2" autoFocus />
                        ) : c.landlordPhone ? (
                          <span onClick={() => { setEditNameValue(c.landlordPhone || ''); setInlineEdit({ id: c.id, field: 'phone', value: c.landlordPhone || '' }) }} className="cursor-pointer hover:text-blue-600 mr-2" title="点击修改">{c.landlordPhone}</span>
                        ) : null}
                        {c.contractStart} ~ {c.contractEnd}
                      </p>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          <div className="space-y-2">
            {propertyRooms.map((room) => (
              <div key={room.id} className="relative group">
                <RoomCard
                  room={room}
                  tenant={getTenantForRoom(room.id)}
                  onClick={() => navigate(`/properties/${propertyId}/rooms/${room.id}`)}
                  billSummary={(() => {
                    const roomBills = bills.filter(b => b.roomId === room.id)
                    const total = roomBills.reduce((s, b) => s + b.amount, 0)
                    const paid = roomBills.reduce((s, b) => {
                      const p = b.paidAmount !== undefined ? b.paidAmount : (b.status === 'paid' ? b.amount : 0)
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
                      <div className="fixed inset-0 z-[5]" onClick={() => setRoomMenu(null)} />
                    <div className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[150px] z-10">
                      <button
                        type="button"
                        onClick={() => {
                          const existing = getTenantForRoom(room.id)
                          if (existing) {
                            setEditingTenantId(existing.id)
                            setTenantRoomId(room.id)
                          } else {
                            setTenantRoomId(room.id)
                            setEditingTenantId(null)
                          }
                          setRoomMenu(null)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        租客合同
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
        isOpen={editContractId !== null}
        onClose={() => setEditContractId(null)}
        onConfirm={(draftBills, rent, name, phone, cs, ce) => {
          draftBills.forEach((bill) => {
            addBill({ propertyId: propertyId!, amount: bill.amount, type: 'rent', status: 'pending', direction: 'payable', dueDate: bill.dueDate, description: bill.description })
          })
          addLandlordContract({ propertyId: propertyId!, landlordName: name, landlordPhone: phone, monthlyRent: rent || 0, paymentMethod: 'quarterly', contractStart: cs || '', contractEnd: ce || '', status: 'active' })
          setEditContractId(null)
        }}
        onUpdate={(draftBills, rent, name, phone, cs, ce) => {
          draftBills.forEach((bill) => {
            addBill({ propertyId: propertyId!, amount: bill.amount, type: 'rent', status: 'pending', direction: 'payable', dueDate: bill.dueDate, description: `[续约] ${bill.description}` })
          })
          addLandlordContract({ propertyId: propertyId!, landlordName: name, landlordPhone: phone, monthlyRent: rent || 0, paymentMethod: 'quarterly', contractStart: cs || '', contractEnd: ce || '', status: 'active' })
          setEditContractId(null)
        }}
        propertyAddress={property?.address || ''}
        existingRent={editContractId ? landlordContracts.find(c => c.id === editContractId)?.monthlyRent : undefined}
        existingPaymentMethod={editContractId ? landlordContracts.find(c => c.id === editContractId)?.paymentMethod : undefined}
        existingStart={editContractId ? landlordContracts.find(c => c.id === editContractId)?.contractStart : undefined}
        existingEnd={editContractId ? landlordContracts.find(c => c.id === editContractId)?.contractEnd : undefined}
        existingName={editContractId ? landlordContracts.find(c => c.id === editContractId)?.landlordName : undefined}
        existingPhone={editContractId ? landlordContracts.find(c => c.id === editContractId)?.landlordPhone : undefined}
      />
    </div>
  )
}
