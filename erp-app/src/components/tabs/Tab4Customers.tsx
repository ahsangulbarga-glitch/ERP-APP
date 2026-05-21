'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Customer } from '@/types'
import { canWrite, canBulkImport } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, Upload, Users, Pencil, X, Check } from 'lucide-react'

export default function Tab4Customers({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', kaeId: '', minConversion: '' })
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<Customer | null>(null)
  const [form, setForm] = useState({ customerName: '', assignedKaeId: '', firstActivityDate: '', lastActivityDate: '', remarks: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
    const res = await fetch(`/api/customers?${params}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const topCustomer = rows.reduce((top, r) => Number(r.totalPoValue) > Number(top?.totalPoValue || 0) ? r : top, rows[0])
  const avgConversion = rows.length ? rows.reduce((s, r) => s + Number(r.completionPct), 0) / rows.length : 0

  const kpis = [
    { label: 'Total Customers', value: rows.length, color: 'blue' as const },
    { label: 'Top Customer', value: topCustomer?.customerName || '—', color: 'purple' as const },
    { label: 'Avg Conversion %', value: `${avgConversion.toFixed(1)}%`, color: 'green' as const },
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

      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" placeholder="Search customer..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="input-sm" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Min Conversion:</label>
            <input type="range" min={0} max={100} value={filters.minConversion || 0} onChange={e => setFilters(f => ({ ...f, minConversion: e.target.value }))} className="w-24 accent-blue-600" />
            <span className="text-xs font-medium text-blue-700">{filters.minConversion || 0}%</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 flex gap-2 bg-white border-b border-slate-100">
        {canWrite(user.role, 'customers') && (
          <button onClick={() => { setShowForm(true); setEditRow(null) }} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={15} /> New Customer
          </button>
        )}
        <button onClick={handleExport} className="btn-outline flex items-center gap-1.5 text-sm"><Download size={15} /> Export</button>
        {canBulkImport(user.role, 'customers') && (
          <label className="btn-outline flex items-center gap-1.5 text-sm cursor-pointer">
            <Upload size={15} /> Import
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          </label>
        )}
      </div>

      <div className="flex-1 overflow-auto table-container">
        {loading ? <div className="flex items-center justify-center h-40 text-slate-400">Loading…</div>
          : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <Users size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No customers found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
                <tr>
                  {['Customer', 'KAE', 'RFQs', 'Converted', 'Conversion %', 'Quoted (SAR)', 'PO Value (SAR)', 'First Activity', 'Last Activity', 'Remarks', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium">{row.customerName}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{row.assignedKae?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-center">{row.totalRfq}</td>
                    <td className="px-3 py-2.5 text-center text-green-700 font-medium">{row.totalConverted}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(Number(row.completionPct), 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium w-10 text-right">{Number(row.completionPct).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{Number(row.totalValueQuoted).toLocaleString('en-SA', { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{Number(row.totalPoValue).toLocaleString('en-SA', { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{row.firstActivityDate ? new Date(row.firstActivityDate).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{row.lastActivityDate ? new Date(row.lastActivityDate).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-3 py-2.5 max-w-[120px] truncate text-slate-500 text-xs">{row.remarks || '—'}</td>
                    <td className="px-3 py-2.5">
                      {canWrite(user.role, 'customers') && (
                        <button onClick={() => { setEditRow(row); setForm({ customerName: row.customerName, assignedKaeId: row.assignedKaeId || '', firstActivityDate: row.firstActivityDate?.split('T')[0] || '', lastActivityDate: row.lastActivityDate?.split('T')[0] || '', remarks: row.remarks || '' }); setShowForm(true) }} className="text-slate-400 hover:text-blue-600"><Pencil size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{editRow ? 'Edit Customer' : 'New Customer'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Customer Name', key: 'customerName' },
                { label: 'First Activity', key: 'firstActivityDate', type: 'date' },
                { label: 'Last Activity', key: 'lastActivityDate', type: 'date' },
              ].map(({ label, key, type = 'text' }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-600">{label}</label>
                  <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-600">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="btn-outline text-sm">Cancel</button>
              <button onClick={handleSave} className="btn-primary text-sm flex items-center gap-1.5"><Check size={14} /> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
