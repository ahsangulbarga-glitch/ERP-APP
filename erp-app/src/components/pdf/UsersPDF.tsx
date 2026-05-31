import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const DLIT_BLUE  = '#1A5096'
const DARK_BG    = '#0F172A'
const HDR_GREY   = '#D9D9D9'
const LIGHT_GREY = '#F2F2F2'
const BORDER     = '#CBD5E1'

const ROLE_LABELS: Record<string, string> = {
  P1_CEO:                  'CEO',
  P2_ADMIN:                'Admin',
  P4_REGIONAL_MANAGER:     'Regional Manager',
  P5_SALES_MANAGER:        'Sales Manager',
  P6_KEY_ACCOUNT_ENGINEER: 'Key Account Engineer',
  P7_INSIDE_SALES_ENGINEER:'Inside Sales Engineer',
  P8_ACCOUNTANT:           'Accountant',
  P9_HR:                   'HR',
}

const ROLE_COLOR: Record<string, string> = {
  P1_CEO:                  '#7C3AED',
  P2_ADMIN:                '#DC2626',
  P4_REGIONAL_MANAGER:     '#0891B2',
  P5_SALES_MANAGER:        '#2563EB',
  P6_KEY_ACCOUNT_ENGINEER: '#059669',
  P7_INSIDE_SALES_ENGINEER:'#16A34A',
  P8_ACCOUNTANT:           '#D97706',
  P9_HR:                   '#9D174D',
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Times-Roman', fontSize: 10, color: '#1e293b', paddingLeft: 36, paddingRight: 36, paddingTop: 24, paddingBottom: 48 },
  headerBar:   { backgroundColor: DARK_BG, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 14 },
  headerTitle: { fontSize: 18, fontFamily: 'Times-Bold', color: '#FFFFFF' },
  headerSub:   { fontSize: 9,  color: '#94A3B8', marginTop: 2 },
  headerDate:  { fontSize: 8,  color: '#94A3B8' },

  // Summary cards
  kpiRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard:  { flex: 1, backgroundColor: LIGHT_GREY, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 8,  color: '#64748B' },
  kpiValue: { fontSize: 16, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginTop: 2 },

  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: HDR_GREY, borderWidth: 0.5, borderColor: '#AAAAAA' },
  tableRow:    { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD' },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#DDDDDD', backgroundColor: '#F8FAFC' },
  cellHdr:     { fontSize: 9.5, fontFamily: 'Times-Bold', padding: 4, textAlign: 'center' },
  cell:        { fontSize: 9,   padding: 4 },
  cellC:       { fontSize: 9,   padding: 4, textAlign: 'center' },
  totalRow:    { flexDirection: 'row', backgroundColor: '#E2E8F0', borderTopWidth: 1, borderColor: '#94A3B8' },

  // Footer
  footer:    { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#E2E8F0', paddingTop: 4 },
  footerTxt: { fontSize: 8, color: '#94A3B8' },
})

export interface UserExportRow {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

interface Props {
  users: UserExportRow[]
  reportDate: string
}

export default function UsersPDF({ users, reportDate }: Props) {
  const active   = users.filter(u => u.isActive).length
  const inactive = users.filter(u => !u.isActive).length

  // Count by role
  const roleCounts: Record<string, number> = {}
  for (const u of users) {
    roleCounts[u.role] = (roleCounts[u.role] || 0) + 1
  }

  const kpis = [
    { label: 'Total Users',    value: String(users.length)  },
    { label: 'Active',         value: String(active)        },
    { label: 'Inactive',       value: String(inactive)      },
    { label: 'Roles in Use',   value: String(Object.keys(roleCounts).length) },
  ]

  return (
    <Document title={`User Management Report â€” ${reportDate}`} author="DLIT ERP">
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* â”€â”€ Header â”€â”€ */}
        <View style={s.headerBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={s.headerTitle}>USER MANAGEMENT REPORT</Text>
              <Text style={s.headerSub}>Dynamic Line International Trading</Text>
            </View>
            <Text style={s.headerDate}>{reportDate}</Text>
          </View>
        </View>

        {/* â”€â”€ Summary KPIs â”€â”€ */}
        <View style={s.kpiRow}>
          {kpis.map((k, i) => (
            <View key={i} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiValue}>{k.value}</Text>
            </View>
          ))}
        </View>

        {/* â”€â”€ Users Table â”€â”€ */}
        <View style={s.tableHeader}>
          {[
            { h: '#',        w: '4%'  },
            { h: 'Name',     w: '22%' },
            { h: 'Email',    w: '26%' },
            { h: 'Role',     w: '22%' },
            { h: 'Status',   w: '10%' },
            { h: 'Created',  w: '10%' },
          ].map(({ h, w }, i) => (
            <Text key={i} style={[s.cellHdr, { width: w }]}>{h}</Text>
          ))}
        </View>

        {users.map((u, i) => {
          const roleColor = ROLE_COLOR[u.role] || DLIT_BLUE
          const roleLabel = ROLE_LABELS[u.role] || u.role
          return (
            <View key={u.id} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.cellC, { width: '4%', color: '#94A3B8' }]}>{i + 1}</Text>
              <Text style={[s.cell,  { width: '22%', fontFamily: 'Times-Bold' }]}>{u.name}</Text>
              <Text style={[s.cell,  { width: '26%', color: '#475569' }]}>{u.email}</Text>
              <Text style={[s.cell,  { width: '22%', fontFamily: 'Times-Bold', color: roleColor }]}>{roleLabel}</Text>
              <Text style={[s.cellC, { width: '10%', fontFamily: 'Times-Bold', color: u.isActive ? '#15803D' : '#B91C1C' }]}>
                {u.isActive ? 'Active' : 'Inactive'}
              </Text>
              <Text style={[s.cellC, { width: '10%', color: '#64748B' }]}>{fmtDate(u.createdAt)}</Text>
            </View>
          )
        })}

        {/* â”€â”€ Totals Row â”€â”€ */}
        <View style={s.totalRow}>
          <Text style={[s.cellHdr, { width: '4%' }]}></Text>
          <Text style={[s.cellHdr, { width: '22%', textAlign: 'left' }]}>TOTAL â€” {users.length} User{users.length !== 1 ? 's' : ''}</Text>
          <Text style={[s.cellHdr, { width: '26%' }]}></Text>
          <Text style={[s.cellHdr, { width: '22%' }]}></Text>
          <Text style={[s.cellHdr, { width: '10%', color: '#15803D' }]}>{active} Active</Text>
          <Text style={[s.cellHdr, { width: '10%' }]}></Text>
        </View>

        {/* â”€â”€ Role Breakdown â”€â”€ */}
        <Text style={{ fontSize: 11, fontFamily: 'Times-Bold', color: DLIT_BLUE, marginTop: 16, marginBottom: 6 }}>
          Role Breakdown
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(roleCounts).map(([role, count]) => (
            <View key={role} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: LIGHT_GREY, borderWidth: 1, borderColor: BORDER, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ROLE_COLOR[role] || DLIT_BLUE }} />
              <Text style={{ fontSize: 8.5, fontFamily: 'Times-Bold', color: ROLE_COLOR[role] || DLIT_BLUE }}>
                {ROLE_LABELS[role] || role}
              </Text>
              <Text style={{ fontSize: 8.5, color: '#64748B' }}>({count})</Text>
            </View>
          ))}
        </View>

        {/* â”€â”€ Footer â”€â”€ */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Dynamic Line International Trading</Text>
          <Text style={s.footerTxt}>User Management Report â€” {reportDate}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
