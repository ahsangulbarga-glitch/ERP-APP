import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead, canWrite } from '@/lib/rbac'
import prisma from '@/lib/db'

type ValuationMethod = 'FIFO' | 'LIFO' | 'WEIGHTED_AVERAGE'

function computeItemValue(
  quantity: number,
  unitCost: number,
  lots: { lotDate: Date; remainingQty: number; unitCost: number }[],
  method: ValuationMethod,
): number {
  if (quantity <= 0) return 0

  if (method === 'WEIGHTED_AVERAGE') {
    // Use materialItem.unitCost (weighted average maintained on the item)
    return quantity * unitCost
  }

  // FIFO / LIFO — consume lots until quantity is satisfied
  const ordered = [...lots].sort((a, b) =>
    method === 'FIFO'
      ? new Date(a.lotDate).getTime() - new Date(b.lotDate).getTime()
      : new Date(b.lotDate).getTime() - new Date(a.lotDate).getTime(),
  )

  let remaining = quantity
  let totalValue = 0
  for (const lot of ordered) {
    if (remaining <= 0) break
    const used = Math.min(lot.remainingQty, remaining)
    totalValue += used * lot.unitCost
    remaining -= used
  }
  // If lots don't cover full quantity (data gap), fill remainder at unitCost
  if (remaining > 0) totalValue += remaining * unitCost

  return totalValue
}

export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'inventoryAnalytics'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await prisma.stockValuationConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', method: 'WEIGHTED_AVERAGE' },
    update: {},
  })

  const method = config.method as ValuationMethod

  const materials = await prisma.materialItem.findMany({
    include: { lots: { orderBy: { lotDate: 'asc' } } },
    orderBy: { productRef: 'asc' },
  })

  const items = materials.map(mat => {
    const value = computeItemValue(mat.quantity, mat.unitCost, mat.lots, method)
    return {
      id: mat.id,
      productRef: mat.productRef,
      description: mat.description,
      quantity: mat.quantity,
      unitCost: mat.unitCost,
      totalValue: parseFloat(value.toFixed(2)),
      stockAvailability: mat.stockAvailability,
      reservedQty: mat.reservedQty,
    }
  })

  const totalValue   = items.reduce((s, i) => s + i.totalValue, 0)
  const totalUnits   = items.reduce((s, i) => s + i.quantity, 0)
  const totalItems   = items.length

  // Group by availability for the bar chart
  const availMap: Record<string, { count: number; value: number }> = {}
  for (const item of items) {
    const k = item.stockAvailability
    if (!availMap[k]) availMap[k] = { count: 0, value: 0 }
    availMap[k].count += 1
    availMap[k].value += item.totalValue
  }
  const byAvailability = Object.entries(availMap).map(([status, v]) => ({
    status,
    itemCount: v.count,
    totalValue: parseFloat(v.value.toFixed(2)),
  }))

  return NextResponse.json({
    config: { method },
    summary: { totalItems, totalUnits, totalValue: parseFloat(totalValue.toFixed(2)), currency: 'SAR' },
    byAvailability,
    items: items.sort((a, b) => b.totalValue - a.totalValue),
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(session.user.role, 'inventoryAnalytics'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { method } = await req.json() as { method: ValuationMethod }
  if (!['FIFO', 'LIFO', 'WEIGHTED_AVERAGE'].includes(method))
    return NextResponse.json({ error: 'Invalid method' }, { status: 400 })

  const config = await prisma.stockValuationConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', method, updatedBy: session.user.email },
    update: { method, updatedBy: session.user.email },
  })

  return NextResponse.json({ config })
}
