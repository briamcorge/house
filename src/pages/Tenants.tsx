import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Tenant } from '../types'
import TenantModal from '../components/TenantModal'
import ConfirmModal from '../components/ConfirmModal'
import AlertModal from '../components/AlertModal'
import { Search, Edit2, Trash2, MoreVertical, User, Phone, Home, Calendar } from 'lucide-react'

export default function Tenants() {
  const { tenants, properties, rooms, updateTenant, deleteTenant } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | undefined>()
  const [tenantMenu, setTenantMenu] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended'>('all')
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null)
  const [deleteConfirmState, setDeleteConfirmState] = useState<{ tenantId: string; roomId: string } | null>(null)
  const navigate = useNavigate()

  // 判断租客是否为续约旧合同（endReason='renew' 或 被其他合同的 previousTenantId 指向）
  const isRenewedTenant = (t: { id: string; endReason?: 'renew' | 'checkout' }) =>
    t.endReason === 'renew' || tenants.some(x => x.previousTenantId === t.id)

  const filteredTenants = tenants.filter(t =>
    statusFilter === 'all' ? true
      : statusFilter === 'active' ? t.status === 'active'
        : t.status === 'ended' && !isRenewedTenant(t)
  )

  const getRoomInfo = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return { label: '未知房间', address: '' }
    const prop = properties.find(p => p.id === room.propertyId)
    return {
      label: `${room.label}室`,
      address: prop?.address || '',
    }
  }

  const handleSaveTenant = (data: Omit<Tenant, 'id' | 'createdAt'>) => {
    if (editingTenant) {
      const oldRoomId = editingTenant.roomId
      // 检查新房间是否已被占用
      if (oldRoomId !== data.roomId && data.roomId) {
        const { rooms, tenants: allTenants } = useStore.getState()
        const targetRoom = rooms.find(r => r.id === data.roomId)
        if (targetRoom?.status === 'occupied' || allTenants.some(t => t.roomId === data.roomId && t.status === 'active' && t.id !== editingTenant.id)) {
          setAlertState({ title: '提示', message: '该房间已有在租租客，不能将租客移入' })
          return
        }
      }
      updateTenant(editingTenant.id, data)
      if (oldRoomId !== data.roomId) {
        if (oldRoomId) useStore.getState().updateRoom(oldRoomId, { status: 'vacant' })
        if (data.roomId) useStore.getState().updateRoom(data.roomId, { status: 'occupied' })
      }
    }
    setEditingTenant(undefined)
    setShowModal(false)
  }

  const handleEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant)
    setShowModal(true)
    setTenantMenu(null)
  }

  const handleDeleteTenant = (id: string, roomId: string) => {
    setDeleteConfirmState({ tenantId: id, roomId })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-6 pb-3">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-4">租客管理</h1>
          <div className="flex gap-2">
            {(['all', 'active', 'ended'] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === f ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {f === 'all' ? '全部' : f === 'active' ? '在租' : '已退租'}（{f === 'all' ? tenants.length : f === 'active' ? tenants.filter(t => t.status === 'active').length : tenants.filter(t => t.status === 'ended' && !isRenewedTenant(t)).length}）
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="max-w-md mx-auto">
          <div className="space-y-4">
            {filteredTenants.map((tenant) => {
              const roomInfo = getRoomInfo(tenant.roomId)
              return (
                <div key={tenant.id} className="relative bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer"
                  onClick={() => {
                    const room = rooms.find(r => r.id === tenant.roomId)
                    if (room) navigate(`/properties/${room.propertyId}/rooms/${tenant.roomId}`, { state: { selectedTenantId: tenant.id } })
                  }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Phone className="w-3 h-3" />
                          {tenant.phone}
                        </div>
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setTenantMenu(tenantMenu === tenant.id ? null : tenant.id)
                        }}
                        className="p-2 hover:bg-gray-100 rounded-full"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-500" />
                      </button>
                      {tenantMenu === tenant.id && (
                        <>
                          <div className="fixed inset-0 z-[5]" onClick={() => setTenantMenu(null)} />
                          <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 min-w-[140px] z-[60]">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleEditTenant(tenant); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" />
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant.id, tenant.roomId); }}
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
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Home className="w-4 h-4 text-gray-400" />
                      <span>{roomInfo.address} - {roomInfo.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>{tenant.contractStart} 至 {tenant.contractEnd}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredTenants.length === 0 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-500">暂无租客</p>
                <p className="text-sm text-gray-400 mt-1">请先在房间详情中添加租客</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <TenantModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSaveTenant}
        properties={properties}
        rooms={rooms}
        editingTenant={editingTenant}
      />

      <ConfirmModal
        isOpen={deleteConfirmState !== null}
        onClose={() => setDeleteConfirmState(null)}
        onConfirm={() => {
          if (deleteConfirmState) {
            deleteTenant(deleteConfirmState.tenantId)
            useStore.getState().updateRoom(deleteConfirmState.roomId, { status: 'vacant' })
          }
        }}
        title="删除确认"
        message="确定要删除这个租客吗？"
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
