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

export type PaymentMethod = 'monthly' | 'quarterly' | 'semi-annual' | 'annual'

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
}

export type BillDirection = 'payable' | 'receivable'

export interface Bill {
  id: string
  propertyId?: string
  roomId?: string
  tenantId?: string
  amount: number
  paidAmount?: number
  type: 'rent' | 'water' | 'electric' | 'gas' | 'internet' | 'hygiene' | 'other'
  status: 'pending' | 'paid' | 'overdue'
  direction: BillDirection
  dueDate: string
  paidDate?: string
  description?: string
  createdAt: string
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