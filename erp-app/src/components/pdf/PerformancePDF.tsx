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

const s = StyleSheet.create({
  page: { fontFamily: 'Times-Roman', fontSize: 11, color: '#1e293b', paddingLeft: 36, paddingRight: 36, paddingTop: 24, paddingBottom: 36 },

  headerBar:   { backgroundColor: DARK_BG, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 14 },
  headerTitle: { fontSize: 20, fontFamily: 'Times-Bold', color: '#FFFFFF' },
  headerSub:   { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  headerDate:  { fontSize: 9,  color: '#94A3B8' },

  sectionTitle: { fontSize: 13, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginBottom: 6, marginTop: 14 },

  kpiRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiCard:  { flex: 1, backgroundColor: LIGHT_GREY, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 9, color: '#64748B' },
  kpiValue: { fontSize: 14, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginTop: 2 },
  kpiSub:   { fontSize: 8, color: '#94A3B8', marginTop: 1 },

  tableHeader: { flexDirection: 'row', backgroundColor: HDR_GREY, borderWidth: 0.5, borderColor: '#AAAAAA' },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD' },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD', backgroundColor: '#F8FAFC' },
  tableRowTop: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD', backgroundColor: '#FFF7ED' },
  cellHdr:     { fontSize: 9, fontFamily: 'Times-Bold', padding: 4, textAlign: 'center' },
  cell:        { fontSize: 9, padding: 4 },
  cellR:       { fontSize: 9, padding: 4, textAlign: 'right' },
  cellC:       { fontSize: 9, padding: 4, textAlign: 'center' },

  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#E2E8F0', paddingTop: 4 },
  footerTxt: { fontSize: 8, color: '#94A3B8' },
})

interface PerformanceData {
  reportDate: string
  totalTeamRevenue: number
  overdueCount: number
  avgOverdueDays: number
  kaeCount: number
  iseCount: number
  kaeLeaderboard: { name: string; totalRfq: number; converted: number; revenue: number; avgCollection: number; winRate: number }[]
  isePipeline:    { name: string; openQuotes: number; pipelineValue: number; avgRevisions: number }[]
}

export default function PerformancePDF({ data }: { data: PerformanceData }) {
  const { reportDate, totalTeamRevenue, overdueCount, avgOverdueDays, kaeCount, iseCount, kaeLeaderboard, isePipeline } = data

  return (
    <Document title={`Performance Report — ${reportDate}`} author="DLIT ERP">
      <Page size="A4" style={s.page} orientation="landscape">

        {/* ── Header ── */}
        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={s.headerTitle}>PERFORMANCE REPORT</Text>
              <Text style={s.headerSub}>Dynamic Line International Trading</Text>
            </View>
            <Text style={s.headerDate}>{reportDate}</Text>
          </View>
        </View>

        {/* ── Summary KPIs ── */}
        <Text style={s.sectionTitle}>Summary</Text>
        <View style={s.kpiRow}>
          {[
            { label: 'Total Team Revenue',  value: fmtShrt(totalTeamRevenue), sub: 'All KAEs combined (inc-VAT)' },
            { label: 'Overdue Milestones',  value: String(overdueCount),      sub: avgOverdueDays > 0 ? `Avg ${avgOverdueDays.toFixed(0)} days overdue` : 'None overdue' },
            { label: 'Active KAEs',         value: String(kaeCount),          sub: 'Key Account Engineers' },
            { label: 'Active ISEs',         value: String(iseCount),          sub: 'Inside Sales Engineers' },
          ].map((kpi, i) => (
            <View key={i} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{kpi.label}</Text>
              <Text style={s.kpiValue}>{kpi.value}</Text>
              <Text style={s.kpiSub}>{kpi.sub}</Text>
            </View>
          ))}
        </View>

        {/* ── KAE Leaderboard ── */}
        <Text style={s.sectionTitle}>KAE Leaderboard</Text>
        <View style={s.tableHeader}>
          {['#', 'KAE Name', 'Total RFQs', 'Converted', 'Win Rate', 'Revenue (inc-VAT)', 'Avg Collection'].map((h, i) => (
            <Text key={i} style={[s.cellHdr, { width: i === 0 ? '4%' : i === 1 ? '24%' : i === 5 ? '22%' : '12.5%' }]}>{h}</Text>
          ))}
        </View>
        {kaeLeaderboard.length === 0 ? (
          <Text style={{ fontSize: 10, color: '#94A3B8', padding: 8 }}>No KAE data available.</Text>
        ) : kaeLeaderboard.map((row, i) => (
          <View key={i} style={i === 0 ? s.tableRowTop : i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.cellC, { width: '4%' }]}>{i + 1}</Text>
            <Text style={[s.cell,  { width: '24%', fontFamily: 'Times-Bold' }]}>{row.name}</Text>
            <Text style={[s.cellC, { width: '12.5%' }]}>{row.totalRfq}</Text>
            <Text style={[s.cellC, { width: '12.5%' }]}>{row.converted}</Text>
            <Text style={[s.cellC, { width: '12.5%', color: row.winRate >= 60 ? '#15803D' : row.winRate >= 40 ? '#B45309' : '#B91C1C' }]}>{row.winRate.toFixed(1)}%</Text>
            <Text style={[s.cellR, { width: '22%' }]}>{fmtNum(row.revenue)}</Text>
            <Text style={[s.cellC, { width: '12.5%' }]}>{row.avgCollection.toFixed(1)}%</Text>
          </View>
        ))}

        {/* ── ISE Pipeline ── */}
        {isePipeline.length > 0 && (
          <>
            <Text style={s.sectionTitle}>ISE Pipeline</Text>
            <View style={s.tableHeader}>
              {['#', 'ISE Name', 'Open Quotes', 'Pipeline Value (SAR)', 'Avg Revisions'].map((h, i) => (
                <Text key={i} style={[s.cellHdr, { width: i === 0 ? '6%' : i === 1 ? '30%' : i === 3 ? '36%' : '14%' }]}>{h}</Text>
              ))}
            </View>
            {isePipeline.map((row, i) => (
              <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.cellC, { width: '6%' }]}>{i + 1}</Text>
                <Text style={[s.cell,  { width: '30%', fontFamily: 'Times-Bold' }]}>{row.name}</Text>
                <Text style={[s.cellC, { width: '14%' }]}>{row.openQuotes}</Text>
                <Text style={[s.cellR, { width: '36%' }]}>{fmtNum(row.pipelineValue)}</Text>
                <Text style={[s.cellC, { width: '14%' }]}>{row.avgRevisions.toFixed(1)}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Dynamic Line International Trading</Text>
          <Text style={s.footerTxt}>Performance Report — {reportDate}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
