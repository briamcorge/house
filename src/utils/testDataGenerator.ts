import { Property, Room, Tenant, Bill, LandlordContract, ProfitRecord, TrashItem, PaymentMethod, RoomLabel, BillDirection } from '../types'
import { generateRentBills } from './calculator'

// ============================================================
// 测试数据生成器
// 使用 useStore.setState() 原子注入，不触发云同步
// ============================================================

function createId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============================================================
// 测试数据定义
// ============================================================

const PROPERTIES: Property[] = [
  { id: 'test-prop-1', address: '阳光花园', description: '测试用房源 — 3间房', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'test-prop-2', address: '翠湖苑', description: '测试用房源 — 2间房', createdAt: '2025-01-01T00:00:00.000Z' },
]

const ROOMS: Room[] = [
  // 阳光花园
  { id: 'test-room-101', propertyId: 'test-prop-1', label: 'A' as RoomLabel, roomType: '1室1厅1卫', status: 'vacant', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'test-room-102', propertyId: 'test-prop-1', label: 'B' as RoomLabel, roomType: '2室1厅1卫·70㎡', status: 'occupied', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'test-room-103', propertyId: 'test-prop-1', label: 'C' as RoomLabel, roomType: '1室1厅1卫·55㎡', status: 'occupied', createdAt: '2025-01-01T00:00:00.000Z' },
  // 翠湖苑
  { id: 'test-room-201', propertyId: 'test-prop-2', label: 'A' as RoomLabel, roomType: '2室1厅1卫·68㎡', status: 'occupied', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'test-room-202', propertyId: 'test-prop-2', label: 'B' as RoomLabel, roomType: '1室1厅1卫·45㎡', status: 'vacant', createdAt: '2025-06-01T00:00:00.000Z' },
]

const TENANTS: Tenant[] = [
  // 张三 — 月付 + 押金 + 卫生费
  {
    id: 'test-tenant-001', displayId: 'ZL-0001', name: '张三', phone: '13800001001',
    roomId: 'test-room-102', contractStart: '2025-01-01', contractEnd: '2026-12-31',
    monthlyRent: 3000, paymentMethod: 'monthly' as PaymentMethod, advanceDays: 3,
    deposit: 3000, otherFeeName: '卫生费', otherFeeAmount: 50, status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  // 李四 — 年付 + 押金（无其他费用）
  {
    id: 'test-tenant-002', displayId: 'ZL-0002', name: '李四', phone: '13800001002',
    roomId: 'test-room-103', contractStart: '2025-01-01', contractEnd: '2026-12-31',
    monthlyRent: 2200, paymentMethod: 'annual' as PaymentMethod, advanceDays: 5,
    deposit: 4000, status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  // 王五 — 季付（无押金）
  {
    id: 'test-tenant-003', displayId: 'ZL-0003', name: '王五', phone: '13800001003',
    roomId: 'test-room-201', contractStart: '2025-03-01', contractEnd: '2026-12-31',
    monthlyRent: 2800, paymentMethod: 'quarterly' as PaymentMethod, advanceDays: 3,
    status: 'active',
    createdAt: '2025-03-01T00:00:00.000Z',
  },
  // 赵六 — 半年付 + 押金（已退租）
  {
    id: 'test-tenant-004', displayId: 'ZL-0004', name: '赵六', phone: '13800001004',
    roomId: 'test-room-202', contractStart: '2025-06-01', contractEnd: '2026-05-31',
    monthlyRent: 1800, paymentMethod: 'semi-annual' as PaymentMethod, advanceDays: 3,
    deposit: 2000, status: 'ended',
    createdAt: '2025-06-01T00:00:00.000Z',
  },
]

const LANDLORD_CONTRACTS: LandlordContract[] = [
  {
    id: 'test-landlord-001', displayId: 'DL-0001',
    propertyId: 'test-prop-1', landlordName: '刘先生', landlordPhone: '13900001001',
    monthlyRent: 4500, paymentMethod: 'monthly' as PaymentMethod,
    contractStart: '2025-01-01', contractEnd: '2026-12-31', deposit: 10000,
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'test-landlord-002', displayId: 'DL-0002',
    propertyId: 'test-prop-2', landlordName: '陈女士', landlordPhone: '13900001002',
    monthlyRent: 3500, paymentMethod: 'monthly' as PaymentMethod,
    contractStart: '2025-03-01', contractEnd: '2026-12-31',
    status: 'active',
    createdAt: '2025-03-01T00:00:00.000Z',
  },
]

// ============================================================
// 账单生成
// ============================================================

const NOW = new Date('2026-06-18')

/** 判断账单是否已逾期 */
function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < NOW
}

/** 生成租客的所有账单（含押金 + 房租 + 其他费用） */
function generateTenantBills(tenant: typeof TENANTS[number]): Bill[] {
  const bills: Bill[] = []
  const pd = (d: string) => { const p = new Date(d); p.setDate(p.getDate() + 2); return fmtDate(p) }

  // 1. 押金账单（如适用）
  if (tenant.deposit && tenant.deposit > 0) {
    const depositDue = tenant.contractStart
    bills.push({
      id: createId(),
      propertyId: ROOMS.find(r => r.id === tenant.roomId)?.propertyId || '',
      roomId: tenant.roomId,
      tenantId: tenant.id,
      amount: tenant.deposit,
      type: 'other',
      status: 'paid',
      direction: 'receivable',
      dueDate: depositDue,
      paidDate: pd(depositDue),
      description: '押金',
      createdAt: tenant.createdAt,
    })
  }

  // 2. 租房账单
  const draftBills = generateRentBills(
    tenant.monthlyRent,
    tenant.contractStart,
    tenant.contractEnd,
    tenant.paymentMethod,
    tenant.advanceDays,
  )

  // 计算哪些已付、哪些待付、哪些逾期
  // 已付：到目前已经过去足够多期的账单（前 60% 的期数标记为已付）
  const totalPeriods = draftBills.length
  const paidPeriods = Math.max(0, Math.floor(totalPeriods * 0.55)) // 约55%的账单已付

  draftBills.forEach((db, i) => {
    const isPaid = i < paidPeriods
    const pastDue = isOverdue(db.dueDate)
    bills.push({
      id: createId(),
      propertyId: ROOMS.find(r => r.id === tenant.roomId)?.propertyId || '',
      roomId: tenant.roomId,
      tenantId: tenant.id,
      amount: db.amount,
      type: 'rent',
      status: isPaid ? 'paid' : pastDue ? 'overdue' : 'pending',
      direction: 'receivable',
      dueDate: db.dueDate,
      paidDate: isPaid ? pd(db.dueDate) : undefined,
      description: db.description,
      createdAt: tenant.createdAt,
    })
  })

  // 3. 其他费用账单（如适用）
  if (tenant.otherFeeName && tenant.otherFeeAmount) {
    // 为每个房租账单生成对应的其他费用账单
    draftBills.forEach((db, i) => {
      const isPaid = i < paidPeriods
      const pastDue = isOverdue(db.dueDate)
      bills.push({
        id: createId(),
        propertyId: ROOMS.find(r => r.id === tenant.roomId)?.propertyId || '',
        roomId: tenant.roomId,
        tenantId: tenant.id,
        amount: tenant.otherFeeAmount!,
        type: 'other',
        status: isPaid ? 'paid' : pastDue ? 'overdue' : 'pending',
        direction: 'receivable',
        dueDate: db.dueDate,
        paidDate: isPaid ? pd(db.dueDate) : undefined,
        description: `第${i + 1}期 ${tenant.otherFeeName} ${db.periodStart} ~ ${db.periodEnd}`,
        createdAt: tenant.createdAt,
      })
    })
  }

  // 4. 退租租客的押金退还账单（负数）
  if (tenant.status === 'ended' && tenant.deposit && tenant.deposit > 0) {
    bills.push({
      id: createId(),
      propertyId: ROOMS.find(r => r.id === tenant.roomId)?.propertyId || '',
      roomId: tenant.roomId,
      tenantId: tenant.id,
      amount: -tenant.deposit,
      type: 'other',
      status: 'paid',
      direction: 'receivable',
      dueDate: tenant.contractEnd,
      paidDate: tenant.contractEnd,
      description: '押金',
      createdAt: tenant.createdAt,
    })
  }

  return bills
}

/** 生成业主合同的可付账单 */
function generateLandlordBills(contract: typeof LANDLORD_CONTRACTS[number]): Bill[] {
  const draftBills = generateRentBills(
    contract.monthlyRent,
    contract.contractStart,
    contract.contractEnd,
    contract.paymentMethod,
    0, // 业主合同 advanceDays = 0
  )

  const pd = (d: string) => { const p = new Date(d); p.setDate(p.getDate() + 2); return fmtDate(p) }
  const totalPeriods = draftBills.length
  const paidPeriods = Math.max(0, Math.floor(totalPeriods * 0.55))

  return draftBills.map((db, i) => {
    const isPaid = i < paidPeriods
    const pastDue = isOverdue(db.dueDate)
    return {
      id: createId(),
      propertyId: contract.propertyId,
      amount: db.amount,
      type: 'rent' as const,
      status: isPaid ? ('paid' as const) : pastDue ? ('overdue' as const) : ('pending' as const),
      direction: 'payable' as BillDirection,
      dueDate: db.dueDate,
      paidDate: isPaid ? pd(db.dueDate) : undefined,
      description: `第${i + 1}期 月租 ${db.periodStart} ~ ${db.periodEnd}`,
      createdAt: contract.createdAt,
    }
  })
}

// ============================================================
// 利润记录
// ============================================================

const PROFIT_RECORDS: ProfitRecord[] = [
  {
    id: createId(), propertyId: 'test-prop-1',
    cycleStart: '2025-01-01', cycleEnd: '2025-12-31',
    tenantIncome: 62400, landlordExpense: 54000,
    profitAmount: 8400, status: 'available', isManual: true,
    remark: '测试数据 — 阳光花园 2025年度利润', createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: createId(), propertyId: 'test-prop-2',
    cycleStart: '2025-03-01', cycleEnd: '2025-12-31',
    tenantIncome: 25200, landlordExpense: 35000,
    // 亏损示例：租客收入 < 房东支出（只有3到12月，租客周期短）
    profitAmount: 0, status: 'available', isManual: true,
    remark: '测试数据 — 翠湖苑 2025年度利润', createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: createId(), propertyId: 'test-prop-1',
    cycleStart: '2025-06-01', cycleEnd: '2025-08-30',
    tenantIncome: 10000, landlordExpense: 4500,
    profitAmount: 5500, status: 'withdrawn', isManual: true,
    withdrawnAt: '2025-09-01', remark: '测试数据 — 已提取利润', createdAt: '2025-09-01T00:00:00.000Z',
  },
]

// ============================================================
// 回收站数据
// ============================================================

const TRASH: TrashItem[] = [
  // 已删除房间
  {
    id: createId(), type: 'room', originalId: 'test-room-104',
    data: { id: 'test-room-104', propertyId: 'test-prop-1', label: 'D', roomType: '2室2厅1卫·80㎡', status: 'vacant', createdAt: '2025-01-01T00:00:00.000Z' },
    label: 'D室', deletedAt: '2026-05-30',
  },
  // 已删除租客
  {
    id: createId(), type: 'tenant', originalId: 'test-tenant-005',
    data: {
      id: 'test-tenant-005', displayId: 'ZL-0005', name: '陈七', phone: '13800001005',
      roomId: 'test-room-104', contractStart: '2025-04-01', contractEnd: '2026-06-30',
      monthlyRent: 3500, paymentMethod: 'monthly' as PaymentMethod, advanceDays: 3,
      status: 'ended' as const, createdAt: '2025-04-01T00:00:00.000Z',
    },
    label: '陈七', deletedAt: '2026-05-30',
  },
  // 连带删除的账单
  {
    id: createId(), type: 'bill', originalId: 'test-bill-deleted-01',
    data: { id: 'test-bill-deleted-01', propertyId: 'test-prop-1', roomId: 'test-room-104', tenantId: 'test-tenant-005', amount: 3500, type: 'rent', status: 'pending', direction: 'receivable', dueDate: '2026-05-01', description: '第6期 月租 2026-05-01 ~ 2026-05-30', createdAt: '2025-04-01T00:00:00.000Z' },
    label: '¥3500', deletedAt: '2026-05-30',
  },
  {
    id: createId(), type: 'bill', originalId: 'test-bill-deleted-02',
    data: { id: 'test-bill-deleted-02', propertyId: 'test-prop-1', roomId: 'test-room-104', tenantId: 'test-tenant-005', amount: 3500, type: 'rent', status: 'pending', direction: 'receivable', dueDate: '2026-06-01', description: '第7期 月租 2026-06-01 ~ 2026-06-30', createdAt: '2025-04-01T00:00:00.000Z' },
    label: '¥3500', deletedAt: '2026-05-30',
  },
]

// ============================================================
// 验证报告
// ============================================================

export interface VerificationItem {
  category: string
  name: string
  passed: boolean
  actual: string
  expected: string
}

export interface VerificationReport {
  passed: number
  total: number
  items: VerificationItem[]
}

export function verifyTestData(state: {
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]
  profitRecords: ProfitRecord[]
  trash: TrashItem[]
}): VerificationReport {
  const items: VerificationItem[] = []
  let passed = 0
  let total = 0

  const check = (
    category: string,
    name: string,
    cond: boolean,
    actual: string,
    expected: string,
  ) => {
    total++
    if (cond) passed++
    items.push({ category, name, passed: cond, actual, expected })
  }

  // ---- 实体数量 ----
  check('实体数量', '房源数量', state.properties.length === 2, `${state.properties.length}`, '2')
  check('实体数量', '房间数量（不含回收站）', state.rooms.length === 5, `${state.rooms.length}`, '5')
  check('实体数量', '已租房间', state.rooms.filter(r => r.status === 'occupied').length === 3, `${state.rooms.filter(r => r.status === 'occupied').length}`, '3')
  check('实体数量', '空置房间', state.rooms.filter(r => r.status === 'vacant').length === 2, `${state.rooms.filter(r => r.status === 'vacant').length}`, '2')
  check('实体数量', '租客数量', state.tenants.length === 4, `${state.tenants.length}`, '4')
  check('实体数量', '活跃租客', state.tenants.filter(t => t.status === 'active').length === 3, `${state.tenants.filter(t => t.status === 'active').length}`, '3')
  check('实体数量', '已退租租客', state.tenants.filter(t => t.status === 'ended').length === 1, `${state.tenants.filter(t => t.status === 'ended').length}`, '1')
  check('实体数量', '业主合同', state.landlordContracts.length === 2, `${state.landlordContracts.length}`, '2')
  check('实体数量', '利润记录', state.profitRecords.length === 3, `${state.profitRecords.length}`, '3')

  // ---- 账单验证 ----
  check('账单', '应收账单（租客）数量 > 0', state.bills.filter(b => b.direction === 'receivable').length > 0, `${state.bills.filter(b => b.direction === 'receivable').length}`, '> 0')
  check('账单', '应付账单（业主）数量 > 0', state.bills.filter(b => b.direction === 'payable').length > 0, `${state.bills.filter(b => b.direction === 'payable').length}`, '> 0')
  check('账单', '已付账单数量 > 0', state.bills.filter(b => b.status === 'paid').length > 0, `${state.bills.filter(b => b.status === 'paid').length}`, '> 0')
  check('账单', '待付账单数量 > 0', state.bills.filter(b => b.status === 'pending').length > 0, `${state.bills.filter(b => b.status === 'pending').length}`, '> 0')
  check('账单', '逾期账单数量 > 0', state.bills.filter(b => b.status === 'overdue').length > 0, `${state.bills.filter(b => b.status === 'overdue').length}`, '> 0')
  check('账单', '押金账单存在', state.bills.filter(b => b.description === '押金').length >= 3, `${state.bills.filter(b => b.description === '押金').length}`, '≥ 3')
  check('账单', '押金退还（负数）存在', state.bills.filter(b => b.description === '押金' && b.amount < 0).length === 1, `${state.bills.filter(b => b.description === '押金' && b.amount < 0).length}`, '1')
  check('账单', '卫生费账单存在', state.bills.filter(b => b.description?.includes('卫生费')).length > 0, `${state.bills.filter(b => b.description?.includes('卫生费')).length}`, '> 0')

  // ---- 外键完整性 ----
  const propertyIds = new Set(state.properties.map(p => p.id))
  const roomIds = new Set(state.rooms.map(r => r.id))
  const tenantIds = new Set(state.tenants.map(t => t.id))

  let badRoomLinks = 0
  let badTenantLinks = 0
  let badBillLinks = 0
  for (const r of state.rooms) { if (!propertyIds.has(r.propertyId)) badRoomLinks++ }
  for (const t of state.tenants) { if (!roomIds.has(t.roomId)) badTenantLinks++ }
  for (const b of state.bills) {
    if (b.propertyId && !propertyIds.has(b.propertyId)) badBillLinks++
    if (b.roomId && !roomIds.has(b.roomId)) badBillLinks++
    if (b.direction === 'receivable' && b.tenantId && !tenantIds.has(b.tenantId)) badBillLinks++
  }

  check('数据完整性', '房间外键有效', badRoomLinks === 0, `无效: ${badRoomLinks}`, '0')
  check('数据完整性', '租客房外键有效', badTenantLinks === 0, `无效: ${badTenantLinks}`, '0')
  check('数据完整性', '账单外键有效', badBillLinks === 0, `无效: ${badBillLinks}`, '0')

  // ---- 付款方式多样性 ----
  const methods = new Set(state.tenants.map(t => t.paymentMethod))
  check('业务覆盖', '月付租客', methods.has('monthly'), methods.has('monthly') ? '有' : '无', '有')
  check('业务覆盖', '季付租客', methods.has('quarterly'), methods.has('quarterly') ? '有' : '无', '有')
  check('业务覆盖', '半年付租客', methods.has('semi-annual'), methods.has('semi-annual') ? '有' : '无', '有')
  check('业务覆盖', '年付租客', methods.has('annual'), methods.has('annual') ? '有' : '无', '有')
  check('业务覆盖', '有押金租客', state.tenants.filter(t => (t.deposit ?? 0) > 0).length >= 2, `${state.tenants.filter(t => (t.deposit ?? 0) > 0).length}`, '≥ 2')
  check('业务覆盖', '无押金租客', state.tenants.filter(t => !t.deposit).length >= 1, `${state.tenants.filter(t => !t.deposit).length}`, '≥ 1')

  // ---- 回收站 ----
  check('回收站', '已删除房间数量', state.trash.filter(t => t.type === 'room').length >= 1, `${state.trash.filter(t => t.type === 'room').length}`, '≥ 1')
  check('回收站', '已删除租客数量', state.trash.filter(t => t.type === 'tenant').length >= 1, `${state.trash.filter(t => t.type === 'tenant').length}`, '≥ 1')
  check('回收站', '已删除账单数量', state.trash.filter(t => t.type === 'bill').length >= 1, `${state.trash.filter(t => t.type === 'bill').length}`, '≥ 1')

  // ---- 业主合同 ----
  check('业主合同', '活跃业主合同数', state.landlordContracts.filter(c => c.status === 'active').length === 2, `${state.landlordContracts.filter(c => c.status === 'active').length}`, '2')
  check('业主合同', '押金合同数', state.landlordContracts.filter(c => (c.deposit ?? 0) > 0).length >= 1, `${state.landlordContracts.filter(c => (c.deposit ?? 0) > 0).length}`, '≥ 1')

  return {
    items,
    passed,
    total,
  }
}

// ============================================================
// 汇总信息（用于显示统计）
// ============================================================

export function getTestDataSummary(state: {
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]
  profitRecords: ProfitRecord[]
  trash: TrashItem[]
}): string[] {
  const lines: string[] = []
  lines.push(`🏠 房源: ${state.properties.length} 套 (${state.properties.map(p => p.address).join('、')})`)
  lines.push(`🚪 房间: ${state.rooms.length} 间 (已租 ${state.rooms.filter(r => r.status === 'occupied').length}, 空置 ${state.rooms.filter(r => r.status === 'vacant').length})`)
  lines.push(`👤 租客: ${state.tenants.length} 人 (在租 ${state.tenants.filter(t => t.status === 'active').length}, 已退租 ${state.tenants.filter(t => t.status === 'ended').length})`)
  const rentBills = state.bills.filter(b => b.direction === 'receivable')
  const payBills = state.bills.filter(b => b.direction === 'payable')
  lines.push(`💰 账单: 应收 ${rentBills.length} 条 (已收 ${rentBills.filter(b => b.status === 'paid').length}) | 应付 ${payBills.length} 条`)
  lines.push(`📄 业主合同: ${state.landlordContracts.length} 份`)
  lines.push(`📊 利润记录: ${state.profitRecords.length} 条`)
  lines.push(`🗑️ 回收站: ${state.trash.length} 项`)
  // 押金余额
  const depositBalance = state.bills
    .filter(b => b.description?.includes('押金') && b.status === 'paid')
    .reduce((s, b) => s + Number(b.amount), 0)
  lines.push(`💳 押金余额: ¥${depositBalance.toFixed(2)}`)
  return lines
}

// ============================================================
// 生成完整测试状态
// ============================================================

export function generateTestData(): {
  properties: Property[]
  rooms: Room[]
  tenants: Tenant[]
  bills: Bill[]
  landlordContracts: LandlordContract[]
  profitRecords: ProfitRecord[]
  trash: TrashItem[]
  auditLogs: { id: string; timestamp: string; action: string; entity: string; entityId: string; details: string; createdAt: string }[]
} {
  // 生成所有租客账单
  const tenantBills: Bill[] = []
  for (const tenant of TENANTS) {
    tenantBills.push(...generateTenantBills(tenant))
  }

  // 生成所有业主可付账单
  const landlordBills: Bill[] = []
  for (const contract of LANDLORD_CONTRACTS) {
    landlordBills.push(...generateLandlordBills(contract))
  }

  // 合并利润记录（确保 unique IDs）
  const profitRecords = PROFIT_RECORDS.map(r => ({ ...r, id: createId() }))

  // 合并回收站（确保 unique IDs）
  const trash = TRASH.map(t => ({ ...t, id: createId() }))

  return {
    properties: PROPERTIES,
    rooms: ROOMS,
    tenants: TENANTS,
    bills: [...tenantBills, ...landlordBills],
    landlordContracts: LANDLORD_CONTRACTS,
    profitRecords,
    trash,
    auditLogs: [],
  }
}
