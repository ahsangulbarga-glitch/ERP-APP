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

// Approval workflow status (shared across quotations and other workflows)
export type ApprovalStatus =
  | 'Draft'
  | 'PendingApproval'
  | 'Approved'
  | 'Submitted'
  | 'Rejected'

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  Draft:           'Draft',
  PendingApproval: 'Pending Review',
  Approved:        'Approved',
  Submitted:       'Submitted',
  Rejected:        'Rejected',
}

export type FulfilmentType = 'Stock' | 'FactoryOrder' | 'Split'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  sessionId: string
  tenantId: string          // always present for tenant users
  tenantSlug: string        // e.g. "syed-contracting"
  isSuperAdmin?: boolean    // true only for platform super-admins
}

// ── Tenant ────────────────────────────────────────────────────────────────────
export type TenantPlan   = 'trial' | 'starter' | 'business' | 'enterprise'
export type TenantStatus = 'active' | 'suspended' | 'cancelled'

export interface Tenant {
  id:           string
  name:         string
  slug:         string
  customDomain?: string
  plan:         TenantPlan
  status:       TenantStatus
  trialEndsAt?: string
  maxUsers:     number
  createdAt:    string
  updatedAt:    string
  // computed
  userCount?:   number
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
  discountPct?: number
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
  discountType?: string   // 'SAR' | 'PCT'
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
  termsOfDelivery?: string
  warranty?: string
  tpiNote?: string
  pricesNote?: string
  notes?: string
  remarks?: string
  approvalStatus?: ApprovalStatus
  approvalStep?: number
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

export interface LinkedSupplierPO {
  poId: string
  poNumber: string
  supplierName: string
  status: SupplierPOStatus
  expectedDate?: string | null
  qtyOrdered: number
  unit?: string
  description: string
}

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
  activePOs?: LinkedSupplierPO[]  // active Supplier POs linked to this material
}

export type SupplierPOStatus  = 'Draft' | 'Sent' | 'Acknowledged' | 'PartialDelivery' | 'Delivered' | 'Cancelled'
export type DeliveryStatus    = 'Pending' | 'InTransit' | 'Customs' | 'Arrived' | 'Delivered' | 'Delayed'

export interface SupplierPOItem {
  id: string
  supplierPOId: string
  sNo: number
  description: string          // Title / short summary
  specifications?: string      // Detailed technical specs (multi-line)
  productRef?: string
  qty: number                  // total demand
  unit?: string
  unitPrice: number
  amount: number               // supplier-side spend only
  qtyFromStock?: number        // portion reserved from inventory (default 0)
  materialItemId?: string | null
}

export interface SupplierPO {
  id: string
  poNumber: string
  supplierName: string
  supplierContact?: string
  supplierEmail?: string
  customerPORef?: string
  qtRef?: string
  status: SupplierPOStatus
  expectedDate?: string
  actualDate?: string
  totalAmount: number
  currency: string
  paymentTerms?: string
  remarks?: string
  approvalStatus?: string   // Draft | Pending | Approved | Rejected
  approvalStep?: number
  approvalHistory?: string  // JSON array
  approvedBy?: string
  approvedAt?: string
  rejectionNote?: string
  lineItems?: SupplierPOItem[]
  deliveries?: Delivery[]
  createdAt: string
  updatedAt: string
}

export interface DeliveryItem {
  id: string
  deliveryId: string
  sNo: number
  description: string
  productRef?: string
  qty: number
  unit?: string
}

export interface Delivery {
  id: string
  deliveryRef: string
  supplierPOId?: string
  customerPORef?: string
  supplierName: string
  carrier?: string
  trackingNumber?: string
  origin?: string
  destination?: string
  estimatedDate?: string
  actualDate?: string
  status: DeliveryStatus
  remarks?: string
  approvalStatus?: string   // Draft | Pending | Approved | Rejected
  approvalStep?: number
  approvalHistory?: string  // JSON array
  approvedBy?: string
  approvedAt?: string
  rejectionNote?: string
  items?: DeliveryItem[]
  createdAt: string
  updatedAt: string
}

export type NotificationType     = 'APPROVAL' | 'PAYMENT' | 'DOCUMENT' | 'INVOICE' | 'SYSTEM'
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface AppNotification {
  id: string
  userId: string
  title: string
  body: string
  type: NotificationType
  priority: NotificationPriority
  isRead: boolean
  link?: string
  entityId?: string
  createdAt: string
  readAt?: string
}

export interface NotificationSetting {
  id: string
  userId: string
  emailEnabled: boolean
  whatsappEnabled: boolean
  inAppEnabled: boolean
  onApproval: boolean
  onPaymentDue: boolean
  onDocExpiry: boolean
  onInvoiceIssued: boolean
  onNewRfq: boolean
}

export type InvoiceType   = 'TAX' | 'CREDIT' | 'DEBIT' | 'PROFORMA'
export type InvoiceStatus = 'Draft' | 'Issued' | 'Paid' | 'Cancelled' | 'Void'

export interface InvoiceLineItem {
  id: string
  invoiceId: string
  sNo: number
  description: string
  qty: number
  unit?: string
  unitPrice: number
  amount: number
  vatRate: number
  vatAmount: number
  total: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  invoiceType: InvoiceType
  invoiceDate: string
  supplyDate?: string
  customerName: string
  customerVatNo?: string
  customerAddress?: string
  poNumber?: string
  qtRef?: string
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  status: InvoiceStatus
  referenceInvoiceId?: string
  remarks?: string
  approvalStatus?: string   // Draft | Pending | Approved | Rejected
  approvalStep?: number
  approvalHistory?: string  // JSON array
  approvedBy?: string
  approvedAt?: string
  rejectionNote?: string
  lineItems?: InvoiceLineItem[]
  createdAt: string
  updatedAt: string
}

// ── HR ──────────────────────────────────────────────────────────────────────
export type EmployeeStatus   = 'Active' | 'Inactive' | 'OnLeave' | 'Terminated'
export type ContractType     = 'Permanent' | 'Contract' | 'PartTime'
export type LeaveType        = 'Annual' | 'Sick' | 'Emergency' | 'Unpaid' | 'Maternity' | 'Paternity'
export type LeaveStatus      = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
export type AnnouncementPriority = 'Normal' | 'Important' | 'Urgent'

export interface Employee {
  id: string
  employeeId: string
  name: string
  email?: string
  phone?: string
  department: string
  jobTitle: string
  nationality?: string
  joinDate?: string
  status: EmployeeStatus
  contractType: ContractType
  reportingTo?: string
  salary?: number
  emergencyContact?: string
  remarks?: string
  leaveRequests?: LeaveRequest[]
  createdAt: string
  updatedAt: string
}

export interface LeaveRequest {
  id: string
  employeeId: string
  employee?: { id: string; name: string; employeeId: string; department: string }
  leaveType: LeaveType
  fromDate: string
  toDate: string
  days: number
  reason?: string
  status: LeaveStatus
  approvalStep?: number
  approvalHistory?: string  // JSON array
  approvedBy?: string
  approvedAt?: string
  rejectionNote?: string
  remarks?: string
  createdAt: string
  updatedAt: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  category: string
  priority: AnnouncementPriority
  publishedAt: string
  expiresAt?: string
  isActive: boolean
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// ── Sales Targets ────────────────────────────────────────────────────────────
export type TargetPeriod = 'monthly' | 'quarterly' | 'yearly'
export type TargetType   = 'revenue' | 'quotes' | 'conversions'

export interface SalesTarget {
  id: string
  userId: string
  userName: string
  year: number
  period: TargetPeriod
  month?: number | null
  quarter?: number | null
  targetType: TargetType
  targetValue: number
  createdAt: string
  updatedAt: string
  // computed by API
  actual?: number
  achievement?: number  // %
}


// ── Settings ──────────────────────────────────────────────────────────────────
export interface CompanySetting {
  id: string
  companyName: string
  crNumber?: string
  vatNumber?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  defaultVatRate: number
  currency: string
  currencySymbol?: string
  workingDays: string
  // Tax & Region
  country?: string
  taxName?: string
  taxNumberLabel?: string
  // Branding
  logoDataUrl?: string
  updatedAt: string
  updatedBy?: string
}

export interface PublicHoliday {
  id: string
  date: string
  name: string
  createdAt: string
}

// ── Commission ────────────────────────────────────────────────────────────────
export interface CommissionRule {
  id: string
  userId: string
  userName: string
  rate: number
  minAmount: number
  isActive: boolean
  notes?: string
  createdAt: string
  updatedAt: string
  // computed
  ytdGross?: number
  ytdCommission?: number
}

export interface CommissionPayout {
  id: string
  userId: string
  userName: string
  period: string
  grossAmount: number
  commissionAmt: number
  status: 'Pending' | 'Approved' | 'Paid'
  approvedBy?: string
  approvedAt?: string
  paidAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface CommissionEntry {
  userId: string
  userName: string
  period: string
  grossAmount: number
  commissionAmt: number
  rate: number
  dealCount: number
  payoutStatus?: string
  payoutId?: string
}

// ── Sales Orders ─────────────────────────────────────────────────────────────
export type SOStatus = 'Draft' | 'Confirmed' | 'Processing' | 'Dispatched' | 'Delivered' | 'Cancelled'

export interface SalesOrderItem {
  id:           string
  salesOrderId: string
  sNo:          number
  description:  string          // Title / short summary
  specifications?: string       // Detailed technical specs (multi-line)
  reference?:   string
  make?:        string
  qty:          number
  unit?:        string
  unitPrice:    number
  amount:       number
  delivery?:    string
}

export interface SalesOrder {
  id:             string
  soNumber:       string
  soDate:         string
  customerName:   string
  poNumber?:      string
  qtRef?:         string
  deliveryDate?:  string
  paymentTerms?:  string
  deliveryTerms?: string
  notes?:         string
  remarks?:       string
  status:         SOStatus
  subtotal:       number
  vatRate:        number
  vatAmount:      number
  total:          number
  approvalStatus?: string
  approvalStep?:   number
  approvalHistory?: string
  approvedBy?:     string
  approvedAt?:     string
  rejectionNote?:  string
  // Customer PO + supporting docs
  customerPOFile?:     string       // JSON: {name, type, size, data}
  customerPOFileName?: string
  attachments?:        string       // JSON array of {name, type, size, data}
  procurementTriggered?: boolean
  procurementPoNumber?:  string
  createdBy?:      string
  lineItems?:      SalesOrderItem[]
  createdAt:       string
  updatedAt:       string
}

// ── Expenses ──────────────────────────────────────────────────────────────────
export type ExpenseCategory = 'Travel' | 'Accommodation' | 'Meals' | 'Equipment' | 'Communication' | 'Other'
export type ExpenseStatus   = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Paid'

export interface ExpenseClaim {
  id: string
  claimNumber: string
  submittedBy: string
  submitterName: string
  category: ExpenseCategory
  description: string
  amount: number
  expenseDate: string
  receiptRef?: string
  projectRef?: string
  status: ExpenseStatus
  approvalStep?: number
  approvalHistory?: string   // JSON: [{step,role,label,approverName,approvedAt}]
  approvedBy?: string
  approvedAt?: string
  paidAt?: string
  rejectionNote?: string
  createdAt: string
  updatedAt: string
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
export type SupplierStatus = 'Active' | 'Inactive' | 'Approved' | 'Blacklisted' | 'Under Review'
export type SupplierRating = 'Excellent' | 'Good' | 'Average' | 'Poor'

export interface SupplierContact {
  id: string
  supplierId: string
  name: string
  designation?: string
  email?: string
  phone?: string
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: string
  supplierCode: string
  companyName: string
  tradeName?: string
  category: string
  type: string
  status: SupplierStatus
  country: string
  city?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  vatNumber?: string
  crNumber?: string
  paymentTerms?: string
  currency: string
  creditLimit: number
  rating?: SupplierRating
  leadTimeDays?: number
  notes?: string
  approvedVendor: boolean
  approvedBy?: string
  approvedAt?: string
  totalPOValue: number
  totalOrders: number
  createdBy?: string
  createdAt: string
  updatedAt: string
  contacts?: SupplierContact[]
}

export interface FilterState {
  dateFrom?: string
  dateTo?: string
  search?: string
  status?: string
  kaeId?: string
  customerId?: string
}
