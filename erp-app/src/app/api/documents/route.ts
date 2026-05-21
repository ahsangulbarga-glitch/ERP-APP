import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { notifyDocumentExpiry } from '@/lib/notifications'
import prisma from '@/lib/db'
import { differenceInDays } from 'date-fns'

function computeDocStatus(expiryDate: Date): { status: 'Active' | 'Expired' | 'ExpiringSoon'; days: number } {
  const days = differenceInDays(expiryDate, new Date())
  if (days < 0) return { status: 'Expired', days }
  if (days <= 30) return { status: 'ExpiringSoon', days }
  return { status: 'Active', days }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'documents')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const where: Record<string, unknown> = {}
  const category = searchParams.get('category')
  const department = searchParams.get('department')
  const owner = searchParams.get('owner')
  const expiryWindow = searchParams.get('expiryWindow')

  if (category) where.category = category
  if (department) where.department = { contains: department, mode: 'insensitive' }
  if (owner) where.documentOwner = { contains: owner, mode: 'insensitive' }
  if (expiryWindow === 'expired') where.status = 'Expired'
  else if (expiryWindow === 'expiring30') where.status = 'ExpiringSoon'
  else if (expiryWindow === 'active') where.status = 'Active'

  const rows = await prisma.document.findMany({ where, orderBy: { expiryDate: 'asc' } })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'documents')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { documentName, documentOwner, category, department, issueDate, expiryDate, remarks } = body

  const expiry = new Date(expiryDate)
  const { status, days } = computeDocStatus(expiry)

  const doc = await prisma.document.create({
    data: { documentName, documentOwner, category, department, issueDate: new Date(issueDate), expiryDate: expiry, remainingDaysForExpiry: days, status, remarks, createdBy: session.user.id },
  })

  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'documents', rowId: doc.id, action: 'CREATE', newValue: JSON.stringify(body), relatedId: { type: 'document', id: doc.id } })
  return NextResponse.json(doc, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'documents')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, ...updates } = await req.json()
  if (updates.expiryDate) {
    const { status, days } = computeDocStatus(new Date(updates.expiryDate))
    updates.status = status
    updates.remainingDaysForExpiry = days
  }

  const updated = await prisma.document.update({ where: { id }, data: updates })
  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: 'documents', rowId: id, action: 'UPDATE', newValue: JSON.stringify(updates), relatedId: { type: 'document', id } })
  return NextResponse.json(updated)
}

// Daily cron: refresh expiry status + send alerts
export async function PUT() {
  const docs = await prisma.document.findMany()
  const managerEmail = (await prisma.user.findFirst({ where: { role: 'P4_SALES_MANAGER' } }))?.email || ''

  for (const doc of docs) {
    const { status, days } = computeDocStatus(doc.expiryDate)
    const updateData: Record<string, unknown> = { status, remainingDaysForExpiry: days }

    if (days <= 7 && !doc.alert7Sent) {
      notifyDocumentExpiry(doc.documentOwner, managerEmail, doc.documentName, days, doc.expiryDate.toISOString().split('T')[0]).catch(console.error)
      updateData.alert7Sent = true
    } else if (days <= 15 && !doc.alert15Sent) {
      notifyDocumentExpiry(doc.documentOwner, managerEmail, doc.documentName, days, doc.expiryDate.toISOString().split('T')[0]).catch(console.error)
      updateData.alert15Sent = true
    } else if (days <= 30 && !doc.alert30Sent) {
      notifyDocumentExpiry(doc.documentOwner, managerEmail, doc.documentName, days, doc.expiryDate.toISOString().split('T')[0]).catch(console.error)
      updateData.alert30Sent = true
    }

    await prisma.document.update({ where: { id: doc.id }, data: updateData })
  }

  return NextResponse.json({ refreshed: docs.length })
}
