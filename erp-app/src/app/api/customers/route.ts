import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { canRead, canWrite, isKAERestrictedToOwnAccounts, canSetCreditLimit } from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (!canRead(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const where: Record<string, unknown> = {}
  const search = searchParams.get('search')
  const kaeId = searchParams.get('kaeId')
  const minConversion = searchParams.get('minConversion')
  const tier = searchParams.get('tier')
  const status = searchParams.get('status')

  if (isKAERestrictedToOwnAccounts(session.user.role)) where.assignedKaeId = session.user.id
  if (search) where.customerName = { contains: search }
  if (kaeId) where.assignedKaeId = kaeId
  if (minConversion) where.completionPct = { gte: Number(minConversion) }
  if (tier) where.priceTier = tier
  if (status) where.status = status

  const rows = await db.customer.findMany({
    where,
    include: {
      assignedKae: { select: { id: true, name: true } },
      assignedKam: { select: { id: true, name: true } },
    },
    orderBy: { totalPoValue: 'desc' },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (!canWrite(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    customerName, assignedKaeId, assignedKamId, firstActivityDate, lastActivityDate, remarks,
    status, industry, website, phone, email, primaryAddress, keyPersonnel,
    communicationPref, leadSource, priceTier, discountRate, paymentTerms,
    creditLimit, creditBalance, taxId, taxExempt, currency,
    shippingAddresses, defaultCarrier, carrierAccount,
  } = body

  const customer = await db.customer.create({
    data: {
      customerName,
      assignedKaeId: assignedKaeId || undefined,
      assignedKamId: assignedKamId || undefined,
      firstActivityDate: new Date(),
      lastActivityDate: new Date(),
      remarks,
      status: status || 'Active',
      industry, website, phone, email,
      primaryAddress: typeof primaryAddress === 'object' ? JSON.stringify(primaryAddress) : primaryAddress,
      keyPersonnel: typeof keyPersonnel === 'object' ? JSON.stringify(keyPersonnel) : keyPersonnel,
      communicationPref: typeof communicationPref === 'object' ? JSON.stringify(communicationPref) : communicationPref,
      leadSource,
      priceTier: priceTier || 'STANDARD',
      discountRate: discountRate ?? 0,
      paymentTerms, creditLimit: creditLimit ?? 0, creditBalance: creditBalance ?? 0,
      taxId, taxExempt: taxExempt ?? false,
      currency: currency || 'SAR',
      shippingAddresses: typeof shippingAddresses === 'object' ? JSON.stringify(shippingAddresses) : shippingAddresses,
      defaultCarrier, carrierAccount,
      createdBy: session.user.id,
    },
    include: { assignedKae: { select: { id: true, name: true } }, assignedKam: { select: { id: true, name: true } } },
  })

  await writeAuditLog({ tenantId: session.user.tenantId, userId: session.user.id, userRole: session.user.role, targetTable: 'customers', rowId: customer.id, action: 'CREATE', newValue: JSON.stringify(body), relatedId: { type: 'customer', id: customer.id } })
  return NextResponse.json(customer, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (!canWrite(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, ...updates } = await req.json()

  // Credit fields restricted to CEO / Admin / Accountant
  if ((updates.creditLimit !== undefined || updates.creditBalance !== undefined) && !canSetCreditLimit(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden: credit limit changes require Accountant / Admin / CEO role' }, { status: 403 })
  }

  if (isKAERestrictedToOwnAccounts(session.user.role)) {
    const existing = await db.customer.findFirst({ where: { id } })
    if (existing?.assignedKaeId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Recalculate completion %
  if (updates.totalRfq !== undefined || updates.totalConverted !== undefined) {
    const current = await db.customer.findFirst({ where: { id } })
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

  let updated
  try {
    updated = await db.customer.update({ where: { id }, data: updates, include: { assignedKae: { select: { id: true, name: true } } } })
  } catch (err) {
    console.error('[Customer PATCH]', err)
    return NextResponse.json({ error: `Update failed: ${String(err)}` }, { status: 500 })
  }
  await writeAuditLog({ tenantId: session.user.tenantId, userId: session.user.id, userRole: session.user.role, targetTable: 'customers', rowId: id, action: 'UPDATE', newValue: JSON.stringify(updates), relatedId: { type: 'customer', id } })
  return NextResponse.json(updated)
}
