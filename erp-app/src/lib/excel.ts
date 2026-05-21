import * as XLSX from 'xlsx'
import { Role } from '@/types'
import { canRead } from './rbac'

export function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  sheetName: string,
  fileName: string
): Buffer {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function parseExcelImport(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}

export function formatCurrencySAR(value: number): string {
  return `SAR ${value.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function filterExportByRole<T extends { kaeAssignedId?: string; assignedKaeId?: string }>(
  data: T[],
  role: Role,
  userId: string,
  tab: string
): T[] {
  if (!canRead(role, tab)) return []
  if (role === 'P5_KEY_ACCOUNT_ENGINEER') {
    return data.filter(
      (row) => row.kaeAssignedId === userId || row.assignedKaeId === userId
    )
  }
  return data
}

export const QUOTATION_TEMPLATE_HEADERS = [
  'qtnDate', 'customerName', 'projectName', 'amountSar',
  'status', 'kaeAssigned', 'clientContactName', 'clientContactDetails', 'remarks',
]

export const CUSTOMER_TEMPLATE_HEADERS = [
  'customerName', 'assignedKae', 'firstActivityDate', 'lastActivityDate', 'remarks',
]

export function generateTemplate(headers: string[], sheetName: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
