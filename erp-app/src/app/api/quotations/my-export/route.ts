import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canExportReport } from '@/lib/rbac'
import prisma from '@/lib/db'
import { createElement } from 'react'
import OwnQuotationsPDF from '@/components/pdf/OwnQuotationsPDF'

export const runtime = 'nodejs'

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canExportReport(session.user.role, 'ownQuotations'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch quotations assigned to OR created by this user
  const raw = await prisma.quotation.findMany({
    where: {
      OR: [
        { kaeAssignedId: session.user.id },
        { createdBy:     session.user.id },
      ],
    },
    orderBy: { qtnDate: 'desc' },
  })

  const quotes = raw.map(q => ({
    qtRef:        q.qtRef        || '',
    status:       q.status,
    customerName: q.customerName,
    projectName:  q.projectName  || '',
    amountSar:    Number(q.amountSar),
    rfqCode:      q.rfqCode      || '',
    qtnDate:      q.qtnDate instanceof Date ? q.qtnDate.toISOString() : String(q.qtnDate),
    remarks:      q.remarks      || '',
  }))

  const { renderToBuffer } = await import('@react-pdf/renderer')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer: Buffer = await renderToBuffer(
    createElement(OwnQuotationsPDF, { quotes, userName: session.user.name, reportDate: today() }) as any
  )

  const filename = `DLIT-My-Quotations-${today().replace(/\//g, '-')}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
