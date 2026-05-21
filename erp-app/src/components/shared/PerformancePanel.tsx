'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'
import {
  Users, TrendingUp, Trophy, Target, ShieldCheck, FileWarning,
  AlertTriangle, CheckCircle2, Clock, Zap, ChevronDown, ChevronUp,
  BarChart2, Percent,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────── */
interface PerfUser { id: string; name: string; role: string }

interface KAEData {
  winRate: number; totalRfq: number; totalConverted: number
  totalPoValue: number; avgCollection: number; avgEngagementDays: number
  overdueCount: number; customerCount: number
  accountBreakdown: { name: string; rfq: number; converted: number; poValue: number; conversionPct: number }[]
  collectionByPo: { poNumber: string; customer: string; pct: number; totalValue: number }[]
}
interface ISEData {
  totalQuotes: number; avgRevisions: number; openPipelineValue: number; totalManaged: number
  statusBreakdown: { status: string; count: number; value: number }[]
  revisionDist: { label: string; count: number }[]
  recentQuotes: { ref: string; customer: string; status: string; value: number; date: string; revision: number }[]
}
interface SMData {
  kaeLeaderboard: { name: string; totalRfq: number; converted: number; revenue: number; avgCollection: number; winRate: number }[]
  isePipeline: { name: string; openQuotes: number; pipelineValue: number; avgRevisions: number }[]
  avgOverdueDays: number; overdueCount: number; totalTeamRevenue: number
}
interface AccountantData {
  aging: { label: string; value: number; count: number }[]
  avgCollectionRate: number; totalOutstanding: number; totalBilled: number; totalCollected: number
}
interface HRData {
  total: number; active: number; expiring: number; expired: number
  complianceScore: number; proactiveIndex: number
  expiryBuckets: { label: string; count: number }[]
  riskDocs: { name: string; status: string; daysLeft: number; department: string }[]
}
interface CEOData {
  totalPipeline: number; totalPO: number; totalBilled: number; totalCollected: number
  totalOutstanding: number; conversionRate: number; collectionRate: number; docExpiring: number
  monthlyRevenue: { month: string; value: number }[]
}

interface PerfResponse {
  role: string; userId: string; userName: string
  kae?: KAEData; ise?: ISEData; sm?: SMData; accountant?: AccountantData; hr?: HRData; ceo?: CEOData
}

/* ── Helpers ─────────────────────────────────────────────────────── */
const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : n.toFixed(0)

const STATUS_COLORS: Record<string, string> = { Open: '#2563eb', Converted: '#16a34a', Lost: '#dc2626', OnHold: '#d97706' }
const AGING_COLORS = ['#16a34a', '#d97706', '#ea580c', '#dc2626', '#b91c1c']

const DarkTip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-lg"
      style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
      {label && <p className="font-semibold mb-1 text-slate-300">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#fff' }}>{p.name}: {typeof p.value === 'number' && p.value > 1000 ? `SAR ${p.value.toLocaleString('en-SA', { maximumFractionDigits: 0 })}` : p.value}</p>
      ))}
    </div>
  )
}

/* ── SVG Arc Gauge ─────────────────────────────────────────────── */
const ArcGauge = ({ value, label, color, size = 110 }: { value: number; label: string; color: string; size?: number }) => {
  const pct  = Math.min(Math.max(value, 0), 100)
  const r    = 40; const cx = 60; const cy = 60
  const rad  = (deg: number) => (deg * Math.PI) / 180
  const arc  = (start: number, sweep: number) => {
    const s = rad(start), e = rad(start + sweep)
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
    return `M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`
  }
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 120 120">
        <path d={arc(-210, 240)} fill="none" stroke="#f1f5f9" strokeWidth="10" strokeLinecap="round" />
        <path d={arc(-210, 240 * (pct / 100))} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
        <text x="60" y="56" textAnchor="middle" fontSize="17" fontWeight="700" fill="#0f172a">{pct.toFixed(0)}%</text>
        <text x="60" y="72" textAnchor="middle" fontSize="9" fill="#94a3b8">{label}</text>
      </svg>
    </div>
  )
}

/* ── Section card wrapper ─────────────────────────────────────── */
const MetricCard = ({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) => (
  <div className="rounded-xl p-3.5 flex items-center gap-3 transition-all hover:-translate-y-0.5"
    style={{ background: `${color}0d`, border: `1px solid ${color}30` }}>
    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: `${color}18` }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium truncate" style={{ color: '#64748b' }}>{label}</p>
      <p className="text-base font-bold leading-tight" style={{ color: '#0f172a' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color }}>{sub}</p>}
    </div>
  </div>
)

const Panel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl overflow-hidden ${className}`}
    style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
    {children}
  </div>
)

const SectionHead = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="px-4 py-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
    <p className="font-semibold text-sm text-slate-800">{title}</p>
    {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
  </div>
)

/* ════════════════════════════════════════════════════════════════════
   KAE VIEW
════════════════════════════════════════════════════════════════════ */
function KAEView({ d }: { d: KAEData }) {
  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Win Rate"           value={`${d.winRate.toFixed(1)}%`}         sub={`${d.totalConverted}/${d.totalRfq} RFQs`} icon={<Target size={16} />}    color="#16a34a" />
        <MetricCard label="Revenue (inc-VAT)"  value={`SAR ${fmt(d.totalPoValue)}`}       sub={`${d.customerCount} accounts`}            icon={<TrendingUp size={16} />} color="#2563eb" />
        <MetricCard label="Avg Collection"     value={`${d.avgCollection.toFixed(1)}%`}   sub={d.overdueCount > 0 ? `${d.overdueCount} overdue` : 'No overdue'} icon={<Percent size={16} />}   color={d.avgCollection >= 80 ? '#16a34a' : '#d97706'} />
        <MetricCard label="Avg Engagement"     value={`${Math.round(d.avgEngagementDays)}d`} sub="First → last contact"                icon={<Clock size={16} />}     color="#7c3aed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Account Funnel */}
        <Panel className="lg:col-span-3">
          <SectionHead title="Account Conversion Breakdown" sub="Conversion rate per customer" />
          <div className="p-4">
            {d.accountBreakdown.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No accounts assigned</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, d.accountBreakdown.length * 40)}>
                <BarChart data={d.accountBreakdown} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip content={<DarkTip />} />
                  <Bar dataKey="conversionPct" name="Conversion %" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* Collection Gauge + revenue */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel>
            <SectionHead title="Collection Efficiency" sub="Avg across all POs" />
            <div className="flex items-center justify-center py-4">
              <ArcGauge value={d.avgCollection} label="Collected" color={d.avgCollection >= 80 ? '#16a34a' : d.avgCollection >= 50 ? '#d97706' : '#dc2626'} size={130} />
            </div>
          </Panel>
          <Panel className="flex-1">
            <SectionHead title="Win Rate" sub="RFQ to PO conversion" />
            <div className="flex items-center justify-center py-4">
              <ArcGauge value={d.winRate} label="Win Rate" color={d.winRate >= 60 ? '#2563eb' : d.winRate >= 40 ? '#d97706' : '#dc2626'} size={130} />
            </div>
          </Panel>
        </div>
      </div>

      {/* Collection by PO */}
      {d.collectionByPo.length > 0 && (
        <Panel>
          <SectionHead title="Collection Progress by PO" sub="Per purchase order" />
          <div className="divide-y divide-slate-50">
            {d.collectionByPo.map(po => (
              <div key={po.poNumber} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold" style={{ color: '#7c3aed' }}>{po.poNumber}</span>
                    <span className="text-xs font-semibold text-slate-800">SAR {fmt(po.totalValue)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="progress-bar flex-1">
                      <div className="progress-bar-fill" style={{
                        width: `${po.pct}%`,
                        background: po.pct >= 100 ? '#16a34a' : po.pct >= 50 ? '#2563eb' : '#d97706'
                      }} />
                    </div>
                    <span className="text-xs font-bold shrink-0" style={{ color: po.pct >= 100 ? '#16a34a' : '#d97706' }}>{po.pct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   ISE VIEW
════════════════════════════════════════════════════════════════════ */
function ISEView({ d }: { d: ISEData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Quotes"       value={d.totalQuotes}                         sub="Managed"                   icon={<FileWarning size={16} />} color="#2563eb" />
        <MetricCard label="Open Pipeline"      value={`SAR ${fmt(d.openPipelineValue)}`}     sub={`${d.statusBreakdown.find(s => s.status === 'Open')?.count || 0} quotes open`} icon={<TrendingUp size={16} />} color="#0891b2" />
        <MetricCard label="Avg Revisions"      value={d.avgRevisions.toFixed(1)}             sub="Lower = better"            icon={<BarChart2 size={16} />}  color={d.avgRevisions <= 1 ? '#16a34a' : d.avgRevisions <= 2 ? '#d97706' : '#dc2626'} />
        <MetricCard label="Total Managed"      value={`SAR ${fmt(d.totalManaged)}`}          sub="All statuses"              icon={<Zap size={16} />}        color="#7c3aed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Status donut */}
        <Panel className="lg:col-span-2">
          <SectionHead title="Quote Status Distribution" sub="By SAR value" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={d.statusBreakdown.filter(s => s.value > 0)} dataKey="value" nameKey="status"
                  cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                  {d.statusBreakdown.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.status] || '#94a3b8'} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => typeof v === 'number' ? `SAR ${v.toLocaleString('en-SA', { maximumFractionDigits: 0 })}` : v} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
              {d.statusBreakdown.map((s, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s.status] || '#94a3b8' }} />
                  {s.status} ({s.count})
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Revision distribution */}
        <Panel className="lg:col-span-3">
          <SectionHead title="Revision Frequency" sub="Lower revision = first-try accuracy" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={175}>
              <BarChart data={d.revisionDist} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTip />} />
                <Bar dataKey="count" name="Quotes" radius={[5, 5, 0, 0]}
                  fill="url(#iseGrad)" />
                <defs>
                  <linearGradient id="iseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0891b2" /><stop offset="100%" stopColor="#0891b2" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Recent quotes */}
      {d.recentQuotes.length > 0 && (
        <Panel>
          <SectionHead title="Recent Quotes" sub="Last 5 created" />
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th><th>Customer</th><th>Status</th><th>Revision</th><th className="text-right">Value (SAR)</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              {d.recentQuotes.map(q => (
                <tr key={q.ref}>
                  <td className="font-mono text-xs font-bold" style={{ color: '#7c3aed' }}>{q.ref}</td>
                  <td className="text-slate-700 font-medium">{q.customer}</td>
                  <td>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${STATUS_COLORS[q.status]}18`, color: STATUS_COLORS[q.status] || '#64748b' }}>
                      {q.status}
                    </span>
                  </td>
                  <td className="text-center text-slate-600">REV{q.revision}</td>
                  <td className="text-right font-semibold text-slate-800">{q.value.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</td>
                  <td className="text-slate-400 text-xs">{new Date(q.date).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   SALES MANAGER VIEW
════════════════════════════════════════════════════════════════════ */
function SMView({ d }: { d: SMData }) {
  const maxRevenue = Math.max(...d.kaeLeaderboard.map(k => k.revenue), 1)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Team Revenue"      value={`SAR ${fmt(d.totalTeamRevenue)}`}     sub="All KAEs combined"         icon={<TrendingUp size={16} />}  color="#2563eb" />
        <MetricCard label="Avg Overdue Days"  value={`${Math.round(d.avgOverdueDays)}d`}   sub={`${d.overdueCount} overdue milestones`} icon={<AlertTriangle size={16} />} color={d.avgOverdueDays > 30 ? '#dc2626' : '#d97706'} />
        <MetricCard label="KAEs Active"       value={d.kaeLeaderboard.length}              sub="Tracked accounts"          icon={<Users size={16} />}       color="#7c3aed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* KAE Leaderboard */}
        <Panel className="lg:col-span-3">
          <SectionHead title="KAE Leaderboard" sub="Ranked by revenue generated" />
          <div className="px-4 py-3 space-y-4">
            {d.kaeLeaderboard.map((k, i) => {
              const medals = ['🥇', '🥈', '🥉']
              return (
                <div key={k.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{medals[i] || `#${i + 1}`}</span>
                      <span className="font-semibold text-sm text-slate-800">{k.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">SAR {fmt(k.revenue)}</span>
                      <span className="px-1.5 py-0.5 rounded" style={{ background: '#f0fdf4', color: '#15803d' }}>{k.winRate.toFixed(0)}% win</span>
                      <span className="px-1.5 py-0.5 rounded" style={{ background: '#eff6ff', color: '#1d4ed8' }}>{k.avgCollection.toFixed(0)}% coll.</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill"
                      style={{ width: `${(k.revenue / maxRevenue) * 100}%`, background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : '#cd7c2f' }} />
                  </div>
                </div>
              )
            })}
            {d.kaeLeaderboard.length === 0 && (
              <div className="flex items-center justify-center h-20 text-slate-400 text-sm">No KAEs found</div>
            )}
          </div>
        </Panel>

        {/* Overdue escalation + ISE pipeline */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel>
            <SectionHead title="Escalation Tracker" sub="Avg days milestones stay overdue" />
            <div className="flex items-center justify-center py-5">
              <ArcGauge
                value={Math.min(d.avgOverdueDays, 100)}
                label="Avg days"
                color={d.avgOverdueDays > 60 ? '#dc2626' : d.avgOverdueDays > 30 ? '#d97706' : '#16a34a'}
                size={120}
              />
            </div>
            <div className="px-4 pb-4 text-center">
              <p className="text-xs text-slate-400">
                {d.overdueCount === 0 ? '✅ No overdue milestones' : `${d.overdueCount} milestone${d.overdueCount > 1 ? 's' : ''} require attention`}
              </p>
            </div>
          </Panel>

          {d.isePipeline.length > 0 && (
            <Panel className="flex-1">
              <SectionHead title="ISE Pipeline" sub="Open quotes by engineer" />
              <div className="px-4 py-3 space-y-2.5">
                {d.isePipeline.map(ise => (
                  <div key={ise.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-slate-700">{ise.name.split(' ')[0]}</span>
                      <span className="text-xs text-slate-500">{ise.openQuotes} open · SAR {fmt(ise.pipelineValue)}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${Math.min((ise.pipelineValue / 2_000_000) * 100, 100)}%`, background: '#0891b2' }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* Team radar */}
      {d.kaeLeaderboard.length > 0 && (
        <Panel>
          <SectionHead title="Team Performance Radar" sub="Win Rate · Avg Collection · Accounts (normalised)" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={d.kaeLeaderboard.map(k => ({
                name:       k.name.split(' ')[0],
                WinRate:    Math.round(k.winRate),
                Collection: Math.round(k.avgCollection),
                RFQs:       Math.min(k.totalRfq * 3, 100),
              }))}>
                <PolarGrid stroke="#f1f5f9" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <Radar name="Win Rate"    dataKey="WinRate"    stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
                <Radar name="Collection" dataKey="Collection" stroke="#16a34a" fill="#16a34a" fillOpacity={0.15} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   ACCOUNTANT VIEW
════════════════════════════════════════════════════════════════════ */
function AccountantView({ d }: { d: AccountantData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Billed"      value={`SAR ${fmt(d.totalBilled)}`}           sub="All POs"            icon={<BarChart2 size={16} />}  color="#2563eb" />
        <MetricCard label="Collected"         value={`SAR ${fmt(d.totalCollected)}`}         sub={`${d.avgCollectionRate.toFixed(0)}% rate`} icon={<TrendingUp size={16} />} color="#16a34a" />
        <MetricCard label="Outstanding (AR)"  value={`SAR ${fmt(d.totalOutstanding)}`}       sub="Pending collection"  icon={<Clock size={16} />}     color={d.totalOutstanding > 500_000 ? '#dc2626' : '#d97706'} />
        <MetricCard label="Avg Collection"    value={`${d.avgCollectionRate.toFixed(1)}%`}   sub="Across all POs"     icon={<Percent size={16} />}   color={d.avgCollectionRate >= 80 ? '#16a34a' : '#d97706'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* AR Aging bar chart */}
        <Panel className="lg:col-span-3">
          <SectionHead title="AR Aging Breakdown" sub="Outstanding SAR by overdue period" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.aging} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<DarkTip />} />
                <Bar dataKey="value" name="AR Value (SAR)" radius={[5, 5, 0, 0]}>
                  {d.aging.map((_, i) => <Cell key={i} fill={AGING_COLORS[i] || '#dc2626'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Collection Rate gauge */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel>
            <SectionHead title="Collection Rate" sub="Overall performance" />
            <div className="flex items-center justify-center py-5">
              <ArcGauge value={d.avgCollectionRate} label="Collected" color={d.avgCollectionRate >= 80 ? '#16a34a' : d.avgCollectionRate >= 50 ? '#d97706' : '#dc2626'} size={130} />
            </div>
          </Panel>

          <Panel className="flex-1">
            <SectionHead title="Aging Summary" sub="Bucket counts" />
            <div className="px-4 py-3 space-y-2">
              {d.aging.map((bucket, i) => (
                <div key={bucket.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: AGING_COLORS[i] || '#dc2626' }} />
                    <span className="text-slate-600">{bucket.label}</span>
                  </div>
                  <span className="font-semibold text-slate-800">{bucket.count} items · SAR {fmt(bucket.value)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   HR VIEW
════════════════════════════════════════════════════════════════════ */
function HRView({ d }: { d: HRData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Documents"   value={d.total}              sub="Tracked"              icon={<FileWarning size={16} />} color="#2563eb" />
        <MetricCard label="Active"            value={d.active}             sub="In compliance"        icon={<ShieldCheck size={16} />} color="#16a34a" />
        <MetricCard label="Expiring Soon"     value={d.expiring}           sub="Within 30 days"       icon={<Clock size={16} />}      color="#d97706" />
        <MetricCard label="Expired"           value={d.expired}            sub={d.expired === 0 ? 'Zero risk ✓' : 'Action required!'} icon={<AlertTriangle size={16} />} color={d.expired > 0 ? '#dc2626' : '#16a34a'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Compliance gauges */}
        <Panel className="lg:col-span-2">
          <SectionHead title="Compliance Scores" sub="Active rate · Proactive renewal" />
          <div className="flex items-center justify-around p-4">
            <ArcGauge value={d.complianceScore}  label="Compliant"   color={d.complianceScore >= 90 ? '#16a34a' : '#d97706'} size={120} />
            <ArcGauge value={d.proactiveIndex}   label="Proactive"   color={d.proactiveIndex >= 90 ? '#2563eb' : '#d97706'}   size={120} />
          </div>
        </Panel>

        {/* Expiry distribution */}
        <Panel className="lg:col-span-3">
          <SectionHead title="Document Expiry Distribution" sub="Count by time to expiry" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={d.expiryBuckets} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTip />} />
                <Bar dataKey="count" name="Documents" radius={[5, 5, 0, 0]}>
                  {d.expiryBuckets.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#dc2626' : i === 1 ? '#d97706' : i === 2 ? '#ea580c' : i === 3 ? '#0891b2' : '#2563eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Risk documents list */}
      {d.riskDocs.length > 0 && (
        <Panel>
          <SectionHead title="Document Risk Register" sub="Expiring soon or expired — requires action" />
          <div className="divide-y divide-slate-50">
            {d.riskDocs.map((doc, i) => {
              const isExpired = doc.status === 'Expired'
              const color = isExpired ? '#dc2626' : '#d97706'
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: color, minHeight: 32 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{doc.name}</p>
                    <p className="text-xs text-slate-400">{doc.department}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${color}15`, color }}>
                      {doc.status}
                    </span>
                    <p className="text-xs mt-0.5" style={{ color }}>
                      {doc.daysLeft < 0 ? `${Math.abs(doc.daysLeft)}d overdue` : `${doc.daysLeft}d left`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   CEO / Overview VIEW
════════════════════════════════════════════════════════════════════ */
function CEOView({ d }: { d: CEOData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Pipeline"    value={`SAR ${fmt(d.totalPipeline)}`}   sub={`${d.conversionRate.toFixed(1)}% win rate`}      icon={<Zap size={16} />}       color="#2563eb" />
        <MetricCard label="PO Value"    value={`SAR ${fmt(d.totalPO)}`}         sub="Confirmed orders"                                icon={<TrendingUp size={16} />} color="#16a34a" />
        <MetricCard label="Collected"   value={`SAR ${fmt(d.totalCollected)}`}  sub={`${d.collectionRate.toFixed(1)}% rate`}          icon={<CheckCircle2 size={16} />} color="#7c3aed" />
        <MetricCard label="Outstanding" value={`SAR ${fmt(d.totalOutstanding)}`} sub={d.docExpiring > 0 ? `${d.docExpiring} doc alerts` : 'Docs OK'} icon={<AlertTriangle size={16} />} color="#d97706" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel>
          <SectionHead title="Pipeline vs. Collection" sub="Key organisational ratios" />
          <div className="flex items-center justify-around p-5">
            <ArcGauge value={d.conversionRate} label="Conversion" color="#2563eb" size={130} />
            <ArcGauge value={d.collectionRate} label="Collection" color="#7c3aed" size={130} />
          </div>
        </Panel>
        {d.monthlyRevenue.length > 0 && (
          <Panel>
            <SectionHead title="Monthly PO Revenue" sub="SAR inc-VAT" />
            <div className="p-4">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={d.monthlyRevenue} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip content={<DarkTip />} />
                  <Bar dataKey="value" name="PO Value" fill="#7c3aed" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   MAIN EXPORT
════════════════════════════════════════════════════════════════════ */
export default function PerformancePanel({ user, defaultExpanded = true }: { user: SessionUser; defaultExpanded?: boolean }) {
  const isViewer = ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER'].includes(user.role)

  const [expanded,   setExpanded]   = useState(defaultExpanded)
  const [users,      setUsers]      = useState<PerfUser[]>([])
  const [selectedId, setSelectedId] = useState(user.id)
  const [perfData,   setPerfData]   = useState<PerfResponse | null>(null)
  const [loading,    setLoading]    = useState(false)

  /* Load user list for CEO/Admin selector */
  useEffect(() => {
    if (!isViewer) return
    fetch('/api/performance?list=true').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setUsers(data)
    })
  }, [isViewer])

  /* Load performance data */
  const loadPerf = useCallback(async () => {
    setLoading(true)
    try {
      const url = isViewer ? `/api/performance?userId=${selectedId}` : '/api/performance'
      const res = await fetch(url)
      const data = await res.json()
      setPerfData(data)
    } finally { setLoading(false) }
  }, [selectedId, isViewer])

  useEffect(() => { loadPerf() }, [loadPerf])

  /* Role label helper */
  const roleLabel = (role: string) => {
    const map: Record<string, string> = {
      P1_CEO: 'CEO', P2_ADMIN: 'Admin', P3_REGIONAL_MANAGER: 'Regional Manager',
      P4_SALES_MANAGER: 'Sales Manager', P5_KEY_ACCOUNT_ENGINEER: 'KAE',
      P6_INSIDE_SALES_ENGINEER: 'Inside Sales', P7_ACCOUNTANT: 'Accountant', P8_HR: 'HR',
    }
    return map[role] || role
  }

  /* Group users by role for the dropdown */
  const groupedUsers = users.reduce((acc, u) => {
    const group = roleLabel(u.role)
    if (!acc[group]) acc[group] = []
    acc[group].push(u)
    return acc
  }, {} as Record<string, PerfUser[]>)

  const roleColors: Record<string, string> = {
    P5_KEY_ACCOUNT_ENGINEER: '#16a34a', P6_INSIDE_SALES_ENGINEER: '#0891b2',
    P4_SALES_MANAGER: '#7c3aed', P3_REGIONAL_MANAGER: '#7c3aed',
    P7_ACCOUNTANT: '#d97706', P8_HR: '#dc2626',
    P1_CEO: '#2563eb', P2_ADMIN: '#2563eb',
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none"
        style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)' }}>
            <BarChart2 size={14} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm tracking-tight">Performance Analytics</h3>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {perfData ? `${perfData.userName} · ${roleLabel(perfData.role)}` : 'Loading…'}
            </p>
          </div>
          {perfData && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full ml-2"
              style={{
                background: `${roleColors[perfData.role] || '#2563eb'}20`,
                color: roleColors[perfData.role] || '#2563eb',
                border: `1px solid ${roleColors[perfData.role] || '#2563eb'}40`,
              }}>
              {roleLabel(perfData.role)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* User selector — CEO/Admin only */}
          {isViewer && users.length > 0 && (
            <select
              value={selectedId}
              onChange={e => { e.stopPropagation(); setSelectedId(e.target.value) }}
              onClick={e => e.stopPropagation()}
              className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
              {Object.entries(groupedUsers).map(([group, members]) => (
                <optgroup key={group} label={group} style={{ background: '#1e293b', color: '#94a3b8' }}>
                  {members.map(u => (
                    <option key={u.id} value={u.id} style={{ background: '#1e293b', color: '#fff' }}>
                      {u.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="p-4 lg:p-5" style={{ background: '#f8fafc' }}>
          {loading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
              <div className="grid grid-cols-5 gap-4"><div className="col-span-3 h-56 rounded-2xl shimmer" /><div className="col-span-2 h-56 rounded-2xl shimmer" /></div>
            </div>
          ) : !perfData ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
              <AlertTriangle size={20} className="opacity-50" /><span className="text-sm">Unable to load performance data</span>
            </div>
          ) : (
            <>
              {perfData.kae        && <KAEView       d={perfData.kae} />}
              {perfData.ise        && <ISEView        d={perfData.ise} />}
              {perfData.sm         && <SMView         d={perfData.sm} />}
              {perfData.accountant && <AccountantView d={perfData.accountant} />}
              {perfData.hr         && <HRView         d={perfData.hr} />}
              {perfData.ceo        && <CEOView        d={perfData.ceo} />}
            </>
          )}
        </div>
      )}
    </div>
  )
}
