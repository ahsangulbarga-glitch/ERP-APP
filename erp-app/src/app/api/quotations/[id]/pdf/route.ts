import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { canRead } from '@/lib/rbac'
import { createElement } from 'react'
import { QuotationPDF } from '@/components/pdf/QuotationPDF'
import fs from 'fs'
import path from 'path'

// Force Node.js runtime (required for @react-pdf/renderer)
export const runtime = 'nodejs'

/** Read a file from /public and return a base64 data-URL, or null if missing */
function toDataUrl(filename: string, mime: string): string | null {
  try {
    const fullPath = path.join(process.cwd(), 'public', filename)
    if (!fs.existsSync(fullPath)) return null
    const buf = fs.readFileSync(fullPath)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result
  if (!canRead(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const tenantId = session.user.tenantId

  const [quotation, companySetting] = await Promise.all([
    db.quotation.findFirst({
      where: { id },
      include: {
        kaeAssigned: { select: { id: true, name: true, email: true } },
        lineItems: { orderBy: { sNo: 'asc' } },
      },
    }),
    db.companySetting.findFirst({ where: { tenantId }, select: {
      logoDataUrl: true, pdfHeaderDataUrl: true, preparedByContacts: true,
      pdfCompanyFullName: true, pdfClosingText: true,
      pdfSignatoryName: true, pdfSignatoryTitle: true, pdfSignatoryCc: true,
      pdfLegalNotice: true, pdfFooterAddress: true, pdfFooterEmails: true,
    }}).catch(() => null),
  ])

  if (!quotation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // PDF header priority: pdfHeaderDataUrl (full letterhead) → logoDataUrl → static fallback
  const logoDataUrl: string | null =
    (companySetting as any)?.pdfHeaderDataUrl ??
    (companySetting as any)?.logoDataUrl ??
    toDataUrl('dlit-header-full.png', 'image/png')
  const arabicHeaderUrl   = null
  const arabicFontNormal  = toDataUrl('Amiri-Regular.ttf','font/truetype')
  const arabicFontBold    = toDataUrl('Amiri-Regular.ttf','font/truetype')

  // Parse prepared-by contacts
  let preparedByContacts: { name: string; title: string; email: string; contact: string }[] | null = null
  try {
    const raw = (companySetting as any)?.preparedByContacts
    if (raw) preparedByContacts = JSON.parse(raw)
  } catch { /* use defaults */ }

  // Collect all PDF customisation fields (pass undefined if not set so PDF uses defaults)
  const cs = companySetting as any
  const pdfSettings = {
    companyFullName: cs?.pdfCompanyFullName  || undefined,
    closingText:     cs?.pdfClosingText      || undefined,
    signatoryName:   cs?.pdfSignatoryName    || undefined,
    signatoryTitle:  cs?.pdfSignatoryTitle   || undefined,
    signatoryCc:     cs?.pdfSignatoryCc      || undefined,
    legalNotice:     cs?.pdfLegalNotice      || undefined,
    footerAddress:   cs?.pdfFooterAddress    || undefined,
    footerEmails:    cs?.pdfFooterEmails     || undefined,
  }

  try {
    const { renderToBuffer, Font } = await import('@react-pdf/renderer')

    // Register Arabic font right before render (data-URL is path-independent)
    if (arabicFontNormal) {
      Font.register({
        family: 'ArabicFont',
        fonts: [
          { src: arabicFontNormal, fontWeight: 400 },
          ...(arabicFontBold ? [{ src: arabicFontBold, fontWeight: 700 }] : []),
        ],
      })
    }

    // Disable font hyphenation for Arabic (prevents broken syllables)
    Font.registerHyphenationCallback(word => [word])

    const element = createElement(QuotationPDF, { quotation, logoDataUrl, arabicHeaderUrl, preparedByContacts, pdfSettings })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer: Buffer = await renderToBuffer(element as any)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${quotation.qtRef}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[PDF] render error:', err)
    return NextResponse.json(
      { error: 'PDF generation failed', detail: String(err) },
      { status: 500 }
    )
  }
}
