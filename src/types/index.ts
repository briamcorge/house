export interface Property {
  id: string
  address: string
  description?: string
  /** 户型：一居/两居/三居/开间 等（房源级，整租房直接使用） */
  houseType?: string
  /** 面积（平方米） */
  area?: number
  createdAt: string
}

export type RoomLabel = 'A' | 'B' | 'C' | 'D' | 'E' | '整租'

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
  /** 账单切分方式：front=先整后零（默认），rear=先零后整 */
  billSplit?: 'front' | 'rear'
  deposit?: number
  otherFeeName?: string
  otherFeeAmount?: number
  status: 'active' | 'ended'
  createdAt: string
  /** 续约时指向上一个租客 ID，用于追踪续约链 */
  previousTenantId?: string
  /** 实际退租日（退租时填入，不退租则为空），用于利润计算无需从退款账单反推 */
  effectiveEnd?: string
  /** 结束原因：checkout=手动退租，renew=续约被替代。用于 UI 区分"已退租"与"已续约" */
  endReason?: 'checkout' | 'renew'
  /** 退租时被删除的未付账单暂存（恢复租客时找回），仅退租的租客可能有 */
  pendingBills?: Bill[]
}

export type BillDirection = 'payable' | 'receivable'

export interface Bill {
  id: string
  propertyId?: string
  roomId?: string
  tenantId?: string
  /** 关联业主合同 ID（应付账单归属的具体合同，替代按日期范围猜测） */
  landlordContractId?: string
  amount: number
  paidAmount?: number
  type: 'rent' | 'deposit' | 'agency' | 'sublease' | 'hygiene' | 'internet' | 'utilities' | 'other'
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'
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
  /** 结束原因：checkout=手动退租，renew=续约被替代。用于 UI 区分"已结束"与"已续约" */
  endReason?: 'checkout' | 'renew'
  /** 续约时指向上一个业主合同 ID，用于追踪续约链 */
  previousContractId?: string
  /** 退租时被删除的未付账单暂存（恢复合同时找回），仅已退租的合同可能有 */
  pendingBills?: Bill[]
  /**
   * 免租期（空置期）：业主给二房东的免租天数，只影响应付业主的租金，与实际空置统计无关
   * - number：每年统一（如 30）
   * - number[]：按合同年度分别设定，[第1年, 第2年, 第3年...]（如 [30, 15, 30]）
   * - undefined：无免租期
   */
  vacancyAllowance?: number | number[]
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