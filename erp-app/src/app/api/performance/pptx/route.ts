import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canExportReport } from '@/lib/rbac'
import prisma from '@/lib/db'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require('pptxgenjs')

export const runtime = 'nodejs'

const DLIT_BLUE  = '1A5096'
const DARK_BG    = '0F172A'
const HDR_GREY   = 'D9D9D9'
const LIGHT_GREY = 'F2F2F2'

const fmtNum  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtShrt = (n: number) =>
  n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `SAR ${(n / 1_000).toFixed(0)}K`
  : `SAR ${n.toFixed(0)}`

const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canExportReport(session.user.role, 'performance')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const isSalesMgr = session.user.role === 'P5_SALES_MANAGER'
  const teamFilter = isSalesMgr ? { createdBy: session.user.id } : {}

  // â”€â”€ KAE Leaderboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const totalTeamRevenue  = kaeLeaderboard.reduce((s, k) => s + k.revenue, 0)

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title  = `Performance Report â€” ${todayStr()}`

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 1: Summary
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s1 = pptx.addSlide()
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 1.4, fill: { color: DARK_BG } })
  s1.addText('PERFORMANCE REPORT', {
    x: 0.3, y: 0.15, w: 9, h: 0.7,
    fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
  })
  s1.addText('Dynamic Line International Trading', {
    x: 0.3, y: 0.82, w: 9, h: 0.4,
    fontSize: 15, color: '94A3B8', fontFace: 'Times New Roman',
  })
  s1.addText(`Report Date: ${todayStr()}`, {
    x: 9.5, y: 0.9, w: 3, h: 0.35,
    fontSize: 11, color: '94A3B8', fontFace: 'Times New Roman', align: 'right',
  })

  // Summary KPIs
  const summaryKpis = [
    { label: 'Total Team Revenue',  value: fmtShrt(totalTeamRevenue), sub: `${kaes.length} KAEs` },
    { label: 'Overdue Milestones',  value: String(overdueMilestones.length), sub: avgOverdueDays > 0 ? `Avg ${avgOverdueDays.toFixed(0)}d overdue` : 'None' },
    { label: 'Active KAEs',         value: String(kaes.length), sub: 'Key Account Engineers' },
    { label: 'Active ISEs',         value: String(ises.length), sub: 'Inside Sales Engineers' },
  ]
  summaryKpis.forEach((kpi, i) => {
    const x = 0.3 + i * 3.1
    s1.addShape(pptx.ShapeType.rect, { x, y: 1.6, w: 2.9, h: 1.0, fill: { color: LIGHT_GREY }, line: { color: 'E2E8F0', width: 0.5 } })
    s1.addText(kpi.label, { x: x + 0.12, y: 1.65, w: 2.7, h: 0.3, fontSize: 10, color: '64748B', fontFace: 'Times New Roman' })
    s1.addText(kpi.value, { x: x + 0.12, y: 1.92, w: 2.7, h: 0.42, fontSize: 15, bold: true, color: DLIT_BLUE, fontFace: 'Times New Roman' })
    s1.addText(kpi.sub,   { x: x + 0.12, y: 2.32, w: 2.7, h: 0.22, fontSize: 9,  color: '94A3B8', fontFace: 'Times New Roman' })
  })

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 2: KAE Leaderboard
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s2 = pptx.addSlide()
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
  s2.addText('KAE Leaderboard', { x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman' })

  const kaeCols  = ['#', 'KAE Name', 'Total RFQs', 'Converted', 'Win Rate', 'Revenue (inc-VAT)', 'Avg Collection']
  const kaeColW  = [0.35, 2.4, 1.1, 1.1, 1.0, 2.3, 1.8]
  let kx = 0.3
  kaeCols.forEach((col, i) => {
    s2.addShape(pptx.ShapeType.rect, { x: kx, y: 0.9, w: kaeColW[i], h: 0.42, fill: { color: HDR_GREY }, line: { color: 'AAAAAA', width: 0.3 } })
    s2.addText(col, { x: kx + 0.04, y: 0.93, w: kaeColW[i] - 0.08, h: 0.34, fontSize: 9, bold: true, fontFace: 'Times New Roman', align: 'center' })
    kx += kaeColW[i]
  })

  if (kaeLeaderboard.length === 0) {
    s2.addText('No KAE data available.', { x: 0.3, y: 1.5, w: 12, h: 0.4, fontSize: 11, color: '94A3B8', fontFace: 'Times New Roman' })
  } else {
    kaeLeaderboard.forEach((row, ri) => {
      const y = 1.36 + ri * 0.46
      const fill = ri === 0 ? 'FFF7ED' : ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
      let cx = 0.3
      const cells = [
        String(ri + 1), row.name, String(row.totalRfq), String(row.converted),
        `${row.winRate.toFixed(1)}%`, fmtNum(row.revenue), `${row.avgCollection.toFixed(1)}%`,
      ]
      cells.forEach((cell, ci) => {
        s2.addShape(pptx.ShapeType.rect, { x: cx, y, w: kaeColW[ci], h: 0.42, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
        s2.addText(cell, {
          x: cx + 0.04, y: y + 0.05, w: kaeColW[ci] - 0.08, h: 0.32,
          fontSize: 9.5, fontFace: 'Times New Roman',
          align: ci === 1 ? 'left' : 'center',
          bold: ci === 1,
          color: ci === 4 ? (row.winRate >= 60 ? '15803D' : row.winRate >= 40 ? 'B45309' : 'B91C1C') : '1e293b',
        })
        cx += kaeColW[ci]
      })
    })
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Slide 3: ISE Pipeline
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isePipeline.length > 0) {
    const s3 = pptx.addSlide()
    s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DARK_BG } })
    s3.addText('ISE Pipeline', { x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman' })

    const iseCols = ['#', 'ISE Name', 'Open Quotes', 'Pipeline Value (SAR)', 'Avg Revisions']
    const iseColW = [0.4, 3.5, 1.5, 2.8, 1.8]
    let ix = 0.3
    iseCols.forEach((col, i) => {
      s3.addShape(pptx.ShapeType.rect, { x: ix, y: 0.9, w: iseColW[i], h: 0.42, fill: { color: HDR_GREY }, line: { color: 'AAAAAA', width: 0.3 } })
      s3.addText(col, { x: ix + 0.04, y: 0.93, w: iseColW[i] - 0.08, h: 0.34, fontSize: 9, bold: true, fontFace: 'Times New Roman', align: 'center' })
      ix += iseColW[i]
    })

    isePipeline.forEach((row, ri) => {
      const y = 1.36 + ri * 0.46
      const fill = ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
      let cx = 0.3
      const cells = [String(ri + 1), row.name, String(row.openQuotes), fmtNum(row.pipelineValue), row.avgRevisions.toFixed(1)]
      cells.forEach((cell, ci) => {
        s3.addShape(pptx.ShapeType.rect, { x: cx, y, w: iseColW[ci], h: 0.42, fill: { color: fill }, line: { color: 'DDDDDD', width: 0.3 } })
        s3.addText(cell, {
          x: cx + 0.04, y: y + 0.05, w: iseColW[ci] - 0.08, h: 0.32,
          fontSize: 9.5, fontFace: 'Times New Roman',
          align: ci === 1 ? 'left' : ci === 3 ? 'right' : 'center',
          bold: ci === 1,
        })
        cx += iseColW[ci]
      })
    })
  }

  const buf: Buffer = await pptx.write({ outputType: 'nodebuffer' })
  const filename = `DLIT-Performance-${todayStr().replace(/\//g, '-')}.pptx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
