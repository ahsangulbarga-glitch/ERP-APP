import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canExportReport } from '@/lib/rbac'
import prisma from '@/lib/db'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require('pptxgenjs')

export const runtime = 'nodejs'

const DLIT_BLUE  = '1A5096'
const LIGHT_GREY = 'F2F2F2'
const HDR_GREY   = 'D9D9D9'
const DARK_BG    = '0F172A'

const fmtNum  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtShrt = (n: number) =>
  n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `SAR ${(n / 1_000).toFixed(0)}K`
  : `SAR ${n.toFixed(0)}`

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
const fmtDate = (d: string | Date) => {
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
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

  // â”€â”€ Fetch all data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Derived metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalQuoted      = quotes.reduce((s, q) => s + Number(q.amountSar), 0)
  const openValue        = quotes.filter(q => q.status === 'Open').reduce((s, q) => s + Number(q.amountSar), 0)
  const onHoldValue      = quotes.filter(q => q.status === 'OnHold').reduce((s, q) => s + Number(q.amountSar), 0)
  const convertedValue   = quotes.filter(q => q.status === 'Converted').reduce((s, q) => s + Number(q.amountSar), 0)
  const totalPOExVat     = pos.reduce((s, p) => s + Number(p.poAmountExVat), 0)
  const totalPOIncVat    = pos.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
  const totalBilled      = payments.reduce((s, p) => s + Number(p.poValue), 0)
  const totalCollected   = payments.reduce((s, p) => s + Number(p.poValue) * (Number(p.collectionPct) / 100), 0)
  const totalOutstanding = totalBilled - totalCollected
  const overduePmts      = payments.flatMap(p => p.milestones).filter(m => m.status === 'Overdue')
  const expiringDocs     = docs.filter(d => d.status === 'ExpiringSoon' || d.status === 'Expired').length
  const winRate          = totalQuoted > 0 ? (convertedValue / totalQuoted) * 100 : 0

  const activeValue = openValue + onHoldValue + convertedValue
  const funnel = [
    { name: 'Total Quoted',    value: totalQuoted,    pct: 100 },
    { name: 'Active Pipeline', value: activeValue,    pct: totalQuoted > 0 ? (activeValue / totalQuoted) * 100 : 0 },
    { name: 'Converted',       value: convertedValue, pct: totalQuoted > 0 ? (convertedValue / totalQuoted) * 100 : 0 },
    { name: 'PO Raised',       value: totalPOExVat,   pct: totalQuoted > 0 ? (totalPOExVat / totalQuoted) * 100 : 0 },
    { name: 'Collected',       value: totalCollected, pct: totalQuoted > 0 ? (totalCollected / totalQuoted) * 100 : 0 },
  ]

  const statusCounts = {
    Open:      quotes.filter(q => q.status === 'Open').length,
    Converted: quotes.filter(q => q.status === 'Converted').length,
    OnHold:    quotes.filter(q => q.status === 'OnHold').length,
    Lost:      quotes.filter(q => q.status === 'Lost').length,
  }

  // â”€â”€ Recent payments received (top 5 paid milestones) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const recentPaid = payments
    .flatMap(p => (p.milestones ?? [])
      .filter(m => m.status === 'Paid' && m.paidAt)
      .map(m => ({
        poNumber:     p.poNumber,
        customerName: p.customerName,
        projectName:  p.quotation?.projectName || '',
        phaseName:    m.phaseName,
        amountSar:    Number(m.amountSar),
        paidAt:       m.paidAt!,
      }))
    )
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    .slice(0, 5)

  // â”€â”€ Upcoming payments (next 5 pending milestones) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const todayTs = new Date(); todayTs.setHours(0, 0, 0, 0)
  const upcomingPayments = payments
    .flatMap(p => (p.milestones ?? [])
      .filter(m => m.status === 'Pending' && new Date(m.dueDate) > todayTs)
      .map(m => ({
        poNumber:     p.poNumber,
        customerName: p.customerName,
        projectName:  p.quotation?.projectName || '',
        phaseName:    m.phaseName,
        amountSar:    Number(m.amountSar),
        dueDate:      m.dueDate,
        daysUntilDue: Math.round((new Date(m.dueDate).getTime() - todayTs.getTime()) / 86_400_000),
      }))
    )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5)

  // â”€â”€ New POs (last 30 days) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const newPOs = pos
    .filter(p => new Date(p.poDate) >= thirtyDaysAgo)
    .slice(0, 15)

  // â”€â”€ Open Pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const openPipeline = quotes
    .filter(q => q.status === 'Open' || q.status === 'OnHold')
    .sort((a, b) => new Date(b.qtnDate).getTime() - new Date(a.qtnDate).getTime())
    .slice(0, 15)

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title  = `Executive Dashboard â€” ${today()}`

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 1: Cover / KPI Summary
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s1 = pptx.addSlide()
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 1.4, fill: { color: DARK_BG } })
  s1.addText('EXECUTIVE DASHBOARD', {
    x: 0.3, y: 0.15, w: 9, h: 0.7,
    fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
  })
  s1.addText('Dynamic Line International Trading', {
    x: 0.3, y: 0.82, w: 9, h: 0.4,
    fontSize: 15, color: '94A3B8', fontFace: 'Times New Roman',
  })
  s1.addText(`Report Date: ${today()}`, {
    x: 9.5, y: 0.9, w: 3, h: 0.35,
    fontSize: 11, color: '94A3B8', fontFace: 'Times New Roman', align: 'right',
  })

  // KPI cards
  const kpis = [
    { label: 'Total Pipeline',     value: fmtShrt(totalQuoted),      sub: `${quotes.length} quotations` },
    { label: 'PO Value (inc-VAT)', value: fmtShrt(totalPOIncVat),    sub: `${winRate.toFixed(1)}% win rate` },
    { label: 'Collected',          value: fmtShrt(totalCollected),    sub: `${totalBilled > 0 ? ((totalCollected/totalBilled)*100).toFixed(1) : 0}% of billed` },
    { label: 'AR Outstanding',     value: fmtShrt(totalOutstanding),  sub: overduePmts.length > 0 ? `${overduePmts.length} overdue` : 'No overdue' },
  ]
  kpis.forEach((kpi, i) => {
    const x = 0.3 + i * 3.1
    s1.addShape(pptx.ShapeType.rect, { x, y: 1.6, w: 2.9, h: 1.0, fill: { color: LIGHT_GREY }, line: { color: 'E2E8F0', width: 0.5 } })
    s1.addText(kpi.label, { x: x + 0.12, y: 1.65, w: 2.7, h: 0.3, fontSize: 10, color: '64748B', fontFace: 'Times New Roman' })
    s1.addText(kpi.value, { x: x + 0.12, y: 1.92, w: 2.7, h: 0.42, fontSize: 15, bold: true, color: DLIT_BLUE, fontFace: 'Times New Roman' })
    s1.addText(kpi.sub,   { x: x + 0.12, y: 2.32, w: 2.7, h: 0.22, fontSize: 9,  color: '94A3B8', fontFace: 'Times New Roman' })
  })

  // Status counts row
  const statuses = [
    { label: 'Open Quotes',      count: statusCounts.Open,      color: '2563EB' },
    { label: 'On Hold',          count: statusCounts.OnHold,    color: 'D97706' },
    { label: 'Converted',        count: statusCounts.Converted, color: '16A34A' },
    { label: 'Lost',             count: statusCounts.Lost,      color: 'DC2626' },
    { label: 'Expiring Docs',    count: expiringDocs,           color: 'DC2626' },
    { label: 'Overdue Payments', count: overduePmts.length,     color: 'DC2626' },
  ]
  statuses.forEach((st, i) => {
    const x = 0.3 + i * 2.05
    s1.addShape(pptx.ShapeType.rect, { x, y: 2.75, w: 1.95, h: 0.7, fill: { color: LIGHT_GREY }, line: { color: 'E2E8F0', width: 0.5 } })
    s1.addText(String(st.count), { x: x + 0.1, y: 2.8,  w: 1.75, h: 0.35, fontSize: 20, bold: true, color: st.color, fontFace: 'Times New Roman' })
    s1.addText(st.label,         { x: x + 0.1, y: 3.12, w: 1.75, h: 0.28, fontSize: 9,  color: '64748B', fontFace: 'Times New Roman' })
  })

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 2: Sales Pipeline Funnel
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s2 = pptx.addSlide()
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
  s2.addText('Sales Pipeline Funnel', { x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman' })

  const funnelCols = ['Stage', 'Value (SAR)', '% of Pipeline']
  const funnelColW = [3.5, 3.0, 2.5]
  let fx = 0.5
  funnelCols.forEach((col, i) => {
    s2.addShape(pptx.ShapeType.rect, { x: fx, y: 0.9, w: funnelColW[i], h: 0.42, fill: { color: HDR_GREY }, line: { color: 'AAAAAA', width: 0.3 } })
    s2.addText(col, { x: fx + 0.05, y: 0.93, w: funnelColW[i] - 0.1, h: 0.34, fontSize: 11, bold: true, fontFace: 'Times New Roman', align: 'center' })
    fx += funnelColW[i]
  })
  const funnelColors = ['2563EB', '0891B2', '16A34A', '059669', '7C3AED']
  funnel.forEach((row, ri) => {
    const y = 1.36 + ri * 0.48
    const fill = ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
    let cx = 0.5
    const cells = [row.name, fmtNum(row.value), `${row.pct.toFixed(1)}%`]
    cells.forEach((cell, ci) => {
      s2.addShape(pptx.ShapeType.rect, { x: cx, y, w: funnelColW[ci], h: 0.44, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
      s2.addText(cell, {
        x: cx + 0.05, y: y + 0.05, w: funnelColW[ci] - 0.1, h: 0.34,
        fontSize: 11, fontFace: 'Times New Roman',
        align: ci === 0 ? 'left' : 'right',
        bold: ci === 0,
        color: ci === 0 ? funnelColors[ri] : '333333',
      })
      cx += funnelColW[ci]
    })
  })

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 3: New POs Received (last 30 days)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s3 = pptx.addSlide()
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
  s3.addText(`New POs Received â€” Last 30 Days (${newPOs.length})`, {
    x: 0.25, y: 0.1, w: 12.5, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
  })

  const poCols = ['PO Number', 'Customer', 'Project', kaeColumnLabel, 'Inc-VAT (SAR)', 'Ex-VAT (SAR)', 'Pymt Terms', 'Status', 'Date']
  const poColW = [1.3, 2.0, 2.2, 1.2, 1.4, 1.3, 1.5, 0.95, 1.0]
  let px = 0.25
  poCols.forEach((col, i) => {
    s3.addShape(pptx.ShapeType.rect, { x: px, y: 0.88, w: poColW[i], h: 0.42, fill: { color: HDR_GREY }, line: { color: 'AAAAAA', width: 0.3 } })
    s3.addText(col, { x: px + 0.04, y: 0.91, w: poColW[i] - 0.08, h: 0.34, fontSize: 8, bold: true, fontFace: 'Times New Roman', align: 'center' })
    px += poColW[i]
  })

  if (newPOs.length === 0) {
    s3.addText('No POs received in the last 30 days.', { x: 0.3, y: 1.5, w: 12, h: 0.4, fontSize: 11, color: '94A3B8', fontFace: 'Times New Roman' })
  } else {
    newPOs.forEach((po, ri) => {
      const y = 1.34 + ri * 0.40
      const fill = ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
      const statusColor =
        po.paymentStatus === 'Fully Collected'    ? '15803D' :
        po.paymentStatus === 'Partially Collected' ? 'B45309' : 'B91C1C'
      let cx = 0.25
      const cells = [
        po.poNumber      || 'â€”',
        po.customerName  || 'â€”',
        po.projectName   || 'â€”',
        isCeoOrGm ? (kaeToManagerName[po.kaeName || ''] || po.kaeName || 'â€”') : (po.kaeName || 'â€”'),
        fmtNum(Number(po.totalValueIncVat)),
        fmtNum(Number(po.poAmountExVat)),
        po.paymentTermsSplit || 'â€”',
        po.paymentStatus     || 'â€”',
        fmtDate(po.poDate),
      ]
      cells.forEach((cell, ci) => {
        s3.addShape(pptx.ShapeType.rect, { x: cx, y, w: poColW[ci], h: 0.36, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
        s3.addText(cell, {
          x: cx + 0.03, y: y + 0.03, w: poColW[ci] - 0.06, h: 0.30,
          fontSize: 8, fontFace: 'Times New Roman',
          align: ci === 4 || ci === 5 ? 'right' : ci === 0 || ci === 8 ? 'center' : 'left',
          color: ci === 7 ? statusColor : '1e293b',
          bold: ci === 4,
        })
        cx += poColW[ci]
      })
    })
    // Totals row
    const poTotalY = 1.34 + newPOs.length * 0.40
    const poTotalIncVat = newPOs.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
    const poTotalExVat  = newPOs.reduce((s, p) => s + Number(p.poAmountExVat), 0)
    const poLabelW = poColW[0] + poColW[1] + poColW[2] + poColW[3]
    const poRestW  = poColW[6] + poColW[7] + poColW[8]
    ;[
      { text: `TOTAL â€” ${newPOs.length} PO${newPOs.length !== 1 ? 's' : ''}`, w: poLabelW, align: 'left',  bold: true,  color: DLIT_BLUE },
      { text: fmtNum(poTotalIncVat), w: poColW[4], align: 'right', bold: true,  color: DLIT_BLUE },
      { text: fmtNum(poTotalExVat),  w: poColW[5], align: 'right', bold: true,  color: '333333'  },
      { text: '',                    w: poRestW,   align: 'left',  bold: false, color: '333333'  },
    ].reduce((x, cell) => {
      s3.addShape(pptx.ShapeType.rect, { x, y: poTotalY, w: cell.w, h: 0.36, fill: { color: 'DBEAFE' }, line: { color: '93C5FD', width: 0.3 } })
      s3.addText(cell.text, { x: x + 0.03, y: poTotalY + 0.03, w: cell.w - 0.06, h: 0.30, fontSize: 8, fontFace: 'Times New Roman', align: cell.align as 'left'|'right', bold: cell.bold, color: cell.color })
      return x + cell.w
    }, 0.25)
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 4: Open Pipeline
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s4 = pptx.addSlide()
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
  s4.addText(`Open Pipeline â€” Open & On Hold (${openPipeline.length})`, {
    x: 0.25, y: 0.1, w: 12.5, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
  })

  const pipeCols = ['Ref', 'Status', 'Customer', 'Project', 'Value (SAR)', 'KAE', 'Date', 'Remarks']
  const pipeColW = [1.5, 0.85, 2.1, 2.3, 1.5, 1.4, 0.95, 2.55]
  let ppx = 0.25
  pipeCols.forEach((col, i) => {
    s4.addShape(pptx.ShapeType.rect, { x: ppx, y: 0.88, w: pipeColW[i], h: 0.42, fill: { color: HDR_GREY }, line: { color: 'AAAAAA', width: 0.3 } })
    s4.addText(col, { x: ppx + 0.04, y: 0.91, w: pipeColW[i] - 0.08, h: 0.34, fontSize: 8, bold: true, fontFace: 'Times New Roman', align: 'center' })
    ppx += pipeColW[i]
  })

  if (openPipeline.length === 0) {
    s4.addText('No open quotations in the pipeline.', { x: 0.3, y: 1.5, w: 12, h: 0.4, fontSize: 11, color: '94A3B8', fontFace: 'Times New Roman' })
  } else {
    openPipeline.forEach((q, ri) => {
      const y = 1.34 + ri * 0.40
      const fill = ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
      const statusColor = q.status === 'Open' ? '2563EB' : 'D97706'
      let cx = 0.25
      const cells = [
        q.qtRef        || 'â€”',
        q.status,
        q.customerName || 'â€”',
        q.projectName  || 'â€”',
        fmtNum(Number(q.amountSar)),
        q.kaeAssigned?.name || 'â€”',
        fmtDate(q.qtnDate),
        q.remarks      || 'â€”',
      ]
      cells.forEach((cell, ci) => {
        s4.addShape(pptx.ShapeType.rect, { x: cx, y, w: pipeColW[ci], h: 0.36, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
        s4.addText(cell, {
          x: cx + 0.03, y: y + 0.03, w: pipeColW[ci] - 0.06, h: 0.30,
          fontSize: 8, fontFace: 'Times New Roman',
          align: ci === 4 ? 'right' : ci === 1 || ci === 6 ? 'center' : 'left',
          color: ci === 1 ? statusColor : '1e293b',
          bold: ci === 1 || ci === 4,
        })
        cx += pipeColW[ci]
      })
    })
    // Totals row
    const pipeTotalY = 1.34 + openPipeline.length * 0.40
    const pipeTotal  = openPipeline.reduce((s, q) => s + Number(q.amountSar), 0)
    const pipeLabelW = pipeColW[0] + pipeColW[1] + pipeColW[2] + pipeColW[3]
    const pipeRestW  = pipeColW[5] + pipeColW[6] + pipeColW[7]
    ;[
      { text: `TOTAL â€” ${openPipeline.length} Quote${openPipeline.length !== 1 ? 's' : ''}`, w: pipeLabelW, align: 'left',  bold: true,  color: DLIT_BLUE },
      { text: fmtNum(pipeTotal), w: pipeColW[4], align: 'right', bold: true, color: DLIT_BLUE },
      { text: '',                w: pipeRestW,   align: 'left',  bold: false, color: '333333' },
    ].reduce((x, cell) => {
      s4.addShape(pptx.ShapeType.rect, { x, y: pipeTotalY, w: cell.w, h: 0.36, fill: { color: 'DBEAFE' }, line: { color: '93C5FD', width: 0.3 } })
      s4.addText(cell.text, { x: x + 0.03, y: pipeTotalY + 0.03, w: cell.w - 0.06, h: 0.30, fontSize: 8, fontFace: 'Times New Roman', align: cell.align as 'left'|'right', bold: cell.bold, color: cell.color })
      return x + cell.w
    }, 0.25)
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 5: Recent Payments Received
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s5rp = pptx.addSlide()
  s5rp.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
  s5rp.addText('Recent Payments Received', {
    x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
  })

  const rpCols = ['PO Number', 'Customer', 'Project', 'Phase', 'Amount (SAR)', 'Paid On']
  const rpColW = [1.8, 2.2, 2.2, 2.4, 1.9, 1.5]
  let rpx = 0.3
  rpCols.forEach((col, i) => {
    s5rp.addShape(pptx.ShapeType.rect, { x: rpx, y: 0.9, w: rpColW[i], h: 0.42, fill: { color: 'D1FAE5' }, line: { color: '6EE7B7', width: 0.3 } })
    s5rp.addText(col, { x: rpx + 0.05, y: 0.93, w: rpColW[i] - 0.1, h: 0.34, fontSize: 10, bold: true, fontFace: 'Times New Roman', align: 'center', color: '065F46' })
    rpx += rpColW[i]
  })

  if (recentPaid.length === 0) {
    s5rp.addText('No payments received yet.', { x: 0.3, y: 1.5, w: 12, h: 0.4, fontSize: 11, color: '94A3B8', fontFace: 'Times New Roman' })
  } else {
    recentPaid.forEach((row, ri) => {
      const y = 1.36 + ri * 0.52
      const fill = ri % 2 === 0 ? 'FFFFFF' : 'F0FDF4'
      let cx = 0.3
      const cells = [row.poNumber, row.customerName, row.projectName || 'â€”', row.phaseName, fmtNum(row.amountSar), fmtDate(row.paidAt)]
      cells.forEach((cell, ci) => {
        s5rp.addShape(pptx.ShapeType.rect, { x: cx, y, w: rpColW[ci], h: 0.48, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
        s5rp.addText(cell, {
          x: cx + 0.05, y: y + 0.06, w: rpColW[ci] - 0.1, h: 0.36,
          fontSize: 10.5, fontFace: 'Times New Roman',
          align: ci === 4 ? 'right' : ci === 5 ? 'center' : 'left',
          bold: ci === 4,
          color: ci === 4 ? '15803D' : '1e293b',
        })
        cx += rpColW[ci]
      })
    })
    // Totals row
    const rpTotalY = 1.36 + recentPaid.length * 0.52
    const rpTotal  = recentPaid.reduce((s, r) => s + r.amountSar, 0)
    const rpLabelW = rpColW[0] + rpColW[1] + rpColW[2] + rpColW[3]
    ;[
      { text: `TOTAL â€” ${recentPaid.length} Payment${recentPaid.length !== 1 ? 's' : ''}`, w: rpLabelW, align: 'left',  bold: true, color: '065F46' },
      { text: fmtNum(rpTotal), w: rpColW[4], align: 'right', bold: true, color: '15803D' },
      { text: '',              w: rpColW[5], align: 'left',  bold: false, color: '333333' },
    ].reduce((x, cell) => {
      s5rp.addShape(pptx.ShapeType.rect, { x, y: rpTotalY, w: cell.w, h: 0.42, fill: { color: 'D1FAE5' }, line: { color: '6EE7B7', width: 0.3 } })
      s5rp.addText(cell.text, { x: x + 0.05, y: rpTotalY + 0.05, w: cell.w - 0.1, h: 0.32, fontSize: 10, fontFace: 'Times New Roman', align: cell.align as 'left'|'right', bold: cell.bold, color: cell.color })
      return x + cell.w
    }, 0.3)
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 6: Overdue Payments (conditional)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (overduePmts.length > 0) {
    const s5 = pptx.addSlide()
    s5.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
    s5.addText('Overdue Payments', { x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman' })

    const ovdCols = ['PO Number', 'Customer', 'Project', 'Phase', 'Amount (SAR)', 'Due Date', 'Overdue By']
    const ovdColW = [1.4, 2.0, 2.0, 2.0, 1.7, 1.4, 1.1]
    let ox = 0.3
    ovdCols.forEach((col, i) => {
      s5.addShape(pptx.ShapeType.rect, { x: ox, y: 0.9, w: ovdColW[i], h: 0.42, fill: { color: 'FECACA' }, line: { color: 'AAAAAA', width: 0.3 } })
      s5.addText(col, { x: ox + 0.05, y: 0.93, w: ovdColW[i] - 0.1, h: 0.34, fontSize: 11, bold: true, fontFace: 'Times New Roman', align: 'center', color: 'B91C1C' })
      ox += ovdColW[i]
    })

    const ovdWithPO = payments.flatMap(p => (p.milestones ?? []).filter(m => m.status === 'Overdue').map(m => ({
      poNumber: p.poNumber, customerName: p.customerName,
      projectName: p.quotation?.projectName || 'â€”',
      phaseName: m.phaseName, amountSar: Number(m.amountSar), dueDate: m.dueDate,
      overdueDays: Math.round((todayTs.getTime() - new Date(m.dueDate).getTime()) / 86_400_000),
    })))

    ovdWithPO.forEach((row, ri) => {
      const y = 1.36 + ri * 0.46
      const fill = ri % 2 === 0 ? 'FFFFFF' : 'FEF2F2'
      let ox2 = 0.3
      const cells = [row.poNumber, row.customerName, row.projectName, row.phaseName, fmtNum(row.amountSar), fmtDate(row.dueDate), `${row.overdueDays}d`]
      cells.forEach((cell, ci) => {
        s5.addShape(pptx.ShapeType.rect, { x: ox2, y, w: ovdColW[ci], h: 0.42, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
        s5.addText(cell, {
          x: ox2 + 0.05, y: y + 0.05, w: ovdColW[ci] - 0.1, h: 0.32,
          fontSize: 10, fontFace: 'Times New Roman',
          align: ci === 4 ? 'right' : ci === 5 || ci === 6 ? 'center' : 'left',
          bold: ci === 6,
          color: ci === 6 ? 'B91C1C' : '1e293b',
        })
        ox2 += ovdColW[ci]
      })
    })
    // Totals row
    const ovdTotalY = 1.36 + ovdWithPO.length * 0.46
    const ovdTotal  = ovdWithPO.reduce((s, r) => s + r.amountSar, 0)
    const ovdLabelW = ovdColW[0] + ovdColW[1] + ovdColW[2] + ovdColW[3]
    const ovdRestW  = ovdColW[5] + ovdColW[6]
    ;[
      { text: `TOTAL â€” ${ovdWithPO.length} Overdue Payment${ovdWithPO.length !== 1 ? 's' : ''}`, w: ovdLabelW, align: 'left',  bold: true, color: 'B91C1C' },
      { text: fmtNum(ovdTotal), w: ovdColW[4], align: 'right', bold: true, color: 'B91C1C' },
      { text: '',               w: ovdRestW,   align: 'left',  bold: false, color: '333333' },
    ].reduce((x, cell) => {
      s5.addShape(pptx.ShapeType.rect, { x, y: ovdTotalY, w: cell.w, h: 0.42, fill: { color: 'FECACA' }, line: { color: 'FCA5A5', width: 0.3 } })
      s5.addText(cell.text, { x: x + 0.05, y: ovdTotalY + 0.05, w: cell.w - 0.1, h: 0.32, fontSize: 10, fontFace: 'Times New Roman', align: cell.align as 'left'|'right', bold: cell.bold, color: cell.color })
      return x + cell.w
    }, 0.3)
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 6: Upcoming Payments â€” Next 5 Due
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s6up = pptx.addSlide()
  s6up.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
  s6up.addText('Upcoming Payments â€” Next 5 Due', {
    x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
  })

  const upCols = ['PO Number', 'Customer', 'Project', 'Phase', 'Amount (SAR)', 'Due Date', 'Days Until Due']
  const upColW = [1.7, 2.0, 2.0, 2.2, 1.7, 1.2, 1.2]
  let upx = 0.3
  upCols.forEach((col, i) => {
    s6up.addShape(pptx.ShapeType.rect, { x: upx, y: 0.9, w: upColW[i], h: 0.42, fill: { color: 'D1FAE5' }, line: { color: '6EE7B7', width: 0.3 } })
    s6up.addText(col, { x: upx + 0.05, y: 0.93, w: upColW[i] - 0.1, h: 0.34, fontSize: 10, bold: true, fontFace: 'Times New Roman', align: 'center', color: '065F46' })
    upx += upColW[i]
  })

  if (upcomingPayments.length === 0) {
    s6up.addText('No upcoming payment milestones.', { x: 0.3, y: 1.5, w: 12, h: 0.4, fontSize: 11, color: '94A3B8', fontFace: 'Times New Roman' })
  } else {
    upcomingPayments.forEach((row, ri) => {
      const y = 1.36 + ri * 0.52
      const fill = ri % 2 === 0 ? 'FFFFFF' : 'F0FDF4'
      const urgencyColor = row.daysUntilDue <= 7 ? 'B91C1C' : row.daysUntilDue <= 14 ? 'D97706' : '15803D'
      let cx = 0.3
      const cells = [
        row.poNumber, row.customerName, row.projectName || 'â€”', row.phaseName,
        fmtNum(row.amountSar), fmtDate(row.dueDate), `${row.daysUntilDue}d`,
      ]
      cells.forEach((cell, ci) => {
        s6up.addShape(pptx.ShapeType.rect, { x: cx, y, w: upColW[ci], h: 0.48, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
        s6up.addText(cell, {
          x: cx + 0.05, y: y + 0.06, w: upColW[ci] - 0.1, h: 0.36,
          fontSize: 10.5, fontFace: 'Times New Roman',
          align: ci === 4 ? 'right' : ci === 5 || ci === 6 ? 'center' : 'left',
          bold: ci === 4 || ci === 6,
          color: ci === 6 ? urgencyColor : '1e293b',
        })
        cx += upColW[ci]
      })
    })
    // Totals row
    const upTotalY = 1.36 + upcomingPayments.length * 0.52
    const upTotal  = upcomingPayments.reduce((s, r) => s + r.amountSar, 0)
    const upLabelW = upColW[0] + upColW[1] + upColW[2] + upColW[3]
    const upRestW  = upColW[5] + upColW[6]
    ;[
      { text: `TOTAL â€” ${upcomingPayments.length} Payment${upcomingPayments.length !== 1 ? 's' : ''}`, w: upLabelW, align: 'left',  bold: true, color: '065F46' },
      { text: fmtNum(upTotal), w: upColW[4], align: 'right', bold: true, color: '15803D' },
      { text: '',              w: upRestW,   align: 'left',  bold: false, color: '333333' },
    ].reduce((x, cell) => {
      s6up.addShape(pptx.ShapeType.rect, { x, y: upTotalY, w: cell.w, h: 0.42, fill: { color: 'D1FAE5' }, line: { color: '6EE7B7', width: 0.3 } })
      s6up.addText(cell.text, { x: x + 0.05, y: upTotalY + 0.05, w: cell.w - 0.1, h: 0.32, fontSize: 10, fontFace: 'Times New Roman', align: cell.align as 'left'|'right', bold: cell.bold, color: cell.color })
      return x + cell.w
    }, 0.3)
  }

  const buf: Buffer = await pptx.write({ outputType: 'nodebuffer' })
  const filename = `DLIT-Executive-Dashboard-${today().replace(/\//g, '-')}.pptx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
