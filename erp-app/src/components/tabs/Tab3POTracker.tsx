'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, POTracker } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, ShoppingCart, Pencil, X, Check, BarChart2, Percent } from 'lucide-react'

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Pending:       { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  Paid:          { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  Overdue:       { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  PartiallyPaid: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
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
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await fetch(`/api/po-tracker?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const totalExVat   = rows.reduce((s, r) => s + Number(r.poAmountExVat), 0)
  const totalVat     = rows.reduce((s, r) => s + Number(r.vat15), 0)
  const totalIncVat  = rows.reduce((s, r) => s + Number(r.totalValueIncVat), 0)
  const avgCollection = rows.length ? rows.reduce((s, r) => s + Number(r.paymentCollectionPct), 0) / rows.length : 0

  const kpis = [
    { label: 'Total Ex-VAT',   value: `SAR ${totalExVat.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`,  color: 'blue' as const,   icon: <BarChart2 size={16} /> },
    { label: 'VAT 15%',        value: `SAR ${totalVat.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`,    color: 'orange' as const, icon: <Percent size={16} /> },
    { label: 'Total Inc-VAT',  value: `SAR ${totalIncVat.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'green' as const,  icon: <BarChart2 size={16} /> },
    { label: 'Avg Collection', value: `${avgCollection.toFixed(1)}%`, color: 'purple' as const, icon: <Percent size={16} /> },
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

  const openEdit = (row: POTracker) => {
    setEditRow(row)
    setForm({ customerName: row.customerName, projectName: row.projectName, kaeName: row.kaeName || '', qtRef: row.qtRef || '', poNumber: row.poNumber, poDate: row.poDate.split('T')[0], poAmountExVat: String(row.poAmountExVat), paymentTermsSplit: row.paymentTermsSplit || '', remarks: row.remarks || '' })
    setShowForm(true)
  }

  const fields = [
    { label: 'PO Number', key: 'poNumber' }, { label: 'Customer', key: 'customerName' },
    { label: 'Project', key: 'projectName' }, { label: 'KAE', key: 'kaeName' },
    { label: 'QT Ref', key: 'qtRef' }, { label: 'PO Date', key: 'poDate', type: 'date' },
    { label: 'Amount Ex-VAT (SAR)', key: 'poAmountExVat', type: 'number' },
    { label: 'Payment Terms', key: 'paymentTermsSplit' },
  ]

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      <div className="filter-bar">
        <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="input-sm" />
        <span className="text-slate-400 text-xs">to</span>
        <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="input-sm" />
        <input type="text" placeholder="Customer…" value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="input-sm w-36" />
        <input type="text" placeholder="PO Number…" value={filters.poNumber} onChange={e => setFilters(f => ({ ...f, poNumber: e.target.value }))} className="input-sm w-32" />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="input-sm">
          <option value="">All Status</option>
          <option>Pending</option><option>Paid</option><option>Overdue</option><option>PartiallyPaid</option>
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ dateFrom: '', dateTo: '', kae: '', customer: '', poNumber: '', status: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      <div className="section-header">
        <div className="flex gap-2 flex-wrap">
          {canWrite(user.role, 'poTracker') && (
            <button onClick={() => { setShowForm(true); setEditRow(null); setForm({ customerName: '', projectName: '', kaeName: '', qtRef: '', poNumber: '', poDate: '', poAmountExVat: '', paymentTermsSplit: '', remarks: '' }) }} className="btn-primary">
              <Plus size={14} /> New PO
            </button>
          )}
          <button onClick={handleExport} className="btn-outline"><Download size={14} /> Export</button>
        </div>
        <span className="text-xs text-slate-400">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><ShoppingCart size={36} className="opacity-20" /><p className="text-sm font-medium">No PO records found</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>{['PO Number', 'Customer', 'Project', 'KAE', 'Date', 'Ex-VAT', 'VAT 15%', 'Inc-VAT', 'Collection', 'Status', 'Remarks', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const s = STATUS_STYLES[row.paymentStatus] || STATUS_STYLES.Pending
                const collPct = Number(row.paymentCollectionPct)
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs font-semibold whitespace-nowrap" style={{ color: '#7c3aed' }}>{row.poNumber}</td>
                    <td className="font-medium text-slate-800 whitespace-nowrap">{row.customerName}</td>
                    <td className="text-slate-500 text-xs max-w-[130px] truncate">{row.projectName}</td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{row.kaeName || '—'}</td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{new Date(row.poDate).toLocaleDateString('en-GB')}</td>
                    <td className="text-right text-slate-700 font-medium whitespace-nowrap">{Number(row.poAmountExVat).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                    <td className="text-right text-xs whitespace-nowrap" style={{ color: '#ea580c' }}>{Number(row.vat15).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                    <td className="text-right font-semibold text-slate-800 whitespace-nowrap">{Number(row.totalValueIncVat).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <div className="flex items-center gap-1.5 min-w-[80px]">
                        <div className="progress-bar flex-1" style={{ minWidth: 48 }}>
                          <div className="progress-bar-fill" style={{ width: `${collPct}%`, background: collPct >= 100 ? '#16a34a' : collPct >= 50 ? '#2563eb' : '#ea580c' }} />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{collPct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full border inline-block whitespace-nowrap"
                        style={{ background: s.bg, color: s.text, borderColor: s.border }}>{row.paymentStatus}</span>
                    </td>
                    <td className="text-slate-400 text-xs max-w-[100px] truncate">{row.remarks || '—'}</td>
                    <td>
                      {canWrite(user.role, 'poTracker') && (
                        <button onClick={() => openEdit(row)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-all">
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
          <div className="modal-box">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{editRow ? 'Edit PO' : 'New PO'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editRow ? `Editing ${editRow.poNumber}` : 'Enter purchase order details'}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(({ label, key, type = 'text' }) => (
                <div key={key} className={key === 'remarks' || key === 'paymentTermsSplit' ? 'col-span-2' : ''}>
                  <label className="form-label">{label}</label>
                  <input type={type} value={(form as Record<string, string>)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="form-input" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="form-label">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              <button onClick={handleSave} className="btn-primary"><Check size={14} /> Save PO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
