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
  page: { fontFamily: 'Times-Roman', fontSize: 11, color: '#1e293b', paddingLeft: 36, paddingRight: 36, paddingTop: 24, paddingBottom: 48 },

  // Header
  headerBar:   { backgroundColor: DARK_BG, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 14 },
  headerTitle: { fontSize: 20, fontFamily: 'Times-Bold', color: '#FFFFFF' },
  headerSub:   { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  headerDate:  { fontSize: 9, color: '#94A3B8' },

  // Section heading
  sectionTitle:    { fontSize: 13, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginBottom: 6, marginTop: 14 },
  sectionTitleRed: { fontSize: 13, fontFamily: 'Times-Bold', color: '#B91C1C', marginBottom: 6, marginTop: 14 },

  // KPI cards row
  kpiRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiCard:  { flex: 1, backgroundColor: LIGHT_GREY, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 9, color: '#64748B' },
  kpiValue: { fontSize: 14, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginTop: 2 },
  kpiSub:   { fontSize: 8, color: '#94A3B8', marginTop: 1 },

  // Status chips row
  statusRow:  { flexDirection: 'row', gap: 6, marginBottom: 10 },
  statusCard: { flex: 1, borderWidth: 1, borderRadius: 4, padding: 6, alignItems: 'center' },
  statusNum:  { fontSize: 16, fontFamily: 'Times-Bold' },
  statusLbl:  { fontSize: 8, color: '#64748B', marginTop: 1, textAlign: 'center' },

  // Table
  tableHeader:    { flexDirection: 'row', backgroundColor: HDR_GREY, borderWidth: 0.5, borderColor: '#AAAAAA' },
  tableHeaderRed: { flexDirection: 'row', backgroundColor: '#FECACA', borderWidth: 0.5, borderColor: '#AAAAAA' },
  tableRow:       { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD' },
  tableRowAlt:    { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD', backgroundColor: '#F8FAFC' },
  tableRowAltRed: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD', backgroundColor: '#FEF2F2' },
  cellHdr:  { fontSize: 8,   fontFamily: 'Times-Bold', padding: 3, textAlign: 'center' },
  cellHdrR: { fontSize: 8,   fontFamily: 'Times-Bold', padding: 3, textAlign: 'center', color: '#B91C1C' },
  cell:     { fontSize: 8,   padding: 3 },
  cellR:    { fontSize: 8,   padding: 3, textAlign: 'right' },
  cellC:    { fontSize: 8,   padding: 3, textAlign: 'center' },
  cellB:    { fontSize: 8,   padding: 3, fontFamily: 'Times-Bold' },
  cellBR:   { fontSize: 8,   padding: 3, fontFamily: 'Times-Bold', textAlign: 'right', color: DLIT_BLUE },
  // Compact variants for wide tables
  xs:       { fontSize: 9,   padding: 3 },
  xsR:      { fontSize: 9,   padding: 3, textAlign: 'right' },
  xsC:      { fontSize: 9,   padding: 3, textAlign: 'center' },
  xsBR:     { fontSize: 9,   padding: 3, fontFamily: 'Times-Bold', textAlign: 'right', color: DLIT_BLUE },
  xsHdr:    { fontSize: 9.5, fontFamily: 'Times-Bold', padding: 3, textAlign: 'center' },
  // Totals footer row
  totalRow: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderTopWidth: 1, borderColor: '#94A3B8' },

  // Footer
  footer:    { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#E2E8F0', paddingTop: 4 },
  footerTxt: { fontSize: 8, color: '#94A3B8' },
})

interface DashboardData {
  reportDate: string
  kaeColumnLabel: string
  totalQuoted: number; totalPOIncVat: number; totalCollected: number; totalOutstanding: number; totalBilled: number
  winRate: number; collectionRate: number
  statusCounts: { open: number; converted: number; onHold: number; lost: number }
  overdueCount: number; expiringDocs: number
  funnel: { name: string; value: number; pct: number }[]
  recentPaid: {
    poNumber: string; customerName: string; projectName: string
    phaseName: string; amountSar: number; paidAt: string
  }[]
  upcomingPayments: {
    poNumber: string; customerName: string; projectName: string
    phaseName: string; amountSar: number; dueDate: string; daysUntilDue: number
  }[]
  newPOs: {
    poNumber: string; customerName: string; projectName: string; kaeName: string
    totalValueIncVat: number; poAmountExVat: number; paymentTermsSplit: string; paymentStatus: string; poDate: string
  }[]
  openPipeline: {
    qtRef: string; status: string; customerName: string; projectName: string
    amountSar: number; rfqCode: string; kaeName: string; qtnDate: string; remarks: string
  }[]
  overduePayments: { poNumber: string; customerName: string; projectName: string; phaseName: string; amountSar: number; dueDate: string; overdueDays: number }[]
}

export default function DashboardPDF({ data }: { data: DashboardData }) {
  const {
    reportDate, kaeColumnLabel, totalQuoted, totalPOIncVat, totalCollected, totalOutstanding,
    winRate, collectionRate, statusCounts, overdueCount, expiringDocs,
    funnel, recentPaid, upcomingPayments, newPOs, openPipeline, overduePayments,
  } = data

  return (
    <Document title={`Executive Dashboard — ${reportDate}`} author="DLIT ERP">
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* ── Header ── */}
        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={s.headerTitle}>EXECUTIVE DASHBOARD</Text>
              <Text style={s.headerSub}>Dynamic Line International Trading</Text>
            </View>
            <Text style={s.headerDate}>{reportDate}</Text>
          </View>
        </View>

        {/* ── KPI Row ── */}
        <Text style={s.sectionTitle}>Key Performance Indicators</Text>
        <View style={s.kpiRow}>
          {[
            { label: 'Total Pipeline',     value: fmtShrt(totalQuoted),      sub: 'All quotations' },
            { label: 'PO Value (inc-VAT)', value: fmtShrt(totalPOIncVat),    sub: `${winRate.toFixed(1)}% win rate` },
            { label: 'Collected',          value: fmtShrt(totalCollected),    sub: `${collectionRate.toFixed(1)}% of billed` },
            { label: 'AR Outstanding',     value: fmtShrt(totalOutstanding),  sub: overdueCount > 0 ? `${overdueCount} overdue` : 'No overdue' },
          ].map((kpi, i) => (
            <View key={i} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{kpi.label}</Text>
              <Text style={s.kpiValue}>{kpi.value}</Text>
              <Text style={s.kpiSub}>{kpi.sub}</Text>
            </View>
          ))}
        </View>

        {/* ── Status Row ── */}
        <View style={s.statusRow}>
          {[
            { label: 'Open Quotes',   count: statusCounts.open,      border: '#BFDBFE', color: '#1D4ED8' },
            { label: 'On Hold',       count: statusCounts.onHold,    border: '#FDE68A', color: '#B45309' },
            { label: 'Converted',     count: statusCounts.converted, border: '#BBF7D0', color: '#15803D' },
            { label: 'Lost',          count: statusCounts.lost,      border: '#FECACA', color: '#B91C1C' },
            { label: 'Expiring Docs', count: expiringDocs,           border: '#FECACA', color: '#B91C1C' },
            { label: 'Overdue Pmts',  count: overdueCount,           border: '#FECACA', color: '#B91C1C' },
          ].map((st, i) => (
            <View key={i} style={[s.statusCard, { borderColor: st.border, backgroundColor: `${st.border}33` }]}>
              <Text style={[s.statusNum, { color: st.color }]}>{st.count}</Text>
              <Text style={s.statusLbl}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Sales Funnel Table ── */}
        <Text style={s.sectionTitle}>Sales Pipeline Funnel</Text>
        <View style={s.tableHeader}>
          {[
            { h: 'Stage',         w: '36%' },
            { h: 'Value (SAR)',   w: '34%' },
            { h: '% of Pipeline', w: '30%' },
          ].map(({ h, w }, i) => (
            <Text key={i} style={[s.xsHdr, { width: w }]}>{h}</Text>
          ))}
        </View>
        {funnel.map((row, i) => {
          const stageColor = (['#2563EB','#0891B2','#16A34A','#059669','#7C3AED'] as string[])[i] || DLIT_BLUE
          return (
            <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.xs, { width: '36%', fontFamily: 'Times-Bold', color: stageColor }]}>{row.name}</Text>
              <Text style={[s.xsBR, { width: '34%', color: stageColor }]}>{fmtNum(row.value)}</Text>
              <View style={{ width: '30%', flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 }}>
                <View style={{ flex: 1, height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginRight: 5 }}>
                  <View style={{ width: `${Math.min(row.pct, 100)}%`, height: 6, backgroundColor: stageColor, borderRadius: 3 }} />
                </View>
                <Text style={{ fontSize: 9, fontFamily: 'Times-Bold', color: stageColor, width: 38, textAlign: 'right' }}>{row.pct.toFixed(1)}%</Text>
              </View>
            </View>
          )
        })}

        {/* ── New POs Received (last 30 days) ── */}
        <Text style={s.sectionTitle}>New POs Received — Last 30 Days ({newPOs.length})</Text>
        {newPOs.length === 0 ? (
          <Text style={[s.cell, { color: '#94A3B8' }]}>No POs received in the last 30 days.</Text>
        ) : (
          <>
            <View style={s.tableHeader}>
              {[
                { h: 'PO Number',     w: '16%' }, { h: 'Customer',      w: '13%' },
                { h: 'Project',       w: '13%' }, { h: kaeColumnLabel,  w: '10%' },
                { h: 'Inc-VAT (SAR)', w: '12%' }, { h: 'Ex-VAT (SAR)',  w: '10%' },
                { h: 'Pymt Terms',    w: '10%' }, { h: 'Status',        w: '10%' },
                { h: 'Date',          w: '6%'  },
              ].map(({ h, w }, i) => (
                <Text key={i} style={[s.xsHdr, { width: w }]}>{h}</Text>
              ))}
            </View>
            {newPOs.map((po, i) => {
              const statusColor =
                po.paymentStatus === 'Fully Collected'     ? '#15803D' :
                po.paymentStatus === 'Partially Collected' ? '#B45309' : '#B91C1C'
              return (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={[s.xs,  { width: '16%' }]}>{po.poNumber || '—'}</Text>
                  <Text style={[s.xs,  { width: '13%' }]}>{po.customerName || '—'}</Text>
                  <Text style={[s.xs,  { width: '13%' }]}>{po.projectName || '—'}</Text>
                  <Text style={[s.xs,  { width: '10%' }]}>{po.kaeName || '—'}</Text>
                  <Text style={[s.xsBR,{ width: '12%' }]}>{fmtNum(po.totalValueIncVat)}</Text>
                  <Text style={[s.xsR, { width: '10%' }]}>{fmtNum(po.poAmountExVat)}</Text>
                  <Text style={[s.xs,  { width: '10%' }]}>{po.paymentTermsSplit || '—'}</Text>
                  <Text style={[s.xsC, { width: '10%', color: statusColor, fontFamily: 'Times-Bold' }]}>{po.paymentStatus || '—'}</Text>
                  <Text style={[s.xsC, { width: '6%'  }]}>{fmtDate(po.poDate)}</Text>
                </View>
              )
            })}
            <View style={s.totalRow}>
              <Text style={[s.xsHdr, { width: '52%', textAlign: 'left' }]}>TOTAL — {newPOs.length} PO{newPOs.length !== 1 ? 's' : ''}</Text>
              <Text style={[s.xsHdr, { width: '12%', textAlign: 'right', color: DLIT_BLUE }]}>{fmtNum(newPOs.reduce((sum, p) => sum + p.totalValueIncVat, 0))}</Text>
              <Text style={[s.xsHdr, { width: '10%', textAlign: 'right' }]}>{fmtNum(newPOs.reduce((sum, p) => sum + p.poAmountExVat, 0))}</Text>
              <Text style={[s.xs,    { width: '26%' }]}></Text>
            </View>
          </>
        )}

        {/* ── Open Pipeline ── */}
        <Text style={s.sectionTitle}>Open Pipeline — Open &amp; On Hold ({openPipeline.length})</Text>
        {openPipeline.length === 0 ? (
          <Text style={[s.cell, { color: '#94A3B8' }]}>No open quotations in the pipeline.</Text>
        ) : (
          <>
            <View style={s.tableHeader}>
              {[
                { h: 'Ref',         w: '14%' }, { h: 'Status',      w: '8%'  },
                { h: 'Customer',    w: '15%' }, { h: 'Project',     w: '17%' },
                { h: 'Value (SAR)', w: '13%' }, { h: 'KAE',         w: '13%' },
                { h: 'Date',        w: '7%'  }, { h: 'Remarks',     w: '13%' },
              ].map(({ h, w }, i) => (
                <Text key={i} style={[s.xsHdr, { width: w }]}>{h}</Text>
              ))}
            </View>
            {openPipeline.map((q, i) => {
              const statusColor = q.status === 'Open' ? '#1D4ED8' : '#B45309'
              return (
                <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                  <Text style={[s.xs,  { width: '14%' }]}>{q.qtRef || '—'}</Text>
                  <Text style={[s.xsC, { width: '8%',  color: statusColor, fontFamily: 'Times-Bold' }]}>{q.status}</Text>
                  <Text style={[s.xs,  { width: '15%' }]}>{q.customerName || '—'}</Text>
                  <Text style={[s.xs,  { width: '17%' }]}>{q.projectName || '—'}</Text>
                  <Text style={[s.xsBR,{ width: '13%' }]}>{fmtNum(q.amountSar)}</Text>
                  <Text style={[s.xs,  { width: '13%' }]}>{q.kaeName || '—'}</Text>
                  <Text style={[s.xsC, { width: '7%'  }]}>{fmtDate(q.qtnDate)}</Text>
                  <Text style={[s.xs,  { width: '13%', color: '#64748B', fontStyle: 'italic' }]}>{q.remarks || '—'}</Text>
                </View>
              )
            })}
            <View style={s.totalRow}>
              <Text style={[s.xsHdr, { width: '54%', textAlign: 'left' }]}>TOTAL — {openPipeline.length} Quote{openPipeline.length !== 1 ? 's' : ''}</Text>
              <Text style={[s.xsHdr, { width: '13%', textAlign: 'right', color: DLIT_BLUE }]}>{fmtNum(openPipeline.reduce((sum, q) => sum + q.amountSar, 0))}</Text>
              <Text style={[s.xs,    { width: '33%' }]}></Text>
            </View>
          </>
        )}

        {/* ── Recent Payments Received ── */}
        <Text style={[s.sectionTitle, { color: '#065F46' }]}>Recent Payments Received</Text>
        {recentPaid.length === 0 ? (
          <Text style={[s.xs, { color: '#94A3B8' }]}>No payments received yet.</Text>
        ) : (
          <>
            <View style={[s.tableHeader, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
              {[
                { h: 'PO Number', w: '14%' }, { h: 'Customer',    w: '18%' },
                { h: 'Project',   w: '20%' }, { h: 'Phase',       w: '20%' },
                { h: 'Amount (SAR)', w: '16%' }, { h: 'Paid On',  w: '12%' },
              ].map(({ h, w }, i) => (
                <Text key={i} style={[s.xsHdr, { width: w, color: '#065F46' }]}>{h}</Text>
              ))}
            </View>
            {recentPaid.map((row, i) => (
              <View key={i} style={i % 2 === 0 ? s.tableRow : [s.tableRowAlt, { backgroundColor: '#F0FDF4' }]}>
                <Text style={[s.xs,  { width: '14%' }]}>{row.poNumber}</Text>
                <Text style={[s.xs,  { width: '18%' }]}>{row.customerName}</Text>
                <Text style={[s.xs,  { width: '20%' }]}>{row.projectName || '—'}</Text>
                <Text style={[s.xs,  { width: '20%' }]}>{row.phaseName}</Text>
                <Text style={[s.xsBR,{ width: '16%', color: '#15803D' }]}>{fmtNum(row.amountSar)}</Text>
                <Text style={[s.xsC, { width: '12%' }]}>{fmtDate(row.paidAt)}</Text>
              </View>
            ))}
            <View style={[s.totalRow, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
              <Text style={[s.xsHdr, { width: '72%', textAlign: 'left', color: '#065F46' }]}>TOTAL — {recentPaid.length} Payment{recentPaid.length !== 1 ? 's' : ''}</Text>
              <Text style={[s.xsHdr, { width: '16%', textAlign: 'right', color: '#15803D' }]}>{fmtNum(recentPaid.reduce((sum, r) => sum + r.amountSar, 0))}</Text>
              <Text style={[s.xs,    { width: '12%' }]}></Text>
            </View>
          </>
        )}

        {/* ── Overdue Payments ── */}
        {overduePayments.length > 0 && (
          <>
            <Text style={s.sectionTitleRed}>Overdue Payments</Text>
            <View style={s.tableHeaderRed}>
              {[
                { h: 'PO Number',    w: '13%' }, { h: 'Customer',    w: '16%' },
                { h: 'Project',      w: '18%' }, { h: 'Phase',       w: '18%' },
                { h: 'Amount (SAR)', w: '14%' }, { h: 'Due Date',    w: '11%' },
                { h: 'Overdue By',   w: '10%' },
              ].map(({ h, w }, i) => (
                <Text key={i} style={[s.cellHdrR, { width: w }]}>{h}</Text>
              ))}
            </View>
            {overduePayments.map((row, i) => (
              <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAltRed}>
                <Text style={[s.xs,  { width: '13%' }]}>{row.poNumber}</Text>
                <Text style={[s.xs,  { width: '16%' }]}>{row.customerName}</Text>
                <Text style={[s.xs,  { width: '18%' }]}>{row.projectName || '—'}</Text>
                <Text style={[s.xs,  { width: '18%' }]}>{row.phaseName}</Text>
                <Text style={[s.xsR, { width: '14%' }]}>{fmtNum(row.amountSar)}</Text>
                <Text style={[s.xsC, { width: '11%' }]}>{fmtDate(row.dueDate)}</Text>
                <Text style={[s.xsC, { width: '10%', color: '#B91C1C', fontFamily: 'Times-Bold' }]}>{row.overdueDays}d</Text>
              </View>
            ))}
            <View style={[s.totalRow, { backgroundColor: '#FECACA', borderColor: '#FCA5A5' }]}>
              <Text style={[s.xsHdr, { width: '65%', textAlign: 'left', color: '#B91C1C' }]}>TOTAL — {overduePayments.length} Overdue Payment{overduePayments.length !== 1 ? 's' : ''}</Text>
              <Text style={[s.xsHdr, { width: '14%', textAlign: 'right', color: '#B91C1C' }]}>{fmtNum(overduePayments.reduce((sum, r) => sum + r.amountSar, 0))}</Text>
              <Text style={[s.xs,    { width: '21%' }]}></Text>
            </View>
          </>
        )}

        {/* ── Upcoming Payments ── */}
        <Text style={[s.sectionTitle, { color: '#065F46' }]}>Upcoming Payments — Next 5 Due</Text>
        {upcomingPayments.length === 0 ? (
          <Text style={[s.xs, { color: '#94A3B8' }]}>No upcoming payment milestones.</Text>
        ) : (
          <>
            <View style={[s.tableHeader, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
              {[
                { h: 'PO Number',     w: '14%' }, { h: 'Customer',       w: '16%' },
                { h: 'Project',       w: '18%' }, { h: 'Phase',          w: '18%' },
                { h: 'Amount (SAR)', w: '14%' },  { h: 'Due Date',       w: '10%' },
                { h: 'Days Until Due', w: '10%' },
              ].map(({ h, w }, i) => (
                <Text key={i} style={[s.xsHdr, { width: w, color: '#065F46' }]}>{h}</Text>
              ))}
            </View>
            {upcomingPayments.map((row, i) => {
              const urgencyColor =
                row.daysUntilDue <= 7  ? '#B91C1C' :
                row.daysUntilDue <= 14 ? '#D97706' : '#15803D'
              return (
                <View key={i} style={i % 2 === 0 ? s.tableRow : [s.tableRowAlt, { backgroundColor: '#F0FDF4' }]}>
                  <Text style={[s.xs,  { width: '14%' }]}>{row.poNumber}</Text>
                  <Text style={[s.xs,  { width: '16%' }]}>{row.customerName}</Text>
                  <Text style={[s.xs,  { width: '18%' }]}>{row.projectName || '—'}</Text>
                  <Text style={[s.xs,  { width: '18%' }]}>{row.phaseName}</Text>
                  <Text style={[s.xsBR,{ width: '14%' }]}>{fmtNum(row.amountSar)}</Text>
                  <Text style={[s.xsC, { width: '10%' }]}>{fmtDate(row.dueDate)}</Text>
                  <Text style={[s.xsC, { width: '10%', color: urgencyColor, fontFamily: 'Times-Bold' }]}>{row.daysUntilDue}d</Text>
                </View>
              )
            })}
            <View style={[s.totalRow, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
              <Text style={[s.xsHdr, { width: '66%', textAlign: 'left', color: '#065F46' }]}>TOTAL — {upcomingPayments.length} Payment{upcomingPayments.length !== 1 ? 's' : ''}</Text>
              <Text style={[s.xsHdr, { width: '14%', textAlign: 'right', color: '#15803D' }]}>{fmtNum(upcomingPayments.reduce((sum, r) => sum + r.amountSar, 0))}</Text>
              <Text style={[s.xs,    { width: '20%' }]}></Text>
            </View>
          </>
        )}

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Dynamic Line International Trading</Text>
          <Text style={s.footerTxt}>Executive Dashboard — {reportDate}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
