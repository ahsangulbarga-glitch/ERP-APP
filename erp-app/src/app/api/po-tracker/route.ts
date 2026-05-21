import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'poTracker')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const where: Record<string, unknown> = {}
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const kae = searchParams.get('kae')
  const customer = searchParams.get('customer')
  const poNumber = searchParams.get('poNumber')
  const status = searchParams.get('status')

  if (dateFrom || dateTo) where.poDate = { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined }
  if (kae) where.kaeName = { contains: kae, mode: 'insensitive' }
  if (customer) where.customerName = { contains: customer, mode: 'insensitive' }
  if (poNumber) where.poNumber = { contains: poNumber, mode: 'insensitive' }
  if (status) where.paymentStatus = status

  const rows = await prisma.pOTracker.findMany({ where, orderBy: { poDate: 'desc' } })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'poTracker')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { customerName, projectName, kaeName, qtRef, poNumber, poDate, poAmountExVat, paymentTermsSplit, remarks } = body

  const amountEx = Number(poAmountExVat)
  const vat = amountEx * 0.15
  const total = amountEx + vat

  const po = await prisma.pOTracker.create({
    data: { customerName, projectName, kaeName, qtRef, poNumber, poDate: new Date(poDate), poAmountExVat: amountEx, vat15: vat, totalValueIncVat: total, paymentTermsSplit, remarks, createdBy: session.user.id },
  })

  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'po_tracker', rowId: po.id, action: 'CREATE', newValue: JSON.stringify(body), relatedId: { type: 'po', id: po.id } })
  return NextResponse.json(po, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'poTracker')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, ...updates } = await req.json()
  const existing = await prisma.pOTracker.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (updates.poAmountExVat) {
    updates.vat15 = Number(updates.poAmountExVat) * 0.15
    updates.totalValueIncVat = Number(updates.poAmountExVat) * 1.15
  }

  const updated = await prisma.pOTracker.update({ where: { id }, data: updates })

  for (const [field, newVal] of Object.entries(updates)) {
    const oldVal = (existing as Record<string, unknown>)[field]
    if (String(oldVal) !== String(newVal)) {
      await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'po_tracker', rowId: id, fieldName: field, oldValue: String(oldVal ?? ''), newValue: String(newVal ?? ''), action: 'UPDATE', relatedId: { type: 'po', id } })
    }
  }
  return NextResponse.json(updated)
}
