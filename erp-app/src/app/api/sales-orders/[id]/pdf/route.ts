import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { canRead } from '@/lib/rbac'
import { createElement } from 'react'
import SalesOrderPDF from '@/components/pdf/SalesOrderPDF'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

function toDataUrl(filename: string, mime: string): string | null {
  try {
    const fullPath = path.join(process.cwd(), 'public', filename)
    if (!fs.existsSync(fullPath)) return null
    return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`
  } catch { return null }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result

  if (!canRead(session.user.role, 'salesOrders'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const tenantId = session.user.tenantId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [so, companySetting] = await Promise.all([
    (db as any).salesOrder.findFirst({
      where: { id },
      include: { lineItems: { orderBy: { sNo: 'asc' } } },
    }),
    db.companySetting.findFirst({ where: { tenantId }, select: { logoDataUrl: true, pdfHeaderDataUrl: true } }).catch(() => null),
  ])

  if (!so) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Serialize dates
  const soForPdf = {
    ...so,
    soDate:       so.soDate       instanceof Date ? so.soDate.toISOString()       : String(so.soDate),
    deliveryDate: so.deliveryDate instanceof Date ? so.deliveryDate.toISOString() : (so.deliveryDate ?? null),
  }

  // PDF header priority: pdfHeaderDataUrl → logoDataUrl → static fallback
  const logoDataUrl: string | null =
    (companySetting as any)?.pdfHeaderDataUrl ??
    (companySetting as any)?.logoDataUrl ??
    toDataUrl('dlit-header-full.png', 'image/png')

  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer: Buffer = await renderToBuffer(createElement(SalesOrderPDF, { so: soForPdf as any, logoDataUrl }) as any)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${so.soNumber}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[SO PDF] render error:', err)
    return NextResponse.json({ error: 'PDF generation failed', detail: String(err) }, { status: 500 })
  }
}
