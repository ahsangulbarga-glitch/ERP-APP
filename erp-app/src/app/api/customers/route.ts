import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite, isKAERestrictedToOwnAccounts } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const where: Record<string, unknown> = {}
  const search = searchParams.get('search')
  const kaeId = searchParams.get('kaeId')
  const minConversion = searchParams.get('minConversion')

  if (isKAERestrictedToOwnAccounts(session.user.role)) where.assignedKaeId = session.user.id
  if (search) where.customerName = { contains: search, mode: 'insensitive' }
  if (kaeId) where.assignedKaeId = kaeId
  if (minConversion) where.completionPct = { gte: Number(minConversion) }

  const rows = await prisma.customer.findMany({
    where,
    include: { assignedKae: { select: { id: true, name: true } } },
    orderBy: { totalPoValue: 'desc' },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { customerName, assignedKaeId, firstActivityDate, lastActivityDate, remarks } = body

  const customer = await prisma.customer.create({
    data: { customerName, assignedKaeId, firstActivityDate: firstActivityDate ? new Date(firstActivityDate) : undefined, lastActivityDate: lastActivityDate ? new Date(lastActivityDate) : undefined, remarks, createdBy: session.user.id },
    include: { assignedKae: { select: { id: true, name: true } } },
  })

  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'customers', rowId: customer.id, action: 'CREATE', newValue: JSON.stringify(body), relatedId: { type: 'customer', id: customer.id } })
  return NextResponse.json(customer, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, ...updates } = await req.json()

  if (isKAERestrictedToOwnAccounts(session.user.role)) {
    const existing = await prisma.customer.findUnique({ where: { id } })
    if (existing?.assignedKaeId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Recalculate completion %
  if (updates.totalRfq !== undefined || updates.totalConverted !== undefined) {
    const current = await prisma.customer.findUnique({ where: { id } })
    const rfq = updates.totalRfq ?? current?.totalRfq ?? 0
    const conv = updates.totalConverted ?? current?.totalConverted ?? 0
    updates.completionPct = rfq > 0 ? (conv / rfq) * 100 : 0
  }

  const updated = await prisma.customer.update({ where: { id }, data: updates, include: { assignedKae: { select: { id: true, name: true } } } })
  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'customers', rowId: id, action: 'UPDATE', newValue: JSON.stringify(updates), relatedId: { type: 'customer', id } })
  return NextResponse.json(updated)
}
