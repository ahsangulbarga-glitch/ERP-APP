import { Role } from '@/types'

export const TABS_ACCESS: Record<string, { read: Role[]; write: Role[] }> = {
  quotations: {
    read: ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER', 'P6_INSIDE_SALES_ENGINEER'],
    write: ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER', 'P6_INSIDE_SALES_ENGINEER'],
  },
  poTracker: {
    read: ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER', 'P6_INSIDE_SALES_ENGINEER', 'P7_ACCOUNTANT'],
    write: ['P2_ADMIN', 'P4_SALES_MANAGER', 'P7_ACCOUNTANT'],
  },
  customers: {
    read: ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER', 'P6_INSIDE_SALES_ENGINEER', 'P7_ACCOUNTANT'],
    write: ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER'],
  },
  payments: {
    read: ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER', 'P7_ACCOUNTANT'],
    write: ['P2_ADMIN', 'P4_SALES_MANAGER', 'P7_ACCOUNTANT'],
  },
  documents: {
    read: ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER', 'P7_ACCOUNTANT', 'P8_HR'],
    write: ['P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER', 'P8_HR'],
  },
}

export const BULK_IMPORT_ACCESS: Record<string, Role[]> = {
  quotations: ['P2_ADMIN', 'P4_SALES_MANAGER', 'P6_INSIDE_SALES_ENGINEER'],
  customers: ['P2_ADMIN', 'P4_SALES_MANAGER', 'P5_KEY_ACCOUNT_ENGINEER'],
}

export const FORECAST_MODELER_ACCESS: Role[] = ['P1_CEO', 'P4_SALES_MANAGER']

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
  return role === 'P5_KEY_ACCOUNT_ENGINEER'
}

const PERFORMANCE_ACCESS: Role[] = ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER']

export function canViewPerformanceAnalytics(role: Role): boolean {
  return PERFORMANCE_ACCESS.includes(role)
}
