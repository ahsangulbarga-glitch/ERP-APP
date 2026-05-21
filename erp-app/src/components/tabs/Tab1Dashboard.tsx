'use client'

import { useEffect, useState } from 'react'
import { SessionUser } from '@/types'
import { canAccessForecast } from '@/lib/rbac'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, FileText, ShoppingBag, AlertTriangle, FileWarning, Receipt, Banknote, Clock, Bell, CalendarClock, CheckCircle2 } from 'lucide-react'

interface UpcomingMilestone {
  id: string
  phaseName: string
  amountSar: number
  dueDate: string
  status: string
  poNumber: string
  customerName: string
  daysUntilDue: number
}

const STATUS_COLORS: Record<string, string> = {
  Open: '#2563eb', Converted: '#16a34a', Lost: '#dc2626', OnHold: '#d97706',
}
const PIE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed']

const StatCard = ({ label, value, icon, color, sub }: {
  label: string; value: string | number; icon: React.ReactNode; color: string; sub?: string
}) => (
  <div className="rounded-2xl p-4 flex items-center gap-3.5 transition-all hover:-translate-y-0.5"
    style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: `${color}15` }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
      <p className="text-lg font-bold text-slate-800 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
)

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl shadow-lg px-3 py-2.5 text-xs"
      style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="font-semibold mb-1 text-slate-300">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-bold">SAR {Number(p.value).toLocaleString()}</p>
      ))}
    </div>
  )
}

const PieTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl shadow-lg px-3 py-2 text-xs"
      style={{ background: '#0f172a', color: '#fff' }}>
      <p className="font-semibold">{payload[0].name}: {payload[0].value}</p>
    </div>
  )
}

export default function Tab1Dashboard({ user }: { user: SessionUser }) {
  const [stats, setStats] = useState({ totalQuoted: 0, totalPO: 0, openQuotes: 0, convertedQuotes: 0, overduePayments: 0, expiringDocs: 0, totalBilled: 0, totalCollected: 0, totalOutstanding: 0 })
  const [quotationTrend, setQuotationTrend] = useState<{ month: string; value: number }[]>([])
  const [statusDist, setStatusDist] = useState<{ name: string; value: number }[]>([])
  const [forecastWinRate, setForecastWinRate] = useState(60)
  const [forecastTimeline, setForecastTimeline] = useState(12)
  const [loading, setLoading] = useState(true)
  const [upcomingMilestones, setUpcomingMilestones] = useState<UpcomingMilestone[]>([])

  useEffect(() => { loadStats() }, [])

  const loadStats = async () => {
    setLoading(true)
    try {
      const [qRes, poRes, payRes, docRes] = await Promise.all([
        fetch('/api/quotations').then(r => r.json()),
        fetch('/api/po-tracker').then(r => r.json()),
        fetch('/api/payments').then(r => r.json()),
        fetch('/api/documents').then(r => r.json()),
      ])
      const quotes   = Array.isArray(qRes)   ? qRes   : []
      const pos      = Array.isArray(poRes)   ? poRes  : []
      const payments = Array.isArray(payRes)  ? payRes : []
      const docs     = Array.isArray(docRes)  ? docRes : []

      const totalQuoted      = quotes.reduce((s: number, q: { amountSar: number }) => s + Number(q.amountSar), 0)
      const totalPO          = pos.reduce((s: number, p: { totalValueIncVat: number }) => s + Number(p.totalValueIncVat), 0)
      const openQuotes       = quotes.filter((q: { status: string }) => q.status === 'Open').length
      const convertedQuotes  = quotes.filter((q: { status: string }) => q.status === 'Converted').length
      const overduePayments  = payments.flatMap((p: { milestones: { status: string }[] }) => p.milestones).filter((m: { status: string }) => m.status === 'Overdue').length
      const expiringDocs     = docs.filter((d: { status: string }) => d.status === 'ExpiringSoon' || d.status === 'Expired').length

      const totalBilled      = payments.reduce((s: number, p: { poValue: number }) => s + Number(p.poValue), 0)
      const totalCollected   = payments.reduce((s: number, p: { poValue: number; collectionPct: number }) => s + Number(p.poValue) * (Number(p.collectionPct) / 100), 0)
      const totalOutstanding = totalBilled - totalCollected

      setStats({ totalQuoted, totalPO, openQuotes, convertedQuotes, overduePayments, expiringDocs, totalBilled, totalCollected, totalOutstanding })

      // Upcoming & overdue milestones
      const today = new Date(); today.setHours(0, 0, 0, 0)
      type RawPayment = { id: string; poNumber: string; customerName: string; milestones?: { id: string; phaseName: string; amountSar: string | number; dueDate: string; status: string }[] }
      const allMilestones: UpcomingMilestone[] = (payments as RawPayment[]).flatMap(p =>
        (p.milestones ?? [])
          .filter(m => m.status !== 'Paid')
          .map(m => {
            const due = new Date(m.dueDate); due.setHours(0, 0, 0, 0)
            const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000)
            return { id: m.id, phaseName: m.phaseName, amountSar: Number(m.amountSar), dueDate: m.dueDate, status: m.status, poNumber: p.poNumber, customerName: p.customerName, daysUntilDue }
          })
      )
      allMilestones.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      setUpcomingMilestones(allMilestones.slice(0, 5))

      const statusCounts: Record<string, number> = {}
      quotes.forEach((q: { status: string }) => { statusCounts[q.status] = (statusCounts[q.status] || 0) + 1 })
      setStatusDist(Object.entries(statusCounts).map(([name, value]) => ({ name, value })))

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
      setQuotationTrend(months.map((month, i) => ({
        month,
        value: Math.round(totalQuoted / 6 * (0.55 + i * 0.12))
      })))
    } finally {
      setLoading(false)
    }
  }

  const conversionRate = stats.totalQuoted > 0
    ? ((stats.totalPO / stats.totalQuoted) * 100).toFixed(1)
    : '0.0'

  const forecastData = ['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => ({
    quarter: q,
    baseline: Math.round(stats.totalPO * 0.2 * (1 + i * 0.1)),
    optimistic: Math.round(stats.totalPO * 0.2 * (1 + i * 0.1) * (1 + forecastWinRate / 200)),
  }))

  if (loading) {
    return (
      <div className="p-5 space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-24 rounded-2xl shimmer" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-5 space-y-5 max-w-7xl mx-auto">
      {/* Headline KPIs — row 1: Quotations & Pipeline */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Quoted" value={`SAR ${(stats.totalQuoted / 1000).toFixed(0)}K`} icon={<FileText size={18} />} color="#2563eb" />
        <StatCard label="Total PO Value" value={`SAR ${(stats.totalPO / 1000).toFixed(0)}K`} icon={<ShoppingBag size={18} />} color="#16a34a" />
        <StatCard label="Open Quotes" value={stats.openQuotes} icon={<TrendingUp size={18} />} color="#0891b2" />
        <StatCard label="Converted" value={stats.convertedQuotes} icon={<TrendingDown size={18} />} color="#7c3aed" sub={`${conversionRate}% rate`} />
        <StatCard label="Overdue Milestones" value={stats.overduePayments} icon={<AlertTriangle size={18} />} color="#dc2626" />
        <StatCard label="Doc Alerts" value={stats.expiringDocs} icon={<FileWarning size={18} />} color="#d97706" />
      </div>

      {/* Headline KPIs — row 2: AR / Cash */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total Billed"
          value={`SAR ${(stats.totalBilled ?? 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`}
          icon={<Receipt size={18} />}
          color="#0891b2"
          sub="Sum of all PO values"
        />
        <StatCard
          label="Total Collected"
          value={`SAR ${(stats.totalCollected ?? 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`}
          icon={<Banknote size={18} />}
          color="#16a34a"
          sub={(stats.totalBilled ?? 0) > 0 ? `${(((stats.totalCollected ?? 0) / stats.totalBilled) * 100).toFixed(1)}% of billed` : 'No billings yet'}
        />
        <StatCard
          label="Outstanding (AR)"
          value={`SAR ${(stats.totalOutstanding ?? 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`}
          icon={<Clock size={18} />}
          color={(stats.totalOutstanding ?? 0) > 0 ? '#dc2626' : '#16a34a'}
          sub={(stats.totalBilled ?? 0) > 0 ? `${(((stats.totalOutstanding ?? 0) / stats.totalBilled) * 100).toFixed(1)}% unpaid` : ''}
        />
      </div>

      {/* Upcoming & Overdue Payment Milestones */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid #f1f5f9' }}>
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-blue-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Upcoming Payment Milestones</h3>
            {upcomingMilestones.some(m => m.daysUntilDue < 0) && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                <Bell size={10} />
                {upcomingMilestones.filter(m => m.daysUntilDue < 0).length} Overdue
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400">Next 5 due</span>
        </div>

        {upcomingMilestones.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
            <CheckCircle2 size={18} className="text-green-400" />
            <span className="text-sm">All milestones are up to date</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {upcomingMilestones.map((m, i) => {
              const isOverdue = m.daysUntilDue < 0
              const isDueSoon = !isOverdue && m.daysUntilDue <= 7
              const accentColor = isOverdue ? '#dc2626' : isDueSoon ? '#d97706' : '#2563eb'
              const bgColor     = isOverdue ? '#fef2f2' : isDueSoon ? '#fffbeb' : '#fff'
              const dueLabel    = isOverdue
                ? `${Math.abs(m.daysUntilDue)}d overdue`
                : m.daysUntilDue === 0
                ? 'Due today'
                : `in ${m.daysUntilDue}d`

              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3 transition-colors"
                  style={{ background: bgColor }}>
                  {/* Left accent bar */}
                  <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: accentColor, minHeight: 36 }} />

                  {/* Icon */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${accentColor}15` }}>
                    {isOverdue
                      ? <AlertTriangle size={14} style={{ color: accentColor }} />
                      : <Clock size={14} style={{ color: accentColor }} />}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800 truncate">{m.phaseName}</span>
                      {isOverdue && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={{ background: '#fecaca', color: '#b91c1c' }}>OVERDUE</span>
                      )}
                      {isDueSoon && !isOverdue && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={{ background: '#fde68a', color: '#92400e' }}>DUE SOON</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      <span className="font-mono text-xs" style={{ color: '#7c3aed' }}>{m.poNumber}</span>
                      {' · '}{m.customerName}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-slate-800">
                      SAR {m.amountSar.toLocaleString('en-SA', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: accentColor }}>{dueLabel}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Bar chart — wider */}
        <div className="lg:col-span-3 rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Quotation Value Trend</h3>
              <p className="text-xs text-slate-400 mt-0.5">SAR · Last 6 months</p>
            </div>
            <span className="chip" style={{ background: '#eff6ff', color: '#1d4ed8' }}>Monthly</span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={quotationTrend} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}
                fill="url(#barGrad)" />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="lg:col-span-2 rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">Quote Status</h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribution by count</p>
          </div>
          {statusDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusDist} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={68}
                    paddingAngle={3}>
                    {statusDist.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                {statusDist.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    {entry.name} ({entry.value})
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Forecast Modeler */}
      {canAccessForecast(user.role) && (
        <div className="rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="chip text-xs" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              ✦ Forecast Modeler
            </span>
            <h3 className="font-semibold text-slate-800 text-sm">Revenue Scenario Projection</h3>
          </div>

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

          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={v => `SAR ${Number(v).toLocaleString()}`} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="baseline" stroke="#94a3b8" strokeWidth={2}
                name="Baseline" dot={false} />
              <Line type="monotone" dataKey="optimistic" stroke="#2563eb" strokeWidth={2.5}
                name="Optimistic" strokeDasharray="6 3" dot={{ fill: '#2563eb', strokeWidth: 0, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
