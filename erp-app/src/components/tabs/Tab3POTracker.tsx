'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, POTracker } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, ShoppingCart, Pencil, X, Check } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Paid: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
  PartiallyPaid: 'bg-blue-100 text-blue-700',
}

export default function Tab3POTracker({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<POTracker[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', kae: '', customer: '', poNumber: '', status: '' })
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<POTracker | null>(null)
  const [form, setForm] = useState({ customerName: '', projectName: '', kaeName: '', qtRef: '', poNumber: '', poDate: '', poAmountExVat: '', paymentTermsSplit: '', remarks: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
    const res = await fetch(`/api/po-tracker?${params}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const totalExVat = rows.reduce((s, r) => s + Number(r.poAmountExVat), 0)
  const totalVat = rows.reduce((s, r) => s + Number(r.vat15), 0)
  const totalIncVat = rows.reduce((s, r) => s + Number(r.totalValueIncVat), 0)
  const avgCollection = rows.length ? rows.reduce((s, r) => s + Number(r.paymentCollectionPct), 0) / rows.length : 0

  const kpis = [
    { label: 'Total Ex-VAT (SAR)', value: `SAR ${totalExVat.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'blue' as const },
    { label: 'Total VAT 15%', value: `SAR ${totalVat.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'orange' as const },
    { label: 'Total Inc-VAT (SAR)', value: `SAR ${totalIncVat.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'green' as const },
    { label: 'Avg Collection %', value: `${avgCollection.toFixed(1)}%`, color: 'purple' as const },
  ]

  const handleSave = async () => {
    const method = editRow ? 'PATCH' : 'POST'
    const body = editRow ? { id: editRow.id, ...form } : form
    await fetch('/api/po-tracker', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setShowForm(false); setEditRow(null); load()
  }

  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'poTracker', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      {/* Filters */}
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex flex-wrap gap-2">
          <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="input-sm" />
          <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="input-sm" />
          <input type="text" placeholder="Customer..." value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="input-sm" />
          <input type="text" placeholder="PO Number..." value={filters.poNumber} onChange={e => setFilters(f => ({ ...f, poNumber: e.target.value }))} className="input-sm" />
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="input-sm">
            <option value="">All Status</option>
            <option>Pending</option><option>Paid</option><option>Overdue</option><option>PartiallyPaid</option>
          </select>
        </div>
      </div>

      <div className="px-4 py-2 flex gap-2 bg-white border-b border-slate-100">
        {canWrite(user.role, 'poTracker') && (
          <button onClick={() => { setShowForm(true); setEditRow(null) }} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={15} /> New PO
          </button>
        )}
        <button onClick={handleExport} className="btn-outline flex items-center gap-1.5 text-sm">
          <Download size={15} /> Export
        </button>
      </div>

      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <ShoppingCart size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No PO records found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
              <tr>
                {['PO Number', 'Customer', 'Project', 'KAE', 'Date', 'Ex-VAT', 'VAT 15%', 'Inc-VAT', 'Collection %', 'Status', 'Remarks', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-blue-700">{row.poNumber}</td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.customerName}</td>
                  <td className="px-3 py-2.5 max-w-[140px] truncate text-slate-600">{row.projectName}</td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs">{row.kaeName || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{new Date(row.poDate).toLocaleDateString('en-GB')}</td>
                  <td className="px-3 py-2.5 text-right">{Number(row.poAmountExVat).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2.5 text-right text-orange-700">{Number(row.vat15).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{Number(row.totalValueIncVat).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2.5 text-center">{Number(row.paymentCollectionPct).toFixed(1)}%</td>
                  <td className="px-3 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[row.paymentStatus] || ''}`}>{row.paymentStatus}</span></td>
                  <td className="px-3 py-2.5 max-w-[120px] truncate text-slate-500 text-xs">{row.remarks || '—'}</td>
                  <td className="px-3 py-2.5">
                    {canWrite(user.role, 'poTracker') && (
                      <button onClick={() => { setEditRow(row); setForm({ customerName: row.customerName, projectName: row.projectName, kaeName: row.kaeName || '', qtRef: row.qtRef || '', poNumber: row.poNumber, poDate: row.poDate.split('T')[0], poAmountExVat: String(row.poAmountExVat), paymentTermsSplit: row.paymentTermsSplit || '', remarks: row.remarks || '' }); setShowForm(true) }} className="text-slate-400 hover:text-blue-600"><Pencil size={14} /></button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">{editRow ? 'Edit PO' : 'New PO'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'PO Number', key: 'poNumber' }, { label: 'Customer', key: 'customerName' },
                { label: 'Project', key: 'projectName' }, { label: 'KAE', key: 'kaeName' },
                { label: 'QT Ref', key: 'qtRef' }, { label: 'PO Date', key: 'poDate', type: 'date' },
                { label: 'Amount Ex-VAT', key: 'poAmountExVat', type: 'number' },
                { label: 'Payment Terms', key: 'paymentTermsSplit' },
              ].map(({ label, key, type = 'text' }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-600">{label}</label>
                  <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-600">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2}
                  className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="btn-outline text-sm">Cancel</button>
              <button onClick={handleSave} className="btn-primary text-sm flex items-center gap-1.5"><Check size={14} /> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
