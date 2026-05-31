import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canExportReport } from '@/lib/rbac'
import prisma from '@/lib/db'
import { createElement } from 'react'
import FinancialPDF from '@/components/pdf/FinancialPDF'

export const runtime = 'nodejs'

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canExportReport(session.user.role, 'financial'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isSalesMgr = session.user.role === 'P5_SALES_MANAGER'

  // Sales Manager: restrict to their team's KAEs
  let teamKaeNames = new Set<string>()
  if (isSalesMgr) {
    const teamKaes = await prisma.user.findMany({ where: { createdBy: session.user.id }, select: { name: true } })
    teamKaeNames = new Set(teamKaes.map(k => k.name))
  }

  const [rawPos, payments] = await Promise.all([
    prisma.pOTracker.findMany({ orderBy: { poDate: 'desc' } }),
    prisma.payment.findMany({
      include: { milestones: true, quotation: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const filteredPos = isSalesMgr
    ? rawPos.filter(p => p.kaeName && teamKaeNames.has(p.kaeName))
    : rawPos

  const pos = filteredPos.map(p => ({
    poNumber:             p.poNumber,
    customerName:         p.customerName,
    projectName:          p.projectName          || '',
    kaeName:              p.kaeName              || '',
    poAmountExVat:        Number(p.poAmountExVat),
    totalValueIncVat:     Number(p.totalValueIncVat),
    paymentStatus:        p.paymentStatus         || '',
    paymentCollectionPct: Number(p.paymentCollectionPct),
    poDate:               p.poDate instanceof Date ? p.poDate.toISOString() : String(p.poDate),
  }))

  // Build milestones flat list
  const poSet = new Set(pos.map(p => p.poNumber))
  const milestones = payments
    .filter(p => !isSalesMgr || poSet.has(p.poNumber))
    .flatMap(p => (p.milestones ?? []).map(m => ({
      poNumber:     p.poNumber,
      customerName: p.customerName,
      projectName:  p.quotation?.projectName || '',
      phaseName:    m.phaseName,
      amountSar:    Number(m.amountSar),
      status:       m.status,
      dueDate:      m.dueDate instanceof Date ? m.dueDate.toISOString() : String(m.dueDate),
      paidAt:       m.paidAt ? (m.paidAt instanceof Date ? m.paidAt.toISOString() : String(m.paidAt)) : undefined,
    })))

  const { renderToBuffer } = await import('@react-pdf/renderer')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer: Buffer = await renderToBuffer(
    createElement(FinancialPDF, { pos, milestones, reportDate: today() }) as any
  )

  const filename = `DLIT-Financial-Report-${today().replace(/\//g, '-')}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
