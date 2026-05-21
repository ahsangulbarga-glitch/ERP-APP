import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite, isKAERestrictedToOwnAccounts } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { notifyQuoteStatusChange } from '@/lib/notifications'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const kaeId = searchParams.get('kaeId')
  const customer = searchParams.get('customer')
  const qtRef = searchParams.get('qtRef')
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (isKAERestrictedToOwnAccounts(session.user.role)) where.kaeAssignedId = session.user.id
  if (dateFrom || dateTo) where.qtnDate = { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined }
  if (kaeId) where.kaeAssignedId = kaeId
  if (customer) where.customerName = { contains: customer }
  if (qtRef) where.qtRef = { contains: qtRef }
  if (status) where.status = status

  const rows = await prisma.quotation.findMany({
    where,
    include: { kaeAssigned: { select: { id: true, name: true } } },
    orderBy: { qtnDate: 'desc' },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { qtRef, qtnDate, customerName, projectName, amountSar, status, kaeAssignedId, clientContactName, clientContactDetails, remarks, poNumber } = body

  if (!qtRef || !qtRef.trim()) return NextResponse.json({ error: 'QT Reference is required' }, { status: 400 })

  // Check for duplicate qtRef
  const existing = await prisma.quotation.findUnique({ where: { qtRef: qtRef.trim() } })
  if (existing) return NextResponse.json({ error: `QT Reference "${qtRef}" already exists` }, { status: 409 })

  const quotation = await prisma.quotation.create({
    data: { qtRef: qtRef.trim(), qtnDate: new Date(qtnDate), customerName, projectName, amountSar, status: status || 'Open', poNumber, kaeAssignedId, clientContactName, clientContactDetails, remarks, createdBy: session.user.id },
    include: { kaeAssigned: { select: { id: true, name: true, email: true } } },
  })

  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'quotations', rowId: quotation.id, action: 'CREATE', newValue: JSON.stringify(body), relatedId: { type: 'quotation', id: quotation.id } })

  return NextResponse.json(quotation, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body

  const existing = await prisma.quotation.findUnique({ where: { id }, include: { kaeAssigned: { select: { id: true, name: true, email: true } } } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (isKAERestrictedToOwnAccounts(session.user.role) && existing.kaeAssignedId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Handle revision increment
  if (updates.revisionIncrement) {
    updates.revisionNumber = existing.revisionNumber + 1
    updates.qtRef = existing.qtRef.replace(/REV\d+$/, `REV${updates.revisionNumber}`)
    delete updates.revisionIncrement
  }

  const updated = await prisma.quotation.update({ where: { id }, data: updates, include: { kaeAssigned: { select: { id: true, name: true } } } })

  // Audit field-level changes
  for (const [field, newVal] of Object.entries(updates)) {
    const oldVal = (existing as Record<string, unknown>)[field]
    if (oldVal !== newVal) {
      await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'quotations', rowId: id, fieldName: field, oldValue: String(oldVal ?? ''), newValue: String(newVal ?? ''), action: 'UPDATE', relatedId: { type: 'quotation', id } })
    }
  }

  // Status change notification
  if (updates.status && updates.status !== existing.status && existing.kaeAssigned?.email) {
    notifyQuoteStatusChange('+966500000000', existing.kaeAssigned.email, existing.qtRef, updates.status, existing.customerName).catch(console.error)
  }

  // One-click conversion: auto-create PO + Payment drafts
  if (updates.status === 'Converted' && existing.status !== 'Converted') {
    const poNumber = `PO-${existing.qtRef}`
    const amountEx = Number(existing.amountSar) / 1.15
    const vat = Number(existing.amountSar) - amountEx

    await prisma.pOTracker.create({
      data: { customerName: existing.customerName, projectName: existing.projectName, kaeName: existing.kaeAssigned?.name, qtRef: existing.qtRef, poNumber, poDate: new Date(), poAmountExVat: amountEx, vat15: vat, totalValueIncVat: Number(existing.amountSar), paymentStatus: 'Pending', createdBy: session.user.id },
    }).catch(() => { /* PO number might already exist */ })

    await prisma.payment.create({
      data: { poNumber, customerName: existing.customerName, kaeNameId: existing.kaeAssignedId, poValue: Number(existing.amountSar), quotationId: existing.id, createdBy: session.user.id },
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'P2_ADMIN' && session.user.role !== 'P1_CEO') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  await prisma.quotation.delete({ where: { id } })
  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'quotations', rowId: id, action: 'DELETE' })
  return NextResponse.json({ success: true })
}
