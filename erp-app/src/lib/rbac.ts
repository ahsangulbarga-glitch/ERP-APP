import { Role } from '@/types'

// ── Custom role resolution ────────────────────────────────────────────────────
// If a role string starts with CUSTOM_, the user's session will have
// effectiveRole set by requireTenant(). All RBAC functions should use this.
// Pass session.user.role (or effectiveRole if present) into these functions.
export function resolveRole(user: { role: string; effectiveRole?: string }): Role {
  return ((user as any).effectiveRole || user.role) as Role
}

export const TABS_ACCESS: Record<string, { read: Role[]; write: Role[] }> = {
  quotations: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER'],
  },
  poTracker: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER'],
    write: ['P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER'],
  },
  customers: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT'],
    write: ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER'],
  },
  payments: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P8_ACCOUNTANT'],
    write: ['P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT'],
  },
  documents: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P8_ACCOUNTANT', 'P9_HR'],
    write: ['P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P9_HR'],
  },
  materials: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
    write: ['P2_ADMIN', 'P7_INSIDE_SALES_ENGINEER', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
  },
  inventoryAnalytics: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER'],
  },
  invoices: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT'],
    write: ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT'],
  },
  salesOrders: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER'],
  },
  procurement: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
    write: ['P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER'],
  },
  delivery: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
    write: ['P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
  },
  hr: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P9_HR'],
    write: ['P2_ADMIN', 'P9_HR'],
  },
  targets: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER'],
    write: ['P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
  },
  settings: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT', 'P9_HR', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
    write: ['P2_ADMIN'],
  },
  commission: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
  },
  expenses: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT', 'P9_HR', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT', 'P9_HR', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
  },
  suppliers: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER', 'P8_ACCOUNTANT', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER'],
  },
  reports: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
  },
  performance: {
    read:  ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
  },
}

export const BULK_IMPORT_ACCESS: Record<string, Role[]> = {
  quotations: ['P2_ADMIN', 'P5_SALES_MANAGER', 'P7_INSIDE_SALES_ENGINEER'],
  customers:  ['P2_ADMIN', 'P5_SALES_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER'],
  materials:  ['P2_ADMIN', 'P7_INSIDE_SALES_ENGINEER', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER'],
}

export const FORECAST_MODELER_ACCESS: Role[] = ['P1_CEO', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER']

export const USER_MANAGEMENT_ACCESS: Role[] = ['P2_ADMIN']

export function canRead(role: Role, tab: string): boolean {
  return TABS_ACCESS[tab]?.read.includes(role) ?? false
}

export function canWrite(role: Role, tab: string): boolean {
  return TABS_ACCESS[tab]?.write.includes(role) ?? false
}

export function canBulkImport(role: Role, tab: string): boolean {
  return BULK_IMPORT_ACCESS[tab]?.includes(role) ?? false
}

export function canManageUsers(role: Role): boolean {
  return USER_MANAGEMENT_ACCESS.includes(role)
}

export function canAccessForecast(role: Role): boolean {
  return FORECAST_MODELER_ACCESS.includes(role)
}

export function getVisibleTabs(role: Role): string[] {
  return Object.entries(TABS_ACCESS)
    .filter(([, access]) => access.read.includes(role))
    .map(([tab]) => tab)
}

export function isKAERestrictedToOwnAccounts(role: Role): boolean {
  return role === 'P6_KEY_ACCOUNT_ENGINEER'
}

const PERFORMANCE_ACCESS: Role[] = ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER']

export function canViewPerformanceAnalytics(role: Role): boolean {
  return PERFORMANCE_ACCESS.includes(role)
}

// â”€â”€ Report export access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const REPORT_EXPORT_ACCESS: Record<string, Role[]> = {
  dashboard:     ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
  performance:   ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER'],
  users:         ['P2_ADMIN'],
  ownQuotations: ['P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER'],
  financial:     ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER', 'P8_ACCOUNTANT'],
}

export function canExportReport(role: Role, report: string): boolean {
  return REPORT_EXPORT_ACCESS[report]?.includes(role) ?? false
}

// â”€â”€ Quotation approval workflow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// KAE / ISE create quotes and submit for review
export const QUOTATION_SUBMITTER_ROLES: Role[] = [
  'P3_KEY_ACCOUNT_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER',
]
// Stage 1: Divisional Manager review (Draft â†’ PendingDivMgrReview â†’ PendingSmReview)
export const QUOTATION_DIV_MGR_ROLES: Role[] = [
  'P4_REGIONAL_MANAGER',
]
// Stage 2: Sales Manager review (PendingSmReview â†’ Approved)
export const QUOTATION_SM_ROLES: Role[] = [
  'P5_SALES_MANAGER',
]
// Who can mark Approved â†’ Submitted to customer
export const QUOTATION_FINAL_SUBMIT_ROLES: Role[] = [
  'P1_CEO', 'P2_ADMIN', 'P3_KEY_ACCOUNT_MANAGER', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER',
  'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER',
]

export function canSubmitForReview(role: Role): boolean {
  return QUOTATION_SUBMITTER_ROLES.includes(role)
}
export function canApproveAsDivMgr(role: Role): boolean {
  return QUOTATION_DIV_MGR_ROLES.includes(role)
}
export function canApproveAsSalesMgr(role: Role): boolean {
  return QUOTATION_SM_ROLES.includes(role)
}
export function canMarkSubmitted(role: Role): boolean {
  return QUOTATION_FINAL_SUBMIT_ROLES.includes(role)
}

// ── Credit limit management ───────────────────────────────────────────────────
const CREDIT_LIMIT_ROLES: Role[] = ['P1_CEO', 'P2_ADMIN', 'P8_ACCOUNTANT']

export function canSetCreditLimit(role: Role): boolean {
  return CREDIT_LIMIT_ROLES.includes(role)
}