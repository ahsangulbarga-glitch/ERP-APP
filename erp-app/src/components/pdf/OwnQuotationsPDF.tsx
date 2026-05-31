import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const DLIT_BLUE  = '#1A5096'
const DARK_BG    = '#0F172A'
const HDR_GREY   = '#D9D9D9'
const LIGHT_GREY = '#F2F2F2'
const BORDER     = '#CBD5E1'

const fmtNum = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const STATUS_COLOR: Record<string, string> = {
  Open:      '#2563EB',
  OnHold:    '#D97706',
  Converted: '#16A34A',
  Lost:      '#B91C1C',
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Times-Roman', fontSize: 10, color: '#1e293b', paddingLeft: 36, paddingRight: 36, paddingTop: 24, paddingBottom: 48 },
  headerBar:   { backgroundColor: DARK_BG, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 14 },
  headerTitle: { fontSize: 18, fontFamily: 'Times-Bold', color: '#FFFFFF' },
  headerSub:   { fontSize: 9,  color: '#94A3B8', marginTop: 2 },
  headerDate:  { fontSize: 8,  color: '#94A3B8' },
  kpiRow:      { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard:     { flex: 1, backgroundColor: LIGHT_GREY, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  kpiLabel:    { fontSize: 8, color: '#64748B' },
  kpiValue:    { fontSize: 16, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginBottom: 6, marginTop: 12 },
  tableHeader: { flexDirection: 'row', backgroundColor: HDR_GREY, borderWidth: 0.5, borderColor: '#AAAAAA' },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD' },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD', backgroundColor: '#F8FAFC' },
  xsHdr:       { fontSize: 9.5, fontFamily: 'Times-Bold', padding: 3, textAlign: 'center' },
  xs:          { fontSize: 9,   padding: 3 },
  xsR:         { fontSize: 9,   padding: 3, textAlign: 'right' },
  xsC:         { fontSize: 9,   padding: 3, textAlign: 'center' },
  xsBR:        { fontSize: 9,   padding: 3, fontFamily: 'Times-Bold', textAlign: 'right', color: DLIT_BLUE },
  totalRow:    { flexDirection: 'row', backgroundColor: '#E2E8F0', borderTopWidth: 1, borderColor: '#94A3B8' },
  footer:      { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#E2E8F0', paddingTop: 4 },
  footerTxt:   { fontSize: 8, color: '#94A3B8' },
})

export interface OwnQuotationRow {
  qtRef: string; status: string; customerName: string; projectName: string
  amountSar: number; rfqCode: string; qtnDate: string; remarks: string
}

interface Props {
  quotes: OwnQuotationRow[]
  userName: string
  reportDate: string
}

export default function OwnQuotationsPDF({ quotes, userName, reportDate }: Props) {
  const byStatus = (st: string) => quotes.filter(q => q.status === st).length
  const totalValue = quotes.reduce((s, q) => s + q.amountSar, 0)

  return (
    <Document title={`My Quotations — ${userName} — ${reportDate}`} author="DLIT ERP">
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* Header */}
        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={s.headerTitle}>MY QUOTATIONS REPORT</Text>
              <Text style={s.headerSub}>Dynamic Line International Trading — {userName}</Text>
            </View>
            <Text style={s.headerDate}>{reportDate}</Text>
          </View>
        </View>

        {/* KPI summary */}
        <View style={s.kpiRow}>
          {[
            { label: 'Total Quotations', value: String(quotes.length) },
            { label: 'Open',             value: String(byStatus('Open')) },
            { label: 'On Hold',          value: String(byStatus('OnHold')) },
            { label: 'Converted',        value: String(byStatus('Converted')) },
            { label: 'Lost',             value: String(byStatus('Lost')) },
          ].map((k, i) => (
            <View key={i} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={[s.kpiValue, { fontSize: 14 }]}>{k.value}</Text>
            </View>
          ))}
        </View>

        {/* Quotations table */}
        <Text style={s.sectionTitle}>All Quotations ({quotes.length})</Text>
        <View style={s.tableHeader}>
          {[
            { h: 'QT Ref',      w: '14%' }, { h: 'Status',    w: '9%'  },
            { h: 'Customer',    w: '18%' }, { h: 'Project',   w: '20%' },
            { h: 'Value (SAR)', w: '14%' }, { h: 'RFQ Code',  w: '10%' },
            { h: 'Date',        w: '8%'  }, { h: 'Remarks',   w: '7%'  },
          ].map(({ h, w }, i) => (
            <Text key={i} style={[s.xsHdr, { width: w }]}>{h}</Text>
          ))}
        </View>

        {quotes.map((q, i) => {
          const color = STATUS_COLOR[q.status] || '#64748B'
          return (
            <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.xs,  { width: '14%' }]}>{q.qtRef || '—'}</Text>
              <Text style={[s.xsC, { width: '9%',  fontFamily: 'Times-Bold', color }]}>{q.status}</Text>
              <Text style={[s.xs,  { width: '18%' }]}>{q.customerName || '—'}</Text>
              <Text style={[s.xs,  { width: '20%' }]}>{q.projectName  || '—'}</Text>
              <Text style={[s.xsBR,{ width: '14%' }]}>{fmtNum(q.amountSar)}</Text>
              <Text style={[s.xsC, { width: '10%', color: '#64748B' }]}>{q.rfqCode || '—'}</Text>
              <Text style={[s.xsC, { width: '8%'  }]}>{fmtDate(q.qtnDate)}</Text>
              <Text style={[s.xs,  { width: '7%',  color: '#64748B', fontStyle: 'italic' }]}>{q.remarks || '—'}</Text>
            </View>
          )
        })}

        {/* Totals */}
        <View style={s.totalRow}>
          <Text style={[s.xsHdr, { width: '61%', textAlign: 'left' }]}>TOTAL — {quotes.length} Quotation{quotes.length !== 1 ? 's' : ''}</Text>
          <Text style={[s.xsHdr, { width: '14%', textAlign: 'right', color: DLIT_BLUE }]}>{fmtNum(totalValue)}</Text>
          <Text style={[s.xs,    { width: '25%' }]}></Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Dynamic Line International Trading</Text>
          <Text style={s.footerTxt}>My Quotations — {userName} — {reportDate}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
