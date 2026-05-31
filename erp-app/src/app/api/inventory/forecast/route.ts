import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead } from '@/lib/rbac'
import prisma from '@/lib/db'

// Simple linear regression: returns { slope, intercept }
function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 }
  const sumX  = points.reduce((s, p) => s + p.x, 0)
  const sumY  = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1)
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'inventoryAnalytics'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')
  const forecastMonths = Math.ceil(days / 30)

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const materials = await prisma.materialItem.findMany({
    include: {
      transactions: {
        where: { type: 'ISSUE', transactionDate: { gte: twelveMonthsAgo } },
        orderBy: { transactionDate: 'asc' },
      },
    },
  })

  // Build ordered 12-month labels
  const monthLabels: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    monthLabels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
  }

  // Aggregate total monthly issues across all items
  const monthlyTotals: Record<string, number> = {}
  monthLabels.forEach(m => (monthlyTotals[m] = 0))

  for (const mat of materials) {
    for (const tx of mat.transactions) {
      const key = new Date(tx.transactionDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      if (monthlyTotals[key] !== undefined) monthlyTotals[key] += Math.abs(tx.quantity)
    }
  }

  const historical = monthLabels.map((month, i) => ({
    month,
    totalQty: parseFloat(monthlyTotals[month].toFixed(1)),
    index: i,
  }))

  // Overall linear regression on monthly totals
  const regPoints = historical.map(h => ({ x: h.index, y: h.totalQty }))
  const { slope, intercept } = linearRegression(regPoints)

  // Project forecast months
  const forecast = Array.from({ length: forecastMonths }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() + i + 1)
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const predicted = Math.max(0, slope * (12 + i) + intercept)
    return {
      month: label,
      forecastQty: parseFloat(predicted.toFixed(1)),
      isForecast: true,
    }
  })

  // Per-item forecast (top items by avg monthly demand)
  type ItemForecast = {
    id: string; productRef: string; description: string
    avgMonthlyDemand: number; forecastedQty: number; currentStock: number
    daysOfStockLeft: number; restockRecommended: boolean; stockAvailability: string
  }

  const itemForecasts: ItemForecast[] = materials
    .flatMap(mat => {
      const monthlyIssues: Record<string, number> = {}
      monthLabels.forEach(m => (monthlyIssues[m] = 0))
      for (const tx of mat.transactions) {
        const key = new Date(tx.transactionDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        if (monthlyIssues[key] !== undefined) monthlyIssues[key] += Math.abs(tx.quantity)
      }

      const monthly = Object.values(monthlyIssues)
      const nonZero = monthly.filter(v => v > 0)
      if (nonZero.length === 0) return []

      const avgMonthlyDemand = nonZero.reduce((a, b) => a + b, 0) / nonZero.length
      const pts = monthLabels.map((m, i) => ({ x: i, y: monthlyIssues[m] }))
      const { slope: s, intercept: ic } = linearRegression(pts)
      const forecastedQty = Math.max(0, (s * 12 + ic) * forecastMonths)
      const dailyDemand = avgMonthlyDemand / 30
      const daysOfStockLeft = dailyDemand > 0 ? Math.floor(mat.quantity / dailyDemand) : 999

      return [{
        id: mat.id,
        productRef: mat.productRef,
        description: mat.description,
        avgMonthlyDemand: parseFloat(avgMonthlyDemand.toFixed(1)),
        forecastedQty: parseFloat(forecastedQty.toFixed(1)),
        currentStock: mat.quantity,
        daysOfStockLeft,
        restockRecommended: daysOfStockLeft < days,
        stockAvailability: mat.stockAvailability,
      }]
    })
    .sort((a, b) => a.daysOfStockLeft - b.daysOfStockLeft)
    .slice(0, 15)

  return NextResponse.json({ historical, forecast, itemForecasts, days, forecastMonths })
}
