import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead } from '@/lib/rbac'
import prisma from '@/lib/db'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PptxGenJS = require('pptxgenjs')

export const runtime = 'nodejs'

const DLIT_BLUE  = '1A5096'
const LIGHT_GREY = 'F2F2F2'
const HDR_GREY   = 'D9D9D9'

const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string | Date) => {
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'quotations')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const q = await prisma.quotation.findUnique({
    where: { id },
    include: { kaeAssigned: true, lineItems: { orderBy: { sNo: 'asc' } } },
  })
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const items    = q.lineItems.filter(li => li.itemType !== 'header')
  const subtotal = items.reduce((s, li) => s + Number(li.amount), 0)
  const discount = Number(q.discount) || 0
  const net      = subtotal - discount
  const validity = q.validityDays ?? 30

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title  = `Commercial Offer — ${q.qtRef}`

  // ── Slide 1: Cover ──────────────────────────────────────────────────────────
  const s1 = pptx.addSlide()

  // Blue header bar
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 1.4, fill: { color: DLIT_BLUE } })

  s1.addText('COMMERCIAL OFFER', {
    x: 0.3, y: 0.15, w: 9, h: 0.7,
    fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
  })
  s1.addText('Dynamic Line International Trading', {
    x: 0.3, y: 0.8, w: 9, h: 0.45,
    fontSize: 16, color: 'CCE0FF', fontFace: 'Times New Roman',
  })

  // Details block
  const details = [
    ['Reference',   q.qtRef],
    ['Date',        fmtDate(q.qtnDate)],
    ['Customer',    q.customerName],
    ['Project',     q.projectName],
    ['Subject',     q.subject || q.projectName],
    ['Application', q.application || '—'],
    ['Kind Attn',   q.clientContactName || '—'],
    ['RFQ Code',    q.rfqCode || '—'],
    ['KAE',         q.kaeAssigned?.name || '—'],
    ['Status',      q.status],
  ]

  details.forEach(([label, value], i) => {
    const col = i < 5 ? 0 : 1
    const row = i < 5 ? i : i - 5
    const x = col === 0 ? 0.4 : 6.4
    const y = 1.6 + row * 0.52
    s1.addText(`${label}:`, { x, y, w: 1.3, h: 0.4, fontSize: 12, bold: true, color: DLIT_BLUE, fontFace: 'Times New Roman' })
    s1.addText(value, { x: x + 1.35, y, w: col === 0 ? 4.5 : 5.5, h: 0.4, fontSize: 12, color: '333333', fontFace: 'Times New Roman' })
  })

  // Totals box
  s1.addShape(pptx.ShapeType.rect, { x: 7.5, y: 4.5, w: 4.8, h: 1.5, fill: { color: LIGHT_GREY }, line: { color: 'AAAAAA', width: 0.5 } })
  s1.addText('Subtotal (Ex-VAT)', { x: 7.6, y: 4.6, w: 2.5, h: 0.35, fontSize: 11, bold: true, fontFace: 'Times New Roman' })
  s1.addText(`SAR ${fmtNum(subtotal)}`, { x: 10.1, y: 4.6, w: 2.1, h: 0.35, fontSize: 11, align: 'right', fontFace: 'Times New Roman' })
  if (discount > 0) {
    s1.addText('Discount', { x: 7.6, y: 4.95, w: 2.5, h: 0.35, fontSize: 11, bold: true, fontFace: 'Times New Roman' })
    s1.addText(`SAR ${fmtNum(discount)}`, { x: 10.1, y: 4.95, w: 2.1, h: 0.35, fontSize: 11, align: 'right', fontFace: 'Times New Roman' })
  }
  s1.addText('Grand Total', { x: 7.6, y: 5.3, w: 2.5, h: 0.45, fontSize: 13, bold: true, color: DLIT_BLUE, fontFace: 'Times New Roman' })
  s1.addText(`SAR ${fmtNum(net)}`, { x: 10.1, y: 5.3, w: 2.1, h: 0.45, fontSize: 13, bold: true, align: 'right', color: DLIT_BLUE, fontFace: 'Times New Roman' })

  // ── Slide 2: Terms ──────────────────────────────────────────────────────────
  const s2 = pptx.addSlide()
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DLIT_BLUE } })
  s2.addText('Terms & Conditions', { x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman' })

  const terms = [
    ['Prices',            'Quoted prices are excluding VAT'],
    ['Currency',          'SAR (Saudi Riyal)'],
    ['Terms of Delivery', 'DDP, Delivered to Site'],
    ['Payment Terms',     q.paymentTerms || 'To be discussed'],
    ['Delivery',          q.deliveryWeeks ? `${q.deliveryWeeks} Weeks from material approval or PO` : '** Weeks from material approval or PO'],
    ['Warranty',          '12 months from date of supply'],
    ['Validity',          `${validity} days from the date of quotation`],
    ['TPI',               'Inclusive of FAT/SAT; any TPI will be charged on request'],
  ]

  terms.forEach(([label, value], i) => {
    const y = 0.9 + i * 0.56
    s2.addShape(pptx.ShapeType.rect, { x: 0.3, y, w: 2.0, h: 0.42, fill: { color: HDR_GREY } })
    s2.addText(label, { x: 0.35, y: y + 0.03, w: 1.9, h: 0.36, fontSize: 11, bold: true, fontFace: 'Times New Roman' })
    s2.addText(value, { x: 2.5, y: y + 0.03, w: 10, h: 0.36, fontSize: 11, fontFace: 'Times New Roman' })
  })

  // ── Slide 3+: Line Items (10 rows per slide) ────────────────────────────────
  const ROWS_PER_SLIDE = 10
  const chunks: typeof q.lineItems[] = []
  for (let i = 0; i < q.lineItems.length; i += ROWS_PER_SLIDE) {
    chunks.push(q.lineItems.slice(i, i + ROWS_PER_SLIDE))
  }
  if (chunks.length === 0) chunks.push([])

  chunks.forEach((chunk, chunkIdx) => {
    const s = pptx.addSlide()
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: DLIT_BLUE } })
    s.addText(`Line Items${chunks.length > 1 ? ` (${chunkIdx + 1}/${chunks.length})` : ''}`, {
      x: 0.3, y: 0.1, w: 12, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fontFace: 'Times New Roman',
    })

    const cols = [
      { label: 'S.No',       w: 0.4 },
      { label: 'Description',w: 3.8 },
      { label: 'Reference',  w: 1.1 },
      { label: 'Make',       w: 0.8 },
      { label: 'Qty',        w: 0.5 },
      { label: 'Unit',       w: 0.55 },
      { label: 'Rate',       w: 1.1 },
      { label: 'Amount',     w: 1.2 },
      { label: 'Delivery',   w: 0.85 },
    ]

    // Table header
    let x = 0.2
    cols.forEach(col => {
      s.addShape(pptx.ShapeType.rect, { x, y: 0.8, w: col.w, h: 0.38, fill: { color: HDR_GREY }, line: { color: 'AAAAAA', width: 0.3 } })
      s.addText(col.label, { x: x + 0.02, y: 0.82, w: col.w - 0.04, h: 0.34, fontSize: 9, bold: true, fontFace: 'Times New Roman', align: 'center' })
      x += col.w
    })

    // Table rows
    chunk.forEach((li, rowIdx) => {
      const y = 1.22 + rowIdx * 0.42
      const fill = li.itemType === 'header' ? LIGHT_GREY : rowIdx % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
      const qty  = Number(li.qty)
      const rate = Number(li.rate)
      const isRateOnly = qty === 0 && rate > 0

      const cells = li.itemType === 'header'
        ? [{ text: li.description.toUpperCase(), span: 9, bold: true }]
        : [
            { text: String(li.sNo), align: 'center' as const },
            { text: li.description },
            { text: li.reference || '', align: 'center' as const },
            { text: li.make || '', align: 'center' as const },
            { text: isRateOnly ? '' : String(qty), align: 'center' as const },
            { text: li.unit || 'NO.S', align: 'center' as const },
            { text: fmtNum(rate), align: 'right' as const },
            { text: isRateOnly ? 'Rate Only' : fmtNum(Number(li.amount)), align: 'right' as const },
            { text: li.delivery || '', align: 'center' as const },
          ]

      let cx = 0.2
      if (li.itemType === 'header') {
        const totalW = cols.reduce((s, c) => s + c.w, 0)
        s.addShape(pptx.ShapeType.rect, { x: cx, y, w: totalW, h: 0.38, fill: { color: fill }, line: { color: 'AAAAAA', width: 0.3 } })
        s.addText(li.description.toUpperCase(), { x: cx + 0.05, y: y + 0.03, w: totalW - 0.1, h: 0.32, fontSize: 9, bold: true, fontFace: 'Times New Roman' })
      } else {
        cells.forEach((cell, ci) => {
          const cw = cols[ci].w
          s.addShape(pptx.ShapeType.rect, { x: cx, y, w: cw, h: 0.38, fill: { color: fill }, line: { color: 'AAAAAA', width: 0.3 } })
          s.addText((cell as { text: string; align?: string }).text, {
            x: cx + 0.02, y: y + 0.03, w: cw - 0.04, h: 0.32,
            fontSize: 8.5, fontFace: 'Times New Roman',
            align: (cell as { align?: string }).align || 'left',
          })
          cx += cw
        })
      }
    })

    // Totals on last chunk
    if (chunkIdx === chunks.length - 1) {
      const ty = 1.22 + chunk.length * 0.42 + 0.1
      s.addText(`Grand Total (Ex-VAT): SAR ${fmtNum(net)}`, {
        x: 7.5, y: ty, w: 5.0, h: 0.45,
        fontSize: 13, bold: true, color: DLIT_BLUE, align: 'right', fontFace: 'Times New Roman',
      })
    }
  })

  const buf: Buffer = await pptx.write({ outputType: 'nodebuffer' })
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${q.qtRef}.pptx"`,
    },
  })
}
