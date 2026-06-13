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

  const ROLE_TITLE: Record<string, string> = {
    P1_CEO:                  'CEO',
    P2_ADMIN:                'Admin',
    P3_KEY_ACCOUNT_MANAGER:  'Key Account Manager',
    P4_REGIONAL_MANAGER:     'Divisional Manager',
    P5_SALES_MANAGER:        'Sales Manager',
    P6_KEY_ACCOUNT_ENGINEER: 'Key Account Engineer',
    P7_INSIDE_SALES_ENGINEER:'Inside Sales Engineer',
    P8_ACCOUNTANT:           'Accountant',
    P9_HR:                   'HR',
    P10_LOGISTICS_MANAGER:   'Logistics Manager',
    P11_PURCHASE_MANAGER:    'Purchase Manager',
    P12_WAREHOUSE_MANAGER:   'Warehouse Manager',
  }

  const [quotation, companySetting] = await Promise.all([
    db.quotation.findFirst({
      where: { id },
      include: {
        kaeAssigned: { select: { id: true, name: true, email: true, role: true, managerId: true } },
        lineItems: { orderBy: { sNo: 'asc' } },
      },
    }),
    db.companySetting.findFirst({ where: { tenantId }, select: {
      companyName: true,
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

  // ── Auto-build Prepared By from KAE + their manager ───────────────────────
  // Priority: manually configured settings contacts → auto from KAE/manager
  let preparedByContacts: { name: string; title: string; email: string; contact: string }[] | null = null

  // 1. Check if manually configured contacts exist in settings
  try {
    const raw = (companySetting as any)?.preparedByContacts
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) preparedByContacts = parsed
    }
  } catch { /* ignore */ }

  // 2. If no manual contacts, auto-build from KAE + manager
  if (!preparedByContacts && quotation.kaeAssigned) {
    const kae = quotation.kaeAssigned as any
    const autoContacts: typeof preparedByContacts = []

    // Add KAE
    autoContacts.push({
      name:    kae.name  || '',
      title:   ROLE_TITLE[kae.role] || kae.role || 'Sales Engineer',
      email:   kae.email || '',
      contact: '',
    })

    // Add manager if linked
    if (kae.managerId) {
      try {
        const manager = await db.user.findFirst({
          where: { id: kae.managerId },
          select: { name: true, email: true, role: true },
        })
        if (manager) {
          autoContacts.push({
            name:    manager.name  || '',
            title:   ROLE_TITLE[manager.role] || manager.role || 'Manager',
            email:   manager.email || '',
            contact: '',
          })
        }
      } catch { /* skip manager */ }
    }

    preparedByContacts = autoContacts
  }

  // Collect all PDF customisation fields (pass undefined if not set so PDF uses defaults)
  const cs = companySetting as any
  const pdfSettings = {
    // Use pdfCompanyFullName if explicitly set, otherwise fall back to companyName from settings
    companyFullName: cs?.pdfCompanyFullName || cs?.companyName || undefined,
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
