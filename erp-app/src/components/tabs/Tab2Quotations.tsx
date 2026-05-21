'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Quotation, QuotationStatus } from '@/types'
import { canWrite, canBulkImport } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, Upload, FileText, Pencil, Check, X, DollarSign, TrendingUp, TrendingDown, PauseCircle } from 'lucide-react'

const STATUS_STYLES: Record<QuotationStatus, { bg: string; text: string; border: string }> = {
  Open:      { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  Lost:      { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  Converted: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  OnHold:    { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
}

export default function Tab2Quotations({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', kaeId: '', customer: '', qtRef: '', status: '' })
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<Quotation | null>(null)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    qtRef: '', qtnDate: '', customerName: '', projectName: '', amountSar: '',
    status: 'Open', kaeAssignedId: '', clientContactName: '', clientContactDetails: '', remarks: '', poNumber: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await fetch(`/api/quotations?${params}`)
      const text = await res.text()
      if (!text) { setRows([]); return }
      const data = JSON.parse(text)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to load quotations:', e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const kpis = [
    { label: 'Total Quoted', value: `SAR ${rows.reduce((s, r) => s + Number(r.amountSar), 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'blue' as const, icon: <DollarSign size={16} /> },
    { label: 'Open Quotes', value: rows.filter(r => r.status === 'Open').length, color: 'cyan' as const, icon: <TrendingUp size={16} /> },
    { label: 'Converted', value: rows.filter(r => r.status === 'Converted').length, color: 'green' as const, icon: <Check size={16} /> },
    { label: 'Lost Value', value: `SAR ${rows.filter(r => r.status === 'Lost').reduce((s, r) => s + Number(r.amountSar), 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'red' as const, icon: <TrendingDown size={16} /> },
  ]

  const resetForm = () => setForm({ qtRef: '', qtnDate: '', customerName: '', projectName: '', amountSar: '', status: 'Open', kaeAssignedId: '', clientContactName: '', clientContactDetails: '', remarks: '', poNumber: '' })

  const handleSave = async () => {
    setFormError('')
    const method = editRow ? 'PATCH' : 'POST'
    const body = editRow ? { id: editRow.id, ...form } : form
    const res = await fetch('/api/quotations', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Save failed' }))
      setFormError(err.error || 'Save failed'); return
    }
    setShowForm(false); setEditRow(null); setFormError(''); load()
  }

  const handleStatusChange = async (id: string, status: string) => {
    await fetch('/api/quotations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    load()
  }

  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'quotations', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('tab', 'quotations')
    await fetch('/api/import', { method: 'POST', body: fd }); load()
  }

  const openEdit = (row: Quotation) => {
    setEditRow(row); setFormError('')
    setForm({ qtRef: row.qtRef, qtnDate: row.qtnDate.split('T')[0], customerName: row.customerName, projectName: row.projectName, amountSar: String(row.amountSar), status: row.status, kaeAssignedId: row.kaeAssignedId || '', clientContactName: row.clientContactName || '', clientContactDetails: row.clientContactDetails || '', remarks: row.remarks || '', poNumber: row.poNumber || '' })
    setShowForm(true)
  }

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      {/* Filters */}
      <div className="filter-bar">
        <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="input-sm" />
        <span className="text-slate-400 text-xs">to</span>
        <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="input-sm" />
        <input type="text" placeholder="Customer…" value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="input-sm w-36" />
        <input type="text" placeholder="QT Ref…" value={filters.qtRef} onChange={e => setFilters(f => ({ ...f, qtRef: e.target.value }))} className="input-sm w-32" />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="input-sm">
          <option value="">All Status</option>
          <option>Open</option><option>Lost</option><option>Converted</option><option>OnHold</option>
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ dateFrom: '', dateTo: '', kaeId: '', customer: '', qtRef: '', status: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Action Bar */}
      <div className="section-header">
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite(user.role, 'quotations') && (
            <button onClick={() => { setShowForm(true); setEditRow(null); setFormError(''); resetForm() }} className="btn-primary">
              <Plus size={14} /> New Quote
            </button>
          )}
          <button onClick={handleExport} className="btn-outline">
            <Download size={14} /> Export
          </button>
          {canBulkImport(user.role, 'quotations') && (
            <label className="btn-outline cursor-pointer">
              <Upload size={14} /> Import
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>
        <span className="text-xs text-slate-400">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <FileText size={36} className="opacity-20" />
            <p className="text-sm font-medium">No quotations found</p>
            <p className="text-xs">Try adjusting your filters</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {['QT Ref', 'Date', 'Customer', 'Project', 'Amount (SAR)', 'Status', 'KAE', 'Contact', 'PO No.', 'Remarks', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const s = STATUS_STYLES[row.status]
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs font-semibold" style={{ color: '#2563eb' }}>{row.qtRef}</td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{new Date(row.qtnDate).toLocaleDateString('en-GB')}</td>
                    <td className="font-medium text-slate-800 whitespace-nowrap">{row.customerName}</td>
                    <td className="text-slate-500 text-xs max-w-[140px] truncate">{row.projectName}</td>
                    <td className="text-right font-semibold text-slate-800 whitespace-nowrap">
                      {Number(row.amountSar).toLocaleString('en-SA', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      {canWrite(user.role, 'quotations') ? (
                        <select value={row.status} onChange={e => handleStatusChange(row.id, e.target.value)}
                          className="text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer outline-none transition-colors"
                          style={{ background: s.bg, color: s.text, borderColor: s.border }}>
                          <option value="Open">Open</option>
                          <option value="Lost">Lost</option>
                          <option value="Converted">Converted</option>
                          <option value="OnHold">On Hold</option>
                        </select>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full border inline-block"
                          style={{ background: s.bg, color: s.text, borderColor: s.border }}>{row.status}</span>
                      )}
                    </td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{row.kaeAssigned?.name || '—'}</td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{row.clientContactName || '—'}</td>
                    <td className="text-slate-500 text-xs font-mono whitespace-nowrap">{row.poNumber || '—'}</td>
                    <td className="text-slate-400 text-xs max-w-[120px] truncate">{row.remarks || '—'}</td>
                    <td>
                      {canWrite(user.role, 'quotations') && (
                        <button onClick={() => openEdit(row)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
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

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{editRow ? 'Edit Quotation' : 'New Quotation'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editRow ? `Editing ${editRow.qtRef}` : 'Fill in the details below'}</p>
              </div>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-2"
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                <X size={14} /> {formError}
              </div>
            )}

            <div className="space-y-3">
              {/* QT Ref */}
              <div>
                <label className="form-label">QT Reference <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. QTN-00016-REV0" value={form.qtRef}
                  onChange={e => setForm(f => ({ ...f, qtRef: e.target.value.toUpperCase() }))}
                  disabled={!!editRow}
                  className="form-input font-mono"
                  style={editRow ? { background: '#f8fafc', color: '#94a3b8' } : {}} />
                {!editRow && <p className="text-xs text-slate-400 mt-1">Enter reference exactly as issued</p>}
              </div>

              {/* Two column grid for common fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Date</label>
                  <input type="date" value={form.qtnDate} onChange={e => setForm(f => ({ ...f, qtnDate: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Amount (SAR)</label>
                  <input type="number" value={form.amountSar} onChange={e => setForm(f => ({ ...f, amountSar: e.target.value }))} className="form-input" placeholder="0.00" />
                </div>
              </div>

              <div>
                <label className="form-label">Customer Name</label>
                <input type="text" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className="form-input" />
              </div>
              <div>
                <label className="form-label">Project Name</label>
                <input type="text" value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} className="form-input" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                    <option>Open</option><option>Lost</option><option>Converted</option><option>OnHold</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">PO Number</label>
                  <input type="text" value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))} className="form-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Contact Name</label>
                  <input type="text" value={form.clientContactName} onChange={e => setForm(f => ({ ...f, clientContactName: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Contact Details</label>
                  <input type="text" value={form.clientContactDetails} onChange={e => setForm(f => ({ ...f, clientContactDetails: e.target.value }))} className="form-input" />
                </div>
              </div>

              <div>
                <label className="form-label">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              <button onClick={handleSave} className="btn-primary"><Check size={14} /> Save Quotation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
