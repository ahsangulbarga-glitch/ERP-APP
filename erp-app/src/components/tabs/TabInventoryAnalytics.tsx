'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Package, DollarSign, AlertTriangle, RefreshCw, Settings, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { SessionUser } from '@/types'
import { canWrite } from '@/lib/rbac'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TurnoverItem {
  id: string; productRef: string; description: string
  turnoverRatio: number; category: 'High-Performing' | 'Slow-Moving' | 'Dead Stock'
  cogs: number; avgInventoryValue: number; currentStock: number; unitCost: number
  issueCount: number; stockAvailability: string
}
interface AnalyticsData {
  summary: { highPerforming: number; slowMoving: number; deadStock: number; totalItems: number; avgTurnoverRatio: number }
  items: TurnoverItem[]
  monthlyBreakdown: { month: string; totalIssues: number; totalReceipts: number; totalCogs: number }[]
}
interface ForecastPoint { month: string; totalQty?: number; forecastQty?: number; isForecast?: boolean; index?: number }
interface ForecastItem {
  productRef: string; description: string; avgMonthlyDemand: number; forecastedQty: number
  currentStock: number; daysOfStockLeft: number; restockRecommended: boolean; stockAvailability: string
}
interface ForecastData { historical: ForecastPoint[]; forecast: ForecastPoint[]; itemForecasts: ForecastItem[]; days: number }
interface ValuationData {
  config: { method: string }
  summary: { totalItems: number; totalUnits: number; totalValue: number; currency: string }
  byAvailability: { status: string; itemCount: number; totalValue: number }[]
  items: { id: string; productRef: string; description: string; quantity: number; unitCost: number; totalValue: number; stockAvailability: string }[]
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = { 'High-Performing': '#059669', 'Slow-Moving': '#d97706', 'Dead Stock': '#dc2626' }
const AVAILABILITY_COLORS: Record<string, string> = {
  'In Stock': '#059669', 'Low Stock': '#d97706', 'Out of Stock': '#dc2626', 'Reserved': '#7c3aed',
}
const PIE_COLORS = ['#059669', '#d97706', '#dc2626']
const SAR = (v: number) => `SAR ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon: Icon }:
  { label: string; value: string | number; sub?: string; color: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg shadow-lg p-3 text-xs" style={{ background: '#1e293b', color: '#e2e8f0', minWidth: 140 }}>
      <p className="font-semibold mb-1 text-white">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-medium text-white">{typeof p.value === 'number' && p.value > 100 ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TabInventoryAnalytics({ user }: { user: SessionUser }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [forecast, setForecast]   = useState<ForecastData | null>(null)
  const [valuation, setValuation] = useState<ValuationData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [forecastDays, setForecastDays] = useState(30)
  const [activeSection, setActiveSection] = useState<'turnover' | 'forecast' | 'valuation'>('turnover')
  const [valuationMethod, setValuationMethod] = useState('WEIGHTED_AVERAGE')
  const [savingMethod, setSavingMethod] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canChangeMethod = canWrite(user.role, 'inventoryAnalytics')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [aRes, fRes, vRes] = await Promise.all([
        fetch('/api/inventory/analytics'),
        fetch(`/api/inventory/forecast?days=${forecastDays}`),
        fetch('/api/inventory/valuation'),
      ])
      if (!aRes.ok || !fRes.ok || !vRes.ok) throw new Error('Failed to load analytics data')
      const [a, f, v] = await Promise.all([aRes.json(), fRes.json(), vRes.json()])
      setAnalytics(a)
      setForecast(f)
      setValuation(v)
      setValuationMethod(v.config.method)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [forecastDays])

  useEffect(() => { load() }, [load])

  const handleMethodChange = async (method: string) => {
    if (!canChangeMethod) return
    setSavingMethod(true)
    try {
      await fetch('/api/inventory/valuation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      })
      setValuationMethod(method)
      const vRes = await fetch('/api/inventory/valuation')
      setValuation(await vRes.json())
    } finally {
      setSavingMethod(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!analytics || !forecast || !valuation) return
    const wb = XLSX.utils.book_new()
    const date = new Date().toISOString().split('T')[0]

    if (activeSection === 'turnover') {
      const rows = analytics.items.map(i => ({
        'Product Ref': i.productRef,
        'Description': i.description,
        'Turnover Ratio': i.turnoverRatio === 99 ? '∞' : i.turnoverRatio,
        'Category': i.category,
        'COGS (SAR)': i.cogs,
        'Avg Inventory Value (SAR)': i.avgInventoryValue,
        'Current Stock': i.currentStock,
        'Unit Cost (SAR)': i.unitCost,
        'Issue Count': i.issueCount,
        'Stock Status': i.stockAvailability,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Turnover')
      const monthly = analytics.monthlyBreakdown.map(m => ({
        'Month': m.month, 'Total Issues': m.totalIssues,
        'Total Receipts': m.totalReceipts, 'Total COGS (SAR)': m.totalCogs,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthly), 'Monthly Breakdown')
      XLSX.writeFile(wb, `inventory-turnover-${date}.xlsx`)
    } else if (activeSection === 'forecast') {
      const rows = forecast.itemForecasts.map(i => ({
        'Product Ref': i.productRef,
        'Description': i.description,
        'Avg Monthly Demand': i.avgMonthlyDemand,
        [`Forecast (${forecast.days}d)`]: i.forecastedQty,
        'Current Stock': i.currentStock,
        'Days of Stock Left': i.daysOfStockLeft >= 999 ? '∞' : i.daysOfStockLeft,
        'Restock Recommended': i.restockRecommended ? 'Yes' : 'No',
        'Stock Status': i.stockAvailability,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `Forecast ${forecast.days}d`)
      const hist = forecast.historical.map(h => ({ 'Month': h.month, 'Total Issues': h.totalQty }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hist), 'Historical')
      XLSX.writeFile(wb, `inventory-forecast-${forecast.days}d-${date}.xlsx`)
    } else {
      const summary = [{
        'Valuation Method': valuation.config.method,
        'Total Value (SAR)': valuation.summary.totalValue,
        'Total Units': valuation.summary.totalUnits,
        'Total SKUs': valuation.summary.totalItems,
      }]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary')
      const rows = valuation.items.map((i, idx) => ({
        '#': idx + 1,
        'Product Ref': i.productRef,
        'Description': i.description,
        'Quantity': i.quantity,
        'Unit Cost (SAR)': i.unitCost,
        'Total Value (SAR)': i.totalValue,
        'Stock Status': i.stockAvailability,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Items by Value')
      const byAvail = valuation.byAvailability.map(a => ({
        'Status': a.status, 'Item Count': a.itemCount, 'Total Value (SAR)': a.totalValue,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byAvail), 'By Availability')
      XLSX.writeFile(wb, `inventory-valuation-${valuation.config.method.toLowerCase()}-${date}.xlsx`)
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-slate-500">
        <RefreshCw size={18} className="animate-spin" />
        <span className="text-sm">Loading analytics…</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <AlertTriangle size={32} className="mx-auto mb-2 text-red-400" />
        <p className="text-sm text-red-600 font-medium">{error}</p>
        <button onClick={load} className="mt-3 text-xs text-blue-600 underline">Retry</button>
      </div>
    </div>
  )

  if (!analytics || !forecast || !valuation) return null

  // ── Prepared chart data ────────────────────────────────────────────────────

  const turnoverTopItems = [...analytics.items]
    .filter(i => i.turnoverRatio < 99)
    .sort((a, b) => b.turnoverRatio - a.turnoverRatio)
    .slice(0, 10)
    .map(i => ({ name: i.productRef, ratio: i.turnoverRatio, category: i.category }))

  const pieSummary = [
    { name: 'High-Performing', value: analytics.summary.highPerforming },
    { name: 'Slow-Moving',     value: analytics.summary.slowMoving },
    { name: 'Dead Stock',      value: analytics.summary.deadStock },
  ].filter(p => p.value > 0)

  const combinedForecast: (ForecastPoint & { isHistorical?: boolean })[] = [
    ...forecast.historical.map(h => ({ ...h, isHistorical: true })),
    ...forecast.forecast.map(f => ({ ...f, isHistorical: false })),
  ]

  const TAB_BTN = (id: typeof activeSection, label: string) => (
    <button
      onClick={() => setActiveSection(id)}
      className="px-4 py-2 text-sm font-medium rounded-lg transition-all"
      style={activeSection === id
        ? { background: '#2563eb', color: '#fff' }
        : { background: '#f1f5f9', color: '#64748b' }}
    >
      {label}
    </button>
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-5 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Inventory Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">12-month rolling window · {analytics.summary.totalItems} items</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90" style={{ background: '#059669' }}>
            <Download size={13} /> Export
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2">
        {TAB_BTN('turnover',  '📊 Turnover')}
        {TAB_BTN('forecast',  '📈 Forecast')}
        {TAB_BTN('valuation', '💰 Valuation')}
      </div>

      {/* ── SECTION 1: Inventory Turnover ─────────────────────────────────── */}
      {activeSection === 'turnover' && (
        <div className="space-y-5">
          <SectionHeader
            title="Inventory Turnover Analytics"
            sub="COGS ÷ Average Inventory Value over the past 12 months"
          />

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="High-Performing" value={analytics.summary.highPerforming} sub="Ratio ≥ 4" color="#059669" icon={TrendingUp} />
            <KpiCard label="Slow-Moving"     value={analytics.summary.slowMoving}     sub="Ratio 1–3.9" color="#d97706" icon={TrendingDown} />
            <KpiCard label="Dead Stock"      value={analytics.summary.deadStock}      sub="Ratio < 1" color="#dc2626" icon={AlertTriangle} />
            <KpiCard label="Avg Turnover"    value={analytics.summary.avgTurnoverRatio + 'x'} sub="All items" color="#2563eb" icon={RefreshCw} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Top items bar chart */}
            <div className="lg:col-span-2 rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
              <p className="text-sm font-semibold text-slate-700 mb-3">Top 10 Items by Turnover Ratio</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={turnoverTopItems} margin={{ left: 0, right: 8, top: 4, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={32} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={4} stroke="#059669" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: 'High', position: 'right', fontSize: 9, fill: '#059669' }} />
                  <ReferenceLine y={1} stroke="#d97706" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: 'Slow', position: 'right', fontSize: 9, fill: '#d97706' }} />
                  <Bar dataKey="ratio" name="Turnover Ratio" radius={[3, 3, 0, 0]}>
                    {turnoverTopItems.map((entry, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[entry.category as keyof typeof CATEGORY_COLORS]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart */}
            <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
              <p className="text-sm font-semibold text-slate-700 mb-3">Stock Classification</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieSummary} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                    {pieSummary.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieSummary.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: PIE_COLORS[i] }} />
                      <span className="text-slate-600">{p.name}</span>
                    </span>
                    <span className="font-semibold text-slate-800">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly issues/receipts chart */}
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <p className="text-sm font-semibold text-slate-700 mb-3">Monthly Stock Movement (12 months)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.monthlyBreakdown} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="totalReceipts" name="Receipts" fill="#2563eb" radius={[2, 2, 0, 0]} />
                <Bar dataKey="totalIssues"   name="Issues"   fill="#dc2626" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Items table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <p className="text-sm font-semibold text-slate-700">All Items — Turnover Detail</p>
              <p className="text-xs text-slate-400">{analytics.items.length} items</p>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    {['Ref', 'Description', 'Ratio', 'Category', 'COGS (SAR)', 'Avg Inv. (SAR)', 'Stock'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.items.map((item, i) => (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderTop: '1px solid #f1f5f9' }}>
                      <td className="px-3 py-2 font-mono font-medium text-slate-700 whitespace-nowrap">{item.productRef}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[220px] truncate">{item.description}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{item.turnoverRatio === 99 ? '∞' : item.turnoverRatio + 'x'}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                          background: `${CATEGORY_COLORS[item.category]}18`,
                          color: CATEGORY_COLORS[item.category],
                        }}>{item.category}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{item.cogs.toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-700">{item.avgInventoryValue.toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-700">{item.currentStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 2: Demand Forecast ───────────────────────────────────── */}
      {activeSection === 'forecast' && (
        <div className="space-y-5">
          <div className="flex items-start justify-between">
            <SectionHeader
              title="Demand Forecasting"
              sub="Historical consumption + linear regression projection"
            />
            {/* Days selector */}
            <div className="flex gap-1.5 shrink-0">
              {[30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setForecastDays(d)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                  style={forecastDays === d
                    ? { background: '#2563eb', color: '#fff' }
                    : { background: '#f1f5f9', color: '#64748b' }}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Area chart — historical + forecast */}
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <p className="text-sm font-semibold text-slate-700 mb-1">12-Month Historical + {forecastDays}-Day Forecast</p>
            <p className="text-xs text-slate-400 mb-3">Total units issued across all inventory items</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={combinedForecast} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="foreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={44} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="totalQty"    name="Historical Issues" stroke="#2563eb" fill="url(#histGrad)" strokeWidth={2} dot={false} connectNulls />
                <Area type="monotone" dataKey="forecastQty" name="Forecast"          stroke="#7c3aed" fill="url(#foreGrad)" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Restock alert table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <p className="text-sm font-semibold text-slate-700">Stock Runway — Top Items at Risk</p>
              <p className="text-xs text-slate-400">Based on avg monthly demand · {forecastDays}-day horizon</p>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    {['Ref', 'Description', 'Avg Demand/mo', `Forecast (${forecastDays}d)`, 'Current Stock', 'Days Left', 'Action'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forecast.itemForecasts.map((item, i) => (
                    <tr key={item.productRef} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderTop: '1px solid #f1f5f9' }}>
                      <td className="px-3 py-2 font-mono font-medium text-slate-700 whitespace-nowrap">{item.productRef}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{item.description}</td>
                      <td className="px-3 py-2 text-slate-700">{item.avgMonthlyDemand}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{item.forecastedQty}</td>
                      <td className="px-3 py-2 text-slate-700">{item.currentStock}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold" style={{ color: item.daysOfStockLeft < 30 ? '#dc2626' : item.daysOfStockLeft < 60 ? '#d97706' : '#059669' }}>
                          {item.daysOfStockLeft >= 999 ? '∞' : item.daysOfStockLeft + 'd'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {item.restockRecommended
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">Restock Now</span>
                          : <span className="text-slate-400">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 3: Stock Valuation ───────────────────────────────────── */}
      {activeSection === 'valuation' && (
        <div className="space-y-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <SectionHeader
              title="Stock Valuation"
              sub="Real-time on-hand asset value by accounting method"
            />

            {/* Method switcher */}
            <div className="flex items-center gap-2">
              <Settings size={14} className="text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500 font-medium">Method:</span>
              {['FIFO', 'LIFO', 'WEIGHTED_AVERAGE'].map(m => (
                <button
                  key={m}
                  onClick={() => handleMethodChange(m)}
                  disabled={!canChangeMethod || savingMethod}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50"
                  style={valuationMethod === m
                    ? { background: '#2563eb', color: '#fff' }
                    : { background: '#f1f5f9', color: '#64748b' }}
                >
                  {m === 'WEIGHTED_AVERAGE' ? 'WA' : m}
                </button>
              ))}
              {savingMethod && <RefreshCw size={12} className="animate-spin text-blue-500" />}
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Total Asset Value" value={SAR(valuation.summary.totalValue)} sub={`${valuationMethod === 'WEIGHTED_AVERAGE' ? 'Weighted Avg' : valuationMethod} method`} color="#2563eb" icon={DollarSign} />
            <KpiCard label="Total Units On-Hand" value={valuation.summary.totalUnits.toLocaleString()} sub="Across all items" color="#059669" icon={Package} />
            <KpiCard label="Total SKUs" value={valuation.summary.totalItems} sub="Active inventory items" color="#7c3aed" icon={TrendingUp} />
          </div>

          {/* Bar chart by availability */}
          <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
            <p className="text-sm font-semibold text-slate-700 mb-3">Asset Value by Stock Status</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={valuation.byAvailability} margin={{ left: 16, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={60} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                <Tooltip content={<CustomTooltip />} formatter={(v: number) => SAR(v)} />
                <Bar dataKey="totalValue" name="Value (SAR)" radius={[4, 4, 0, 0]}>
                  {valuation.byAvailability.map((entry, i) => (
                    <Cell key={i} fill={AVAILABILITY_COLORS[entry.status] ?? '#2563eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-availability breakdown cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {valuation.byAvailability.map(av => (
              <div key={av.status} className="rounded-xl p-3" style={{ background: `${AVAILABILITY_COLORS[av.status] ?? '#2563eb'}0d`, border: `1px solid ${AVAILABILITY_COLORS[av.status] ?? '#2563eb'}33` }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: AVAILABILITY_COLORS[av.status] ?? '#2563eb' }} />
                  <span className="text-xs font-semibold" style={{ color: AVAILABILITY_COLORS[av.status] ?? '#2563eb' }}>{av.status}</span>
                </div>
                <p className="text-base font-bold text-slate-800">{SAR(av.totalValue)}</p>
                <p className="text-xs text-slate-500">{av.itemCount} item{av.itemCount !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          {/* Top items by value */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <p className="text-sm font-semibold text-slate-700">Items Ranked by Asset Value</p>
              <p className="text-xs text-slate-400">{valuationMethod === 'WEIGHTED_AVERAGE' ? 'Weighted Average' : valuationMethod} costing</p>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    {['#', 'Ref', 'Description', 'Qty', 'Unit Cost (SAR)', 'Total Value (SAR)', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {valuation.items.slice(0, 25).map((item, i) => (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderTop: '1px solid #f1f5f9' }}>
                      <td className="px-3 py-2 text-slate-400 font-medium">{i + 1}</td>
                      <td className="px-3 py-2 font-mono font-medium text-slate-700 whitespace-nowrap">{item.productRef}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[220px] truncate">{item.description}</td>
                      <td className="px-3 py-2 text-slate-700">{item.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-700">{item.unitCost.toLocaleString()}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{item.totalValue.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                          background: `${AVAILABILITY_COLORS[item.stockAvailability] ?? '#2563eb'}18`,
                          color: AVAILABILITY_COLORS[item.stockAvailability] ?? '#2563eb',
                        }}>{item.stockAvailability}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
