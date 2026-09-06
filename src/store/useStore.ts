import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Property, Room, Tenant, Bill, LandlordContract, TrashItem, TrashType, ProfitRecord, AuditLogEntry } from '../types'
import { DraftBill } from '../utils/calculator'
import { triggerCloudSave } from '../lib/cloud-sync-context'
import { setLocalDirtyAt } from '../lib/supabase'
import { formatRoomLabel, todayLocal } from '../lib/utils'

interface AppStore {
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]
  trash: TrashItem[]
  auditLogs: AuditLogEntry[]
  settings: { showPropertyBills: boolean }
  setSettings: (partial: Partial<{ showPropertyBills: boolean }>) => void

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
  restoreTenant: (id: string, roomId: string) => void
  extendContract: (id: string, newEndDate: string) => void

  addBill: (bill: Omit<Bill, 'id' | 'createdAt'>) => boolean
  updateBill: (id: string, bill: Partial<Bill>) => boolean
  deleteBill: (id: string) => void

  addLandlordContract: (contract: Omit<LandlordContract, 'id' | 'createdAt' | 'displayId'>) => string
  updateLandlordContract: (id: string, data: Partial<LandlordContract>) => void
  deleteLandlordContract: (id: string, propertyId: string) => void
  terminateLandlordContract: (id: string) => void
  restoreLandlordContract: (id: string) => void
  deleteTenantAndBills: (id: string, roomId: string) => void
  createTenantContract: (tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[], roomId: string) => void
  editTenantContract: (tenantId: string, tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[], roomId: string) => void
  renewTenantContract: (oldTenantId: string, tenant: Omit<Tenant, 'id' | 'createdAt' | 'displayId'>, bills: DraftBill[], roomId: string) => void

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
  const trashType: TrashType = prefix === 'DL' ? 'landlord_contract' : 'tenant'
  const regex = new RegExp(`^${prefix}-(\\d+)$`)
  let maxNum = 0
  const scan = (displayId: string) => {
    const match = displayId.match(regex)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  }
  // 同时扫描回收站中可恢复的同类型条目，避免恢复后 displayId 重复
  // ⚠️ 防御损坏数据：trash 条目 data 可能缺失/非对象（历史脏数据），直接取 displayId 会抛 TypeError 导致新增租客/合同崩溃
  for (const item of items) scan(item.displayId)
  for (const item of state.trash) {
    if (item.type === trashType && item.data && typeof item.data.displayId === 'string') scan(item.data.displayId)
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`
}

// Sync outer: wraps set() to auto-upload after every mutation
let hydrated = false

// ─── 云同步失败标记（模块级，2026-09-06 安全加固 M6）───
// 原实现挂在 window 上，XSS/恶意脚本可篡改 window.__cloudSyncBrokenAt：
// 置位=阻止全部业务操作（DoS），删除=绕过同步失败拦截。
// 改为模块级私有变量 + 显式导出函数，外部无法通过 window 访问。
let _cloudSyncBrokenAt: number | undefined
export function getCloudSyncBrokenAt(): number | undefined { return _cloudSyncBrokenAt }
export function setCloudSyncBroken(v: number) { _cloudSyncBrokenAt = v }
export function clearCloudSyncBroken() { _cloudSyncBrokenAt = undefined }

export const useStore = create<AppStore>()(
  persist(
    (rawSet, get) => {
      // ⚠️ 在线强制（产品铁律）：断网时阻止一切业务数据变更。
      // 只拦截业务操作（actions 走这里的包装 set）；
      // 云端加载/踢出等系统路径走 useStore.setState 原始方法，不受影响。
      // 云同步失败后持续视为离线（__cloudSyncBrokenAt 由 cloud-sync-context 设置，
      // 直到重试成功 clearSyncBroken 删除标记才恢复——不做 60s 过期，避免窗口过期后操作不落云的无感知风险）
      // 返回值 boolean：true=已写入，false=被离线拦截（调用方可据此中止后续操作）
      // fn 允许返回 Partial（与 zustand 运行时行为一致，persist 包装的类型推导不准确）
      type GuardedSet = (
        fn: AppStore | Partial<AppStore> | ((state: AppStore) => AppStore | Partial<AppStore>),
        replace?: boolean
      ) => boolean
      const set = ((fn) => {
        const brokenAt = getCloudSyncBrokenAt()
        if (
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          brokenAt !== undefined
        ) {
          window.dispatchEvent(new CustomEvent('app-offline-blocked'))
          return false
        }
        const prev = get() as AppStore
        ;(rawSet as unknown as GuardedSet)(fn)
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
            // ⚠️ 本地未同步数据标记：每次业务操作写入时间戳（A1 起保存成功即清除，
            // 见 cloud-sync-context doSave ok 分支）——语义=「存在未确认同步到云端的本地改动」。
            // 加载时若标记比云端 updated_at 新 → 禁止云端旧数据覆盖本地
            //（2026-09-03 修复 / 2026-09-06 A1 语义修正：8-28/9-03/9-05 三次均为覆盖事故）。
            setLocalDirtyAt()
            triggerCloudSave()
          }
        }
        return true
      }) as GuardedSet

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
      settings: { showPropertyBills: true },

      setSettings: (partial) => set((state) => ({ settings: { ...state.settings, ...partial } })),

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
          if (prop) trashItems.push({ id: createId(), type: 'property', originalId: id, data: prop, label: prop.address, deletedAt: todayLocal() })
          state.rooms.filter((r) => r.propertyId === id).forEach((r) => trashItems.push({ id: createId(), type: 'room', originalId: r.id, data: r, label: `${formatRoomLabel(r.label)}`, deletedAt: todayLocal() }))
          state.tenants.filter((t) => roomIds.includes(t.roomId)).forEach((t) => trashItems.push({ id: createId(), type: 'tenant', originalId: t.id, data: t, label: t.name, deletedAt: todayLocal() }))
          state.landlordContracts.filter((c) => c.propertyId === id).forEach((c) => trashItems.push({ id: createId(), type: 'landlord_contract', originalId: c.id, data: c, label: `代理合同 ${c.displayId}`, deletedAt: todayLocal() }))
          const billBelongsTo = (b: Bill) => b.propertyId === id || (b.roomId && roomIds.includes(b.roomId))
          if (keepPaidBills) {
            // 保留已付账单，只删未付
            state.bills.filter((b) => billBelongsTo(b) && b.status !== 'paid').forEach((b) => trashItems.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: todayLocal() }))
          } else {
            // 全部账单删除
            state.bills.filter(billBelongsTo).forEach((b) => trashItems.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: todayLocal() }))
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
            auditLogs: recordLog(state, 'create', 'room', id, `${formatRoomLabel(room.label)}`),
          }
        }),

      updateRoom: (id, room) =>
        set((state) => {
          const r = state.rooms.find(x => x.id === id)
          return {
            rooms: state.rooms.map((r2) =>
              r2.id === id ? { ...r2, ...room } : r2
            ),
            auditLogs: recordLog(state, 'update', 'room', id, `${r?.label ? formatRoomLabel(r.label) : ''}`),
          }
        }),

      deleteRoom: (id) =>
        set((state) => {
          const room = state.rooms.find((r) => r.id === id)
          const trash: TrashItem[] = []
          if (room) trash.push({ id: createId(), type: 'room', originalId: id, data: room, label: `${formatRoomLabel(room.label)}`, deletedAt: todayLocal() })
          // 只删未付账单，已付账单保留作为历史流水
          state.bills.filter((b) => b.roomId === id && b.status !== 'paid').forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: todayLocal() }))
          return {
            rooms: state.rooms.filter((r) => r.id !== id),
            bills: state.bills.filter((b) => !(b.roomId === id && b.status !== 'paid')),
            trash: [...state.trash, ...trash],
            auditLogs: recordLog(state, 'delete', 'room', id, `${formatRoomLabel(room.label)}`),
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
          // 检查新房间是否已被其他活跃租客占用（防止一间房两个活跃租客）
          const newRoomOccupied = state.tenants.some(t =>
            t.roomId === newRoomId && t.id !== tenantId && t.status === 'active'
          )
          if (newRoomOccupied) return state
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
          if (tenant) trash.push({ id: createId(), type: 'tenant', originalId: id, data: tenant, label: tenant.name, deletedAt: todayLocal() })
          state.bills.filter((b) => b.tenantId === id).forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount} ${b.type}`, deletedAt: todayLocal() }))
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
          // 保留已付和已退还的账单，删除其他（未付/逾期的未来期数账单）
          const removedBills = state.bills.filter(b =>
            b.tenantId === id && b.status !== 'paid' && b.status !== 'refunded' && b.direction === 'receivable'
          )
          const remainingBills = state.bills.filter(b => !removedBills.includes(b))
          // 合同结束日：退租日的前一天（退租当天已不住）
          const d = new Date(checkoutDate)
          d.setDate(d.getDate() - 1)
          const contractEnd = d.toISOString().slice(0, 10)
          // 合同结束日保持原有值不变，新增 actualEffectiveEnd 字段表示实际退租日。
          // 历史数据中已有 contractEnd 被修改过的，由 profit.ts 从退租金账单推导。
          return {
            tenants: state.tenants.map((t) =>
              t.id === id ? { ...t, status: 'ended', effectiveEnd: checkoutDate, endReason: 'checkout' as const, pendingBills: removedBills } : t
            ),
            rooms: state.rooms.map((r) =>
              r.id === roomId ? { ...r, status: 'vacant' } : r
            ),
            bills: remainingBills,
            auditLogs: recordLog(state, 'terminate', 'tenant', id, `退租`),
          }
        }),

      restoreTenant: (id, roomId) =>
        set((state) => {
          // 检查房间是否已有活跃租客
          const roomHasActiveTenant = state.tenants.some(t =>
            t.roomId === roomId && t.id !== id && t.status === 'active'
          )
          if (roomHasActiveTenant) {
            // 房间被占用，不恢复
            return state
          }
          const tenant = state.tenants.find(t => t.id === id)
          // 撤销退租时生成的账单：退押金/违约金/退租金/退其他
          // 退租账单由 CheckoutModal 在退租日生成（dueDate/paidDate 均为退租日 = effectiveEnd），
          // 因此仅删除退租日当天及之后生成的账单，避免误删合同期内同名的合法账单（如中途违约金）。
          // 历史数据缺少 effectiveEnd 时退回旧行为：仅按描述匹配。
          const effectiveEnd = tenant?.effectiveEnd
          const checkoutBillIds = new Set(
            state.bills
              .filter(b => b.tenantId === id && (
                b.description === '退押金' ||
                b.description === '违约金' ||
                b.description.startsWith('退租金') ||
                (b.amount < 0 && b.type === 'other' && b.description.startsWith('退'))
              ) && (!effectiveEnd || (b.paidDate || b.dueDate) >= effectiveEnd))
              .map(b => b.id)
          )
          // 找回退租时暂存的未付账单（未来期数）
          const pendingBills = tenant?.pendingBills || []
          return {
            tenants: state.tenants.map((t) =>
              t.id === id ? { ...t, status: 'active' as const, effectiveEnd: undefined, endReason: undefined, pendingBills: undefined } : t
            ),
            rooms: state.rooms.map((r) =>
              r.id === roomId && r.status === 'vacant' ? { ...r, status: 'occupied' as const } : r
            ),
            bills: [...state.bills.filter(b => !checkoutBillIds.has(b.id)), ...pendingBills],
            auditLogs: recordLog(state, 'restore', 'tenant', id, `恢复租客`),
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
            trash: bill ? [...state.trash, { id: createId(), type: 'bill' as const, originalId: id, data: bill, label: `¥${bill.amount} ${bill.type}`, deletedAt: todayLocal() }] : state.trash,
            auditLogs: recordLog(state, 'delete', 'bill', id, bill ? `¥${bill.amount}` : ''),
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
            periodStart: b.periodStart,
            periodEnd: b.periodEnd,
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

      // ⚠️ 有意设计（用户确认，勿当作 bug）：编辑合同 = 删除该租客全部应收账单并重新生成，
      // 已收/已退账单也会一并删除（不进回收站），删除后需用户在账单页手动重新添加已收记录。
      // TenantModal 已在此操作前增加确认弹窗，防止误操作。
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
            periodStart: b.periodStart,
            periodEnd: b.periodEnd,
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
            periodStart: b.periodStart,
            periodEnd: b.periodEnd,
            createdAt: now,
          }))
          return {
            tenants: [
              ...state.tenants.map((t) =>
                t.id === oldTenantId ? { ...t, status: 'ended' as const, endReason: 'renew' as const } : t
              ),
              newTenant,
            ],
            // ⚠️ 续约（2026-09-03 用户确认，勿报 bug）：旧租客的账单（含未收）全部保留，未收账单继续收款——
            // "租客提前续约也是这样的逻辑。如有未收账单，依然需要继续支付"（与业主续约一致，区别于退租会删除未付账单）
            bills: [...state.bills, ...newBills],
            rooms: state.rooms.map((r) =>
              r.id === roomId ? { ...r, status: 'occupied' as const } : r
            ),
            auditLogs: recordLog(state, 'renew', 'tenant', oldTenantId, `续租 ${tenant.name}`),
          }
        }),

      addLandlordContract: (contract) => {
        const now = new Date().toISOString()
        const id = createId()
        const ok = set((state) => ({
          landlordContracts: [
            ...state.landlordContracts,
            { ...contract, displayId: nextDisplayId(state, 'DL'), id, createdAt: now } as LandlordContract,
          ],
          auditLogs: recordLog(state, 'create', 'landlord_contract', id, `业主合同`),
        }))
        // 离线/同步失败窗口内 set 被拦截 → 返回 '' 表示未创建，调用方应中止后续 addBill 并提示
        return ok ? id : ''
      },

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
            trash.push({ id: createId(), type: 'landlord_contract', originalId: id, data: contract, label: `代理合同 ${contract.displayId}`, deletedAt: todayLocal() })
            // 删除该合同关联的应付账单（landlordContractId 精确匹配）
            // 旧数据无 landlordContractId → 兜底按 propertyId + dueDate 在合同日期范围内删除
            // ⚠️ 设计前提（2026-09-03 用户确认，勿报 bug）：「提前续约」= 提前办理续约手续，
            // 新合同日期从旧合同结束后开始（衔接不重叠），因此兜底按日期匹配不会误删续约新合同的账单。
            // 若未来出现同一房源多份合同日期重叠的数据，此兜底需加「排除其他合同期间」保护，勿直接改。
            state.bills.filter((b) =>
              b.direction === 'payable' &&
              (b.landlordContractId === id ||
                (!b.landlordContractId &&
                  b.propertyId === propertyId &&
                  b.dueDate >= contract.contractStart &&
                  b.dueDate <= contract.contractEnd))
            ).forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: todayLocal() }))
          }
          return {
            landlordContracts: state.landlordContracts.filter((c) => c.id !== id),
            bills: contract
              ? state.bills.filter((b) =>
                  !(b.direction === 'payable' &&
                    (b.landlordContractId === id ||
                      (!b.landlordContractId &&
                        b.propertyId === propertyId &&
                        b.dueDate >= contract.contractStart &&
                        b.dueDate <= contract.contractEnd)))
                )
              : state.bills,
            trash: [...state.trash, ...trash],
            auditLogs: recordLog(state, 'delete', 'landlord_contract', id, `删除业主合同`),
          }
        }),

      terminateLandlordContract: (id) =>
        set((state) => {
          const contract = state.landlordContracts.find((c) => c.id === id)
          if (!contract) return state
          // 删除该合同未付的应付账单（未来期数），已付/已退还保留；暂存以便恢复时找回
          // 旧数据无 landlordContractId → 兜底按 propertyId + dueDate 在合同日期范围内删除
          const isContractBill = (b: Bill) =>
            b.direction === 'payable' &&
            (b.landlordContractId === id ||
              (!b.landlordContractId &&
                b.propertyId === contract.propertyId &&
                b.dueDate >= contract.contractStart &&
                b.dueDate <= contract.contractEnd))
          const removedBills = state.bills.filter(b => isContractBill(b) && b.status !== 'paid' && b.status !== 'refunded')
          return {
            landlordContracts: state.landlordContracts.map((c) =>
              c.id === id ? { ...c, status: 'ended' as const, endReason: 'checkout' as const, pendingBills: removedBills } : c
            ),
            bills: state.bills.filter(b => !removedBills.includes(b)),
            auditLogs: recordLog(state, 'terminate', 'landlord_contract', id, `终止业主合同`),
          }
        }),

      restoreLandlordContract: (id) =>
        set((state) => {
          // 撤销退租时生成的账单：退押金/业主违约金/退租金
          const checkoutBillIds = new Set(
            state.bills
              .filter(b => b.landlordContractId === id && (
                b.description === '退押金' ||
                b.description === '业主违约金' ||
                b.description.startsWith('退租金')
              ))
              .map(b => b.id)
          )
          // 找回退租时暂存的未付账单（未来期数）
          const contract = state.landlordContracts.find(c => c.id === id)
          const pendingBills = contract?.pendingBills || []
          return {
            landlordContracts: state.landlordContracts.map((c) =>
              c.id === id ? { ...c, status: 'active' as const, endReason: undefined, pendingBills: undefined } : c
            ),
            bills: [...state.bills.filter(b => !checkoutBillIds.has(b.id)), ...pendingBills],
            auditLogs: recordLog(state, 'restore', 'landlord_contract', id, `恢复业主合同`),
          }
        }),

      deleteTenantAndBills: (id, roomId) =>
        set((state) => {
          const tenant = state.tenants.find((t) => t.id === id)
          const trash: TrashItem[] = []
          if (tenant) trash.push({ id: createId(), type: 'tenant', originalId: id, data: tenant, label: tenant.name, deletedAt: todayLocal() })
          // ⚠️ 设计意图（2026-09-03 用户确认，勿报 bug）：删除租客 = 彻底断绝关系，**已付账单也一并删除**（进回收站可恢复）；
          // 用户原话："我之所以要删除这个租客，就是不想和他发生任何关系，要不然只会给他点退租"。
          // 想保留已付流水应走「退租」（terminateTenant），而非删除。
          state.bills.filter((b) => b.roomId === roomId && b.direction === 'receivable' && b.tenantId === id).forEach((b) => trash.push({ id: createId(), type: 'bill', originalId: b.id, data: b, label: `¥${b.amount}`, deletedAt: todayLocal() }))
          return {
            tenants: state.tenants.filter((t) => t.id !== id),
            bills: state.bills.filter((b) => !(b.roomId === roomId && b.direction === 'receivable' && b.tenantId === id)),
            rooms: state.rooms.map((r) => r.id === roomId && r.status === 'occupied' ? { ...r, status: 'vacant' as const } : r),
            trash: [...state.trash, ...trash],
            auditLogs: recordLog(state, 'delete', 'tenant', id, `${tenant.name}`),
          }
        }),

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
          trash: [...state.trash, { id: createId(), type, originalId, data, label, deletedAt: todayLocal() }],
        })),

      restoreFromTrash: (trashId) =>
        set((state) => {
          const item = state.trash.find((t) => t.id === trashId)
          if (!item) return state
          const data = item.data
          // 恢复账单时校验关联实体存在（防止孤儿账单：租客/房间已被彻底删除）
          if (item.type === 'bill') {
            const b = data as Bill
            if (b.tenantId && !state.tenants.some(t => t.id === b.tenantId)) return state
            if (b.roomId && !state.rooms.some(r => r.id === b.roomId)) return state
            if (b.landlordContractId && !state.landlordContracts.some(c => c.id === b.landlordContractId)) return state
          }
          // 恢复房间时校验所属房源存在（防止孤儿房间）
          if (item.type === 'room') {
            const r = data as Room
            if (!state.properties.some(p => p.id === r.propertyId)) return state
          }
          // 恢复租客时校验房间存在且未被其他活跃租客占用（防止孤儿租客/双重占用）
          if (item.type === 'tenant') {
            const t = data as Tenant
            if (!state.rooms.some(r => r.id === t.roomId)) return state
            if (state.tenants.some(x => x.roomId === t.roomId && x.id !== t.id && x.status === 'active')) return state
          }
          const log = recordLog(state, 'restore', item.type, item.originalId, `恢复 ${item.label}`)
          switch (item.type) {
            case 'property':
              return { properties: [...state.properties, data as Property], trash: state.trash.filter((t) => t.id !== trashId), auditLogs: log }
            case 'room':
              return { rooms: [...state.rooms, data as Room], trash: state.trash.filter((t) => t.id !== trashId), auditLogs: log }
            case 'tenant': {
              const t = data as Tenant
              return {
                tenants: [...state.tenants, t],
                // 恢复在租租客时同步把房间置为已入住，避免房间显示空置导致一房双租客
                rooms: t.status === 'active'
                  ? state.rooms.map(r => r.id === t.roomId && r.status === 'vacant' ? { ...r, status: 'occupied' } : r)
                  : state.rooms,
                trash: state.trash.filter((x) => x.id !== trashId),
                auditLogs: log,
              }
            }
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
    version: 8,
    onRehydrateStorage: () => () => { hydrated = true },
    migrate: (persistedState: unknown, version: number) => {
      let state = persistedState as Record<string, unknown>
      // 防御：persistedState 字段可能缺失或类型异常（localStorage 被污染/损坏），
// 一律降级为空数组，避免 .map/.filter 对非数组抛 TypeError 导致启动崩溃（2026-09-06 M5 加固）
        const arrOf = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v as Record<string, unknown>[] : []
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
        if (version <= 1) {
          // v1→v2: 水电燃气类型合并 + 押金类型识别
          // 注意：不能 return，必须继续执行后续迁移链（v2→v8）
          const bills = arrOf(state.bills).map(b => {
          let type = b.type as string
          if (type === 'water' || type === 'electric' || type === 'gas') {
            type = 'utilities'
          }
          if (type === 'other' && (b.description as string)?.includes('押金')) {
            type = 'deposit'
          }
          return { ...b, type }
        })
        state = { ...state, bills }
      }
      // v2→v3: 已退租租客的未付账单删除 + contractEnd 修正
      if (version <= 2) {
        const rawTenants = (state.tenants as Array<Record<string, unknown>> || [])
        const rawBills = (state.bills as Array<Record<string, unknown>> || [])
        const tenants = rawTenants.map(t => {
          if (String(t.status) !== 'ended') return t
          const refund = rawBills.find(b =>
            b.tenantId === t.id && Number(b.amount) < 0 && String(b.direction) === 'receivable' && String(b.description || '').includes('退租金')
          )
          if (!refund) return t
          const m = String(refund.description || '').match(/(\d{4}-\d{2}-\d{2})\s*~/)
          const actualEnd = m ? m[1] : String(refund.paidDate || refund.dueDate || '')
          if (!actualEnd || actualEnd >= String(t.contractEnd || '')) return t
          return { ...t, contractEnd: actualEnd }
        })
        // ⚠️ 只删除退租(checkout)租客的未付账单；续约(renew)租客的未付账单必须保留
        // （2026-09-03 用户确认：续约后旧合同未付账单依然有效，继续收款）。
        // v2 时代旧数据大多无 endReason：迁移只针对老数据，排除明确 renew 的即可。
        const endedIds = new Set(
          tenants.filter(t => String(t.status) === 'ended' && String(t.endReason) !== 'renew').map(t => String(t.id))
        )
        const bills = rawBills.filter(b =>
          !(endedIds.has(String(b.tenantId)) && String(b.status) === 'pending' && String(b.direction) === 'receivable')
        )
        state = { ...state, tenants, bills }
      }
      // v3→v4: 已退租租客的合同结束日改为退租前一天（退租日当天不占房）
      if (version <= 3) {
        const tenants = (state.tenants as Array<Record<string, unknown>> || []).map(t => {
          if (String(t.status) !== 'ended') return t
          const ce = String(t.contractEnd || '')
          if (!ce) return t
          const d = new Date(ce)
          d.setDate(d.getDate() - 1)
          const adjusted = d.toISOString().slice(0, 10)
          if (adjusted >= ce) return t
          return { ...t, contractEnd: adjusted }
        })
        state = { ...state, tenants }
      }
      // v4→v5: 给旧账单补 periodStart/periodEnd + 已退租租客补 effectiveEnd
      if (version <= 4) {
        const tenants = (state.tenants as Array<Record<string, unknown>> || []).map(t => {
          if (String(t.status) === 'ended' && !t.effectiveEnd) {
            let ee = String(t.contractEnd || '')
            if (ee) {
              const d = new Date(ee)
              d.setDate(d.getDate() + 1)
              ee = d.toISOString().slice(0, 10)
            }
            return { ...t, effectiveEnd: ee }
          }
          return t
        })
        const bills = (state.bills as Array<Record<string, unknown>> || []).map(b => {
          if (b.periodStart || b.periodEnd) return b
          const desc = String(b.description || '')
          const m = desc.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
          if (!m) return b
          return { ...b, periodStart: m[1], periodEnd: m[2] }
        })
        state = { ...state, tenants, bills }
      }
      // v5→v6: 原 status='paid' 的退款账单（amount<0）改为 status='refunded'
      if (version <= 5) {
        const bills = (state.bills as Array<Record<string, unknown>> || []).map(b => {
          if (b.status === 'paid' && Number(b.amount) < 0) {
            return { ...b, status: 'refunded' as const }
          }
          return b
        })
        state = { ...state, bills }
      }
      // v6→v7: 给旧应付账单回填 landlordContractId（按 propertyId + dueDate 落在合同日期范围内匹配）
      if (version <= 6) {
        const contracts = (state.landlordContracts as Array<Record<string, unknown>> || [])
        const bills = (state.bills as Array<Record<string, unknown>> || []).map(b => {
          if (b.direction !== 'payable' || b.landlordContractId) return b
          const c = contracts.find((c: Record<string, unknown>) =>
            String(c.propertyId) === String(b.propertyId) &&
            String(b.dueDate || '') >= String(c.contractStart || '') &&
            String(b.dueDate || '') <= String(c.contractEnd || '')
          )
          return c ? { ...b, landlordContractId: c.id } : b
        })
        state = { ...state, bills }
      }
      // v7→v8: 添加用户设置，默认 showPropertyBills（不覆盖已有值）
      if (version <= 7) {
        state = { ...state, settings: { showPropertyBills: true, ...(state.settings as Record<string, unknown> || {}) } }
      }
      return state as unknown as AppStore
    },
  })
)


