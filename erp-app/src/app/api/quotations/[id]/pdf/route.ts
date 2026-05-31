import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead } from '@/lib/rbac'
import prisma from '@/lib/db'
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
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      kaeAssigned: { select: { id: true, name: true, email: true } },
      lineItems: { orderBy: { sNo: 'asc' } },
    },
  })

  if (!quotation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Load assets as base64 data URLs (avoids Windows path issues in fontkit)
  const logoDataUrl       = toDataUrl('dlit-header-full.png', 'image/png')
  const arabicHeaderUrl   = null   // no longer needed — combined into logoDataUrl
  const arabicFontNormal  = toDataUrl('Amiri-Regular.ttf','font/truetype')
  const arabicFontBold    = toDataUrl('Amiri-Regular.ttf','font/truetype')

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

    const element = createElement(QuotationPDF, { quotation, logoDataUrl, arabicHeaderUrl })
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
