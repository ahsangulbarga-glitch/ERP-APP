'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Customer } from '@/types'
import { canWrite, canBulkImport } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, Upload, Users, Pencil, X, Check, Trophy, TrendingUp } from 'lucide-react'

export default function Tab4Customers({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', kaeId: '', minConversion: '' })
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<Customer | null>(null)
  const [form, setForm] = useState({ customerName: '', assignedKaeId: '', firstActivityDate: '', lastActivityDate: '', remarks: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await fetch(`/api/customers?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const topCustomer = rows.reduce((top, r) => Number(r.totalPoValue) > Number(top?.totalPoValue || 0) ? r : top, rows[0])
  const avgConversion = rows.length ? rows.reduce((s, r) => s + Number(r.completionPct), 0) / rows.length : 0
  const totalPoValue = rows.reduce((s, r) => s + Number(r.totalPoValue), 0)

  const kpis = [
    { label: 'Total Customers', value: rows.length, color: 'blue' as const, icon: <Users size={16} /> },
    { label: 'Total PO Value', value: `SAR ${(totalPoValue / 1000).toFixed(0)}K`, color: 'green' as const, icon: <TrendingUp size={16} /> },
    { label: 'Avg Conversion', value: `${avgConversion.toFixed(1)}%`, color: 'purple' as const, icon: <TrendingUp size={16} /> },
    { label: 'Top Customer', value: topCustomer?.customerName?.split(' ')[0] || '—', color: 'orange' as const, icon: <Trophy size={16} /> },
  ]

  const handleSave = async () => {
    const method = editRow ? 'PATCH' : 'POST'
    const body = editRow ? { id: editRow.id, ...form } : form
    await fetch('/api/customers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setShowForm(false); setEditRow(null); load()
  }

  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'customers', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('tab', 'customers')
    await fetch('/api/import', { method: 'POST', body: fd }); load()
  }

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      <div className="filter-bar">
        <input type="text" placeholder="Search customer…" value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="input-sm w-48" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 whitespace-nowrap">Min Conversion:</span>
          <input type="range" min={0} max={100} value={filters.minConversion || 0}
            onChange={e => setFilters(f => ({ ...f, minConversion: e.target.value }))}
            className="w-24 accent-blue-600" />
          <span className="text-xs font-bold text-blue-600 w-8">{filters.minConversion || 0}%</span>
        </div>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ search: '', kaeId: '', minConversion: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      <div className="section-header">
        <div className="flex gap-2 flex-wrap">
          {canWrite(user.role, 'customers') && (
            <button onClick={() => { setShowForm(true); setEditRow(null); setForm({ customerName: '', assignedKaeId: '', firstActivityDate: '', lastActivityDate: '', remarks: '' }) }} className="btn-primary">
              <Plus size={14} /> New Customer
            </button>
          )}
          <button onClick={handleExport} className="btn-outline"><Download size={14} /> Export</button>
          {canBulkImport(user.role, 'customers') && (
            <label className="btn-outline cursor-pointer">
              <Upload size={14} /> Import
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>
        <span className="text-xs text-slate-400">{rows.length} customer{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><Users size={36} className="opacity-20" /><p className="text-sm font-medium">No customers found</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>{['Customer', 'KAE', 'RFQs', 'Converted', 'Conversion', 'Quoted (SAR)', 'PO Value (SAR)', 'Last Activity', 'Remarks', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const pct = Math.min(Number(row.completionPct), 100)
                const barColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#2563eb' : '#ea580c'
                return (
                  <tr key={row.id}>
                    <td className="font-semibold text-slate-800">{row.customerName}</td>
                    <td className="text-slate-500 text-xs">{row.assignedKae?.name || '—'}</td>
                    <td className="text-center text-slate-600">{row.totalRfq}</td>
                    <td className="text-center font-semibold" style={{ color: '#15803d' }}>{row.totalConverted}</td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="progress-bar flex-1">
                          <div className="progress-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{Number(row.completionPct).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="text-right text-slate-600">{Number(row.totalValueQuoted).toLocaleString('en-SA', { maximumFractionDigits: 0 })}</td>
                    <td className="text-right font-semibold text-slate-800">{Number(row.totalPoValue).toLocaleString('en-SA', { maximumFractionDigits: 0 })}</td>
                    <td className="text-slate-400 text-xs whitespace-nowrap">{row.lastActivityDate ? new Date(row.lastActivityDate).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="text-slate-400 text-xs max-w-[110px] truncate">{row.remarks || '—'}</td>
                    <td>
                      {canWrite(user.role, 'customers') && (
                        <button onClick={() => { setEditRow(row); setForm({ customerName: row.customerName, assignedKaeId: row.assignedKaeId || '', firstActivityDate: row.firstActivityDate?.split('T')[0] || '', lastActivityDate: row.lastActivityDate?.split('T')[0] || '', remarks: row.remarks || '' }); setShowForm(true) }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all">
                          <Pencil size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{editRow ? 'Edit Customer' : 'New Customer'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editRow ? `Editing ${editRow.customerName}` : 'Add a new customer record'}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Customer Name', key: 'customerName' },
                { label: 'First Activity', key: 'firstActivityDate', type: 'date' },
                { label: 'Last Activity', key: 'lastActivityDate', type: 'date' },
              ].map(({ label, key, type = 'text' }) => (
                <div key={key}>
                  <label className="form-label">{label}</label>
                  <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="form-input" />
                </div>
              ))}
              <div>
                <label className="form-label">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              <button onClick={handleSave} className="btn-primary"><Check size={14} /> Save Customer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
