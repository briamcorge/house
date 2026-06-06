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
  type: 'rent' | 'water' | 'electric' | 'gas' | 'other'
  status: 'pending' | 'paid' | 'overdue'
  direction: BillDirection
  dueDate: string
  paidDate?: string
  description?: string
  createdAt: string
}

export interface LandlordContract {
  id: string
  propertyId: string
  landlordName?: string
  landlordPhone?: string
  monthlyRent: number
  paymentMethod: PaymentMethod
  contractStart: string
  contractEnd: string
  status: 'active' | 'ended'
  createdAt: string
}