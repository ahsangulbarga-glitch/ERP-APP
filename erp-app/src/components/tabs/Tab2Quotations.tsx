'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Quotation, QuotationStatus } from '@/types'
import { canWrite, canBulkImport } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, Upload, FileText, Pencil, Check, X } from 'lucide-react'

const STATUS_COLORS: Record<QuotationStatus, string> = {
  Open: 'bg-blue-100 text-blue-700',
  Lost: 'bg-red-100 text-red-700',
  Converted: 'bg-green-100 text-green-700',
  OnHold: 'bg-yellow-100 text-yellow-700',
}

export default function Tab2Quotations({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', kaeId: '', customer: '', qtRef: '', status: '' })
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<Quotation | null>(null)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ qtRef: '', qtnDate: '', customerName: '', projectName: '', amountSar: '', status: 'Open', kaeAssignedId: '', clientContactName: '', clientContactDetails: '', remarks: '', poNumber: '' })

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
    { label: 'Total Quoted (SAR)', value: `SAR ${rows.reduce((s, r) => s + Number(r.amountSar), 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'blue' as const },
    { label: 'Open Quotes', value: rows.filter(r => r.status === 'Open').length, color: 'orange' as const },
    { label: 'Converted', value: rows.filter(r => r.status === 'Converted').length, color: 'green' as const },
    { label: 'Lost Value (SAR)', value: `SAR ${rows.filter(r => r.status === 'Lost').reduce((s, r) => s + Number(r.amountSar), 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'red' as const },
  ]

  const handleSave = async () => {
    setFormError('')
    const method = editRow ? 'PATCH' : 'POST'
    const body = editRow ? { id: editRow.id, ...form } : form
    const res = await fetch('/api/quotations', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Save failed' }))
      setFormError(err.error || 'Save failed')
      return
    }
    setShowForm(false); setEditRow(null); setFormError('')
    load()
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
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('tab', 'quotations')
    await fetch('/api/import', { method: 'POST', body: fd })
    load()
  }

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      {/* Filters */}
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex flex-wrap gap-2">
          <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="input-sm" placeholder="From" />
          <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="input-sm" />
          <input type="text" placeholder="Customer..." value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="input-sm" />
          <input type="text" placeholder="QT Ref..." value={filters.qtRef} onChange={e => setFilters(f => ({ ...f, qtRef: e.target.value }))} className="input-sm" />
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="input-sm">
            <option value="">All Status</option>
            <option>Open</option><option>Lost</option><option>Converted</option><option>OnHold</option>
          </select>
          <button onClick={() => setFilters({ dateFrom: '', dateTo: '', kaeId: '', customer: '', qtRef: '', status: '' })} className="text-xs text-slate-500 hover:text-red-500">Clear</button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="px-4 py-2 flex gap-2 bg-white border-b border-slate-100 flex-wrap">
        {canWrite(user.role, 'quotations') && (
          <button onClick={() => { setShowForm(true); setEditRow(null); setFormError(''); setForm({ qtRef: '', qtnDate: '', customerName: '', projectName: '', amountSar: '', status: 'Open', kaeAssignedId: '', clientContactName: '', clientContactDetails: '', remarks: '', poNumber: '' }) }} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={15} /> New Quote
          </button>
        )}
        <button onClick={handleExport} className="btn-outline flex items-center gap-1.5 text-sm">
          <Download size={15} /> Export
        </button>
        {canBulkImport(user.role, 'quotations') && (
          <label className="btn-outline flex items-center gap-1.5 text-sm cursor-pointer">
            <Upload size={15} /> Import Excel
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          </label>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <FileText size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No quotations found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
              <tr>
                {['QT Ref', 'Date', 'Customer', 'Project', 'Amount (SAR)', 'Status', 'KAE', 'Contact', 'Remarks', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-blue-700 whitespace-nowrap">{row.qtRef}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{new Date(row.qtnDate).toLocaleDateString('en-GB')}</td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.customerName}</td>
                  <td className="px-3 py-2.5 max-w-[160px] truncate text-slate-600">{row.projectName}</td>
                  <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                    {Number(row.amountSar).toLocaleString('en-SA', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2.5">
                    {canWrite(user.role, 'quotations') ? (
                      <select value={row.status} onChange={e => handleStatusChange(row.id, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[row.status]}`}>
                        <option value="Open">Open</option>
                        <option value="Lost">Lost</option>
                        <option value="Converted">Converted</option>
                        <option value="OnHold">On Hold</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[row.status]}`}>{row.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs">{row.kaeAssigned?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{row.clientContactName || '—'}</td>
                  <td className="px-3 py-2.5 max-w-[140px] truncate text-slate-500 text-xs">{row.remarks || '—'}</td>
                  <td className="px-3 py-2.5">
                    {canWrite(user.role, 'quotations') && (
                      <button onClick={() => { setEditRow(row); setFormError(''); setForm({ qtRef: row.qtRef, qtnDate: row.qtnDate.split('T')[0], customerName: row.customerName, projectName: row.projectName, amountSar: String(row.amountSar), status: row.status, kaeAssignedId: row.kaeAssignedId || '', clientContactName: row.clientContactName || '', clientContactDetails: row.clientContactDetails || '', remarks: row.remarks || '', poNumber: row.poNumber || '' }); setShowForm(true) }}
                        className="text-slate-400 hover:text-blue-600">
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">{editRow ? 'Edit Quotation' : 'New Quotation'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{formError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">QT Reference <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. QTN-00016-REV0"
                  value={form.qtRef}
                  onChange={e => setForm(f => ({ ...f, qtRef: e.target.value.toUpperCase() }))}
                  disabled={!!editRow}
                  className={`w-full mt-0.5 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${editRow ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'border-slate-200'}`}
                />
                {!editRow && <p className="text-xs text-slate-400 mt-0.5">Enter the reference number exactly as issued</p>}
              </div>
              {[
                { label: 'Date', key: 'qtnDate', type: 'date' },
                { label: 'Customer Name', key: 'customerName', type: 'text' },
                { label: 'Project Name', key: 'projectName', type: 'text' },
                { label: 'Amount (SAR)', key: 'amountSar', type: 'number' },
                { label: 'Contact Name', key: 'clientContactName', type: 'text' },
                { label: 'Contact Details', key: 'clientContactDetails', type: 'text' },
                { label: 'PO Number', key: 'poNumber', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-600">{label}</label>
                  <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-600">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>Open</option><option>Lost</option><option>Converted</option><option>OnHold</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2}
                  className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
