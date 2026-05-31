import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite, isKAERestrictedToOwnAccounts } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { assignedKae: { select: { id: true, name: true } } },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (isKAERestrictedToOwnAccounts(session.user.role) && customer.assignedKaeId !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(customer)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  if (isKAERestrictedToOwnAccounts(session.user.role)) {
    const existing = await prisma.customer.findUnique({ where: { id } })
    if (existing?.assignedKaeId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates = await req.json()

  // Recalculate completion %
  if (updates.totalRfq !== undefined || updates.totalConverted !== undefined) {
    const current = await prisma.customer.findUnique({ where: { id } })
    const rfq = updates.totalRfq ?? current?.totalRfq ?? 0
    const conv = updates.totalConverted ?? current?.totalConverted ?? 0
    updates.completionPct = rfq > 0 ? (conv / rfq) * 100 : 0
  }

  // Serialize JSON fields if passed as objects
  if (updates.primaryAddress && typeof updates.primaryAddress === 'object')
    updates.primaryAddress = JSON.stringify(updates.primaryAddress)
  if (updates.keyPersonnel && typeof updates.keyPersonnel === 'object')
    updates.keyPersonnel = JSON.stringify(updates.keyPersonnel)
  if (updates.communicationPref && typeof updates.communicationPref === 'object')
    updates.communicationPref = JSON.stringify(updates.communicationPref)
  if (updates.shippingAddresses && typeof updates.shippingAddresses === 'object')
    updates.shippingAddresses = JSON.stringify(updates.shippingAddresses)

  const updated = await prisma.customer.update({
    where: { id },
    data: updates,
    include: { assignedKae: { select: { id: true, name: true } } },
  })

  await writeAuditLog({
    userId: session.user.id, userRole: session.user.role,
    targetTable: 'customers', rowId: id, action: 'UPDATE',
    newValue: JSON.stringify(updates), relatedId: { type: 'customer', id },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.customer.delete({ where: { id } })
  await writeAuditLog({
    userId: session.user.id, userRole: session.user.role,
    targetTable: 'customers', rowId: id, action: 'DELETE',
    relatedId: { type: 'customer', id },
  })
  return NextResponse.json({ success: true })
}
