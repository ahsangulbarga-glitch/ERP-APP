import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const DLIT_BLUE  = '#1A5096'
const DARK_BG    = '#0F172A'
const HDR_GREY   = '#D9D9D9'
const LIGHT_GREY = '#F2F2F2'
const BORDER     = '#CBD5E1'

const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtShrt = (n: number) =>
  n >= 1_000_000 ? `SAR ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `SAR ${(n / 1_000).toFixed(0)}K`
  : `SAR ${n.toFixed(0)}`
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const s = StyleSheet.create({
  page:         { fontFamily: 'Times-Roman', fontSize: 10, color: '#1e293b', paddingLeft: 36, paddingRight: 36, paddingTop: 24, paddingBottom: 48 },
  headerBar:    { backgroundColor: DARK_BG, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 14 },
  headerTitle:  { fontSize: 18, fontFamily: 'Times-Bold', color: '#FFFFFF' },
  headerSub:    { fontSize: 9,  color: '#94A3B8', marginTop: 2 },
  headerDate:   { fontSize: 8,  color: '#94A3B8' },
  kpiRow:       { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard:      { flex: 1, backgroundColor: LIGHT_GREY, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  kpiLabel:     { fontSize: 8, color: '#64748B' },
  kpiValue:     { fontSize: 14, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginBottom: 6, marginTop: 14 },
  tableHeader:  { flexDirection: 'row', backgroundColor: HDR_GREY, borderWidth: 0.5, borderColor: '#AAAAAA' },
  tableRow:     { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD' },
  tableRowAlt:  { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD', backgroundColor: '#F8FAFC' },
  xsHdr:        { fontSize: 9.5, fontFamily: 'Times-Bold', padding: 3, textAlign: 'center' },
  xs:           { fontSize: 9,   padding: 3 },
  xsR:          { fontSize: 9,   padding: 3, textAlign: 'right' },
  xsC:          { fontSize: 9,   padding: 3, textAlign: 'center' },
  xsBR:         { fontSize: 9,   padding: 3, fontFamily: 'Times-Bold', textAlign: 'right', color: DLIT_BLUE },
  totalRow:     { flexDirection: 'row', backgroundColor: '#E2E8F0', borderTopWidth: 1, borderColor: '#94A3B8' },
  footer:       { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#E2E8F0', paddingTop: 4 },
  footerTxt:    { fontSize: 8, color: '#94A3B8' },
})

export interface PORow {
  poNumber: string; customerName: string; projectName: string; kaeName: string
  poAmountExVat: number; totalValueIncVat: number; paymentStatus: string; poDate: string
  paymentCollectionPct: number
}

export interface MilestoneRow {
  poNumber: string; customerName: string; projectName: string
  phaseName: string; amountSar: number; status: string; dueDate: string; paidAt?: string
}

interface Props {
  pos: PORow[]
  milestones: MilestoneRow[]
  reportDate: string
}

export default function FinancialPDF({ pos, milestones, reportDate }: Props) {
  const totalIncVat   = pos.reduce((s, p) => s + p.totalValueIncVat, 0)
  const totalExVat    = pos.reduce((s, p) => s + p.poAmountExVat, 0)
  const totalBilled   = milestones.reduce((s, m) => s + m.amountSar, 0)
  const totalPaid     = milestones.filter(m => m.status === 'Paid').reduce((s, m) => s + m.amountSar, 0)
  const totalOverdue  = milestones.filter(m => m.status === 'Overdue').reduce((s, m) => s + m.amountSar, 0)

  const milestoneStatusColor: Record<string, string> = {
    Paid:    '#15803D',
    Pending: '#D97706',
    Overdue: '#B91C1C',
  }

  const poStatusColor = (st: string) =>
    st === 'Fully Collected'     ? '#15803D' :
    st === 'Partially Collected' ? '#D97706' : '#B91C1C'

  return (
    <Document title={`Financial Report — ${reportDate}`} author="DLIT ERP">
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* Header */}
        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={s.headerTitle}>FINANCIAL REPORT</Text>
              <Text style={s.headerSub}>Dynamic Line International Trading — PO Tracker &amp; Payments</Text>
            </View>
            <Text style={s.headerDate}>{reportDate}</Text>
          </View>
        </View>

        {/* KPIs */}
        <View style={s.kpiRow}>
          {[
            { label: 'Total POs',         value: String(pos.length) },
            { label: 'PO Value (Inc-VAT)', value: fmtShrt(totalIncVat) },
            { label: 'PO Value (Ex-VAT)',  value: fmtShrt(totalExVat) },
            { label: 'Total Milestones',  value: fmtShrt(totalBilled) },
            { label: 'Collected',         value: fmtShrt(totalPaid) },
            { label: 'Overdue',           value: fmtShrt(totalOverdue) },
          ].map((k, i) => (
            <View key={i} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiValue}>{k.value}</Text>
            </View>
          ))}
        </View>

        {/* ── PO Tracker ── */}
        <Text style={s.sectionTitle}>PO Tracker ({pos.length} POs)</Text>
        <View style={s.tableHeader}>
          {[
            { h: 'PO Number',    w: '15%' }, { h: 'Customer',    w: '16%' },
            { h: 'Project',      w: '16%' }, { h: 'KAE',         w: '10%' },
            { h: 'Inc-VAT (SAR)',w: '13%' }, { h: 'Ex-VAT (SAR)',w: '11%' },
            { h: 'Collection %', w: '9%'  }, { h: 'Status',      w: '10%' },
          ].map(({ h, w }, i) => (
            <Text key={i} style={[s.xsHdr, { width: w }]}>{h}</Text>
          ))}
        </View>
        {pos.map((p, i) => (
          <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.xs,  { width: '15%' }]}>{p.poNumber}</Text>
            <Text style={[s.xs,  { width: '16%' }]}>{p.customerName}</Text>
            <Text style={[s.xs,  { width: '16%' }]}>{p.projectName || '—'}</Text>
            <Text style={[s.xs,  { width: '10%' }]}>{p.kaeName || '—'}</Text>
            <Text style={[s.xsBR,{ width: '13%' }]}>{fmtNum(p.totalValueIncVat)}</Text>
            <Text style={[s.xsR, { width: '11%' }]}>{fmtNum(p.poAmountExVat)}</Text>
            <Text style={[s.xsC, { width: '9%'  }]}>{p.paymentCollectionPct.toFixed(1)}%</Text>
            <Text style={[s.xsC, { width: '10%', fontFamily: 'Times-Bold', color: poStatusColor(p.paymentStatus) }]}>{p.paymentStatus || '—'}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.xsHdr, { width: '57%', textAlign: 'left' }]}>TOTAL — {pos.length} PO{pos.length !== 1 ? 's' : ''}</Text>
          <Text style={[s.xsHdr, { width: '13%', textAlign: 'right', color: DLIT_BLUE }]}>{fmtNum(totalIncVat)}</Text>
          <Text style={[s.xsHdr, { width: '11%', textAlign: 'right' }]}>{fmtNum(totalExVat)}</Text>
          <Text style={[s.xs,    { width: '19%' }]}></Text>
        </View>

        {/* ── Payment Milestones ── */}
        <Text style={s.sectionTitle}>Payment Milestones ({milestones.length})</Text>
        <View style={s.tableHeader}>
          {[
            { h: 'PO Number',    w: '13%' }, { h: 'Customer',    w: '16%' },
            { h: 'Project',      w: '16%' }, { h: 'Phase',       w: '16%' },
            { h: 'Amount (SAR)', w: '14%' }, { h: 'Status',      w: '9%'  },
            { h: 'Due Date',     w: '9%'  }, { h: 'Paid On',     w: '7%'  },
          ].map(({ h, w }, i) => (
            <Text key={i} style={[s.xsHdr, { width: w }]}>{h}</Text>
          ))}
        </View>
        {milestones.map((m, i) => {
          const color = milestoneStatusColor[m.status] || '#64748B'
          return (
            <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.xs,  { width: '13%' }]}>{m.poNumber}</Text>
              <Text style={[s.xs,  { width: '16%' }]}>{m.customerName}</Text>
              <Text style={[s.xs,  { width: '16%' }]}>{m.projectName || '—'}</Text>
              <Text style={[s.xs,  { width: '16%' }]}>{m.phaseName}</Text>
              <Text style={[s.xsBR,{ width: '14%' }]}>{fmtNum(m.amountSar)}</Text>
              <Text style={[s.xsC, { width: '9%',  fontFamily: 'Times-Bold', color }]}>{m.status}</Text>
              <Text style={[s.xsC, { width: '9%'  }]}>{fmtDate(m.dueDate)}</Text>
              <Text style={[s.xsC, { width: '7%',  color: '#15803D' }]}>{m.paidAt ? fmtDate(m.paidAt) : '—'}</Text>
            </View>
          )
        })}
        <View style={s.totalRow}>
          <Text style={[s.xsHdr, { width: '61%', textAlign: 'left' }]}>TOTAL — {milestones.length} Milestone{milestones.length !== 1 ? 's' : ''}</Text>
          <Text style={[s.xsHdr, { width: '14%', textAlign: 'right', color: DLIT_BLUE }]}>{fmtNum(totalBilled)}</Text>
          <Text style={[s.xs,    { width: '25%' }]}></Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Dynamic Line International Trading</Text>
          <Text style={s.footerTxt}>Financial Report — {reportDate}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
