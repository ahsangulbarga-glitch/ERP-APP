import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canExportReport } from '@/lib/rbac'
import prisma from '@/lib/db'
import { createElement } from 'react'
import DashboardPDF from '@/components/pdf/DashboardPDF'

export const runtime = 'nodejs'

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canExportReport(session.user.role, 'dashboard')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role          = session.user.role
  const isCeoOrGm     = ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER'].includes(role)
  const isSalesMgr    = role === 'P5_SALES_MANAGER'
  const kaeColumnLabel = isCeoOrGm ? 'Manager' : 'KAE'

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [quotesAll, posAll, paymentsAll, docs] = await Promise.all([
    prisma.quotation.findMany({ orderBy: { qtnDate: 'desc' }, include: { kaeAssigned: true } }),
    prisma.pOTracker.findMany({ orderBy: { poDate: 'desc' } }),
    prisma.payment.findMany({ include: { milestones: true, quotation: true } }),
    prisma.document.findMany(),
  ])

  // Build KAE-name â†’ Sales Manager-name map for CEO/Admin view
  const kaeToManagerName: Record<string, string> = {}
  if (isCeoOrGm) {
    const allUsers = await prisma.user.findMany({ select: { id: true, name: true, createdBy: true } })
    const userById: Record<string, string> = Object.fromEntries(allUsers.map(u => [u.id, u.name]))
    for (const u of allUsers) {
      if (u.createdBy && userById[u.createdBy]) kaeToManagerName[u.name] = userById[u.createdBy]
    }
  }

  // Sales Manager: filter to their direct team KAEs only
  let teamKaeIds   = new Set<string>()
  let teamKaeNames = new Set<string>()
  if (isSalesMgr) {
    const teamKaes = await prisma.user.findMany({ where: { createdBy: session.user.id }, select: { id: true, name: true } })
    teamKaeIds   = new Set(teamKaes.map(k => k.id))
    teamKaeNames = new Set(teamKaes.map(k => k.name))
  }

  const quotes   = isSalesMgr ? quotesAll.filter(q => q.kaeAssignedId && teamKaeIds.has(q.kaeAssignedId))   : quotesAll
  const pos      = isSalesMgr ? posAll.filter(p => p.kaeName && teamKaeNames.has(p.kaeName))                 : posAll
  const payments = isSalesMgr ? paymentsAll.filter(p => p.kaeNameId && teamKaeIds.has(p.kaeNameId ?? ''))    : paymentsAll

  const totalQuoted    = quotes.reduce((s, q) => s + Number(q.amountSar), 0)
  const openValue      = quotes.filter(q => q.status === 'Open').reduce((s, q) => s + Number(q.amountSar), 0)
  const onHoldValue    = quotes.filter(q => q.status === 'OnHold').reduce((s, q) => s + Number(q.amountSar), 0)
  const convertedValue = quotes.filter(q => q.status === 'Converted').reduce((s, q) => s + Number(q.amountSar), 0)
  const totalPOExVat   = pos.reduce((s, p) => s + Number(p.poAmountExVat), 0)
  const totalPOIncVat  = pos.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
  const totalBilled    = payments.reduce((s, p) => s + Number(p.poValue), 0)
  const totalCollected = payments.reduce((s, p) => s + Number(p.poValue) * (Number(p.collectionPct) / 100), 0)
  const overduePmts    = payments.flatMap(p => p.milestones).filter(m => m.status === 'Overdue')
  const todayTs        = new Date(); todayTs.setHours(0, 0, 0, 0)
  const recentPaid     = payments
    .flatMap(p => (p.milestones ?? [])
      .filter(m => m.status === 'Paid' && m.paidAt)
      .map(m => ({
        poNumber:     p.poNumber,
        customerName: p.customerName,
        projectName:  p.quotation?.projectName || '',
        phaseName:    m.phaseName,
        amountSar:    Number(m.amountSar),
        paidAt:       m.paidAt instanceof Date ? m.paidAt.toISOString() : String(m.paidAt!),
      }))
    )
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    .slice(0, 5)
  const expiringDocs   = docs.filter(d => d.status === 'ExpiringSoon' || d.status === 'Expired').length
  const activeValue    = openValue + onHoldValue + convertedValue

  const data = {
    reportDate: today(),
    kaeColumnLabel,
    totalQuoted, totalPOIncVat, totalCollected,
    totalOutstanding: totalBilled - totalCollected,
    totalBilled,
    winRate: totalQuoted > 0 ? (convertedValue / totalQuoted) * 100 : 0,
    collectionRate: totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0,
    statusCounts: {
      open:      quotes.filter(q => q.status === 'Open').length,
      converted: quotes.filter(q => q.status === 'Converted').length,
      onHold:    quotes.filter(q => q.status === 'OnHold').length,
      lost:      quotes.filter(q => q.status === 'Lost').length,
    },
    overdueCount: overduePmts.length,
    expiringDocs,
    funnel: [
      { name: 'Total Quoted',    value: totalQuoted,    pct: 100 },
      { name: 'Active Pipeline', value: activeValue,    pct: totalQuoted > 0 ? (activeValue / totalQuoted) * 100 : 0 },
      { name: 'Converted',       value: convertedValue, pct: totalQuoted > 0 ? (convertedValue / totalQuoted) * 100 : 0 },
      { name: 'PO Raised',       value: totalPOExVat,   pct: totalQuoted > 0 ? (totalPOExVat / totalQuoted) * 100 : 0 },
      { name: 'Collected',       value: totalCollected, pct: totalQuoted > 0 ? (totalCollected / totalQuoted) * 100 : 0 },
    ],
    newPOs: pos
      .filter(p => new Date(p.poDate) >= thirtyDaysAgo)
      .slice(0, 20)
      .map(p => ({
        poNumber:         p.poNumber        || '',
        customerName:     p.customerName    || '',
        projectName:      p.projectName     || '',
        kaeName:          isCeoOrGm ? (kaeToManagerName[p.kaeName || ''] || p.kaeName || 'â€”') : (p.kaeName || 'â€”'),
        totalValueIncVat: Number(p.totalValueIncVat),
        poAmountExVat:    Number(p.poAmountExVat),
        paymentTermsSplit: p.paymentTermsSplit || '',
        paymentStatus:    p.paymentStatus    || '',
        poDate:           p.poDate instanceof Date ? p.poDate.toISOString() : String(p.poDate),
      })),
    openPipeline: quotes
      .filter(q => q.status === 'Open' || q.status === 'OnHold')
      .sort((a, b) => new Date(b.qtnDate).getTime() - new Date(a.qtnDate).getTime())
      .slice(0, 20)
      .map(q => ({
        qtRef:        q.qtRef        || '',
        status:       q.status,
        customerName: q.customerName,
        projectName:  q.projectName  || '',
        amountSar:    Number(q.amountSar),
        rfqCode:      q.rfqCode      || '',
        kaeName:      q.kaeAssigned?.name || '',
        qtnDate:      q.qtnDate instanceof Date ? q.qtnDate.toISOString() : String(q.qtnDate),
        remarks:      q.remarks      || '',
      })),
    recentPaid,
    upcomingPayments: payments
      .flatMap(p => (p.milestones ?? [])
        .filter(m => m.status === 'Pending' && new Date(m.dueDate) > todayTs)
        .map(m => ({
          poNumber:     p.poNumber,
          customerName: p.customerName,
          projectName:  p.quotation?.projectName || '',
          phaseName:    m.phaseName,
          amountSar:    Number(m.amountSar),
          dueDate:      m.dueDate instanceof Date ? m.dueDate.toISOString() : String(m.dueDate),
          daysUntilDue: Math.round((new Date(m.dueDate).getTime() - todayTs.getTime()) / 86_400_000),
        }))
      )
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5),
    overduePayments: payments
      .flatMap(p => (p.milestones ?? [])
        .filter(m => m.status === 'Overdue')
        .map(m => ({
          poNumber:     p.poNumber,
          customerName: p.customerName,
          projectName:  p.quotation?.projectName || '',
          phaseName:    m.phaseName,
          amountSar:    Number(m.amountSar),
          dueDate:      m.dueDate instanceof Date ? m.dueDate.toISOString() : String(m.dueDate),
          overdueDays:  Math.round((todayTs.getTime() - new Date(m.dueDate).getTime()) / 86_400_000),
        }))
      ),
  }

  const { renderToBuffer } = await import('@react-pdf/renderer')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer: Buffer = await renderToBuffer(createElement(DashboardPDF, { data }) as any)

  const filename = `DLIT-Executive-Dashboard-${today().replace(/\//g, '-')}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
