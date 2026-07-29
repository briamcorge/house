import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Property, Room, Tenant, Bill, LandlordContract, TrashItem, TrashType, ProfitRecord, AuditLogEntry } from '../types'
import { DraftBill } from '../utils/calculator'
import { triggerCloudSave } from '../lib/cloud-sync-context'

interface AppStore {
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]
  trash: TrashItem[]
  auditLogs: AuditLogEntry[]

  addProperty: (property: Omit<Property, 'id' | 'createdAt'>) => void
  updateProperty: (id: string, property: Partial<Property>) => void
  deleteProperty: (id: string, keepPaidBills?: boolean) => void

  addRoom: (room: Omit<Room, 'id' | 'createdAt'>) => void
  updateRoom: (id: string, room: Partial<Room>) => void
  deleteRoom: (id: string) => void

  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>) => void
  updateTenant: (id: string, tenant: Partial<Tenant>) => void
  changeTenantRoom: (tenantId: string, newRoomId: string) => void
  deleteTenant: (id: string) => void
  terminateTenant: (id: string, roomId: string, checkoutDate: string) => void
  extendContract: (id: string, newEndDate: string) => void

  addBill: (bill: Omit<Bill, 'id' | 'createdAt'>) => void
  updateBill: (id: string, bill: Partial<Bill>) => void
  deleteBill: (id: string) => void

  addLandlordContract: (contract: Omit<LandlordContract, 'id' | 'createdAt' | 'displayId'>) => void
  updateLandlordContract: (id: string, data: Partial<LandlordContract>) => void
  deleteLandlordContract: (id: string, propertyId: string) => void
  terminateLandlordContract: (id: string) => void
  deleteTenantAndBills: (id: string, roomId: string) => void
  createTenantContract: (tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[], roomId: string) => void
  editTenantContract: (tenantId: string, tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[], roomId: string) => void
  renewTenantContract: (oldTenantId: string, tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[], roomId: string) => void

  clearAllData: () => void

  profitRecords: ProfitRecord[]
  addProfitRecord: (record: Omit<ProfitRecord, 'id' | 'createdAt'>) => void
  updateProfitRecord: (id: string, data: Partial<ProfitRecord>) => void
  deleteProfitRecord: (id: string) => void

  addToTrash: (type: TrashType, originalId: string, data: unknown, label: string) => void
  restoreFromTrash: (trashId: string) => void
  permanentlyDelete: (trashId: string) => void
  emptyTrash: () => void
}

function createId(): string {
  // crypto.randomUUID() 在 HTTP 非安全环境下不可用（如手机通过IP访问）
  // 使用 Math.random 兼容方案
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function nextDisplayId(state: AppStore, prefix: 'DL' | 'ZL'): string {
  const items = prefix === 'DL' ? state.landlordContracts : state.tenants
  let maxNum = 0
  for (const item of items) {
    const match = item.displayId.match(new RegExp(`^${prefix}-(\\d+)$`))
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`
}

// Sync outer: wraps set() to auto-upload after every mutation
let hydrated = false
export const useStore = create<AppStore>()(
  persist(
    (rawSet, get) => {
      const set: typeof rawSet = ((fn) => {
        const prev = get() as AppStore
        ;(rawSet as typeof rawSet)(fn)
        if (hydrated) {
          const next = get() as AppStore
          // 只有业务数据变更时才触发云同步（审计日志变更不触发）
          if (
            prev.properties !== next.properties ||
            prev.rooms !== next.rooms ||
            prev.tenants !== next.tenants ||
            prev.bills !== next.bills ||
            prev.landlordContracts !== next.landlordContracts ||
            prev.profitRecords !== next.profitRecords ||
            prev.trash !== next.trash
          ) {
            triggerCloudSave()
          }
        }
      }) as typeof rawSet

      // 操作日志辅助
      const recordLog = (state: AppStore, action: AuditLogEntry['action'], entity: string, entityId?: string, details?: string): AuditLogEntry[] => {
        return [...state.auditLogs, { id: createId(), timestamp: new Date().toISOString(), action, entity, entityId: entityId || '', details: details || '', createdAt: new Date().toISOString() }]
      }

      return {
      properties: [],
      rooms: [],
      tenants: [],
      bills: [],
      landlordContracts: [],
      profitRecords: [],
      trash: [],
      auditLogs: [],

      addProperty: (property) =>
        set((state) => {
          const now = new Date().toISOString()
          const id = createId()
          return {
            properties: [...state.properties, { ...property, id, createdAt: now } as Property],
            auditLogs: recordLog(state, 'create', 'property', id, property.address),
          }
        }),

      updateProperty: (id, property) =>
        set((state) => {
          const p = state.properties.find(x => x.id === id)
          return {
            properties: state.properties.map((p2) => p2.id === id ? { ...p2, ...property } : p2),
            auditLogs: recordLog(state, 'update', 'property', id, p?.address || ''),
          }
        }),

      deleteProperty: (id, keepPaidBills = true) =>
        set((state) => {
          const prop = state.properties.find((p) => p.id === id)
          const roomIds = state.rooms.filter((r) => r.propertyId === id).map((r) => r.id)
          const trashItems: TrashItem[] = []
          if (prop) trashItems.push({ id: createId(), type: 'property', originalId: id, data: prop, label: prop.address, deletedAt: new Date().toISOString().slice(0, 10) })
          state.rooms.filter((r) => r.propertyId === id).forEach((r) => trashItems.push({ id: createId(), type: 'room', originalId: r.id, data: r, label: `${r.label}室`, deletedAt: new Date().toISOString().slice(0, 10) }))
          state.tenants.filter((t) => roomIds.includes(t.roomId)).forEach((t) => trashItems.push({ id: createId(), type: 'tenant', originalId: t.id, data: t, label: t.name, deletedAt: new Date().toISOString().slice(0, 10) }))
          state.landlordContracts.filter((c) => c.propertyId === id).forEach((c) => trashItems.push({ id: createId(), type: 'landlord_contract', originalId: c.id, data: c, label: `代理合同 ${c.displayId}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          const billBelongsTo = (b: Bill) => b.propertyId === id || (b.roomId && roomIds.includes(b.roomId))
          if (keepPaidBills) {
            // 保留已付账单，只删未付
            state.bills.filter((b) => billBelongsTo(b) && b.status !== 'paid').forEach((b) => trashItems.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          } else {
            // 全部账单删除
            state.bills.filter(billBelongsTo).forEach((b) => trashItems.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          }
          return {
            properties: state.properties.filter((p) => p.id !== id),
            rooms: state.rooms.filter((r) => r.propertyId !== id),
            tenants: state.tenants.filter((t) => !roomIds.includes(t.roomId)),
            bills: keepPaidBills
              ? state.bills.filter((b) => !(billBelongsTo(b) && b.status !== 'paid'))
              : state.bills.filter((b) => !billBelongsTo(b)),
            landlordContracts: state.landlordContracts.filter((c) => c.propertyId !== id),
            trash: [...state.trash, ...trashItems],
            auditLogs: recordLog(state, 'delete', 'property', id, prop?.address || ''),
          }
        }),
      addRoom: (room) =>
        set((state) => {
          const now = new Date().toISOString()
          const id = createId()
          return {
            rooms: [...state.rooms, { ...room, id, createdAt: now } as Room],
            auditLogs: recordLog(state, 'create', 'room', id, `${room.label}室`),
          }
        }),

      updateRoom: (id, room) =>
        set((state) => {
          const r = state.rooms.find(x => x.id === id)
          return {
            rooms: state.rooms.map((r2) =>
              r2.id === id ? { ...r2, ...room } : r2
            ),
            auditLogs: recordLog(state, 'update', 'room', id, `${r?.label || ''}室`),
          }
        }),

      deleteRoom: (id) =>
        set((state) => {
          const room = state.rooms.find((r) => r.id === id)
          const trash: TrashItem[] = []
          if (room) trash.push({ id: createId(), type: 'room', originalId: id, data: room, label: `${room.label}室`, deletedAt: new Date().toISOString().slice(0, 10) })
          // 只删未付账单，已付账单保留作为历史流水
          state.bills.filter((b) => b.roomId === id && b.status !== 'paid').forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          return {
            rooms: state.rooms.filter((r) => r.id !== id),
            bills: state.bills.filter((b) => !(b.roomId === id && b.status !== 'paid')),
            trash: [...state.trash, ...trash],
            auditLogs: recordLog(state, 'delete', 'room', id, `${room.label}室`),
          }
        }),

      addTenant: (tenant) =>
        set((state) => {
          const now = new Date().toISOString()
          const id = createId()
          const newTenant: Tenant = { ...tenant, displayId: nextDisplayId(state, 'ZL'), id, createdAt: now }
          return {
            tenants: [...state.tenants, newTenant],
            auditLogs: recordLog(state, 'create', 'tenant', id, `租客 ${tenant.name}`),
          }
        }),

      updateTenant: (id, tenant) =>
        set((state) => ({
          tenants: state.tenants.map((t) =>
            t.id === id ? { ...t, ...tenant } : t
          ),
          auditLogs: recordLog(state, 'update', 'tenant', id, tenant.name || `租客`),
        })),

      changeTenantRoom: (tenantId, newRoomId) =>
        set((state) => {
          const tenant = state.tenants.find(t => t.id === tenantId)
          if (!tenant || tenant.roomId === newRoomId) return state
          const oldRoomId = tenant.roomId
          const oldRoom = state.rooms.find(r => r.id === oldRoomId)
          const newRoom = state.rooms.find(r => r.id === newRoomId)
          // 更新租客 roomId
          const updatedTenants = state.tenants.map(t =>
            t.id === tenantId ? { ...t, roomId: newRoomId } : t
          )
          // 更新该租客所有账单的 roomId
          const updatedBills = state.bills.map(b =>
            b.tenantId === tenantId ? { ...b, roomId: newRoomId } : b
          )
          // 更新房间状态
          const otherActiveInOldRoom = updatedTenants.some(
            t => t.roomId === oldRoomId && t.status === 'active' && t.id !== tenantId
          )
          const updatedRooms = state.rooms.map(r => {
            if (r.id === oldRoomId && !otherActiveInOldRoom) return { ...r, status: 'vacant' as const }
            if (r.id === newRoomId) return { ...r, status: 'occupied' as const }
            return r
          })
          return {
            tenants: updatedTenants,
            bills: updatedBills,
            rooms: updatedRooms,
            auditLogs: recordLog(state, 'update', 'tenant', tenantId, `换房: ${oldRoom?.label||oldRoomId}→${newRoom?.label||newRoomId}`),
          }
        }),

      deleteTenant: (id) =>
        set((state) => {
          const tenant = state.tenants.find((t) => t.id === id)
          const trash: TrashItem[] = []
          if (tenant) trash.push({ id: createId(), type: 'tenant', originalId: id, data: tenant, label: tenant.name, deletedAt: new Date().toISOString().slice(0, 10) })
          state.bills.filter((b) => b.tenantId === id).forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount} ${b.type}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          return {
            tenants: state.tenants.filter((t) => t.id !== id),
            bills: state.bills.filter((b) => b.tenantId !== id),
            rooms: tenant
              ? state.rooms.map((r) => r.id === tenant.roomId ? { ...r, status: 'vacant' as const } : r)
              : state.rooms,
            trash: [...state.trash, ...trash],
            auditLogs: recordLog(state, 'delete', 'tenant', id, `${tenant.name}`),
          }
        }),

      terminateTenant: (id, roomId, checkoutDate) =>
        set((state) => {
          // 删除该租客所有未付账单（退租后这些未来期数的账单不应再存在）
          const remainingBills = state.bills.filter(b =>
            !(b.tenantId === id && b.status !== 'paid' && b.direction === 'receivable')
          )
          return {
            tenants: state.tenants.map((t) =>
              t.id === id ? { ...t, status: 'ended', contractEnd: checkoutDate } : t
            ),
            rooms: state.rooms.map((r) =>
              r.id === roomId ? { ...r, status: 'vacant' } : r
            ),
            bills: remainingBills,
            auditLogs: recordLog(state, 'terminate', 'tenant', id, `退租`),
          }
        }),

      extendContract: (id, newEndDate) =>
        set((state) => ({
          tenants: state.tenants.map((t) =>
            t.id === id ? { ...t, contractEnd: newEndDate } : t
          ),
          auditLogs: recordLog(state, 'update', 'tenant', id, `续约至${newEndDate}`),
        })),

      addBill: (bill) =>
        set((state) => {
          const now = new Date().toISOString()
          const id = createId()
          return {
            bills: [...state.bills, { ...bill, id, createdAt: now } as Bill],
            auditLogs: recordLog(state, 'create', 'bill', id, `¥${bill.amount} ${bill.type}`),
          }
        }),

      updateBill: (id, bill) =>
        set((state) => {
          const current = state.bills.find(b => b.id === id)
          return {
            bills: state.bills.map((b) =>
              b.id === id ? { ...b, ...bill } : b
            ),
            auditLogs: recordLog(state, 'update', 'bill', id, current ? `¥${current.amount}` : ''),
          }
        }),

      deleteBill: (id) =>
        set((state) => {
          const bill = state.bills.find((b) => b.id === id)
          return {
            bills: state.bills.filter((b) => b.id !== id),
            trash: bill ? [...state.trash, { id: createId(), type: 'bill' as const, originalId: id, data: bill, label: `¥${bill.amount} ${bill.type}`, deletedAt: new Date().toISOString().slice(0, 10) }] : state.trash,
            auditLogs: recordLog(state, 'delete', 'bill', id, `¥${bill.amount}`),
          }
        }),

      createTenantContract: (tenant, draftBills, roomId) =>
        set((state) => {
          const tenantId = createId()
          const now = new Date().toISOString()
          const newTenant: Tenant = { ...tenant, displayId: nextDisplayId(state, 'ZL'), id: tenantId, status: 'active', createdAt: now }
          const newBills: Bill[] = draftBills.map((b) => ({
            id: createId(),
            roomId,
            tenantId,
            amount: b.amount,
            type: b.type === 'other' || b.type === 'deposit' ? b.type : 'rent',
            status: 'pending' as const,
            direction: 'receivable' as const,
            dueDate: b.dueDate,
            description: b.description,
            createdAt: now,
          }))
          return {
            tenants: [...state.tenants, newTenant],
            bills: [...state.bills, ...newBills],
            rooms: state.rooms.map((r) =>
              r.id === roomId ? { ...r, status: 'occupied' as const } : r
            ),
            auditLogs: recordLog(state, 'create', 'tenant', tenantId, `新租客 ${tenant.name}`),
          }
        }),

      editTenantContract: (tenantId, tenant, draftBills, roomId) =>
        set((state) => {
          const now = new Date().toISOString()
          const newBills: Bill[] = draftBills.map((b) => ({
            id: createId(),
            roomId,
            tenantId,
            amount: b.amount,
            type: b.type === 'other' || b.type === 'deposit' ? b.type : 'rent',
            status: 'pending' as const,
            direction: 'receivable' as const,
            dueDate: b.dueDate,
            description: b.description,
            createdAt: now,
          }))
          return {
            tenants: state.tenants.map((t) =>
              t.id === tenantId ? { ...t, ...tenant, id: tenantId, createdAt: t.createdAt, status: 'active' } : t
            ),
            bills: [
              ...state.bills.filter((b) => !(b.roomId === roomId && b.direction === 'receivable' && b.tenantId === tenantId)),
              ...newBills,
            ],
            auditLogs: recordLog(state, 'update', 'tenant', tenantId, `修改合同`),
          }
        }),

      renewTenantContract: (oldTenantId, tenant, draftBills, roomId) =>
        set((state) => {
          const now = new Date().toISOString()
          const newTenantId = createId()
          const newTenant: Tenant = { ...tenant, displayId: nextDisplayId(state, 'ZL'), id: newTenantId, status: 'active', createdAt: now, previousTenantId: oldTenantId }
          const newBills: Bill[] = draftBills.map((b) => ({
            id: createId(),
            roomId,
            tenantId: newTenantId,
            amount: b.amount,
            type: b.type === 'other' || b.type === 'deposit' ? b.type : 'rent',
            status: 'pending' as const,
            direction: 'receivable' as const,
            dueDate: b.dueDate,
            description: b.description,
            createdAt: now,
          }))
          return {
            tenants: [
              ...state.tenants.map((t) =>
                t.id === oldTenantId ? { ...t, status: 'ended' as const } : t
              ),
              newTenant,
            ],
            bills: [...state.bills, ...newBills],
            rooms: state.rooms.map((r) =>
              r.id === roomId ? { ...r, status: 'occupied' as const } : r
            ),
            auditLogs: recordLog(state, 'renew', 'tenant', oldTenantId, `续租 ${tenant.name}`),
          }
        }),

      addLandlordContract: (contract) =>
        set((state) => {
          const now = new Date().toISOString()
          const id = createId()
          return {
            landlordContracts: [
              ...state.landlordContracts,
              { ...contract, displayId: nextDisplayId(state, 'DL'), id, createdAt: now } as LandlordContract,
            ],
            auditLogs: recordLog(state, 'create', 'landlord_contract', id, `业主合同`),
          }
        }),

      updateLandlordContract: (id, data) =>
        set((state) => ({
          landlordContracts: state.landlordContracts.map((c) =>
            c.id === id ? { ...c, ...data } : c
          ),
          auditLogs: recordLog(state, 'update', 'landlord_contract', id, `修改业主合同`),
        })),

      deleteLandlordContract: (id, propertyId) =>
        set((state) => {
          const contract = state.landlordContracts.find((c) => c.id === id)
          const trash: TrashItem[] = []
          if (contract) {
            trash.push({ id: createId(), type: 'landlord_contract', originalId: id, data: contract, label: `代理合同 ${contract.displayId}`, deletedAt: new Date().toISOString().slice(0, 10) })
            // 只删除该合同日期范围内的应付账单
            state.bills.filter((b) =>
              b.propertyId === propertyId &&
              b.direction === 'payable' &&
              b.dueDate >= contract.contractStart &&
              b.dueDate <= contract.contractEnd
            ).forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          }
          return {
            landlordContracts: state.landlordContracts.filter((c) => c.id !== id),
            bills: contract
              ? state.bills.filter((b) =>
                  !(b.propertyId === propertyId &&
                    b.direction === 'payable' &&
                    b.dueDate >= contract.contractStart &&
                    b.dueDate <= contract.contractEnd)
                )
              : state.bills,
            trash: [...state.trash, ...trash],
            auditLogs: recordLog(state, 'delete', 'landlord_contract', id, `删除业主合同`),
          }
        }),

      terminateLandlordContract: (id) =>
        set((state) => ({
          landlordContracts: state.landlordContracts.map((c) =>
            c.id === id ? { ...c, status: 'ended' as const } : c
          ),
          auditLogs: recordLog(state, 'terminate', 'landlord_contract', id, `终止业主合同`),
        })),

      deleteTenantAndBills: (id, roomId) =>
        set((state) => {
          const tenant = state.tenants.find((t) => t.id === id)
          const trash: TrashItem[] = []
          if (tenant) trash.push({ id: createId(), type: 'tenant', originalId: id, data: tenant, label: tenant.name, deletedAt: new Date().toISOString().slice(0, 10) })
          state.bills.filter((b) => b.roomId === roomId && b.direction === 'receivable' && b.tenantId === id).forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          return {
            tenants: state.tenants.filter((t) => t.id !== id),
            bills: state.bills.filter((b) => !(b.roomId === roomId && b.direction === 'receivable' && b.tenantId === id)),
            rooms: state.rooms.map((r) => r.id === roomId && r.status === 'occupied' ? { ...r, status: 'vacant' as const } : r),
            trash: [...state.trash, ...trash],
            auditLogs: recordLog(state, 'delete', 'tenant', id, `${tenant.name}`),
          }
        }),

      clearAllData: () =>
        set((state) => ({
          properties: [],
          rooms: [],
          tenants: [],
          bills: [],
          landlordContracts: [],
          profitRecords: [],
          trash: [],
          auditLogs: recordLog(state, 'clear', 'all', '', '清空全部数据'),
        })),

      addProfitRecord: (record) =>
        set((state) => {
          const now = new Date().toISOString()
          const id = createId()
          return {
            profitRecords: [...state.profitRecords, { ...record, id, createdAt: now } as ProfitRecord],
            auditLogs: recordLog(state, 'create', 'profit_record', id, `¥${record.profitAmount}`),
          }
        }),

      updateProfitRecord: (id, data) =>
        set((state) => ({
          profitRecords: state.profitRecords.map((r) =>
            r.id === id ? { ...r, ...data } : r
          ),
          auditLogs: recordLog(state, 'update', 'profit_record', id, '修改利润记录'),
        })),

      deleteProfitRecord: (id) =>
        set((state) => ({
          profitRecords: state.profitRecords.filter((r) => r.id !== id),
          auditLogs: recordLog(state, 'delete', 'profit_record', id, '删除利润记录'),
        })),

      addToTrash: (type, originalId, data, label) =>
        set((state) => ({
          trash: [...state.trash, { id: createId(), type, originalId, data, label, deletedAt: new Date().toISOString().slice(0, 10) }],
        })),

      restoreFromTrash: (trashId) =>
        set((state) => {
          const item = state.trash.find((t) => t.id === trashId)
          if (!item) return state
          const data = item.data
          const log = recordLog(state, 'restore', item.type, item.originalId, `恢复 ${item.label}`)
          switch (item.type) {
            case 'property':
              return { properties: [...state.properties, data as Property], trash: state.trash.filter((t) => t.id !== trashId), auditLogs: log }
            case 'room':
              return { rooms: [...state.rooms, data as Room], trash: state.trash.filter((t) => t.id !== trashId), auditLogs: log }
            case 'tenant':
              return { tenants: [...state.tenants, data as Tenant], trash: state.trash.filter((t) => t.id !== trashId), auditLogs: log }
            case 'landlord_contract':
              return { landlordContracts: [...state.landlordContracts, data as LandlordContract], trash: state.trash.filter((t) => t.id !== trashId), auditLogs: log }
            case 'bill':
              return { bills: [...state.bills, data as Bill], trash: state.trash.filter((t) => t.id !== trashId), auditLogs: log }
            default:
              return state
          }
        }),

      permanentlyDelete: (trashId) =>
        set((state) => {
          const item = state.trash.find((t) => t.id === trashId)
          return {
            trash: state.trash.filter((t) => t.id !== trashId),
            auditLogs: item ? recordLog(state, 'delete', item.type, item.originalId, `彻底删除 ${item.label}`) : state.auditLogs,
          }
        }),

      emptyTrash: () =>
        set((state) => ({
          trash: [],
          auditLogs: recordLog(state, 'clear', 'trash', '', '清空回收站'),
        })),
    }
  },
  {
    name: 'property-manager-data',
    version: 2,
    onRehydrateStorage: () => () => { hydrated = true },
    migrate: (persistedState: unknown, version: number) => {
      let state = persistedState as Record<string, unknown>
      if (version === 0) {
        return {
          properties: [],
          rooms: [],
          tenants: [],
          bills: [],
          landlordContracts: [],
          profitRecords: [],
          trash: [],
          auditLogs: [],
        } as AppStore
      }
      if (version === 1) {
        const bills = (state.bills as Array<Record<string, unknown>> || []).map(b => {
          let type = b.type as string
          // 水电气合并为 utilities
          if (type === 'water' || type === 'electric' || type === 'gas') {
            type = 'utilities'
          }
          // 押金从 other 独立
          if (type === 'other' && (b.description as string)?.includes('押金')) {
            type = 'deposit'
          }
          return { ...b, type }
        })
        return { ...state, bills } as AppStore
      }
      return persistedState as AppStore
    },
  })
)
