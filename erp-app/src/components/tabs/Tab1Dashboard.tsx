'use client'

import { useEffect, useState } from 'react'
import { SessionUser } from '@/types'
import { canAccessForecast } from '@/lib/rbac'
import PerformancePanel from '@/components/shared/PerformancePanel'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Legend,
  FunnelChart, Funnel, LabelList,
} from 'recharts'
import {
  TrendingUp, FileText, ShoppingBag, AlertTriangle, FileWarning,
  Clock, Bell, CalendarClock, CheckCircle2, RefreshCw, Zap, Trophy, Users,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────── */
interface UpcomingMilestone {
  id: string; phaseName: string; amountSar: number; dueDate: string
  status: string; poNumber: string; customerName: string; daysUntilDue: number
}
interface TopCustomer { customerName: string; totalPoValue: number; completionPct: number }
interface FunnelStage { name: string; value: number; fill: string; pct: number }

type RawQuote    = { qtnDate: string; amountSar: string|number; status: string }
type RawPO       = { poDate: string; poAmountExVat: string|number; totalValueIncVat: string|number }
type RawPayment  = { poNumber: string; customerName: string; poValue: string|number; collectionPct: string|number; milestones?: { id: string; phaseName: string; amountSar: string|number; dueDate: string; status: string }[] }
type RawDocument = { status: string }
type RawCustomer = { customerName: string; totalPoValue: string|number; completionPct: string|number }

/* ── Colours ─────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  Open: '#2563eb', Converted: '#16a34a', Lost: '#dc2626', OnHold: '#d97706',
}
const PIE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed']

/* ── Helper ─────────────────────────────────────────────────────── */
const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(0)}K`
  : n.toFixed(0)

/* ── Tooltip components ───────────────────────────────────────────── */
const DarkTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl shadow-lg px-3 py-2.5 text-xs"
      style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="font-semibold mb-1 text-slate-300">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#fff' }}>
          {p.name}: SAR {Number(p.value).toLocaleString('en-SA', { maximumFractionDigits: 0 })}
        </p>
      ))}
    </div>
  )
}

const FunnelTip = ({ active, payload }: { active?: boolean; payload?: { payload: FunnelStage }[] }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl shadow-lg px-3 py-2 text-xs"
      style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="font-semibold">{d.name}</p>
      <p className="text-slate-300">SAR {d.value.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</p>
      <p style={{ color: d.fill }}>{d.pct.toFixed(1)}% of pipeline</p>
    </div>
  )
}

const PieTip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl shadow-lg px-3 py-2 text-xs" style={{ background: '#0f172a', color: '#fff' }}>
      <p className="font-semibold">{payload[0].name}: {payload[0].value}</p>
    </div>
  )
}

/* ── Reusable panel shells ─────────────────────────────────────────── */
const Panel = ({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-2xl overflow-hidden ${className}`}
    style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', ...style }}>
    {children}
  </div>
)

const PanelHead = ({ icon, title, sub, right }: { icon?: React.ReactNode; title: React.ReactNode; sub?: string; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #f1f5f9' }}>
    <div>
      <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
        {icon}{title}
      </div>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
    {right}
  </div>
)

/* ══════════════════════════════════════════════════════════════════ */
export default function Tab1Dashboard({ user }: { user: SessionUser }) {

  const [stats, setStats] = useState({
    totalQuoted: 0, totalPO: 0, totalPOExVat: 0,
    totalQuotes: 0, openQuotes: 0, convertedQuotes: 0, onHoldQuotes: 0, lostQuotes: 0,
    overduePayments: 0, expiringDocs: 0,
    totalBilled: 0, totalCollected: 0, totalOutstanding: 0,
    openQuotesValue: 0, convertedQuotesValue: 0, onHoldQuotesValue: 0,
  })
  const [funnelData,   setFunnelData]   = useState<FunnelStage[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [trendData,    setTrendData]    = useState<{ month: string; quotes: number; pos: number }[]>([])
  const [statusDist,   setStatusDist]   = useState<{ name: string; value: number }[]>([])
  const [allUnpaidMilestones, setAllUnpaidMilestones] = useState<UpcomingMilestone[]>([])
  const [forecastWinRate,   setForecastWinRate]   = useState(60)
  const [forecastTimeline,  setForecastTimeline]  = useState(12)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = async () => {
    setLoading(true)
    try {
      const [qRes, poRes, payRes, docRes, custRes] = await Promise.all([
        fetch('/api/quotations').then(r => r.json()),
        fetch('/api/po-tracker').then(r => r.json()),
        fetch('/api/payments').then(r => r.json()),
        fetch('/api/documents').then(r => r.json()),
        fetch('/api/customers').then(r => r.json()),
      ])

      const quotes    = Array.isArray(qRes)    ? qRes    as RawQuote[]    : []
      const pos       = Array.isArray(poRes)   ? poRes   as RawPO[]       : []
      const payments  = Array.isArray(payRes)  ? payRes  as RawPayment[]  : []
      const docs      = Array.isArray(docRes)  ? docRes  as RawDocument[] : []
      const customers = Array.isArray(custRes) ? custRes as RawCustomer[] : []

      /* ── Core financials ── */
      const totalQuoted          = quotes.reduce((s, q) => s + Number(q.amountSar), 0)
      const openQuotesValue      = quotes.filter(q => q.status === 'Open').reduce((s, q) => s + Number(q.amountSar), 0)
      const onHoldQuotesValue    = quotes.filter(q => q.status === 'OnHold').reduce((s, q) => s + Number(q.amountSar), 0)
      const convertedQuotesValue = quotes.filter(q => q.status === 'Converted').reduce((s, q) => s + Number(q.amountSar), 0)
      const totalPOExVat         = pos.reduce((s, p) => s + Number(p.poAmountExVat), 0)
      const totalPO              = pos.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
      const totalBilled          = payments.reduce((s, p) => s + Number(p.poValue), 0)
      const totalCollected       = payments.reduce((s, p) => s + Number(p.poValue) * (Number(p.collectionPct) / 100), 0)
      const totalOutstanding     = totalBilled - totalCollected
      const overduePayments      = payments.flatMap(p => p.milestones ?? []).filter(m => m.status === 'Overdue').length
      const expiringDocs         = docs.filter(d => d.status === 'ExpiringSoon' || d.status === 'Expired').length

      setStats({
        totalQuoted, totalPO, totalPOExVat,
        totalQuotes:     quotes.length,
        openQuotes:      quotes.filter(q => q.status === 'Open').length,
        convertedQuotes: quotes.filter(q => q.status === 'Converted').length,
        onHoldQuotes:    quotes.filter(q => q.status === 'OnHold').length,
        lostQuotes:      quotes.filter(q => q.status === 'Lost').length,
        overduePayments, expiringDocs,
        totalBilled, totalCollected, totalOutstanding,
        openQuotesValue, convertedQuotesValue, onHoldQuotesValue,
      })

      /* ── Funnel ── */
      const activeValue = openQuotesValue + onHoldQuotesValue + convertedQuotesValue
      const stages: FunnelStage[] = [
        { name: 'Total Quoted',   value: totalQuoted,          fill: '#2563eb', pct: 100 },
        { name: 'Active Pipeline',value: activeValue,           fill: '#0891b2', pct: totalQuoted > 0 ? (activeValue / totalQuoted) * 100 : 0 },
        { name: 'Converted',      value: convertedQuotesValue,  fill: '#16a34a', pct: totalQuoted > 0 ? (convertedQuotesValue / totalQuoted) * 100 : 0 },
        { name: 'PO Raised',      value: totalPOExVat,          fill: '#059669', pct: totalQuoted > 0 ? (totalPOExVat / totalQuoted) * 100 : 0 },
        { name: 'Collected',      value: totalCollected,        fill: '#7c3aed', pct: totalQuoted > 0 ? (totalCollected / totalQuoted) * 100 : 0 },
      ]
      setFunnelData(stages)

      /* ── Top customers ── */
      setTopCustomers(
        [...customers]
          .sort((a, b) => Number(b.totalPoValue) - Number(a.totalPoValue))
          .slice(0, 3)
          .map(c => ({ customerName: c.customerName, totalPoValue: Number(c.totalPoValue), completionPct: Number(c.completionPct) }))
      )

      /* ── Monthly trend (real dates) ── */
      const monthMap: Record<string, { label: string; quotes: number; pos: number }> = {}
      quotes.forEach(q => {
        if (!q.qtnDate) return
        const d = new Date(q.qtnDate)
        const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        if (!monthMap[key]) monthMap[key] = { label, quotes: 0, pos: 0 }
        monthMap[key].quotes += Number(q.amountSar)
      })
      pos.forEach(p => {
        if (!p.poDate) return
        const d = new Date(p.poDate)
        const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        if (!monthMap[key]) monthMap[key] = { label, quotes: 0, pos: 0 }
        monthMap[key].pos += Number(p.totalValueIncVat)
      })
      setTrendData(
        Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => ({ month: v.label, quotes: v.quotes, pos: v.pos }))
      )

      /* ── Quote status distribution ── */
      const statusCounts: Record<string, number> = {}
      quotes.forEach(q => { statusCounts[q.status] = (statusCounts[q.status] || 0) + 1 })
      setStatusDist(Object.entries(statusCounts).map(([name, value]) => ({ name, value })))

      /* ── Milestones ── */
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const all: UpcomingMilestone[] = payments.flatMap(p =>
        (p.milestones ?? [])
          .filter(m => m.status !== 'Paid')
          .map(m => {
            const due = new Date(m.dueDate); due.setHours(0, 0, 0, 0)
            return {
              id: m.id, phaseName: m.phaseName, amountSar: Number(m.amountSar),
              dueDate: m.dueDate, status: m.status, poNumber: p.poNumber,
              customerName: p.customerName,
              daysUntilDue: Math.round((due.getTime() - today.getTime()) / 86_400_000),
            }
          })
      )
      all.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      setAllUnpaidMilestones(all)

    } finally { setLoading(false) }
  }

  /* ── Derived (render-time, never stale) ── */
  const overdueMilestones  = allUnpaidMilestones.filter(m => m.daysUntilDue < 0).slice(0, 5)
  const upcomingMilestones = allUnpaidMilestones.filter(m => m.daysUntilDue >= 0).slice(0, 5)
  const conversionRate     = stats.totalQuoted > 0 ? ((stats.convertedQuotesValue / stats.totalQuoted) * 100).toFixed(1) : '0.0'
  const collectionRate     = stats.totalBilled  > 0 ? ((stats.totalCollected / stats.totalBilled) * 100).toFixed(1) : '0.0'

  const forecastData = ['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => ({
    quarter: q,
    baseline:   Math.round(stats.totalPO * 0.2 * (1 + i * 0.1)),
    optimistic: Math.round(stats.totalPO * 0.2 * (1 + i * 0.1) * (1 + forecastWinRate / 200)),
  }))

  /* ── Loading skeleton ── */
  if (loading) return (
    <div className="p-5 space-y-4">
      <div className="h-36 rounded-2xl shimmer" />
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 h-80 rounded-2xl shimmer" />
        <div className="lg:col-span-2 space-y-4">
          <div className="h-48 rounded-2xl shimmer" />
          <div className="h-28 rounded-2xl shimmer" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => <div key={i} className="h-56 rounded-2xl shimmer" />)}
      </div>
      <div className="h-64 rounded-2xl shimmer" />
    </div>
  )

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 lg:p-5 space-y-4 max-w-7xl mx-auto">

      {/* ━━━ HERO DARK STRIP ━━━ */}
      <div className="rounded-2xl p-5" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0c1629 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(37,99,235,0.22)', border: '1px solid rgba(37,99,235,0.45)' }}>
              <Zap size={15} className="text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-sm tracking-tight">Executive Dashboard</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                {user.name} · {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <button onClick={loadStats}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* Hero KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
          {[
            { label: 'Total Pipeline',   value: `SAR ${fmt(stats.totalQuoted)}`,      sub: `${stats.totalQuotes} quotations`,                  subColor: '#60a5fa' },
            { label: 'PO Value (inc-VAT)', value: `SAR ${fmt(stats.totalPO)}`,        sub: `${conversionRate}% win rate`,                      subColor: '#34d399' },
            { label: 'Collected',        value: `SAR ${fmt(stats.totalCollected)}`,   sub: `${collectionRate}% of billed`,                     subColor: '#a78bfa' },
            { label: 'AR Outstanding',   value: `SAR ${fmt(stats.totalOutstanding)}`, sub: stats.totalOutstanding > 0 ? 'Pending collection' : 'Fully collected', subColor: stats.totalOutstanding > 0 ? '#f87171' : '#34d399' },
            { label: 'Active Alerts',    value: String(stats.overduePayments + stats.expiringDocs), sub: `${stats.overduePayments} overdue · ${stats.expiringDocs} doc alerts`, subColor: '#fbbf24' },
          ].map(({ label, value, sub, subColor }) => (
            <div key={label} className="flex flex-col">
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.38)' }}>{label}</p>
              <p className="text-xl font-bold tracking-tight" style={{ color: '#fff' }}>{value}</p>
              <p className="text-xs font-medium mt-0.5" style={{ color: subColor }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ KPI CHIP ROW ━━━ */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { label: 'Open Quotes',        value: stats.openQuotes,      icon: <FileText size={15} />,     color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'On Hold',            value: stats.onHoldQuotes,    icon: <Clock size={15} />,        color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
          { label: 'Converted',          value: stats.convertedQuotes, icon: <ShoppingBag size={15} />,  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Lost',               value: stats.lostQuotes,      icon: <TrendingUp size={15} />,   color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          { label: 'Overdue Milestones', value: stats.overduePayments, icon: <AlertTriangle size={15}/>, color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
          { label: 'Doc Alerts',         value: stats.expiringDocs,    icon: <FileWarning size={15} />,  color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
        ].map(({ label, value, icon, color, bg, border }) => (
          <div key={label}
            className="rounded-xl px-3 py-2.5 flex items-center gap-2 transition-all hover:-translate-y-0.5 cursor-default"
            style={{ background: bg, border: `1px solid ${border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <span style={{ color }} className="shrink-0">{icon}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold truncate leading-tight" style={{ color }}>{label}</p>
              <p className="text-lg font-bold leading-tight" style={{ color }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ━━━ FUNNEL  +  DONUT & TOP CUSTOMERS ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Sales Pipeline Funnel */}
        <Panel className="lg:col-span-3">
          <PanelHead
            icon={<Zap size={14} className="text-blue-500" />}
            title="Sales Pipeline Funnel"
            sub="Revenue flowing through each stage (SAR)"
            right={
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>Live</span>
            }
          />
          <div className="px-5 pt-4 pb-2">
            {funnelData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <FunnelChart>
                    <Tooltip content={<FunnelTip />} />
                    <Funnel dataKey="value" data={funnelData} isAnimationActive>
                      <LabelList
                        position="right"
                        fill="#475569"
                        stroke="none"
                        dataKey="name"
                        style={{ fontSize: '11px', fontWeight: 600 }}
                      />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>

                {/* Progress breakdown below funnel */}
                <div className="mt-4 space-y-2.5 pb-4">
                  {funnelData.map((stage) => (
                    <div key={stage.name} className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: stage.fill }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-slate-600 font-medium">{stage.name}</span>
                          <span className="text-xs font-bold text-slate-800 shrink-0 ml-2">
                            SAR {stage.value.toLocaleString('en-SA', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-bar-fill" style={{ width: `${stage.pct}%`, background: stage.fill }} />
                        </div>
                      </div>
                      <span className="text-xs font-bold w-10 text-right shrink-0" style={{ color: stage.fill }}>
                        {stage.pct.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No pipeline data</div>
            )}
          </div>
        </Panel>

        {/* Right column */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Quote Status Donut */}
          <Panel>
            <PanelHead title="Quote Status" sub="Distribution by count" />
            <div className="px-4 py-3">
              {statusDist.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={statusDist} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={32} outerRadius={55} paddingAngle={3}>
                        {statusDist.map((entry, i) => (
                          <Cell key={i} fill={STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-1">
                    {statusDist.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
                        {entry.name} ({entry.value})
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No data</div>
              )}
            </div>
          </Panel>

          {/* Top Customers leaderboard */}
          <Panel className="flex-1">
            <PanelHead
              icon={<Trophy size={14} className="text-amber-500" />}
              title="Top Customers"
              sub="Ranked by PO value"
            />
            <div className="px-4 py-3 space-y-3">
              {topCustomers.length === 0 ? (
                <div className="flex items-center justify-center gap-2 h-16 text-slate-400 text-sm">
                  <Users size={18} className="opacity-40" /> No data
                </div>
              ) : topCustomers.map((c, i) => {
                const medals  = ['🥇', '🥈', '🥉']
                const colors  = ['#f59e0b', '#94a3b8', '#cd7c2f']
                const maxVal  = topCustomers[0].totalPoValue
                return (
                  <div key={c.customerName} className="flex items-center gap-2.5">
                    <span className="text-base shrink-0 select-none">{medals[i]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700 truncate">{c.customerName}</span>
                        <span className="text-xs font-bold text-slate-800 shrink-0 ml-2">
                          SAR {fmt(c.totalPoValue)}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-bar-fill"
                          style={{ width: `${(c.totalPoValue / maxVal) * 100}%`, background: colors[i] }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>
      </div>

      {/* ━━━ MILESTONE PANELS ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Overdue Alerts */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #fecaca', boxShadow: '0 1px 8px rgba(220,38,38,0.08)' }}>
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid #fef2f2', background: '#fff5f5' }}>
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-red-500" />
              <span className="font-semibold text-red-700 text-sm">Overdue Payments</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{
                background: overdueMilestones.length > 0 ? '#fecaca' : '#f0fdf4',
                color:      overdueMilestones.length > 0 ? '#b91c1c' : '#15803d',
              }}>
              {overdueMilestones.length > 0 ? `${overdueMilestones.length} alert${overdueMilestones.length > 1 ? 's' : ''}` : 'All clear'}
            </span>
          </div>
          {overdueMilestones.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <CheckCircle2 size={20} className="text-green-400" />
              <span className="text-sm font-medium">No overdue milestones</span>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#fef2f2' }}>
              {overdueMilestones.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3" style={{ background: '#fef9f9' }}>
                  <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: '#dc2626', minHeight: 36 }} />
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#fee2e2' }}>
                    <AlertTriangle size={13} style={{ color: '#dc2626' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800">{m.phaseName}</span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                        style={{ background: '#fecaca', color: '#b91c1c' }}>OVERDUE</span>
                    </div>
                    <p className="text-xs mt-0.5 truncate">
                      <span className="font-mono" style={{ color: '#7c3aed' }}>{m.poNumber}</span>
                      <span className="text-slate-400"> · {m.customerName}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Due {new Date(m.dueDate).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-slate-800">SAR {m.amountSar.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: '#dc2626' }}>{Math.abs(m.daysUntilDue)}d overdue</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <div className="flex items-center gap-2">
              <CalendarClock size={14} className="text-blue-500" />
              <span className="font-semibold text-slate-700 text-sm">Next 5 Lined Up</span>
            </div>
            <span className="text-xs text-slate-400">Upcoming payments</span>
          </div>
          {upcomingMilestones.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <CheckCircle2 size={20} className="text-blue-300" />
              <span className="text-sm font-medium">No upcoming milestones</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {upcomingMilestones.map((m, idx) => {
                const isToday  = m.daysUntilDue === 0
                const isSoon   = m.daysUntilDue <= 7 && !isToday
                const accent   = isToday ? '#dc2626' : isSoon ? '#d97706' : '#2563eb'
                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: `${accent}18`, color: accent }}>{idx + 1}</div>
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: accent, minHeight: 36 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800">{m.phaseName}</span>
                        {isToday && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#fecaca', color: '#b91c1c' }}>TODAY</span>}
                        {isSoon  && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#fde68a', color: '#92400e' }}>SOON</span>}
                      </div>
                      <p className="text-xs mt-0.5 truncate">
                        <span className="font-mono" style={{ color: '#7c3aed' }}>{m.poNumber}</span>
                        <span className="text-slate-400"> · {m.customerName}</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Due {new Date(m.dueDate).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-slate-800">SAR {m.amountSar.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs font-semibold mt-0.5" style={{ color: accent }}>
                        {isToday ? 'Due today' : `in ${m.daysUntilDue}d`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ━━━ MONTHLY REVENUE TREND ━━━ */}
      <Panel>
        <PanelHead
          icon={<TrendingUp size={14} className="text-blue-500" />}
          title="Monthly Revenue Trend"
          sub="Quotations vs PO value · SAR · real data"
          right={
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#3b82f6' }} />Quotes
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#16a34a' }} />POs
              </span>
            </div>
          }
        />
        <div className="p-5">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={trendData} barSize={22}>
                <defs>
                  <linearGradient id="blueBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="quotes" name="Quoted" fill="url(#blueBar)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="pos" name="PO Value" stroke="#16a34a" strokeWidth={2.5}
                  strokeDasharray="6 3" dot={{ fill: '#16a34a', strokeWidth: 0, r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No trend data yet</div>
          )}
        </div>
      </Panel>

      {/* ━━━ FORECAST MODELER (CEO only) ━━━ */}
      {canAccessForecast(user.role) && (
        <Panel>
          <PanelHead
            title={
              <span className="flex items-center gap-2">
                ✦ Forecast Modeler
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>CEO</span>
              </span>
            }
            sub="Adjust parameters to model revenue scenarios"
          />
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              {[
                { label: 'Win Rate', value: forecastWinRate, unit: '%', min: 10, max: 100, onChange: setForecastWinRate },
                { label: 'Collection Timeline', value: forecastTimeline, unit: ' wks', min: 4, max: 52, onChange: setForecastTimeline },
              ].map(({ label, value, unit, min, max, onChange }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-600">{label}</label>
                    <span className="text-sm font-bold text-blue-600">{value}{unit}</span>
                  </div>
                  <input type="range" min={min} max={max} value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="w-full accent-blue-600 h-1.5" />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>{min}{unit}</span><span>{max}{unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => `SAR ${Number(v).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="baseline"   stroke="#94a3b8" strokeWidth={2}   name="Baseline"   dot={false} />
                <Line type="monotone" dataKey="optimistic" stroke="#2563eb" strokeWidth={2.5} name="Optimistic"
                  strokeDasharray="6 3" dot={{ fill: '#2563eb', strokeWidth: 0, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {/* ━━━ PERFORMANCE ANALYTICS ━━━ */}
      <PerformancePanel user={user} />

    </div>
  )
}
