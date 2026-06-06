import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Property, Room, Tenant, Bill, LandlordContract } from '../types'
import { DraftBill } from '../utils/calculator'

interface AppStore {
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]

  addProperty: (property: Omit<Property, 'id' | 'createdAt'>) => void
  updateProperty: (id: string, property: Partial<Property>) => void
  deleteProperty: (id: string) => void

  addRoom: (room: Omit<Room, 'id' | 'createdAt'>) => void
  updateRoom: (id: string, room: Partial<Room>) => void
  deleteRoom: (id: string) => void

  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt'>) => void
  updateTenant: (id: string, tenant: Partial<Tenant>) => void
  deleteTenant: (id: string) => void
  terminateTenant: (id: string, roomId: string) => void
  extendContract: (id: string, newEndDate: string) => void

  addBill: (bill: Omit<Bill, 'id' | 'createdAt'>) => void
  updateBill: (id: string, bill: Partial<Bill>) => void
  deleteBill: (id: string) => void

  addLandlordContract: (contract: Omit<LandlordContract, 'id' | 'createdAt'>) => void
  updateLandlordContract: (id: string, data: Partial<LandlordContract>) => void
  deleteLandlordContract: (id: string, propertyId: string) => void
  terminateLandlordContract: (id: string) => void
  deleteTenantAndBills: (id: string, roomId: string) => void
  createTenantContract: (tenant: Omit<Tenant, 'id' | 'createdAt'>, bills: DraftBill[], roomId: string) => void
  editTenantContract: (tenantId: string, tenant: Omit<Tenant, 'id' | 'createdAt'>, bills: DraftBill[], roomId: string) => void
  renewTenantContract: (oldTenantId: string, tenant: Omit<Tenant, 'id' | 'createdAt'>, bills: DraftBill[], roomId: string) => void

  clearAllData: () => void
}

function createId(): string {
  return crypto.randomUUID()
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
      { id: t1Id, name: '张先生', phone: '13800138000', roomId: r1Id, contractStart: '2024-01-01', contractEnd: '2025-01-01', paymentMethod: 'monthly', advanceDays: 7, otherFeeName: '卫管费', otherFeeAmount: 120, monthlyRent: 1800, status: 'active', createdAt: now },
      { id: t2Id, name: '李女士', phone: '13900139000', roomId: r2Id, contractStart: '2024-03-01', contractEnd: '2025-03-01', paymentMethod: 'quarterly', advanceDays: 0, monthlyRent: 1500, status: 'active', createdAt: now },
    ] as Tenant[],
    bills: [
      { id: createId(), propertyId: p1Id, amount: 4500, type: 'rent', status: 'paid', direction: 'payable', dueDate: '2025-01-01', paidDate: '2025-01-01', createdAt: now },
      { id: createId(), propertyId: p2Id, amount: 3800, type: 'rent', status: 'pending', direction: 'payable', dueDate: '2025-02-01', createdAt: now },
      { id: createId(), roomId: r1Id, tenantId: t1Id, amount: 1800, type: 'rent', status: 'paid', direction: 'receivable', dueDate: '2025-01-01', paidDate: '2025-01-01', createdAt: now },
      { id: createId(), roomId: r2Id, tenantId: t2Id, amount: 1500, type: 'rent', status: 'pending', direction: 'receivable', dueDate: '2025-02-01', createdAt: now },
      { id: createId(), roomId: r1Id, tenantId: t1Id, amount: 180, type: 'water', status: 'overdue', direction: 'receivable', dueDate: '2024-12-25', createdAt: now },
    ] as Bill[],
    landlordContracts: [] as LandlordContract[],
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
          const roomIds = state.rooms.filter((r) => r.propertyId === id).map((r) => r.id)
          return {
            properties: state.properties.filter((p) => p.id !== id),
            rooms: state.rooms.filter((r) => r.propertyId !== id),
            tenants: state.tenants.filter((t) => !roomIds.includes(t.roomId)),
            bills: state.bills.filter((b) => b.propertyId !== id && !roomIds.includes(b.roomId || '')),
            landlordContracts: state.landlordContracts.filter((c) => c.propertyId !== id),
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
        set((state) => ({
          rooms: state.rooms.filter((r) => r.id !== id),
        })),

      addTenant: (tenant) =>
        set((state) => ({
          tenants: [
            ...state.tenants,
            { ...tenant, id: createId(), createdAt: new Date().toISOString() } as Tenant,
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
          return {
            tenants: state.tenants.filter((t) => t.id !== id),
            bills: state.bills.filter((b) => !(b.tenantId === id)),
            rooms: tenant
              ? state.rooms.map((r) =>
                  r.id === tenant.roomId ? { ...r, status: 'vacant' as const } : r
                )
              : state.rooms,
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
        set((state) => ({
          bills: state.bills.filter((b) => b.id !== id),
        })),

      createTenantContract: (tenant, draftBills, roomId) =>
        set((state) => {
          const tenantId = createId()
          const now = new Date().toISOString()
          const newTenant: Tenant = { ...tenant, id: tenantId, status: 'active', createdAt: now }
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
          const newTenant: Tenant = { ...tenant, id: newTenantId, status: 'active', createdAt: now }
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
            { ...contract, id: createId(), createdAt: new Date().toISOString() } as LandlordContract,
          ],
        })),

      updateLandlordContract: (id, data) =>
        set((state) => ({
          landlordContracts: state.landlordContracts.map((c) =>
            c.id === id ? { ...c, ...data } : c
          ),
        })),

      deleteLandlordContract: (id, propertyId) =>
        set((state) => ({
          landlordContracts: state.landlordContracts.filter((c) => c.id !== id),
          bills: state.bills.filter((b) => !(b.propertyId === propertyId && b.direction === 'payable')),
        })),

      terminateLandlordContract: (id) =>
        set((state) => ({
          landlordContracts: state.landlordContracts.map((c) =>
            c.id === id ? { ...c, status: 'ended' as const } : c
          ),
        })),

      deleteTenantAndBills: (id, roomId) =>
        set((state) => ({
          tenants: state.tenants.filter((t) => t.id !== id),
          bills: state.bills.filter((b) => !(b.roomId === roomId && b.direction === 'receivable' && b.tenantId === id)),
          rooms: state.rooms.map((r) =>
            r.id === roomId && r.status === 'occupied' ? { ...r, status: 'vacant' as const } : r
          ),
        })),

      clearAllData: () =>
        set({ properties: [], rooms: [], tenants: [], bills: [], landlordContracts: [] }),
    }),
    {
      name: 'property-manager-data',
    }
  )
)
