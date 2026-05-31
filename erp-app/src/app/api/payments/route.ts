import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { notifyOverdueMilestone } from '@/lib/notifications'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'payments')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const where: Record<string, unknown> = {}
  const poNumber = searchParams.get('poNumber')
  const customer = searchParams.get('customer')
  const kaeId = searchParams.get('kaeId')
  const milestoneStatus = searchParams.get('milestoneStatus')

  if (poNumber) where.poNumber = { contains: poNumber }
  if (customer) where.customerName = { contains: customer }
  if (kaeId) where.kaeNameId = kaeId

  const rows = await prisma.payment.findMany({
    where,
    include: {
      milestones: true,
      kaeName: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Filter by milestone status if provided
  const filtered = milestoneStatus
    ? rows.filter((r) => r.milestones.some((m) => m.status === milestoneStatus))
    : rows

  return NextResponse.json(filtered)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'payments')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { poNumber, customerName, kaeNameId, poValue, milestones, remarks } = body

  const payment = await prisma.payment.create({
    data: {
      poNumber, customerName, kaeNameId: kaeNameId || undefined, poValue: parseFloat(poValue), remarks, createdBy: session.user.id,
      milestones: milestones ? { create: milestones } : undefined,
    },
    include: { milestones: true, kaeName: { select: { id: true, name: true } } },
  })

  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'payments', rowId: payment.id, action: 'CREATE', newValue: JSON.stringify(body), relatedId: { type: 'payment', id: payment.id } })
  return NextResponse.json(payment, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'payments')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, milestoneId, milestoneStatus, milestoneUpdates, newMilestones, deleteMilestoneIds, ...paymentUpdates } = body

  // â”€â”€ Quick status toggle (Mark Paid button) â”€â”€
  if (milestoneId && milestoneStatus) {
    await prisma.paymentMilestone.update({
      where: { id: milestoneId },
      data: { status: milestoneStatus, paidAt: milestoneStatus === 'Paid' ? new Date() : undefined },
    })
    const payment = await prisma.payment.findUnique({ where: { id }, include: { milestones: true } })
    if (payment) {
      const paidAmount = payment.milestones.filter(m => m.status === 'Paid').reduce((sum, m) => sum + Number(m.amountSar), 0)
      const collectionPct = Number(payment.poValue) > 0 ? (paidAmount / Number(payment.poValue)) * 100 : 0
      await prisma.payment.update({ where: { id }, data: { collectionPct } })

      // Sync collection % and status back to the PO tracker record
      const poStatus = collectionPct >= 100 ? 'Paid' : collectionPct > 0 ? 'PartiallyPaid' : 'Pending'
      await prisma.pOTracker.updateMany({
        where: { poNumber: payment.poNumber },
        data: { paymentCollectionPct: collectionPct, paymentStatus: poStatus },
      })
    }
    const refreshed = await prisma.payment.findUnique({ where: { id }, include: { milestones: true, kaeName: { select: { id: true, name: true } } } })
    return NextResponse.json(refreshed)
  }

  // â”€â”€ Full edit (from edit modal) â”€â”€

  // 1. Delete removed milestones
  if (Array.isArray(deleteMilestoneIds) && deleteMilestoneIds.length > 0) {
    await prisma.paymentMilestone.deleteMany({ where: { id: { in: deleteMilestoneIds } } })
  }

  // 2. Update existing milestones
  if (Array.isArray(milestoneUpdates)) {
    for (const m of milestoneUpdates) {
      await prisma.paymentMilestone.update({
        where: { id: m.id },
        data: {
          phaseName: m.phaseName,
          amountSar: parseFloat(m.amountSar),
          dueDate: new Date(m.dueDate),
          status: m.status,
          paidAt: m.status === 'Paid' ? (m.paidAt ? new Date(m.paidAt) : new Date()) : null,
        },
      })
    }
  }

  // 3. Create new milestones
  if (Array.isArray(newMilestones) && newMilestones.length > 0) {
    await prisma.paymentMilestone.createMany({
      data: newMilestones.map((m: { phaseName: string; amountSar: string|number; dueDate: string; status: string }) => ({
        paymentId: id,
        phaseName: m.phaseName,
        amountSar: parseFloat(String(m.amountSar)),
        dueDate: new Date(m.dueDate),
        status: m.status,
        paidAt: m.status === 'Paid' ? new Date() : null,
      })),
    })
  }

  // 4. Update payment fields
  const fieldUpdates: Record<string, unknown> = {}
  if (paymentUpdates.poNumber   !== undefined) fieldUpdates.poNumber = paymentUpdates.poNumber
  if (paymentUpdates.customerName !== undefined) fieldUpdates.customerName = paymentUpdates.customerName
  if (paymentUpdates.poValue    !== undefined) fieldUpdates.poValue = parseFloat(paymentUpdates.poValue)
  if (paymentUpdates.remarks    !== undefined) fieldUpdates.remarks = paymentUpdates.remarks

  // 5. Recalculate collectionPct from all current milestones
  const latest = await prisma.payment.findUnique({ where: { id }, include: { milestones: true } })
  if (latest) {
    const paidAmount = latest.milestones.filter(m => m.status === 'Paid').reduce((sum, m) => sum + Number(m.amountSar), 0)
    const base = paymentUpdates.poValue ? parseFloat(paymentUpdates.poValue) : Number(latest.poValue)
    fieldUpdates.collectionPct = base > 0 ? Math.min((paidAmount / base) * 100, 100) : 0
  }

  const updated = await prisma.payment.update({
    where: { id },
    data: fieldUpdates,
    include: { milestones: true, kaeName: { select: { id: true, name: true } } },
  })
  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'payments', rowId: id, action: 'UPDATE', newValue: JSON.stringify(body), relatedId: { type: 'payment', id } })
  return NextResponse.json(updated)
}

// Scheduled job endpoint: check overdue milestones
export async function PUT() {
  const today = new Date()
  const overdueMilestones = await prisma.paymentMilestone.findMany({
    where: { status: 'Pending', dueDate: { lt: today } },
    include: { payment: { include: { kaeName: { select: { id: true, name: true, email: true } } } } },
  })

  for (const milestone of overdueMilestones) {
    await prisma.paymentMilestone.update({ where: { id: milestone.id }, data: { status: 'Overdue' } })
    const salesManager = await prisma.user.findFirst({ where: { role: 'P5_SALES_MANAGER' } })
    if (salesManager) {
      notifyOverdueMilestone(
        '+966500000000',
        salesManager.email,
        milestone.payment.poNumber,
        milestone.payment.customerName,
        milestone.phaseName,
        milestone.dueDate.toISOString().split('T')[0],
        Number(milestone.amountSar)
      ).catch(console.error)
    }
  }

  return NextResponse.json({ processed: overdueMilestones.length })
}
