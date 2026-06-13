import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { canRead, canWrite, isKAERestrictedToOwnAccounts } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import { notifyQuoteStatusChange } from '@/lib/notifications'
import { checkPlanLimit } from '@/lib/planLimits'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (!canRead(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const kaeId = searchParams.get('kaeId')
  const customer = searchParams.get('customer')
  const qtRef = searchParams.get('qtRef')
  const status = searchParams.get('status')
  const withItems = searchParams.get('withItems') === '1'

  const where: Record<string, unknown> = {}
  if (isKAERestrictedToOwnAccounts(session.user.role)) where.kaeAssignedId = session.user.id
  if (dateFrom || dateTo) where.qtnDate = { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined }
  if (kaeId) where.kaeAssignedId = kaeId
  if (customer) where.customerName = { contains: customer }
  if (qtRef) where.qtRef = { contains: qtRef }
  if (status) where.status = status

  const rows = await db.quotation.findMany({
    where,
    include: {
      kaeAssigned: { select: { id: true, name: true } },
      ...(withItems ? { lineItems: { orderBy: { sNo: 'asc' } } } : {}),
    },
    orderBy: { qtnDate: 'desc' },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session, tenantId } = result
  if (!canWrite(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Check plan quotation limit before creating
  const tenantRecord = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (tenantRecord) {
    const limitError = await checkPlanLimit(prisma, tenantId, tenantRecord, 'quotations')
    if (limitError) return NextResponse.json({ error: limitError }, { status: 402 })
  }

  const body = await req.json()
  const {
    qtRef, qtnDate, customerName, projectName, amountSar, discount, discountType, hideDiscount, status,
    kaeAssignedId, clientContactName, clientContactDetails, remarks, poNumber,
    subject, rfqCode, application, poBox, paymentTerms, deliveryWeeks, validityDays,
    termsOfDelivery, warranty, tpiNote, pricesNote, notes,
    lineItems,
  } = body

  if (!qtRef || !qtRef.trim()) return NextResponse.json({ error: 'QT Reference is required' }, { status: 400 })

  // Parse and validate qtnDate — fall back to today if missing or invalid
  const parsedDate = qtnDate ? new Date(qtnDate) : new Date()
  const safeDate   = isNaN(parsedDate.getTime()) ? new Date() : parsedDate

  const existing = await db.quotation.findFirst({ where: { qtRef: qtRef.trim() } })
  if (existing) return NextResponse.json({ error: `QT Reference "${qtRef}" already exists` }, { status: 409 })

  const quotation = await db.quotation.create({
    data: {
      qtRef: qtRef.trim(),
      qtnDate: safeDate,
      customerName,
      projectName,
      amountSar: parseFloat(amountSar) || 0,
      discount: parseFloat(discount) || 0,
      discountType: discountType || 'SAR',
      hideDiscount: hideDiscount ?? false,
      status: status || 'Open',
      poNumber: poNumber || undefined,
      kaeAssignedId: kaeAssignedId || undefined,
      clientContactName,
      clientContactDetails,
      subject,
      rfqCode,
      application,
      poBox,
      paymentTerms,
      deliveryWeeks,
      validityDays: validityDays ? parseInt(validityDays) : 30,
      termsOfDelivery: termsOfDelivery || null,
      warranty: warranty || null,
      tpiNote: tpiNote || null,
      pricesNote: pricesNote || null,
      notes,
      remarks,
      createdBy: session.user.id,
      ...(Array.isArray(lineItems) && lineItems.length > 0 ? {
        lineItems: {
          create: lineItems.map((item: QuotationLineItemInput, idx: number) => ({
            sNo: item.sNo ?? idx + 1,
            itemType: item.itemType || 'item',
            description: item.description,
            specifications: item.specifications || null,
            reference: item.reference || null,
            make: item.make || null,
            qty: parseFloat(item.qty as unknown as string) || 0,
            unit: item.unit || null,
            rate: parseFloat(item.rate as unknown as string) || 0,
            discountPct: parseFloat(item.discountPct as unknown as string) || 0,
            amount: parseFloat(item.amount as unknown as string) || 0,
            delivery: item.delivery || null,
          })),
        },
      } : {}),
    },
    include: {
      kaeAssigned: { select: { id: true, name: true, email: true } },
      lineItems: { orderBy: { sNo: 'asc' } },
    },
  })

  await writeAuditLog({ tenantId: session.user.tenantId, userId: session.user.id, userRole: session.user.role, targetTable: 'quotations', rowId: quotation.id, action: 'CREATE', newValue: JSON.stringify(body), relatedId: { type: 'quotation', id: quotation.id } })

  // Auto-create or update customer record when a quotation is created
  if (customerName?.trim()) {
    try {
      const existing = await db.customer.findFirst({ where: { customerName: customerName.trim() } })
      if (existing) {
        // Update stats on existing customer
        await db.customer.update({
          where: { id: existing.id },
          data: {
            lastActivityDate:  new Date(),
            totalRfq:          existing.totalRfq + 1,
            totalValueQuoted:  existing.totalValueQuoted + (parseFloat(amountSar) || 0),
            // Link KAE if not already assigned
            ...(kaeAssignedId && !existing.assignedKaeId ? { assignedKaeId: kaeAssignedId } : {}),
          },
        })
      } else {
        // Create new customer record automatically
        await db.customer.create({
          data: {
            customerName:     customerName.trim(),
            status:           'Active',
            firstActivityDate: new Date(),
            lastActivityDate:  new Date(),
            totalRfq:          1,
            totalValueQuoted:  parseFloat(amountSar) || 0,
            assignedKaeId:     kaeAssignedId || undefined,
            createdBy:         session.user.id,
          },
        })
      }
    } catch (e) {
      console.error('[quotation POST] customer auto-create failed:', e)
    }
  }

  return NextResponse.json(quotation, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (!canWrite(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, lineItems, ...updates } = body

  const existing = await db.quotation.findFirst({ where: { id }, include: { kaeAssigned: { select: { id: true, name: true, email: true } } } })
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

  // Coerce numeric fields
  if (updates.amountSar !== undefined) updates.amountSar = parseFloat(updates.amountSar) || 0
  if (updates.discount !== undefined) updates.discount = parseFloat(updates.discount) || 0
  if (updates.validityDays !== undefined) updates.validityDays = parseInt(updates.validityDays) || 30

  // Coerce date fields (Prisma requires Date objects, not strings)
  if (updates.qtnDate !== undefined && updates.qtnDate !== null) updates.qtnDate = new Date(updates.qtnDate)

  // Coerce empty-string FK fields to null (prevents Prisma FK constraint errors)
  if (updates.kaeAssignedId === '') updates.kaeAssignedId = null

  let updated
  try {
  updated = await db.quotation.update({
    where: { id },
    data: {
      ...updates,
      // Upsert line items if provided
      ...(Array.isArray(lineItems) ? {
        lineItems: {
          deleteMany: {},
          create: lineItems.map((item: QuotationLineItemInput, idx: number) => ({
            sNo: item.sNo ?? idx + 1,
            itemType: item.itemType || 'item',
            description: item.description,
            specifications: item.specifications || null,
            reference: item.reference || null,
            make: item.make || null,
            qty: parseFloat(item.qty as unknown as string) || 0,
            unit: item.unit || null,
            rate: parseFloat(item.rate as unknown as string) || 0,
            discountPct: parseFloat(item.discountPct as unknown as string) || 0,
            amount: parseFloat(item.amount as unknown as string) || 0,
            delivery: item.delivery || null,
          })),
        },
      } : {}),
    },
    include: {
      kaeAssigned: { select: { id: true, name: true } },
      lineItems: { orderBy: { sNo: 'asc' } },
    },
  })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error'
    console.error('[PATCH /api/quotations]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Audit field-level changes (skip lineItems from audit)
  for (const [field, newVal] of Object.entries(updates)) {
    const oldVal = (existing as Record<string, unknown>)[field]
    if (oldVal !== newVal) {
      await writeAuditLog({ tenantId: session.user.tenantId, userId: session.user.id, userRole: session.user.role, targetTable: 'quotations', rowId: id, fieldName: field, oldValue: String(oldVal ?? ''), newValue: String(newVal ?? ''), action: 'UPDATE', relatedId: { type: 'quotation', id } })
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

    await db.pOTracker.create({
      data: { customerName: existing.customerName, projectName: existing.projectName, kaeName: existing.kaeAssigned?.name, qtRef: existing.qtRef, poNumber, poDate: new Date(), poAmountExVat: amountEx, vat15: vat, totalValueIncVat: Number(existing.amountSar), paymentStatus: 'Pending', createdBy: session.user.id },
    }).catch(() => { /* PO number might already exist */ })

    await db.payment.create({
      data: { poNumber, customerName: existing.customerName, kaeNameId: existing.kaeAssignedId, poValue: Number(existing.amountSar), quotationId: existing.id, createdBy: session.user.id },
    }).catch(() => { /* payment might already exist */ })

    await db.quotation.update({ where: { id }, data: { poNumber } }).catch(() => {})
  }

  // Auto-create or update customer when quotation is saved/edited
  const nameForActivity = (updates.customerName || existing.customerName)?.trim()
  if (nameForActivity) {
    try {
      const existingCust = await db.customer.findFirst({ where: { customerName: nameForActivity } })
      if (existingCust) {
        await db.customer.update({
          where: { id: existingCust.id },
          data: {
            lastActivityDate: new Date(),
            // Link KAE if not already assigned and this update includes one
            ...(updates.kaeAssignedId && !existingCust.assignedKaeId ? { assignedKaeId: updates.kaeAssignedId } : {}),
          },
        })
      } else {
        // New customer name on this quotation — create the customer record
        await db.customer.create({
          data: {
            customerName:      nameForActivity,
            status:            'Active',
            firstActivityDate: new Date(),
            lastActivityDate:  new Date(),
            totalRfq:          1,
            totalValueQuoted:  Number(updates.amountSar ?? existing.amountSar) || 0,
            assignedKaeId:     updates.kaeAssignedId || existing.kaeAssignedId || undefined,
            createdBy:         session.user.id,
          },
        })
      }
    } catch (e) {
      console.error('[quotation PATCH] customer auto-create failed:', e)
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (session.user.role !== 'P2_ADMIN' && session.user.role !== 'P1_CEO') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  await db.quotation.delete({ where: { id } })
  await writeAuditLog({ tenantId: session.user.tenantId, userId: session.user.id, userRole: session.user.role, targetTable: 'quotations', rowId: id, action: 'DELETE' })
  return NextResponse.json({ success: true })
}

// ─── types ────────────────────────────────────────────────────────────────────
interface QuotationLineItemInput {
  sNo?: number
  itemType?: string
  description: string
  specifications?: string
  reference?: string
  make?: string
  qty: number | string
  unit?: string
  rate: number | string
  discountPct?: number | string
  amount: number | string
  delivery?: string
}
