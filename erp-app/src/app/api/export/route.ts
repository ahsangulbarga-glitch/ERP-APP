import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, isKAERestrictedToOwnAccounts } from '@/lib/rbac'
import { exportToExcel } from '@/lib/excel'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tab = searchParams.get('tab') || ''

  if (!canRead(session.user.role, tab)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rebuild active filters from query params
  const filters: Record<string, string> = {}
  for (const [key, val] of searchParams.entries()) {
    if (key !== 'tab') filters[key] = val
  }

  let data: Record<string, unknown>[] = []
  const kaeFilter = isKAERestrictedToOwnAccounts(session.user.role) ? session.user.id : undefined

  if (tab === 'quotations') {
    const where = buildWhere(filters, kaeFilter ? { kaeAssignedId: kaeFilter } : {})
    const rows = await prisma.quotation.findMany({ where, include: { kaeAssigned: { select: { name: true } } }, orderBy: { qtnDate: 'desc' } })
    data = rows.map((r) => ({
      'QT Ref': r.qtRef, 'Date': r.qtnDate.toISOString().split('T')[0],
      'Customer': r.customerName, 'Project': r.projectName,
      'Amount (SAR)': Number(r.amountSar).toFixed(2), 'Status': r.status,
      'KAE': r.kaeAssigned?.name || '', 'Contact': r.clientContactName || '',
      'Remarks': r.remarks || '',
    }))
  } else if (tab === 'poTracker') {
    const rows = await prisma.pOTracker.findMany({ where: buildWhere(filters, {}), orderBy: { poDate: 'desc' } })
    data = rows.map((r) => ({
      'Customer': r.customerName, 'Project': r.projectName, 'KAE': r.kaeName || '',
      'QT Ref': r.qtRef || '', 'PO Number': r.poNumber, 'PO Date': r.poDate.toISOString().split('T')[0],
      'Amount Ex-VAT (SAR)': Number(r.poAmountExVat).toFixed(2),
      'VAT 15% (SAR)': Number(r.vat15).toFixed(2),
      'Total Inc-VAT (SAR)': Number(r.totalValueIncVat).toFixed(2),
      'Collection %': Number(r.paymentCollectionPct).toFixed(2) + '%',
      'Status': r.paymentStatus, 'Remarks': r.remarks || '',
    }))
  } else if (tab === 'customers') {
    const where = buildWhere(filters, kaeFilter ? { assignedKaeId: kaeFilter } : {})
    const rows = await prisma.customer.findMany({ where, include: { assignedKae: { select: { name: true } } }, orderBy: { totalPoValue: 'desc' } })
    data = rows.map((r) => ({
      'Customer': r.customerName, 'KAE': r.assignedKae?.name || '',
      'Total RFQ': r.totalRfq, 'Converted': r.totalConverted,
      'Conversion %': Number(r.completionPct).toFixed(2) + '%',
      'Total Quoted (SAR)': Number(r.totalValueQuoted).toFixed(2),
      'Total PO (SAR)': Number(r.totalPoValue).toFixed(2),
      'Remarks': r.remarks || '',
    }))
  } else if (tab === 'payments') {
    const rows = await prisma.payment.findMany({ include: { milestones: true, kaeName: { select: { name: true } } }, orderBy: { createdAt: 'desc' } })
    data = rows.map((r) => ({
      'PO Number': r.poNumber, 'Customer': r.customerName, 'KAE': r.kaeName?.name || '',
      'PO Value (SAR)': Number(r.poValue).toFixed(2),
      'Collection %': Number(r.collectionPct).toFixed(2) + '%',
      'Milestones': r.milestones.length, 'Remarks': r.remarks || '',
    }))
  } else if (tab === 'documents') {
    const rows = await prisma.document.findMany({ where: buildWhere(filters, {}), orderBy: { expiryDate: 'asc' } })
    data = rows.map((r) => ({
      'Document': r.documentName, 'Owner': r.documentOwner,
      'Category': r.category, 'Department': r.department,
      'Issue Date': r.issueDate.toISOString().split('T')[0],
      'Expiry Date': r.expiryDate.toISOString().split('T')[0],
      'Days Remaining': r.remainingDaysForExpiry,
      'Status': r.status, 'Remarks': r.remarks || '',
    }))
  } else if (tab === 'materials') {
    const search      = filters.search
    const availability = filters.availability
    const orderToFactory = filters.orderToFactory
    const where: Record<string, unknown> = {}
    if (search) where.OR = [{ productRef: { contains: search } }, { description: { contains: search } }]
    if (availability) where.stockAvailability = availability
    if (orderToFactory === 'true')  where.orderToFactory = true
    if (orderToFactory === 'false') where.orderToFactory = false
    const rows = await prisma.materialItem.findMany({ where, orderBy: { productRef: 'asc' } })
    data = rows.map((r) => ({
      'Product Ref':        r.productRef,
      'Description':        r.description,
      'Stock Availability': r.stockAvailability,
      'Total Quantity':     r.quantity,
      'Reserved Qty':       r.reservedQty ?? 0,
      'Available Qty':      r.quantity - (r.reservedQty ?? 0),
      'Reserved For PO':    r.reservedForPO || '',
      'Order to Factory':   r.orderToFactory ? 'Yes' : 'No',
      'Remarks':            r.remarks || '',
    }))
  } else {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
  }

  const buffer = exportToExcel(data, tab, `${tab}-export`)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${tab}-${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  })
}

function buildWhere(filters: Record<string, string>, base: Record<string, unknown>) {
  const where = { ...base } as Record<string, unknown>
  if (filters.dateFrom || filters.dateTo) {
    const dateField = filters.dateFrom?.includes('po') ? 'poDate' : 'qtnDate'
    where[dateField] = { gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined, lte: filters.dateTo ? new Date(filters.dateTo) : undefined }
  }
  if (filters.status) where.status = filters.status
  if (filters.customer) where.customerName = { contains: filters.customer }
  return where
}
