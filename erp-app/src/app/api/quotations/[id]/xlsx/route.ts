import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead } from '@/lib/rbac'
import prisma from '@/lib/db'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const q = await prisma.quotation.findUnique({
    where: { id },
    include: { kaeAssigned: true, lineItems: { orderBy: { sNo: 'asc' } } },
  })
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Cover Details ──────────────────────────────────────────────────
  const coverData = [
    ['Field', 'Value'],
    ['QT Reference',    q.qtRef],
    ['Date',            new Date(q.qtnDate).toLocaleDateString('en-GB')],
    ['Customer',        q.customerName],
    ['Project',         q.projectName],
    ['Subject',         q.subject || ''],
    ['RFQ Code',        q.rfqCode || ''],
    ['Application',     q.application || ''],
    ['PO Box',          q.poBox || ''],
    ['Kind Attn',       q.clientContactName || ''],
    ['Contact Details', q.clientContactDetails || ''],
    ['Payment Terms',   q.paymentTerms || ''],
    ['Delivery Weeks',  q.deliveryWeeks || ''],
    ['Validity Days',   q.validityDays ?? 30],
    ['KAE Assigned',    q.kaeAssigned?.name || ''],
    ['Status',          q.status],
    ['Remarks',         q.remarks || ''],
  ]
  const wsCover = XLSX.utils.aoa_to_sheet(coverData)
  wsCover['!cols'] = [{ wch: 20 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsCover, 'Cover Details')

  // ── Sheet 2: Line Items ─────────────────────────────────────────────────────
  const itemHeaders = ['S.No', 'Type', 'Description', 'Reference', 'Make', 'Qty', 'Unit', 'Rate (SAR)', 'Amount (SAR)', 'Delivery']
  const itemRows = q.lineItems.map(li => [
    li.sNo,
    li.itemType || 'item',
    li.description,
    li.reference || '',
    li.make || '',
    li.itemType === 'header' ? '' : li.qty,
    li.unit || '',
    li.itemType === 'header' ? '' : li.rate,
    li.itemType === 'header' ? '' : li.amount,
    li.delivery || '',
  ])

  const items     = q.lineItems.filter(li => li.itemType !== 'header')
  const subtotal  = items.reduce((s, li) => s + Number(li.amount), 0)
  const discount  = Number(q.discount) || 0
  const net       = subtotal - discount

  const wsItems = XLSX.utils.aoa_to_sheet([
    itemHeaders,
    ...itemRows,
    [],
    ['', '', '', '', '', '', '', 'Subtotal',        subtotal],
    ['', '', '', '', '', '', '', 'Discount',        discount],
    ['', '', '', '', '', '', '', 'Grand Total (Net)', net],
  ])
  wsItems['!cols'] = [
    { wch: 6 }, { wch: 8 }, { wch: 50 }, { wch: 16 }, { wch: 12 },
    { wch: 6 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsItems, 'Line Items')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${q.qtRef}.xlsx"`,
    },
  })
}
