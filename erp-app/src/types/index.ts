export type Role =
  | 'P1_CEO'
  | 'P2_ADMIN'
  | 'P3_KEY_ACCOUNT_MANAGER'   // KAM — reports to Sales Manager, manages KAEs
  | 'P4_REGIONAL_MANAGER'      // Divisional Manager
  | 'P5_SALES_MANAGER'
  | 'P6_KEY_ACCOUNT_ENGINEER'
  | 'P7_INSIDE_SALES_ENGINEER'
  | 'P8_ACCOUNTANT'
  | 'P9_HR'
  | 'P10_LOGISTICS_MANAGER'
  | 'P11_PURCHASE_MANAGER'
  | 'P12_WAREHOUSE_MANAGER'

export const ROLE_LABELS: Record<Role, string> = {
  P1_CEO:                    'CEO',
  P2_ADMIN:                  'Admin',
  P3_KEY_ACCOUNT_MANAGER:    'Key Account Manager',
  P4_REGIONAL_MANAGER:       'Divisional Manager',
  P5_SALES_MANAGER:          'Sales Manager',
  P6_KEY_ACCOUNT_ENGINEER:   'Key Account Engineer',
  P7_INSIDE_SALES_ENGINEER:  'Inside Sales Engineer',
  P8_ACCOUNTANT:             'Accountant',
  P9_HR:                     'HR',
  P10_LOGISTICS_MANAGER:     'Logistics Manager',
  P11_PURCHASE_MANAGER:      'Purchase Manager',
  P12_WAREHOUSE_MANAGER:     'Warehouse Manager',
}

// Approval workflow status for quotations
export type ApprovalStatus =
  | 'Draft'
  | 'PendingDivMgrReview'
  | 'PendingSmReview'
  | 'Approved'
  | 'Submitted'

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  Draft:                'Draft',
  PendingDivMgrReview:  'Div Mgr Review',
  PendingSmReview:      'SM Review',
  Approved:             'Approved',
  Submitted:            'Submitted',
}

export type FulfilmentType = 'Stock' | 'FactoryOrder'

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

export interface QuotationLineItem {
  id: string
  quotationId: string
  sNo: number
  itemType?: string        // 'item' | 'header'
  description: string      // item title
  specifications?: string  // detailed technical specs
  reference?: string
  make?: string
  qty: number
  unit?: string
  rate: number
  amount: number
  delivery?: string
}

export interface Quotation {
  id: string
  qtRef: string
  revisionNumber: number
  qtnDate: string
  customerName: string
  projectName: string
  amountSar: number
  discount: number
  status: QuotationStatus
  poNumber?: string
  kaeAssignedId?: string
  kaeAssigned?: { id: string; name: string }
  clientContactName?: string
  clientContactDetails?: string
  subject?: string
  rfqCode?: string
  application?: string
  poBox?: string
  paymentTerms?: string
  deliveryWeeks?: string
  validityDays?: number
  notes?: string
  remarks?: string
  approvalStatus?: ApprovalStatus
  approvalComments?: string // JSON stringified array
  submittedAt?: string
  lineItems?: QuotationLineItem[]
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
  fulfilmentType?: FulfilmentType
  remarks?: string
  createdAt: string
}

export interface Customer {
  id: string
  customerName: string
  assignedKaeId?: string
  assignedKae?: { id: string; name: string }
  assignedKamId?: string
  assignedKam?: { id: string; name: string }
  totalRfq: number
  totalConverted: number
  completionPct: number
  totalValueQuoted: number
  totalPoValue: number
  firstActivityDate?: string
  lastActivityDate?: string
  remarks?: string
  // CRM Profile
  status?: string
  industry?: string
  website?: string
  phone?: string
  email?: string
  primaryAddress?: string    // JSON string
  keyPersonnel?: string      // JSON string
  communicationPref?: string // JSON string
  leadSource?: string
  // Billing / Finance
  priceTier?: string
  discountRate?: number
  paymentTerms?: string
  creditLimit?: number
  creditBalance?: number
  taxId?: string
  taxExempt?: boolean
  currency?: string
  // Shipping / Logistics
  shippingAddresses?: string // JSON string
  defaultCarrier?: string
  carrierAccount?: string
  createdAt: string
  updatedAt: string
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

export type StockAvailability = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Reserved'

export interface MaterialItem {
  id: string
  productRef: string
  description: string        // item title
  specifications?: string    // detailed technical specifications
  stockAvailability: StockAvailability
  quantity: number
  reservedQty: number
  reservedForPO?: string
  orderToFactory: boolean
  remarks?: string
  createdAt: string
  updatedAt: string
}

export interface FilterState {
  dateFrom?: string
  dateTo?: string
  search?: string
  status?: string
  kaeId?: string
  customerId?: string
}
