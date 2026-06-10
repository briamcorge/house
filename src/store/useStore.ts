import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Property, Room, Tenant, Bill, LandlordContract, TrashItem, TrashType, ProfitRecord } from '../types'
import { DraftBill } from '../utils/calculator'

interface AppStore {
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]
  trash: TrashItem[]

  addProperty: (property: Omit<Property, 'id' | 'createdAt'>) => void
  updateProperty: (id: string, property: Partial<Property>) => void
  deleteProperty: (id: string) => void

  addRoom: (room: Omit<Room, 'id' | 'createdAt'>) => void
  updateRoom: (id: string, room: Partial<Room>) => void
  deleteRoom: (id: string) => void

  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>) => void
  updateTenant: (id: string, tenant: Partial<Tenant>) => void
  deleteTenant: (id: string) => void
  terminateTenant: (id: string, roomId: string) => void
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
  const count = prefix === 'DL'
    ? state.landlordContracts.length
    : state.tenants.length
  return `${prefix}-${String(count + 1).padStart(4, '0')}`
}

function buildSeedState() {
  const now = new Date().toISOString()
  const p1Id = createId()
  const p2Id = createId()
  const r1Id = createId()
  const r2Id = createId()
  const r3Id = createId()
  const r4Id = createId()
  const t1Id = createId()
  const t2Id = createId()
  const lc1Id = createId()
  const lc2Id = createId()

  return {
    properties: [
      { id: p1Id, address: '朝阳区建国路88号', createdAt: now },
      { id: p2Id, address: '海淀区中关村大街100号', createdAt: now },
    ] as Property[],
    rooms: [
      { id: r1Id, propertyId: p1Id, label: 'A', roomType: '主卧', status: 'occupied', createdAt: now },
      { id: r2Id, propertyId: p1Id, label: 'B', roomType: '次卧', status: 'occupied', createdAt: now },
      { id: r3Id, propertyId: p1Id, label: 'C', roomType: '次卧', status: 'vacant', createdAt: now },
      { id: r4Id, propertyId: p2Id, label: 'A', roomType: '独卫', status: 'vacant', createdAt: now },
    ] as Room[],
    tenants: [
      { id: t1Id, displayId: 'ZL-0001', name: '张先生', phone: '13800138000', roomId: r1Id, contractStart: '2025-08-01', contractEnd: '2026-08-01', paymentMethod: 'monthly', advanceDays: 7, otherFeeName: '卫管费', otherFeeAmount: 120, monthlyRent: 1800, status: 'active', createdAt: now },
      { id: t2Id, displayId: 'ZL-0002', name: '李女士', phone: '13900139000', roomId: r2Id, contractStart: '2025-10-01', contractEnd: '2026-10-01', paymentMethod: 'quarterly', advanceDays: 0, monthlyRent: 1500, status: 'active', createdAt: now },
    ] as Tenant[],
    bills: [
      { id: createId(), propertyId: p1Id, amount: 4500, type: 'rent', status: 'paid', direction: 'payable', dueDate: '2026-01-01', paidDate: '2026-01-01', createdAt: now },
      { id: createId(), propertyId: p2Id, amount: 3800, type: 'rent', status: 'pending', direction: 'payable', dueDate: '2026-04-01', createdAt: now },
      { id: createId(), roomId: r1Id, tenantId: t1Id, amount: 1800, type: 'rent', status: 'paid', direction: 'receivable', dueDate: '2026-01-01', paidDate: '2026-01-01', createdAt: now },
      { id: createId(), roomId: r2Id, tenantId: t2Id, amount: 1500, type: 'rent', status: 'pending', direction: 'receivable', dueDate: '2026-04-01', createdAt: now },
      { id: createId(), roomId: r1Id, tenantId: t1Id, amount: 180, type: 'water', status: 'overdue', direction: 'receivable', dueDate: '2026-05-25', createdAt: now },
    ] as Bill[],
    landlordContracts: [
      { id: lc1Id, displayId: 'DL-0001', propertyId: p1Id, landlordName: '王业主', landlordPhone: '13800138001', monthlyRent: 3000, paymentMethod: 'quarterly', contractStart: '2025-06-01', contractEnd: '2026-12-01', status: 'active', createdAt: now },
      { id: lc2Id, displayId: 'DL-0002', propertyId: p2Id, landlordName: '刘业主', landlordPhone: '13900139001', monthlyRent: 2500, paymentMethod: 'monthly', contractStart: '2025-07-01', contractEnd: '2027-01-01', status: 'active', createdAt: now },
    ] as LandlordContract[],
    profitRecords: [] as ProfitRecord[],
    trash: [] as TrashItem[],
  }
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      ...buildSeedState(),

      addProperty: (property) =>
        set((state) => ({
          properties: [
            ...state.properties,
            { ...property, id: createId(), createdAt: new Date().toISOString() } as Property,
          ],
        })),

      updateProperty: (id, property) =>
        set((state) => ({
          properties: state.properties.map((p) =>
            p.id === id ? { ...p, ...property } : p
          ),
        })),

      deleteProperty: (id) =>
        set((state) => {
          const prop = state.properties.find((p) => p.id === id)
          const roomIds = state.rooms.filter((r) => r.propertyId === id).map((r) => r.id)
          const trashItems: TrashItem[] = []
          if (prop) trashItems.push({ id: createId(), type: 'property', originalId: id, data: prop, label: prop.address, deletedAt: new Date().toISOString().slice(0, 10) })
          state.rooms.filter((r) => r.propertyId === id).forEach((r) => trashItems.push({ id: createId(), type: 'room', originalId: r.id, data: r, label: `${r.label}室`, deletedAt: new Date().toISOString().slice(0, 10) }))
          state.tenants.filter((t) => roomIds.includes(t.roomId)).forEach((t) => trashItems.push({ id: createId(), type: 'tenant', originalId: t.id, data: t, label: t.name, deletedAt: new Date().toISOString().slice(0, 10) }))
          state.landlordContracts.filter((c) => c.propertyId === id).forEach((c) => trashItems.push({ id: createId(), type: 'landlord_contract', originalId: c.id, data: c, label: `代理合同 ${c.displayId}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          state.bills.filter((b) => b.propertyId === id || (b.roomId && roomIds.includes(b.roomId))).forEach((b) => trashItems.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          return {
            properties: state.properties.filter((p) => p.id !== id),
            rooms: state.rooms.filter((r) => r.propertyId !== id),
            tenants: state.tenants.filter((t) => !roomIds.includes(t.roomId)),
            bills: state.bills.filter((b) => b.propertyId !== id && !(b.roomId && roomIds.includes(b.roomId))),
            landlordContracts: state.landlordContracts.filter((c) => c.propertyId !== id),
            trash: [...state.trash, ...trashItems],
          }
        }),
      addRoom: (room) =>
        set((state) => ({
          rooms: [
            ...state.rooms,
            { ...room, id: createId(), createdAt: new Date().toISOString() } as Room,
          ],
        })),

      updateRoom: (id, room) =>
        set((state) => ({
          rooms: state.rooms.map((r) =>
            r.id === id ? { ...r, ...room } : r
          ),
        })),

      deleteRoom: (id) =>
        set((state) => {
          const room = state.rooms.find((r) => r.id === id)
          const trash: TrashItem[] = []
          if (room) trash.push({ id: createId(), type: 'room', originalId: id, data: room, label: `${room.label}室`, deletedAt: new Date().toISOString().slice(0, 10) })
          state.bills.filter((b) => b.roomId === id).forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          return {
            rooms: state.rooms.filter((r) => r.id !== id),
            trash: [...state.trash, ...trash],
          }
        }),

      addTenant: (tenant) =>
        set((state) => ({
          tenants: [
            ...state.tenants,
            { ...tenant, displayId: nextDisplayId(state, 'ZL'), id: createId(), createdAt: new Date().toISOString() } as Tenant,
          ],
        })),

      updateTenant: (id, tenant) =>
        set((state) => ({
          tenants: state.tenants.map((t) =>
            t.id === id ? { ...t, ...tenant } : t
          ),
        })),

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
          }
        }),

      terminateTenant: (id, roomId) =>
        set((state) => ({
          tenants: state.tenants.map((t) =>
            t.id === id ? { ...t, status: 'ended' } : t
          ),
          rooms: state.rooms.map((r) =>
            r.id === roomId ? { ...r, status: 'vacant' } : r
          ),
        })),

      extendContract: (id, newEndDate) =>
        set((state) => ({
          tenants: state.tenants.map((t) =>
            t.id === id ? { ...t, contractEnd: newEndDate } : t
          ),
        })),

      addBill: (bill) =>
        set((state) => ({
          bills: [
            ...state.bills,
            { ...bill, id: createId(), createdAt: new Date().toISOString() } as Bill,
          ],
        })),

      updateBill: (id, bill) =>
        set((state) => ({
          bills: state.bills.map((b) =>
            b.id === id ? { ...b, ...bill } : b
          ),
        })),

      deleteBill: (id) =>
        set((state) => {
          const bill = state.bills.find((b) => b.id === id)
          return {
            bills: state.bills.filter((b) => b.id !== id),
            trash: bill ? [...state.trash, { id: createId(), type: 'bill' as const, originalId: id, data: bill, label: `¥${bill.amount} ${bill.type}`, deletedAt: new Date().toISOString().slice(0, 10) }] : state.trash,
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
            type: b.type === 'other' ? 'other' : 'rent',
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
            type: b.type === 'other' ? 'other' : 'rent',
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
          }
        }),

      renewTenantContract: (oldTenantId, tenant, draftBills, roomId) =>
        set((state) => {
          const now = new Date().toISOString()
          const newTenantId = createId()
          const newTenant: Tenant = { ...tenant, displayId: nextDisplayId(state, 'ZL'), id: newTenantId, status: 'active', createdAt: now }
          const newBills: Bill[] = draftBills.map((b) => ({
            id: createId(),
            roomId,
            tenantId: newTenantId,
            amount: b.amount,
            type: b.type === 'other' ? 'other' : 'rent',
            status: 'pending' as const,
            direction: 'receivable' as const,
            dueDate: b.dueDate,
            description: b.description,
            createdAt: now,
          }))
          return {
            tenants: [
              ...state.tenants,
              newTenant,
            ],
            bills: [...state.bills, ...newBills],
            rooms: state.rooms.map((r) =>
              r.id === roomId ? { ...r, status: 'occupied' as const } : r
            ),
          }
        }),

      addLandlordContract: (contract) =>
        set((state) => ({
          landlordContracts: [
            ...state.landlordContracts,
            { ...contract, displayId: nextDisplayId(state, 'DL'), id: createId(), createdAt: new Date().toISOString() } as LandlordContract,
          ],
        })),

      updateLandlordContract: (id, data) =>
        set((state) => ({
          landlordContracts: state.landlordContracts.map((c) =>
            c.id === id ? { ...c, ...data } : c
          ),
        })),

      deleteLandlordContract: (id, propertyId) =>
        set((state) => {
          const contract = state.landlordContracts.find((c) => c.id === id)
          const trash: TrashItem[] = []
          if (contract) trash.push({ id: createId(), type: 'landlord_contract', originalId: id, data: contract, label: `代理合同 ${contract.displayId}`, deletedAt: new Date().toISOString().slice(0, 10) })
          state.bills.filter((b) => b.propertyId === propertyId && b.direction === 'payable').forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: new Date().toISOString().slice(0, 10) }))
          return {
            landlordContracts: state.landlordContracts.filter((c) => c.id !== id),
            bills: state.bills.filter((b) => !(b.propertyId === propertyId && b.direction === 'payable')),
            trash: [...state.trash, ...trash],
          }
        }),

      terminateLandlordContract: (id) =>
        set((state) => ({
          landlordContracts: state.landlordContracts.map((c) =>
            c.id === id ? { ...c, status: 'ended' as const } : c
          ),
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
          }
        }),

      clearAllData: () =>
        set({ properties: [], rooms: [], tenants: [], bills: [], landlordContracts: [], profitRecords: [], trash: [] }),

      addProfitRecord: (record) =>
        set((state) => ({
          profitRecords: [
            ...state.profitRecords,
            { ...record, id: createId(), createdAt: new Date().toISOString() } as ProfitRecord,
          ],
        })),

      updateProfitRecord: (id, data) =>
        set((state) => ({
          profitRecords: state.profitRecords.map((r) =>
            r.id === id ? { ...r, ...data } : r
          ),
        })),

      deleteProfitRecord: (id) =>
        set((state) => ({
          profitRecords: state.profitRecords.filter((r) => r.id !== id),
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
          switch (item.type) {
            case 'property':
              return { properties: [...state.properties, data as Property], trash: state.trash.filter((t) => t.id !== trashId) }
            case 'room':
              return { rooms: [...state.rooms, data as Room], trash: state.trash.filter((t) => t.id !== trashId) }
            case 'tenant':
              return { tenants: [...state.tenants, data as Tenant], trash: state.trash.filter((t) => t.id !== trashId) }
            case 'landlord_contract':
              return { landlordContracts: [...state.landlordContracts, data as LandlordContract], trash: state.trash.filter((t) => t.id !== trashId) }
            case 'bill':
              return { bills: [...state.bills, data as Bill], trash: state.trash.filter((t) => t.id !== trashId) }
            default:
              return state
          }
        }),

      permanentlyDelete: (trashId) =>
        set((state) => ({
          trash: state.trash.filter((t) => t.id !== trashId),
        })),

      emptyTrash: () =>
        set({ trash: [] }),
    }),
    {
      name: 'property-manager-data',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          // Version 1: Updated seed dates + added landlord contracts
          return buildSeedState()
        }
        return persistedState as typeof buildSeedState
      },
    }
  )
)
