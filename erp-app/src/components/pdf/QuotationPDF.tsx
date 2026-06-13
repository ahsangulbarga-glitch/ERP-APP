/**
 * QuotationPDF — exactly matches DLIT commercial offer format
 * Reference: DLITSA0526A018QN01-R3.pdf / DLITSA0526A016QN01.pdf
 *
 * NOTE: Font.register() for ArabicFont is called in the API route (route.ts)
 * immediately before renderToBuffer(), using base64 data-URLs to avoid
 * Windows path issues with spaces in the OneDrive folder.
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// ─── colours ──────────────────────────────────────────────────────────────────
const TBL_HEADER_BG = '#d9d9d9'
const TBL_SECT_BG   = '#f2f2f2'
const BORDER_COLOR  = '#aaaaaa'

// ─── styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Times-Roman',
    fontSize: 11,
    color: '#000',
    paddingLeft: 42,
    paddingRight: 42,
    paddingTop: 20,
    paddingBottom: 44,
  },

  // header row — single full-width logo
  pageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  logoImg:      { width: 511, height: 112, objectFit: 'contain' },
  arabicImg:    { width: 320, height: 105, objectFit: 'contain' },

  // COMMERCIAL OFFER title
  offerTitle: {
    fontSize: 16,
    fontFamily: 'Times-Bold',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    letterSpacing: 0.4,
  },

  // Two-column address block
  addrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  addrLeft:     { flex: 1, paddingRight: 30 },
  addrRight:    { width: 190 },
  addrTo:       { fontSize: 11, marginBottom: 1 },
  addrCustomer: { fontSize: 11, fontFamily: 'Times-Bold', marginBottom: 2 },
  addrLine:     { fontSize: 11, fontStyle: 'italic', color: '#222', marginBottom: 1 },

  metaRow:   { flexDirection: 'row', marginBottom: 3, alignItems: 'center' },
  metaLabel: { fontSize: 11, fontFamily: 'Times-Bold', width: 40 },
  metaSep:   { fontSize: 11, marginHorizontal: 6, color: '#000' },
  metaValue: { fontSize: 11, flex: 1 },

  // Bold field rows (PROJECT / KIND ATTN / SUBJECT / APPLICATION)
  fieldRow:   { flexDirection: 'row', marginBottom: 5, alignItems: 'flex-start' },
  fieldLabel: { fontSize: 11, fontFamily: 'Times-Bold', width: 96 },
  fieldColon: { fontSize: 11, fontFamily: 'Times-Bold', marginHorizontal: 4 },
  fieldValue: { fontSize: 11, flex: 1 },
  fieldsSep:  { marginBottom: 8 },

  // body paragraphs
  para: { fontSize: 11, lineHeight: 1.65, marginBottom: 8, color: '#000' },

  // terms table (plain, colon-separated)
  termsBlock: { marginBottom: 10 },
  termsRow:   { flexDirection: 'row', marginBottom: 3 },
  termsLabel: { width: 120, fontSize: 11, color: '#000' },
  termsSep:   { width: 12, fontSize: 11, textAlign: 'center', color: '#000' },
  termsValue: { flex: 1, fontSize: 11, color: '#000' },

  // signature block
  signWrap:  { marginTop: 10 },
  signLine:  { fontSize: 11, lineHeight: 1.7 },
  signBold:  { fontFamily: 'Times-Bold' },
  signName:  { fontSize: 11, fontFamily: 'Times-Bold', marginTop: 30 },
  signTitle: { fontSize: 11 },
  signCC:    { fontSize: 10, fontStyle: 'italic', marginTop: 4 },

  // legal footer text (centered, small)
  legalText: {
    fontSize: 8,
    textAlign: 'center',
    color: '#555',
    letterSpacing: 0.5,
    marginTop: 18,
  },

  // fixed page footer
  pageFooter: {
    position: 'absolute',
    bottom: 14,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 0.5,
    borderTopColor: '#aaa',
    paddingTop: 3,
  },
  footerLeft:   { fontSize: 8, color: '#444', lineHeight: 1.5 },
  footerCenter: { fontSize: 8, color: '#444', textAlign: 'center' },
  footerRight:  { fontSize: 8, color: '#444', textAlign: 'right', lineHeight: 1.5 },

  // ── items table ───────────────────────────────────────────────────────────
  tblWrap: { marginBottom: 8 },
  tblHeadRow: {
    flexDirection: 'row',
    backgroundColor: TBL_HEADER_BG,
    borderWidth: 0.75,
    borderColor: BORDER_COLOR,
    borderBottomWidth: 0,
  },
  tblHeadCell: {
    fontSize: 8,
    fontFamily: 'Times-Bold',
    paddingHorizontal: 3,
    paddingVertical: 4,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: BORDER_COLOR,
    flexShrink: 0,
    justifyContent: 'center',
  },
  tblSectRow: {
    flexDirection: 'row',
    backgroundColor: TBL_SECT_BG,
    borderWidth: 0.75,
    borderColor: BORDER_COLOR,
    borderTopWidth: 0,
  },
  tblSectCell: {
    flex: 1,
    fontSize: 9,
    fontFamily: 'Times-Bold',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tblRow: {
    flexDirection: 'row',
    borderLeftWidth: 0.75,
    borderRightWidth: 0.75,
    borderBottomWidth: 0.5,
    borderColor: BORDER_COLOR,
    minHeight: 18,
  },
  tblCell: {
    fontSize: 8,
    paddingHorizontal: 3,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: BORDER_COLOR,
    flexShrink: 0,
    justifyContent: 'center',  // vertically center content when row is tall
  },
  tblCellLast: {
    fontSize: 8,
    paddingHorizontal: 3,
    paddingVertical: 3,
    flexShrink: 0,
    justifyContent: 'center',  // vertically center content when row is tall
  },
  tblDescTitle: {
    fontSize: 8,
    fontFamily: 'Times-Bold',
    lineHeight: 1.3,
  },
  tblDescSpecs: {
    fontSize: 7,
    color: '#333333',
    lineHeight: 1.4,
    marginTop: 1.5,
  },

  // totals
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  totalsBox:  { width: 230 },
  totRowFirst: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 0.75,
    borderColor: BORDER_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  totRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 0.75,
    borderColor: BORDER_COLOR,
    borderTopWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  totLabel: { fontSize: 11, fontFamily: 'Times-Bold' },
  totValue: { fontSize: 11, fontFamily: 'Times-Bold' },

  // footnotes
  fnText: { fontSize: 11, fontStyle: 'italic', lineHeight: 1.6, color: '#333' },

  // prepared-by table
  prepHead: {
    flexDirection: 'row',
    backgroundColor: TBL_HEADER_BG,
    borderWidth: 0.75,
    borderColor: BORDER_COLOR,
    borderBottomWidth: 0,
    marginTop: 8,
  },
  prepRow: {
    flexDirection: 'row',
    borderWidth: 0.75,
    borderColor: BORDER_COLOR,
    borderTopWidth: 0,
  },
  prepHeadCell: {
    fontSize: 11,
    fontFamily: 'Times-Bold',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: BORDER_COLOR,
  },
  prepHeadCellLast: {
    fontSize: 11,
    fontFamily: 'Times-Bold',
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  prepCell: {
    fontSize: 11,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: BORDER_COLOR,
  },
  prepCellLast: {
    fontSize: 11,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
})

// ─── column widths (page content = 511px) ────────────────────────────────────
// fixed cols: 20+72+68+20+22+50+58+46 = 356  →  description = 511-356 = 155px
const W = { sno: 20, ref: 72, make: 68, qty: 20, unit: 22, rate: 50, amount: 58, delivery: 46 }
const DESC_W = 511 - W.sno - W.ref - W.make - W.qty - W.unit - W.rate - W.amount - W.delivery  // 155

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d: string | Date) => {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
}
const fmtNum = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── types ────────────────────────────────────────────────────────────────────
export interface QuotationForPDF {
  id: string
  qtRef: string
  qtnDate: string | Date
  customerName: string
  projectName: string
  amountSar: number
  discount: number
  subject?: string | null
  rfqCode?: string | null
  application?: string | null
  poBox?: string | null
  paymentTerms?: string | null
  deliveryWeeks?: string | null
  validityDays?: number | null
  termsOfDelivery?: string | null
  warranty?: string | null
  tpiNote?: string | null
  pricesNote?: string | null
  discountType?: string | null
  hideDiscount?: boolean | null
  notes?: string | null
  remarks?: string | null
  clientContactName?: string | null
  clientContactDetails?: string | null
  kaeAssigned?: { name: string; email?: string | null } | null
  // Customer address fields (fetched from Customer record)
  customerCity?:    string | null
  customerCountry?: string | null
  customerStreet?:  string | null
  lineItems: Array<{
    id?: string
    sNo: number
    itemType?: string | null
    description: string
    specifications?: string | null
    reference?: string | null
    make?: string | null
    qty: number
    unit?: string | null
    rate: number
    discountPct?: number | null
    amount: number
    delivery?: string | null
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE HEADER  — full-width DLIT logo (already contains Arabic text)
// ─────────────────────────────────────────────────────────────────────────────
function PageHeader({ logoDataUrl }: { logoDataUrl?: string | null; arabicHeaderUrl?: string | null }) {
  return (
    <View style={s.pageHeaderRow} fixed>
      {logoDataUrl
        ? <Image src={logoDataUrl} style={s.logoImg} />
        : <Text style={{ fontFamily: 'Times-Bold', fontSize: 11 }}>DYNAMIC LINE INTERNATIONAL TRADING</Text>
      }
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE FOOTER  — fixed at bottom
// ─────────────────────────────────────────────────────────────────────────────
function PageFooter({ address, emails }: { address?: string; emails?: string }) {
  const footerAddr   = address || '17, 3rd Floor, 7202, Saeed Ibn Zayd Rd,\nQurtubah, 13247, Riyadh, KSA'
  const footerEmails = emails  || 'sales@dynamicline.com.sa\nomair@dynamicline.com.sa'
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.footerLeft}>{footerAddr}</Text>
      <Text style={s.footerCenter} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      <Text style={s.footerRight}>{footerEmails}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 1 — COVER LETTER
// ─────────────────────────────────────────────────────────────────────────────
function CoverPage({ q, logoDataUrl, arabicHeaderUrl, pdfSettings = {} }: { q: QuotationForPDF; logoDataUrl?: string | null; arabicHeaderUrl?: string | null; pdfSettings?: PdfSettings }) {
  const validity     = q.validityDays ?? 30
  const deliveryText = q.deliveryWeeks
    ? `${q.deliveryWeeks} Weeks from material approval or PO (whichever is later)`
    : '** Weeks from material approval or PO (whichever is later)'

  return (
    <Page size="A4" style={s.page}>
      <PageHeader logoDataUrl={logoDataUrl} arabicHeaderUrl={arabicHeaderUrl} />

      {/* Title */}
      <Text style={s.offerTitle}>COMMERCIAL OFFER</Text>

      {/* ── Address block ── */}
      <View style={s.addrRow}>
        {/* Left: To */}
        <View style={s.addrLeft}>
          <Text style={s.addrTo}>To,</Text>
          <Text style={s.addrCustomer}>{q.customerName}</Text>
          {(q.customerStreet || q.poBox) && (
            <Text style={s.addrLine}>{q.customerStreet || `Po Box  ${q.poBox}`}</Text>
          )}
          <Text style={s.addrLine}>
            {[q.customerCity, q.customerCountry].filter(Boolean).join('    ') || 'Saudi Arabia'}
          </Text>
        </View>
        {/* Right: TRN / Date / Ref / Code */}
        <View style={s.addrRight}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>TRN</Text>
            <Text style={s.metaSep}>:</Text>
            <Text style={s.metaValue}> </Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Date</Text>
            <Text style={s.metaSep}>:</Text>
            <Text style={s.metaValue}>{fmtDate(q.qtnDate)}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Ref</Text>
            <Text style={s.metaSep}>:</Text>
            <Text style={s.metaValue}>{q.qtRef}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Code</Text>
            <Text style={s.metaSep}>:</Text>
            <Text style={s.metaValue}>{q.rfqCode || ''}</Text>
          </View>
        </View>
      </View>

      {/* ── PROJECT / KIND ATTN / SUBJECT / APPLICATION ── */}
      <View style={s.fieldRow}>
        <Text style={s.fieldLabel}>PROJECT</Text>
        <Text style={s.fieldColon}>:</Text>
        <Text style={s.fieldValue}>{q.projectName}</Text>
      </View>
      <View style={s.fieldRow}>
        <Text style={s.fieldLabel}>KIND ATTN</Text>
        <Text style={s.fieldColon}>:</Text>
        <Text style={s.fieldValue}>{q.clientContactName || ''}</Text>
      </View>
      <View style={s.fieldRow}>
        <Text style={s.fieldLabel}>SUBJECT</Text>
        <Text style={s.fieldColon}>:</Text>
        <Text style={s.fieldValue}>{q.subject || q.projectName}</Text>
      </View>
      <View style={[s.fieldRow, s.fieldsSep]}>
        <Text style={s.fieldLabel}>APPLICATION</Text>
        <Text style={s.fieldColon}>:</Text>
        <Text style={s.fieldValue}>{q.application || ''}</Text>
      </View>

      {/* ── Greeting ── */}
      <Text style={s.para}>Dear Sir,</Text>
      <Text style={s.para}>
        We thank you for your enquiry, please find attached our detailed quotation.
      </Text>

      {/* ── Terms ── */}
      <View style={s.termsBlock}>
        {([
          ['Prices',            q.pricesNote        || 'Quoted prices are excluding VAT'],
          ['Currency',          'SAR (SAUDI RIYAL)'],
          ['Terms of Delivery', q.termsOfDelivery   || 'DDP, Delivered to Site'],
          ['Payment Terms',     q.paymentTerms      || 'To be discussed'],
          ['Delivery',          deliveryText],
          ['Warranty',          q.warranty          || '12 months from date of supply'],
          ['Validity',          `${validity} days from the date of quotation`],
          ['TPI',               q.tpiNote           || 'Inclusive of FAT/SAT; any TPI will be charged on request.'],
        ] as [string, string][]).map(([label, value]) => (
          <View key={label} style={s.termsRow}>
            <Text style={s.termsLabel}>{label}</Text>
            <Text style={s.termsSep}>:</Text>
            <Text style={s.termsValue}>{value}</Text>
          </View>
        ))}
      </View>

      {/* ── Remarks ── */}
      {q.remarks ? (
        <Text style={[s.para, { marginBottom: 6 }]}>Remarks: {q.remarks}</Text>
      ) : null}

      {/* ── Closing ── */}
      <Text style={s.para}>
        {pdfSettings.closingText || 'We trust you will find our offer most competitive. If you need any further information, please feel free to contact us.'}
      </Text>
      <Text style={s.para}>Thank you and assuring you of our best services at all times.</Text>

      {/* ── Signature ── */}
      <View style={s.signWrap}>
        <Text style={s.signLine}>Yours Faithfully,</Text>
        <Text style={s.signLine}>
          For <Text style={s.signBold}>{pdfSettings.companyFullName || 'DYNAMIC LINE INTERNATIONAL TRADING'},</Text>
        </Text>
        <Text style={s.signName}>{pdfSettings.signatoryName  || 'OMAIR AZMI'}</Text>
        <Text style={s.signTitle}>{pdfSettings.signatoryTitle || 'Manager, Water Division'}</Text>
        {(pdfSettings.signatoryCc || 'Mr. Mohammed Afaque Ahmed, CEO') && (
          <Text style={s.signCC}>cc - {pdfSettings.signatoryCc || 'Mr. Mohammed Afaque Ahmed, CEO'}</Text>
        )}
      </View>

      {/* Legal notice */}
      <Text style={s.legalText}>
        {pdfSettings.legalNotice || 'THIS OFFER IS LEGAL WITHOUT SIGNATURE DURING ELECTRONIC TRANSMISSION'}
      </Text>

      <PageFooter address={pdfSettings.footerAddress} emails={pdfSettings.footerEmails} />
    </Page>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 2+ — LINE ITEMS
// ─────────────────────────────────────────────────────────────────────────────
type PreparedContact = { name: string; title?: string; email: string; contact: string }

type PdfSettings = {
  companyFullName?: string
  closingText?:     string
  signatoryName?:   string
  signatoryTitle?:  string
  signatoryCc?:     string
  legalNotice?:     string
  footerAddress?:   string
  footerEmails?:    string
  footnotes?:       string[]
}

function ItemsPage({
  q, subtotal, discount, net, logoDataUrl, arabicHeaderUrl, preparedByContacts, pdfSettings = {},
}: {
  q: QuotationForPDF
  subtotal: number
  discount: number
  net: number
  logoDataUrl?: string | null
  arabicHeaderUrl?: string | null
  preparedByContacts?: PreparedContact[] | null
  pdfSettings?: PdfSettings
}) {
  // Use custom contacts from settings if provided; otherwise fall back to hardcoded defaults
  const preparedBy: PreparedContact[] = (preparedByContacts && preparedByContacts.length > 0)
    ? preparedByContacts
    : [
        {
          name:    q.kaeAssigned?.name
            ? `${q.kaeAssigned.name}${q.kaeAssigned.name ? '' : ' - Key Account Executive'}`
            : 'Muhammed Nufair',
          title:   'Inside Sales Engineer',
          email:   q.kaeAssigned?.email || 'sales3@dynamiclinevalves.com',
          contact: '+971 52 616 5825',
        },
        { name: 'Umar Khan',   title: 'Sales & Project Engineer', email: 'sales1@dynamicline.com.sa', contact: '+966 50 240 9228' },
        { name: 'Ahsan Farooq', title: 'Sales Manager',           email: 'ahsan@dynamicline.com.sa',  contact: '+966 50 240 9228' },
      ]

  return (
    <Page size="A4" style={s.page}>
      <PageHeader logoDataUrl={logoDataUrl} arabicHeaderUrl={arabicHeaderUrl} />

      {/* Items table */}
      <View style={s.tblWrap}>
        {/* Header */}
        <View style={s.tblHeadRow}>
          <Text style={[s.tblHeadCell, { width: W.sno }]}>S.No</Text>
          <Text style={[s.tblHeadCell, { flex: 1, textAlign: 'left' }]}>Description</Text>
          <Text style={[s.tblHeadCell, { width: W.ref }]}>Reference</Text>
          <Text style={[s.tblHeadCell, { width: W.make }]}>Make</Text>
          <Text style={[s.tblHeadCell, { width: W.qty }]}>Qty</Text>
          <Text style={[s.tblHeadCell, { width: W.unit }]}>Unit</Text>
          <Text style={[s.tblHeadCell, { width: W.rate }]}>Rate</Text>
          <Text style={[s.tblHeadCell, { width: W.amount }]}>Amount</Text>
          <Text style={[s.tblHeadCell, { width: W.delivery, borderRightWidth: 0 }]}>Delivery{'\n'}(Weeks)</Text>
        </View>

        {/* Rows */}
        {q.lineItems.length === 0 ? (
          <View style={[s.tblRow, { borderTopWidth: 0.75 }]}>
            <Text style={[s.tblCellLast, { flex: 1, textAlign: 'center', paddingVertical: 12, color: '#888' }]}>
              No line items added
            </Text>
          </View>
        ) : (
          q.lineItems.map((item, idx) => {
            if (item.itemType === 'header') {
              return (
                <View key={idx} style={s.tblSectRow} wrap={false}>
                  <Text style={s.tblSectCell}>{item.description.toUpperCase()}</Text>
                </View>
              )
            }
            const qty    = Number(item.qty)
            const rate   = Number(item.rate)
            const isRateOnly = qty === 0 && rate > 0
            return (
              <View key={idx} style={s.tblRow}>
                {/* S.No */}
                <View style={[s.tblCell, { width: W.sno, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'center' }}>{item.sNo}</Text>
                </View>
                {/* Description (title + specs) — explicit width so react-pdf knows where to wrap */}
                <View style={{ width: DESC_W, paddingHorizontal: 3, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: BORDER_COLOR }}>
                  <Text style={s.tblDescTitle}>{item.description}</Text>
                  {item.specifications ? (
                    <Text style={s.tblDescSpecs}>{item.specifications}</Text>
                  ) : null}
                </View>
                {/* Reference */}
                <View style={[s.tblCell, { width: W.ref, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'center' }}>{item.reference || ''}</Text>
                </View>
                {/* Make */}
                <View style={[s.tblCell, { width: W.make, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'center' }}>{item.make || ''}</Text>
                </View>
                {/* Qty */}
                <View style={[s.tblCell, { width: W.qty, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'center' }}>{isRateOnly ? '' : String(qty)}</Text>
                </View>
                {/* Unit */}
                <View style={[s.tblCell, { width: W.unit, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'center' }}>{item.unit || 'NO.S'}</Text>
                </View>
                {/* Rate */}
                <View style={[s.tblCell, { width: W.rate, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'right' }}>{fmtNum(rate)}</Text>
                </View>
                {/* Amount */}
                <View style={[s.tblCell, { width: W.amount, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'right' }}>
                    {isRateOnly ? 'Rate Only' : fmtNum(Number(item.amount))}
                  </Text>
                </View>
                {/* Delivery */}
                <View style={[s.tblCellLast, { width: W.delivery, flexShrink: 0 }]}>
                  <Text style={{ fontSize: 8, textAlign: 'center' }}>{item.delivery || ''}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>

      {/* Totals — hideDiscount collapses discount row so customer sees net price only */}
      <View style={s.totalsWrap}>
        <View style={s.totalsBox}>
          {discount > 0 && !q.hideDiscount ? (
            <>
              <View style={s.totRowFirst}>
                <Text style={s.totLabel}>SUB-TOTAL</Text>
                <Text style={s.totValue}>{fmtNum(subtotal)}</Text>
              </View>
              <View style={s.totRow}>
                <Text style={s.totLabel}>SPECIAL DISCOUNT</Text>
                <Text style={s.totValue}>- {fmtNum(discount)}</Text>
              </View>
              <View style={s.totRow}>
                <Text style={s.totLabel}>GRAND TOTAL</Text>
                <Text style={s.totValue}>{fmtNum(net)}</Text>
              </View>
            </>
          ) : (
            <View style={s.totRowFirst}>
              <Text style={s.totLabel}>TOTAL</Text>
              <Text style={s.totValue}>{fmtNum(net)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Footnotes — from settings or hardcoded defaults */}
      {(() => {
        const defaultNotes = [
          'Any deviation in specification or material of construction, quantity will warrant a change in price from the manufacturer.',
          'Any subsequent claims regarding Model Code, Material of Construction (MOC), Design, or any other discrepancies will not be honored by M/s DLIT',
          'Please note that due to the current situation, the delivery lead time may be longer than initially offered',
          'The offered prices are valid only for this enquiry and quantity. Orders are non-cancellable upon PO placement. TDS of the proposed valves is enclosed with the offer',
        ]
        const notes = (pdfSettings.footnotes && pdfSettings.footnotes.length > 0) ? pdfSettings.footnotes : defaultNotes
        return (
          <View style={{ marginBottom: 6 }}>
            {notes.map((note, i) => (
              <Text key={i} style={s.fnText}>*{note}</Text>
            ))}
            {q.notes ? <Text style={[s.fnText, { marginTop: 2 }]}>*{q.notes}</Text> : null}
          </View>
        )
      })()}

      {/* Prepared by */}
      <View style={s.prepHead}>
        <Text style={[s.prepHeadCell, { flex: 1 }]}>Prepared by</Text>
        <Text style={[s.prepHeadCell, { width: 168 }]}>Email</Text>
        <Text style={[s.prepHeadCellLast, { width: 96 }]}>Contact</Text>
      </View>
      {preparedBy.map((p, i) => (
        <View key={i} style={s.prepRow}>
          <Text style={[s.prepCell, { flex: 1 }]}>{p.name}{p.title ? ` - ${p.title}` : ''}</Text>
          <Text style={[s.prepCell, { width: 168 }]}>{p.email}</Text>
          <Text style={[s.prepCellLast, { width: 96 }]}>{p.contact}</Text>
        </View>
      ))}

      <PageFooter address={pdfSettings.footerAddress} emails={pdfSettings.footerEmails} />
    </Page>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function QuotationPDF({
  quotation: q,
  logoDataUrl,
  arabicHeaderUrl,
  preparedByContacts,
  pdfSettings,
}: {
  quotation: QuotationForPDF
  logoDataUrl?: string | null
  arabicHeaderUrl?: string | null
  preparedByContacts?: PreparedContact[] | null
  pdfSettings?: PdfSettings
}) {
  const items    = q.lineItems.filter(li => li.itemType !== 'header')
  const subtotal = items.reduce((sum, li) => sum + Number(li.amount), 0) || Number(q.amountSar)
  const discountRaw = Number(q.discount) || 0
  const discount = q.discountType === 'PCT'
    ? subtotal * (discountRaw / 100)
    : discountRaw
  const net      = subtotal - discount

  return (
    <Document
      title={`Commercial Offer — ${q.qtRef}`}
      author="Dynamic Line International Trading"
      subject={q.subject || q.projectName}
    >
      <CoverPage q={q} logoDataUrl={logoDataUrl} arabicHeaderUrl={arabicHeaderUrl} pdfSettings={pdfSettings} />
      <ItemsPage q={q} subtotal={subtotal} discount={discount} net={net}
        logoDataUrl={logoDataUrl} arabicHeaderUrl={arabicHeaderUrl}
        preparedByContacts={preparedByContacts} pdfSettings={pdfSettings} />
    </Document>
  )
}
