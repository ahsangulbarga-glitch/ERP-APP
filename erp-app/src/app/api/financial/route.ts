import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { canExportReport } from '@/lib/rbac'
import { createElement } from 'react'
import FinancialPDF from '@/components/pdf/FinancialPDF'

export const runtime = 'nodejs'

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export async function GET() {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (!canExportReport(session.user.role, 'financial'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isSalesMgr = session.user.role === 'P5_SALES_MANAGER'

  // Sales Manager: restrict to their team's KAEs
  let teamKaeNames = new Set<string>()
  if (isSalesMgr) {
    const teamKaes = await db.user.findMany({ where: { createdBy: session.user.id }, select: { name: true } })
    teamKaeNames = new Set(teamKaes.map(k => k.name))
  }

  const [rawPos, payments, quotesAll] = await Promise.all([
    db.pOTracker.findMany({ orderBy: { poDate: 'desc' } }),
    db.payment.findMany({
      include: { milestones: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.quotation.findMany({ select: { id: true, projectName: true } }),
  ])

  // Build quotationId → projectName lookup (Payment has no quotation relation)
  const qtProjectMap: Record<string, string> = Object.fromEntries(
    quotesAll.map(q => [q.id, q.projectName || ''])
  )

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
      projectName:  qtProjectMap[p.quotationId || ''] || '',
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
