'use client'

import { useEffect, useState } from 'react'
import { SessionUser } from '@/types'
import { canAccessForecast } from '@/lib/rbac'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#1e40af', '#16a34a', '#d97706', '#dc2626', '#7c3aed']

export default function Tab1Dashboard({ user }: { user: SessionUser }) {
  const [stats, setStats] = useState({ totalQuoted: 0, totalPO: 0, openQuotes: 0, convertedQuotes: 0, overduePayments: 0, expiringDocs: 0 })
  const [quotationTrend, setQuotationTrend] = useState<{ month: string; value: number }[]>([])
  const [statusDist, setStatusDist] = useState<{ name: string; value: number }[]>([])
  const [forecastWinRate, setForecastWinRate] = useState(60)
  const [forecastTimeline, setForecastTimeline] = useState(12)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const [qRes, poRes, payRes, docRes] = await Promise.all([
      fetch('/api/quotations').then(r => r.json()),
      fetch('/api/po-tracker').then(r => r.json()),
      fetch('/api/payments').then(r => r.json()),
      fetch('/api/documents').then(r => r.json()),
    ])

    const quotes = Array.isArray(qRes) ? qRes : []
    const pos = Array.isArray(poRes) ? poRes : []
    const payments = Array.isArray(payRes) ? payRes : []
    const docs = Array.isArray(docRes) ? docRes : []

    const totalQuoted = quotes.reduce((s: number, q: { amountSar: number }) => s + Number(q.amountSar), 0)
    const totalPO = pos.reduce((s: number, p: { totalValueIncVat: number }) => s + Number(p.totalValueIncVat), 0)
    const openQuotes = quotes.filter((q: { status: string }) => q.status === 'Open').length
    const convertedQuotes = quotes.filter((q: { status: string }) => q.status === 'Converted').length
    const overduePayments = payments.flatMap((p: { milestones: { status: string }[] }) => p.milestones).filter((m: { status: string }) => m.status === 'Overdue').length
    const expiringDocs = docs.filter((d: { status: string }) => d.status === 'ExpiringSoon' || d.status === 'Expired').length

    setStats({ totalQuoted, totalPO, openQuotes, convertedQuotes, overduePayments, expiringDocs })

    // Build status distribution
    const statusCounts: Record<string, number> = {}
    quotes.forEach((q: { status: string }) => { statusCounts[q.status] = (statusCounts[q.status] || 0) + 1 })
    setStatusDist(Object.entries(statusCounts).map(([name, value]) => ({ name, value })))

    // Mock trend data
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
    setQuotationTrend(months.map((month, i) => ({ month, value: Math.round(totalQuoted / 6 * (0.7 + i * 0.1)) })))
  }

  const forecastData = ['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => ({
    quarter: q,
    baseline: Math.round(stats.totalPO * 0.2 * (1 + i * 0.1)),
    optimistic: Math.round(stats.totalPO * 0.2 * (1 + i * 0.1) * (1 + forecastWinRate / 200)),
  }))

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold text-slate-800">Dashboard Overview</h2>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Quoted', value: `SAR ${(stats.totalQuoted / 1000).toFixed(0)}K`, color: 'bg-blue-50 text-blue-700 border-blue-100' },
          { label: 'Total PO Value', value: `SAR ${(stats.totalPO / 1000).toFixed(0)}K`, color: 'bg-green-50 text-green-700 border-green-100' },
          { label: 'Open Quotes', value: stats.openQuotes, color: 'bg-orange-50 text-orange-700 border-orange-100' },
          { label: 'Converted', value: stats.convertedQuotes, color: 'bg-purple-50 text-purple-700 border-purple-100' },
          { label: 'Overdue Payments', value: stats.overduePayments, color: 'bg-red-50 text-red-700 border-red-100' },
          { label: 'Doc Alerts', value: stats.expiringDocs, color: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
        ].map((kpi, i) => (
          <div key={i} className={`kpi-card border rounded-xl p-3 ${kpi.color}`}>
            <p className="text-xs font-medium opacity-70">{kpi.label}</p>
            <p className="text-lg font-bold mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quotation Value Trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Quotation Value Trend (SAR)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={quotationTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`SAR ${Number(v).toLocaleString()}`, 'Value']} />
              <Bar dataKey="value" fill="#1e40af" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quote Status Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Quote Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {statusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Forecast Modeler — P1/P4 only */}
      {canAccessForecast(user.role) && (
        <div className="bg-white rounded-xl border border-blue-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">Forecast Modeler</span>
            <h3 className="text-sm font-semibold text-slate-700">Revenue Scenario Projection</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-xs font-medium text-slate-600">Win Rate: <span className="font-bold text-blue-700">{forecastWinRate}%</span></label>
              <input type="range" min={10} max={100} value={forecastWinRate} onChange={(e) => setForecastWinRate(Number(e.target.value))}
                className="w-full mt-1 accent-blue-600" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Collection Timeline: <span className="font-bold text-blue-700">{forecastTimeline} weeks</span></label>
              <input type="range" min={4} max={52} value={forecastTimeline} onChange={(e) => setForecastTimeline(Number(e.target.value))}
                className="w-full mt-1 accent-blue-600" />
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `SAR ${Number(v).toLocaleString()}`} />
              <Legend />
              <Line type="monotone" dataKey="baseline" stroke="#64748b" strokeWidth={2} name="Baseline" dot={false} />
              <Line type="monotone" dataKey="optimistic" stroke="#1e40af" strokeWidth={2.5} name="Optimistic" strokeDasharray="6 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
