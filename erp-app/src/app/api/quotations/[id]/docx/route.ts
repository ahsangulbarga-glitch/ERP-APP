import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead } from '@/lib/rbac'
import prisma from '@/lib/db'
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType,
} from 'docx'

export const runtime = 'nodejs'

const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string | Date) => {
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}

const DLIT_BLUE = '1A5096'
const HEADER_BG = 'D9D9D9'

function field(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: 'Times New Roman' }),
      new TextRun({ text: value, size: 22, font: 'Times New Roman' }),
    ],
  })
}

function termRow(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}`, bold: true, size: 22, font: 'Times New Roman', color: '000000' }),
      new TextRun({ text: ` : ${value}`, size: 22, font: 'Times New Roman' }),
    ],
  })
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
  const deliveryText = q.deliveryWeeks
    ? `${q.deliveryWeeks} Weeks from material approval or PO`
    : '** Weeks from material approval or PO'

  // ── Items table ─────────────────────────────────────────────────────────────
  const tblHeaders = ['S.No', 'Description', 'Reference', 'Make', 'Qty', 'Unit', 'Rate (SAR)', 'Amount (SAR)', 'Delivery']
  const colWidths  = [500, 3000, 900, 700, 400, 500, 900, 1000, 700]

  const headerRow = new TableRow({
    children: tblHeaders.map((h, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: HEADER_BG },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: h, bold: true, size: 18, font: 'Times New Roman' })],
      })],
    })),
  })

  const dataRows = q.lineItems.map(li => {
    const isHeader = li.itemType === 'header'
    if (isHeader) {
      return new TableRow({
        children: [new TableCell({
          columnSpan: 9,
          shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
          children: [new Paragraph({
            children: [new TextRun({ text: li.description.toUpperCase(), bold: true, size: 18, font: 'Times New Roman' })],
          })],
        })],
      })
    }
    const qty  = Number(li.qty)
    const rate = Number(li.rate)
    const isRateOnly = qty === 0 && rate > 0
    const cells = [
      String(li.sNo),
      li.description,
      li.reference || '',
      li.make || '',
      isRateOnly ? '' : String(qty),
      li.unit || 'NO.S',
      fmtNum(rate),
      isRateOnly ? 'Rate Only' : fmtNum(Number(li.amount)),
      li.delivery || '',
    ]
    return new TableRow({
      children: cells.map((txt, i) => new TableCell({
        width: { size: colWidths[i], type: WidthType.DXA },
        children: [new Paragraph({
          alignment: i >= 6 ? AlignmentType.RIGHT : i === 0 || i === 4 || i === 8 ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: txt, size: 18, font: 'Times New Roman' })],
        })],
      })),
    })
  })

  // Totals rows
  const totalsRows = [
    ...(discount > 0 ? [
      ['Subtotal', fmtNum(subtotal)],
      ['Special Discount', fmtNum(discount)],
    ] : []),
    ['Grand Total (Net - Ex VAT)', fmtNum(net)],
  ].map(([label, val]) => new TableRow({
    children: [
      new TableCell({
        columnSpan: 7,
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        children: [new Paragraph({ children: [] })],
      }),
      new TableCell({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: label, bold: true, size: 18, font: 'Times New Roman' })],
        })],
      }),
      new TableCell({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: val, bold: true, size: 18, font: 'Times New Roman' })],
        })],
      }),
    ],
  }))

  const doc = new Document({
    sections: [{
      children: [
        // Title
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: 'COMMERCIAL OFFER', bold: true, size: 32, color: DLIT_BLUE, font: 'Times New Roman' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({ text: 'Dynamic Line International Trading', size: 22, font: 'Times New Roman', color: '555555' })],
        }),

        // Cover fields
        field('Reference',      q.qtRef),
        field('Date',           fmtDate(q.qtnDate)),
        field('Customer',       q.customerName),
        field('Project',        q.projectName),
        field('Subject',        q.subject || q.projectName),
        field('Application',    q.application || ''),
        field('Kind Attn',      q.clientContactName || ''),
        field('RFQ Code',       q.rfqCode || ''),
        new Paragraph({ spacing: { after: 200 } }),

        // Terms
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: 'TERMS & CONDITIONS', bold: true, size: 24, color: DLIT_BLUE, font: 'Times New Roman' })],
        }),
        termRow('Prices',            'Quoted prices are excluding VAT'),
        termRow('Currency',          'SAR (Saudi Riyal)'),
        termRow('Terms of Delivery', 'DDP, Delivered to Site'),
        termRow('Payment Terms',     q.paymentTerms || 'To be discussed'),
        termRow('Delivery',          deliveryText),
        termRow('Warranty',          '12 months from date of supply'),
        termRow('Validity',          `${validity} days from the date of quotation`),
        termRow('TPI',               'Inclusive of FAT/SAT; any TPI will be charged on request'),
        new Paragraph({ spacing: { after: 300 } }),

        // Items table heading
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: 'LINE ITEMS', bold: true, size: 24, color: DLIT_BLUE, font: 'Times New Roman' })],
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows, ...totalsRows],
        }),
        new Paragraph({ spacing: { after: 200 } }),

        // Footnotes
        ...[
          '*Any deviation in specification or material of construction, quantity will warrant a change in price.',
          '*Any subsequent claims regarding Model Code, MOC, Design, or any other discrepancies will not be honored by M/s DLIT.',
          '*Please note that due to the current situation, delivery lead time may be longer than initially offered.',
          '*The offered prices are valid only for this enquiry and quantity. Orders are non-cancellable upon PO placement.',
          ...(q.notes ? [`*${q.notes}`] : []),
        ].map(fn => new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: fn, italics: true, size: 16, color: '555555', font: 'Times New Roman' })],
        })),

        new Paragraph({ spacing: { after: 300 } }),
        // Signature
        new Paragraph({ children: [new TextRun({ text: 'Yours Faithfully,', size: 22, font: 'Times New Roman' })] }),
        new Paragraph({ children: [new TextRun({ text: 'For Dynamic Line International Trading,', size: 22, font: 'Times New Roman' })] }),
        new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: 'OMAIR AZMI', bold: true, size: 22, font: 'Times New Roman' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Manager, Water Division', size: 22, font: 'Times New Roman' })] }),
      ],
    }],
  })

  const buf = await Packer.toBuffer(doc)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${q.qtRef}.docx"`,
    },
  })
}
