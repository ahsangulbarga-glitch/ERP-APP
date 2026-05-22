'use client'

import { useEffect, useState } from 'react'
import { SessionUser } from '@/types'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, ReferenceLine,
  FunnelChart, Funnel, LabelList, Cell,
} from 'recharts'
import {
  TrendingUp, FileText, ShoppingBag, AlertTriangle, FileWarning,
  Clock, Bell, CalendarClock, CheckCircle2, RefreshCw, Zap, Trophy, Users,
  Target, BarChart2,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────── */
interface UpcomingMilestone {
  id: string; phaseName: string; amountSar: number; dueDate: string
  status: string; poNumber: string; customerName: string; daysUntilDue: number
}
interface TopCustomer  { customerName: string; totalPoValue: number; completionPct: number }
interface FunnelStage  { name: string; value: number; fill: string; pct: number }
interface RFQStage     { name: string; count: number; fill: string; dropPct: number }
interface WinLossItem  { customer: string; won: number; lost: number; winRate: number }

type RawQuote    = { qtnDate: string; amountSar: string|number; status: string }
type RawPO       = { poDate: string; poAmountExVat: string|number; totalValueIncVat: string|number }
type RawPayment  = { poNumber: string; customerName: string; poValue: string|number; collectionPct: string|number; milestones?: { id: string; phaseName: string; amountSar: string|number; dueDate: string; status: string }[] }
type RawDocument = { status: string }
type RawCustomer = { customerName: string; totalPoValue: string|number; completionPct: string|number; totalRfq?: number; totalConverted?: number }


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
  const [trendData,    setTrendData]    = useState<{ key: string; month: string; quotes: number; pos: number; collected: number }[]>([])
  const [perfPeriod,   setPerfPeriod]   = useState<'3m'|'6m'|'1y'|'2y'>('1y')
  const [rfqFunnel,    setRfqFunnel]    = useState<RFQStage[]>([])
  const [winLoss,      setWinLoss]      = useState<WinLossItem[]>([])
  const [monthlyQuota, setMonthlyQuota] = useState(0)
  const [allUnpaidMilestones, setAllUnpaidMilestones] = useState<UpcomingMilestone[]>([])
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
      const monthMap: Record<string, { label: string; quotes: number; pos: number; collected: number }> = {}
      quotes.forEach(q => {
        if (!q.qtnDate) return
        const d = new Date(q.qtnDate)
        const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        if (!monthMap[key]) monthMap[key] = { label, quotes: 0, pos: 0, collected: 0 }
        monthMap[key].quotes += Number(q.amountSar)
      })
      pos.forEach(p => {
        if (!p.poDate) return
        const d = new Date(p.poDate)
        const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        if (!monthMap[key]) monthMap[key] = { label, quotes: 0, pos: 0, collected: 0 }
        monthMap[key].pos += Number(p.totalValueIncVat)
      })
      payments.forEach(p => {
        if (!(p as RawPayment & { poDate?: string }).poDate) return
        const d = new Date((p as RawPayment & { poDate?: string }).poDate!)
        const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        if (!monthMap[key]) monthMap[key] = { label, quotes: 0, pos: 0, collected: 0 }
        monthMap[key].collected += Number(p.poValue) * (Number(p.collectionPct) / 100)
      })
      setTrendData(
        Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, v]) => ({ key, month: v.label, quotes: v.quotes, pos: v.pos, collected: v.collected }))
      )

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

      /* ── RFQ-to-Quote Conversion Funnel ── */
      const totalRfqCount  = customers.reduce((s, c) => s + (c.totalRfq ?? 0), 0)
      const totalQtCount   = quotes.length
      const activeQtCount  = quotes.filter(q => q.status === 'Open' || q.status === 'OnHold').length
      const convertedCount = quotes.filter(q => q.status === 'Converted').length
      const poCount        = pos.length
      const rfqStages: RFQStage[] = [
        { name: 'RFQ Received',      count: totalRfqCount,  fill: '#2563eb', dropPct: 100 },
        { name: 'Quote Submitted',   count: totalQtCount,   fill: '#0891b2', dropPct: totalRfqCount  > 0 ? (totalQtCount   / totalRfqCount)  * 100 : 0 },
        { name: 'Under Evaluation',  count: activeQtCount,  fill: '#d97706', dropPct: totalQtCount   > 0 ? (activeQtCount  / totalQtCount)   * 100 : 0 },
        { name: 'Quote Converted',   count: convertedCount, fill: '#16a34a', dropPct: totalQtCount   > 0 ? (convertedCount / totalQtCount)   * 100 : 0 },
        { name: 'PO Awarded',        count: poCount,        fill: '#7c3aed', dropPct: convertedCount > 0 ? (poCount        / convertedCount)  * 100 : 0 },
      ]
      setRfqFunnel(rfqStages)

      /* ── Win/Loss by Customer ── */
      const winLossItems: WinLossItem[] = customers
        .filter(c => (c.totalRfq ?? 0) > 0)
        .map(c => {
          const won  = c.totalConverted ?? 0
          const lost = Math.max(0, (c.totalRfq ?? 0) - won)
          return { customer: c.customerName, won, lost, winRate: (c.totalRfq ?? 0) > 0 ? (won / (c.totalRfq ?? 1)) * 100 : 0 }
        })
        .sort((a, b) => b.winRate - a.winRate)
      setWinLoss(winLossItems)

      /* ── Monthly Quota (avg of last 3 months PO value) ── */
      const sortedMonths = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b))
      const last3 = sortedMonths.slice(-3).map(([, v]) => v.pos)
      const avgQuota = last3.length > 0 ? last3.reduce((s, v) => s + v, 0) / last3.length : 0
      setMonthlyQuota(Math.round(avgQuota * 1.1)) // 10% growth target

    } finally { setLoading(false) }
  }

  /* ── Derived (render-time, never stale) ── */
  const overdueMilestones  = allUnpaidMilestones.filter(m => m.daysUntilDue < 0).slice(0, 5)
  const upcomingMilestones = allUnpaidMilestones.filter(m => m.daysUntilDue >= 0).slice(0, 5)
  /* ── Business performance filtered data ── */
  const periodMonths: Record<string, number> = { '3m': 3, '6m': 6, '1y': 12, '2y': 24 }
  const perfData = (() => {
    const months = periodMonths[perfPeriod]
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`
    return trendData.filter(d => d.key >= cutKey)
  })()

  /* ── Sales Forecast vs Quota ── */
  const salesForecastData = (() => {
    const actual = trendData.slice(-12).map(d => ({ month: d.month, actual: d.pos, quota: monthlyQuota, forecast: null as number | null }))
    // Simple linear trend from last 6 actual data points
    const base = actual.slice(-6).map(d => d.actual)
    const avgGrowth = base.length > 1 ? (base[base.length - 1] - base[0]) / (base.length - 1) : 0
    const lastVal   = base[base.length - 1] ?? 0
    const now = new Date()
    const projected = [1, 2, 3].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      return { month: label, actual: null as number | null, quota: monthlyQuota, forecast: Math.max(0, Math.round(lastVal + avgGrowth * i)) }
    })
    return [...actual, ...projected]
  })()

  const conversionRate     = stats.totalQuoted > 0 ? ((stats.convertedQuotesValue / stats.totalQuoted) * 100).toFixed(1) : '0.0'
  const collectionRate     = stats.totalBilled  > 0 ? ((stats.totalCollected / stats.totalBilled) * 100).toFixed(1) : '0.0'

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
            {
              label: 'Total Pipeline',
              value: `SAR ${fmt(stats.totalQuoted)}`,
              sub: `${stats.totalQuotes} quotations`,
              subColor: '#60a5fa',
              tooltip: `${stats.totalQuotes} quotes raised in total — Open: ${stats.openQuotes} · On Hold: ${stats.onHoldQuotes} · Converted: ${stats.convertedQuotes} · Lost: ${stats.lostQuotes}`,
            },
            {
              label: 'PO Value (inc-VAT)',
              value: `SAR ${fmt(stats.totalPO)}`,
              sub: `${conversionRate}% win rate`,
              subColor: '#34d399',
              tooltip: `Win rate = Converted ÷ Total quotes (${stats.convertedQuotes} of ${stats.totalQuotes}). Measures how many quotes turned into purchase orders.`,
            },
            {
              label: 'Collected',
              value: `SAR ${fmt(stats.totalCollected)}`,
              sub: `${collectionRate}% of billed`,
              subColor: '#a78bfa',
              tooltip: `SAR ${fmt(stats.totalCollected)} collected out of SAR ${fmt(stats.totalBilled)} total billed. Collection rate tracks payment receipt efficiency.`,
            },
            {
              label: 'AR Outstanding',
              value: `SAR ${fmt(stats.totalOutstanding)}`,
              sub: stats.totalOutstanding > 0 ? 'Pending collection' : 'Fully collected',
              subColor: stats.totalOutstanding > 0 ? '#f87171' : '#34d399',
              tooltip: stats.totalOutstanding > 0
                ? `SAR ${fmt(stats.totalOutstanding)} remains unpaid — this is the difference between total billed (SAR ${fmt(stats.totalBilled)}) and collected (SAR ${fmt(stats.totalCollected)}).`
                : 'All invoiced amounts have been fully collected. No outstanding AR balance.',
            },
            {
              label: 'Active Alerts',
              value: String(stats.overduePayments + stats.expiringDocs),
              sub: `${stats.overduePayments} overdue · ${stats.expiringDocs} doc alerts`,
              subColor: '#fbbf24',
              tooltip: `${stats.overduePayments} payment milestone${stats.overduePayments !== 1 ? 's' : ''} past due date · ${stats.expiringDocs} document${stats.expiringDocs !== 1 ? 's' : ''} expiring soon or already expired. Requires immediate attention.`,
            },
          ].map(({ label, value, sub, subColor, tooltip }) => (
            <div key={label} className="flex flex-col">
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.38)' }}>{label}</p>
              <p className="text-xl font-bold tracking-tight" style={{ color: '#fff' }}>{value}</p>
              <div className="relative group inline-block mt-0.5 w-fit">
                <p className="text-xs font-medium cursor-default underline decoration-dotted underline-offset-2 decoration-1"
                  style={{ color: subColor, textDecorationColor: `${subColor}99` }}>{sub}</p>
                <div className="pointer-events-none absolute bottom-full left-0 mb-2 z-50
                  w-64 rounded-lg px-3 py-2 text-xs leading-relaxed shadow-xl
                  opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  style={{ background: 'rgba(15,23,42,0.97)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {tooltip}
                  <div className="absolute top-full left-4 -translate-y-0.5"
                    style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(15,23,42,0.97)' }} />
                </div>
              </div>
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

          {/* Business Performance Chart */}
          <Panel>
            <PanelHead
              icon={<TrendingUp size={14} className="text-violet-500" />}
              title="Business Performance"
              sub="Quotes · PO · Collections (SAR)"
              right={
                <div className="flex items-center gap-1">
                  {(['3m','6m','1y','2y'] as const).map(p => (
                    <button key={p} onClick={() => setPerfPeriod(p)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                      style={perfPeriod === p
                        ? { background: '#7c3aed', color: '#fff' }
                        : { background: '#f1f5f9', color: '#64748b' }}>
                      {p === '1y' ? '1Y' : p === '2y' ? '2Y' : p.toUpperCase()}
                    </button>
                  ))}
                </div>
              }
            />
            <div className="px-3 py-3">
              {perfData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={155}>
                    <ComposedChart data={perfData} barSize={9} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="perfQuote" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#2563eb" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="perfPO" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#16a34a" /><stop offset="100%" stopColor="#16a34a" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                        tickFormatter={v => `${(v/1000).toFixed(0)}K`} width={32} />
                      <Tooltip content={<DarkTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="quotes"    name="Quoted"     fill="url(#perfQuote)" radius={[3,3,0,0]} />
                      <Bar dataKey="pos"       name="PO Value"   fill="url(#perfPO)"    radius={[3,3,0,0]} />
                      <Line type="monotone" dataKey="collected" name="Collected"
                        stroke="#7c3aed" strokeWidth={2} dot={{ fill: '#7c3aed', r: 2, strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-4 mt-1">
                    {[['#2563eb','Quoted'],['#16a34a','PO Value'],['#7c3aed','Collected']].map(([color, label]) => (
                      <div key={label} className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No data for period</div>
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

      {/* ━━━ ADVANCED ANALYTICS ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Chart 1: RFQ-to-Quote Conversion Funnel ── */}
        <Panel>
          <PanelHead
            icon={<Zap size={14} className="text-blue-500" />}
            title="RFQ-to-Quote Conversion Funnel"
            sub="Drop-off rate at each stage of the quotation process"
          />
          <div className="px-5 py-4 space-y-3">
            {rfqFunnel.map((stage, i) => {
              const maxCount = rfqFunnel[0]?.count || 1
              const width = (stage.count / maxCount) * 100
              return (
                <div key={stage.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.fill }} />
                      <span className="text-xs font-medium text-slate-600">{stage.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {i > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${stage.fill}18`, color: stage.fill }}>
                          {stage.dropPct.toFixed(0)}% carry
                        </span>
                      )}
                      <span className="text-sm font-bold text-slate-800 w-6 text-right">{stage.count}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-6 rounded-lg overflow-hidden" style={{ background: '#f1f5f9' }}>
                      <div className="h-full rounded-lg flex items-center pl-2 transition-all duration-500"
                        style={{ width: `${Math.max(width, 4)}%`, background: stage.fill, opacity: 0.85 }}>
                        {width > 25 && (
                          <span className="text-[10px] font-bold text-white">
                            {stage.count > 0 ? `${stage.count}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {rfqFunnel.length === 0 && (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No data</div>
            )}
          </div>
        </Panel>

        {/* ── Chart 2: Win/Loss Analysis by Customer ── */}
        <Panel>
          <PanelHead
            icon={<BarChart2 size={14} className="text-rose-500" />}
            title="Win/Loss Analysis by Customer"
            sub="Bids won vs lost · Win rate per account"
          />
          <div className="px-4 py-3">
            {winLoss.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={winLoss} layout="vertical" barSize={12} margin={{ left: 8, right: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="customer" tick={{ fontSize: 10, fill: '#475569' }}
                      axisLine={false} tickLine={false} width={120}
                      tickFormatter={v => v.length > 16 ? v.slice(0, 15) + '…' : v} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const won  = payload.find(p => p.dataKey === 'won')?.value  as number ?? 0
                        const lost = payload.find(p => p.dataKey === 'lost')?.value as number ?? 0
                        const rate = (won + lost) > 0 ? ((won / (won + lost)) * 100).toFixed(0) : '0'
                        return (
                          <div className="rounded-xl px-3 py-2 text-xs shadow-lg"
                            style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <p className="font-semibold mb-1 text-slate-300">{label}</p>
                            <p style={{ color: '#34d399' }}>Won: {won}</p>
                            <p style={{ color: '#f87171' }}>Lost: {lost}</p>
                            <p style={{ color: '#fbbf24' }}>Win Rate: {rate}%</p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="won"  name="Won"  stackId="a" fill="#16a34a" radius={[0,0,0,0]} />
                    <Bar dataKey="lost" name="Lost" stackId="a" fill="#ef4444" radius={[0,4,4,0]}
                      label={({ index }: { index?: number }) => index != null ? `${winLoss[index]?.winRate.toFixed(0)}%` : ''} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-5 mt-1">
                  {[['#16a34a','Won'],['#ef4444','Lost']].map(([c, l]) => (
                    <div key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No customer data</div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── Chart 3: Sales Forecast vs. Project Quota ── */}
      <Panel>
        <PanelHead
          icon={<Target size={14} className="text-emerald-500" />}
          title="Sales Forecast vs. Project Quota"
          sub="Actual PO revenue · projected trend · monthly quota target"
          right={
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Quota:</span>
              <span className="text-xs font-bold text-emerald-600">SAR {fmt(monthlyQuota)}/mo</span>
              <input type="range" min={100000} max={5000000} step={100000} value={monthlyQuota}
                onChange={e => setMonthlyQuota(Number(e.target.value))}
                className="w-24 accent-emerald-500 h-1.5" />
            </div>
          }
        />
        <div className="p-5">
          {salesForecastData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={salesForecastData} barSize={18} margin={{ right: 8 }}>
                  <defs>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#2563eb" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.6} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0.15} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="rounded-xl px-3 py-2 text-xs shadow-lg"
                          style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <p className="font-semibold mb-1 text-slate-300">{label}</p>
                          {payload.map((p, i) => p.value != null && (
                            <p key={i} style={{ color: p.color }}>
                              {p.name}: SAR {Number(p.value).toLocaleString('en-SA', { maximumFractionDigits: 0 })}
                            </p>
                          ))}
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={monthlyQuota} stroke="#16a34a" strokeDasharray="6 3" strokeWidth={2}
                    label={{ value: 'Quota', position: 'right', fontSize: 10, fill: '#16a34a' }} />
                  <Bar dataKey="actual"   name="Actual PO"  fill="url(#actualGrad)"   radius={[4,4,0,0]} />
                  <Bar dataKey="forecast" name="Forecast"   fill="url(#forecastGrad)" radius={[4,4,0,0]} />
                  <Line type="monotone" dataKey="quota" name="Monthly Quota" stroke="#16a34a"
                    strokeWidth={0} dot={false} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-5 mt-2">
                {[['url(#actualGrad)','#2563eb','Actual PO'],['url(#forecastGrad)','#7c3aed','Projected'],['#16a34a','#16a34a','Quota Line']].map(([, c, l]) => (
                  <div key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data</div>
          )}
        </div>
      </Panel>


    </div>
  )
}
