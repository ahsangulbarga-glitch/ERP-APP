import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite } from '@/lib/rbac'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'materials')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search      = searchParams.get('search')
  const availability = searchParams.get('availability')
  const orderToFactory = searchParams.get('orderToFactory')

  const where: Record<string, unknown> = {}
  if (search) where.OR = [
    { productRef:  { contains: search } },
    { description: { contains: search } },
  ]
  if (availability) where.stockAvailability = availability
  if (orderToFactory === 'true')  where.orderToFactory = true
  if (orderToFactory === 'false') where.orderToFactory = false

  const rows = await prisma.materialItem.findMany({ where, orderBy: { productRef: 'asc' } })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'materials')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { productRef, description, specifications, stockAvailability, quantity, orderToFactory, remarks, reservedQty, reservedForPO } = body

  if (!productRef?.trim()) return NextResponse.json({ error: 'Product Reference is required' }, { status: 400 })
  if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 })

  const qty    = parseInt(quantity) || 0
  const rsvQty = parseInt(reservedQty) || 0
  const avail  = stockAvailability || 'In Stock'

  if (avail === 'Reserved') {
    if (!reservedForPO?.trim()) return NextResponse.json({ error: 'PO number is required when status is Reserved' }, { status: 400 })
    if (rsvQty <= 0)            return NextResponse.json({ error: 'Reserved quantity must be greater than 0' }, { status: 400 })
    if (rsvQty > qty)           return NextResponse.json({ error: 'Reserved quantity cannot exceed total quantity' }, { status: 400 })
  }

  const existing = await prisma.materialItem.findUnique({ where: { productRef: productRef.trim() } })
  if (existing) return NextResponse.json({ error: `Product Ref "${productRef}" already exists` }, { status: 409 })

  const item = await prisma.materialItem.create({
    data: {
      productRef:        productRef.trim().toUpperCase(),
      description:       description.trim(),
      specifications:    specifications?.trim() || null,
      stockAvailability: avail,
      quantity:          qty,
      reservedQty:       avail === 'Reserved' ? rsvQty : 0,
      reservedForPO:     avail === 'Reserved' ? (reservedForPO?.trim() || null) : null,
      orderToFactory:    Boolean(orderToFactory),
      remarks:           remarks || null,
      createdBy:         session.user.id,
    },
  })
  return NextResponse.json(item, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'materials')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await prisma.materialItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (updates.productRef) updates.productRef = updates.productRef.trim().toUpperCase()
  if (updates.quantity !== undefined) updates.quantity = parseInt(updates.quantity) || 0
  if (updates.orderToFactory !== undefined) updates.orderToFactory = Boolean(updates.orderToFactory)
  if (updates.reservedQty !== undefined) updates.reservedQty = parseInt(updates.reservedQty) || 0

  // Validate reservation fields
  if (updates.stockAvailability === 'Reserved') {
    if (!updates.reservedForPO?.trim()) return NextResponse.json({ error: 'PO number is required when status is Reserved' }, { status: 400 })
    const qty    = updates.quantity ?? existing.quantity
    const rsvQty = updates.reservedQty ?? existing.reservedQty
    if (rsvQty <= 0)  return NextResponse.json({ error: 'Reserved quantity must be greater than 0' }, { status: 400 })
    if (rsvQty > qty) return NextResponse.json({ error: 'Reserved quantity cannot exceed total quantity' }, { status: 400 })
  }
  // Clear reservation data when switching away from Reserved
  if (updates.stockAvailability && updates.stockAvailability !== 'Reserved') {
    updates.reservedQty   = 0
    updates.reservedForPO = null
  }

  const updated = await prisma.materialItem.update({ where: { id }, data: updates })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'materials')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  await prisma.materialItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
