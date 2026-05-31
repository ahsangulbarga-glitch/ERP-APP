import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canExportReport } from '@/lib/rbac'
import prisma from '@/lib/db'
import { createElement } from 'react'
import PerformancePDF from '@/components/pdf/PerformancePDF'

export const runtime = 'nodejs'

const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canExportReport(session.user.role, 'performance')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const isSalesMgr = session.user.role === 'P5_SALES_MANAGER'
  // Sales Manager: scope to their direct team only
  const teamFilter = isSalesMgr ? { createdBy: session.user.id } : {}

  const kaes = await prisma.user.findMany({ where: { role: 'P6_KEY_ACCOUNT_ENGINEER', isActive: true, ...teamFilter } })
  const ises = await prisma.user.findMany({ where: { role: 'P7_INSIDE_SALES_ENGINEER', isActive: true, ...teamFilter } })

  const kaeLeaderboard = await Promise.all(kaes.map(async kae => {
    const customers = await prisma.customer.findMany({ where: { assignedKaeId: kae.id } })
    const pos       = await prisma.pOTracker.findMany({ where: { kaeName: kae.name } })
    const totalRfq  = customers.reduce((s, c) => s + c.totalRfq, 0)
    const converted = customers.reduce((s, c) => s + c.totalConverted, 0)
    const revenue   = pos.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
    const avgColl   = pos.length > 0 ? pos.reduce((s, p) => s + Number(p.paymentCollectionPct), 0) / pos.length : 0
    return { name: kae.name, totalRfq, converted, revenue, avgCollection: avgColl, winRate: totalRfq > 0 ? (converted / totalRfq) * 100 : 0 }
  }))
  kaeLeaderboard.sort((a, b) => b.revenue - a.revenue)

  const isePipeline = await Promise.all(ises.map(async ise => {
    const quotes = await prisma.quotation.findMany({ where: { kaeAssignedId: ise.id } })
    return {
      name:          ise.name,
      openQuotes:    quotes.filter(q => q.status === 'Open').length,
      pipelineValue: quotes.filter(q => q.status === 'Open').reduce((s, q) => s + Number(q.amountSar), 0),
      avgRevisions:  quotes.length > 0 ? quotes.reduce((s, q) => s + q.revisionNumber, 0) / quotes.length : 0,
    }
  }))

  const overdueMilestones = await prisma.paymentMilestone.findMany({ where: { status: 'Overdue' } })
  const avgOverdueDays    = overdueMilestones.length > 0
    ? overdueMilestones.reduce((s, m) => s + Math.round((today.getTime() - new Date(m.dueDate).getTime()) / 86_400_000), 0) / overdueMilestones.length
    : 0

  const data = {
    reportDate: todayStr(),
    totalTeamRevenue: kaeLeaderboard.reduce((s, k) => s + k.revenue, 0),
    overdueCount:     overdueMilestones.length,
    avgOverdueDays,
    kaeCount: kaes.length,
    iseCount: ises.length,
    kaeLeaderboard,
    isePipeline,
  }

  const { renderToBuffer } = await import('@react-pdf/renderer')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer: Buffer = await renderToBuffer(createElement(PerformancePDF, { data }) as any)

  const filename = `DLIT-Performance-${todayStr().replace(/\//g, '-')}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
