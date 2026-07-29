export interface Property {
  id: string
  address: string
  description?: string
  createdAt: string
}

export type RoomLabel = 'A' | 'B' | 'C' | 'D' | 'E'

export interface Room {
  id: string
  propertyId: string
  label: RoomLabel
  roomType: string
  status: 'vacant' | 'occupied'
  createdAt: string
}

export type PaymentMethod = 'monthly' | 'bi-monthly' | 'quarterly' | 'semi-annual' | 'annual'

export interface Tenant {
  id: string
  displayId: string
  name: string
  phone?: string
  roomId: string
  contractStart: string
  contractEnd: string
  monthlyRent: number
  paymentMethod: PaymentMethod
  advanceDays: number
  deposit?: number
  otherFeeName?: string
  otherFeeAmount?: number
  status: 'active' | 'ended'
  createdAt: string
  /** 续约时指向上一个租客 ID，用于追踪续约链 */
  previousTenantId?: string
  /** 实际退租日（退租时填入，不退租则为空），用于利润计算无需从退款账单反推 */
  effectiveEnd?: string
}

export type BillDirection = 'payable' | 'receivable'

export interface Bill {
  id: string
  propertyId?: string
  roomId?: string
  tenantId?: string
  amount: number
  paidAmount?: number
  type: 'rent' | 'deposit' | 'agency' | 'sublease' | 'hygiene' | 'internet' | 'utilities' | 'other'
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  direction: BillDirection
  dueDate: string
  paidDate?: string
  description?: string
  createdAt: string
  /** 账单覆盖起止日（替代从 description 正则提取），新建账单时自动填入 */
  periodStart?: string
  periodEnd?: string
}

export interface LandlordContract {
  id: string
  displayId: string
  propertyId: string
  landlordName?: string
  landlordPhone?: string
  monthlyRent: number
  paymentMethod: PaymentMethod
  deposit?: number
  contractStart: string
  contractEnd: string
  status: 'active' | 'ended'
  createdAt: string
}

export interface ProfitRecord {
  id: string
  propertyId: string
  cycleStart: string      // 业主周期开始
  cycleEnd: string        // 业主周期结束
  tenantIncome: number    // 该周期租客分摊收入
  landlordExpense: number // 该周期付业主金额
  profitAmount: number    // 利润 = tenantIncome - landlordExpense
  status: 'available' | 'withdrawn'
  extractedAt?: string   // 用户选择的提取日期
  withdrawnAt?: string
  isManual?: boolean
  remark?: string
  createdAt: string
}

export type TrashType = 'property' | 'room' | 'tenant' | 'landlord_contract' | 'bill'

export interface TrashItem {
  id: string
  type: TrashType
  originalId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  label: string
  deletedAt: string
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  action: 'create' | 'update' | 'delete' | 'payment' | 'import' | 'export' | 'restore' | 'clear' | 'checkout' | 'renew' | 'terminate'
  entity: string
  entityId?: string
  details: string
  createdAt: string
}