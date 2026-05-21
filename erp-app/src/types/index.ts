export type Role =
  | 'P1_CEO'
  | 'P2_ADMIN'
  | 'P3_REGIONAL_MANAGER'
  | 'P4_SALES_MANAGER'
  | 'P5_KEY_ACCOUNT_ENGINEER'
  | 'P6_INSIDE_SALES_ENGINEER'
  | 'P7_ACCOUNTANT'
  | 'P8_HR'

export const ROLE_LABELS: Record<Role, string> = {
  P1_CEO: 'CEO',
  P2_ADMIN: 'Admin',
  P3_REGIONAL_MANAGER: 'Regional Manager',
  P4_SALES_MANAGER: 'Sales Manager',
  P5_KEY_ACCOUNT_ENGINEER: 'Key Account Engineer',
  P6_INSIDE_SALES_ENGINEER: 'Inside Sales Engineer',
  P7_ACCOUNTANT: 'Accountant',
  P8_HR: 'HR',
}

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  sessionId: string
}

export type QuotationStatus = 'Open' | 'Lost' | 'Converted' | 'OnHold'
export type PaymentStatus = 'Pending' | 'Paid' | 'Overdue' | 'PartiallyPaid'
export type MilestoneStatus = 'Pending' | 'Paid' | 'Overdue'
export type DocumentStatus = 'Active' | 'Expired' | 'ExpiringSoon'

export interface Quotation {
  id: string
  qtRef: string
  revisionNumber: number
  qtnDate: string
  customerName: string
  projectName: string
  amountSar: number
  status: QuotationStatus
  poNumber?: string
  kaeAssignedId?: string
  kaeAssigned?: { id: string; name: string }
  clientContactName?: string
  clientContactDetails?: string
  remarks?: string
  createdAt: string
  updatedAt: string
}

export interface POTracker {
  id: string
  customerName: string
  projectName: string
  kaeName?: string
  qtRef?: string
  poNumber: string
  poDate: string
  poAmountExVat: number
  vat15: number
  totalValueIncVat: number
  paymentTermsSplit?: string
  paymentCollectionPct: number
  paymentStatus: PaymentStatus
  remarks?: string
  createdAt: string
}

export interface Customer {
  id: string
  customerName: string
  assignedKaeId?: string
  assignedKae?: { id: string; name: string }
  totalRfq: number
  totalConverted: number
  completionPct: number
  totalValueQuoted: number
  totalPoValue: number
  firstActivityDate?: string
  lastActivityDate?: string
  remarks?: string
  createdAt: string
}

export interface PaymentMilestone {
  id: string
  paymentId: string
  phaseName: string
  percentage: number
  amountSar: number
  dueDate: string
  status: MilestoneStatus
  paidAt?: string
}

export interface Payment {
  id: string
  poNumber: string
  customerName: string
  kaeNameId?: string
  kaeName?: { id: string; name: string }
  poValue: number
  collectionPct: number
  remarks?: string
  milestones: PaymentMilestone[]
  createdAt: string
}

export interface Document {
  id: string
  documentName: string
  documentOwner: string
  category: string
  department: string
  issueDate: string
  expiryDate: string
  remainingDaysForExpiry: number
  status: DocumentStatus
  remarks?: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  createdAt: string
}

export interface FilterState {
  dateFrom?: string
  dateTo?: string
  search?: string
  status?: string
  kaeId?: string
  customerId?: string
}
