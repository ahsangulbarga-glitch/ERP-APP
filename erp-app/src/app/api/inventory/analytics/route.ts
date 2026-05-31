import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead } from '@/lib/rbac'
import prisma from '@/lib/db'

const HIGH_THRESHOLD = 4   // turnover ratio >= 4 → High-Performing
const SLOW_THRESHOLD = 1   // turnover ratio >= 1 → Slow-Moving, else Dead Stock

export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'inventoryAnalytics'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  // Fetch all materials with their 12-month transactions
  const materials = await prisma.materialItem.findMany({
    include: {
      transactions: {
        where: { transactionDate: { gte: twelveMonthsAgo } },
        orderBy: { transactionDate: 'asc' },
      },
    },
    orderBy: { productRef: 'asc' },
  })

  const items = materials.map(mat => {
    const issues   = mat.transactions.filter(t => t.type === 'ISSUE')
    const receipts = mat.transactions.filter(t => t.type === 'RECEIPT')

    // COGS = sum of (|quantity| * unitCost) for all ISSUE transactions
    const cogs = issues.reduce((sum, t) => sum + Math.abs(t.quantity) * t.unitCost, 0)

    // Average inventory value over the period
    // Opening value = quantity at start of period * unitCost (approximated)
    const totalReceived = receipts.reduce((s, t) => s + t.quantity, 0)
    const totalIssued   = issues.reduce((s, t) => s + Math.abs(t.quantity), 0)
    const openingQty    = Math.max(0, mat.quantity - totalReceived + totalIssued)
    const openingValue  = openingQty * mat.unitCost
    const closingValue  = mat.quantity * mat.unitCost
    const avgInventory  = (openingValue + closingValue) / 2

    const turnoverRatio = avgInventory > 0 ? parseFloat((cogs / avgInventory).toFixed(2)) : cogs > 0 ? 99 : 0

    const category: 'High-Performing' | 'Slow-Moving' | 'Dead Stock' =
      turnoverRatio >= HIGH_THRESHOLD ? 'High-Performing' :
      turnoverRatio >= SLOW_THRESHOLD ? 'Slow-Moving' : 'Dead Stock'

    return {
      id: mat.id,
      productRef: mat.productRef,
      description: mat.description,
      turnoverRatio,
      category,
      cogs: parseFloat(cogs.toFixed(2)),
      avgInventoryValue: parseFloat(avgInventory.toFixed(2)),
      currentStock: mat.quantity,
      unitCost: mat.unitCost,
      issueCount: issues.length,
      stockAvailability: mat.stockAvailability,
    }
  })

  // Monthly breakdown for the bar chart (last 12 months)
  const monthlyMap: Record<string, { issues: number; receipts: number; cogs: number }> = {}
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    monthlyMap[key] = { issues: 0, receipts: 0, cogs: 0 }
  }

  for (const mat of materials) {
    for (const tx of mat.transactions) {
      const key = new Date(tx.transactionDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      if (!monthlyMap[key]) continue
      if (tx.type === 'ISSUE') {
        monthlyMap[key].issues   += Math.abs(tx.quantity)
        monthlyMap[key].cogs     += Math.abs(tx.quantity) * tx.unitCost
      } else if (tx.type === 'RECEIPT') {
        monthlyMap[key].receipts += tx.quantity
      }
    }
  }

  const monthlyBreakdown = Object.entries(monthlyMap).map(([month, v]) => ({
    month,
    totalIssues:   parseFloat(v.issues.toFixed(1)),
    totalReceipts: parseFloat(v.receipts.toFixed(1)),
    totalCogs:     parseFloat(v.cogs.toFixed(2)),
  }))

  const highPerforming = items.filter(i => i.category === 'High-Performing').length
  const slowMoving     = items.filter(i => i.category === 'Slow-Moving').length
  const deadStock      = items.filter(i => i.category === 'Dead Stock').length
  const ratios         = items.filter(i => i.turnoverRatio < 99).map(i => i.turnoverRatio)
  const avgRatio       = ratios.length ? parseFloat((ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)) : 0

  return NextResponse.json({
    summary: { highPerforming, slowMoving, deadStock, totalItems: items.length, avgTurnoverRatio: avgRatio },
    items,
    monthlyBreakdown,
    thresholds: { high: HIGH_THRESHOLD, slow: SLOW_THRESHOLD },
  })
}
