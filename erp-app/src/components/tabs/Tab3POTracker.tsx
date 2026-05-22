'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, POTracker } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, ShoppingCart, Pencil, X, Check, BarChart2, Percent, Trash2, CalendarDays } from 'lucide-react'

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

  type MilestoneRow = { id?: string; phaseName: string; amountSar: string; dueDate: string; status: string; paidAt?: string; _deleted?: boolean }
  const [linkedPaymentId, setLinkedPaymentId]   = useState<string | null>(null)
  const [editMilestones,  setEditMilestones]    = useState<MilestoneRow[]>([])
  const [milestoneLoading, setMilestoneLoading] = useState(false)

  const addMilestone = () => setEditMilestones(ms => [...ms, { phaseName: '', amountSar: '', dueDate: '', status: 'Pending' }])
  const removeMilestone = (i: number) => setEditMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, _deleted: true } : m))
  const updateMilestone = (i: number, field: string, value: string) =>
    setEditMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: value } : m))

  const poValueNum     = parseFloat(form.poAmountExVat || '0') * 1.15  // inc-VAT
  const msTotal        = editMilestones.filter(m => !m._deleted).reduce((s, m) => s + (parseFloat(m.amountSar) || 0), 0)
  const msBalance      = poValueNum - msTotal

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
    // 1. Save PO fields
    const method = editRow ? 'PATCH' : 'POST'
    const body   = editRow ? { id: editRow.id, ...form } : form
    await fetch('/api/po-tracker', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    // 2. Save milestones via payments API
    const valid    = editMilestones.filter(m => !m._deleted && m.phaseName && m.amountSar && m.dueDate)
    const existing = editMilestones.filter(m => m.id && !m._deleted)
    const deleted  = editMilestones.filter(m => m.id  && m._deleted).map(m => m.id as string)
    const created  = editMilestones.filter(m => !m.id && !m._deleted && m.phaseName && m.amountSar && m.dueDate)

    if (linkedPaymentId) {
      // Update existing payment record
      await fetch('/api/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: linkedPaymentId, milestoneUpdates: existing, newMilestones: created, deleteMilestoneIds: deleted }),
      })
    } else if (valid.length > 0) {
      // No payment record yet — create one
      await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber:     form.poNumber || editRow?.poNumber,
          customerName: form.customerName,
          poValue:      parseFloat(form.poAmountExVat || '0') * 1.15,
          milestones:   valid.map(m => ({ phaseName: m.phaseName, amountSar: parseFloat(m.amountSar), dueDate: new Date(m.dueDate).toISOString(), status: m.status })),
        }),
      })
    }

    setShowForm(false); setEditRow(null); setLinkedPaymentId(null); setEditMilestones([]); load()
  }

  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'poTracker', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }

  const openEdit = async (row: POTracker) => {
    setEditRow(row)
    setForm({ customerName: row.customerName, projectName: row.projectName, kaeName: row.kaeName || '', qtRef: row.qtRef || '', poNumber: row.poNumber, poDate: row.poDate.split('T')[0], poAmountExVat: String(row.poAmountExVat), paymentTermsSplit: row.paymentTermsSplit || '', remarks: row.remarks || '' })
    setEditMilestones([])
    setLinkedPaymentId(null)
    setShowForm(true)

    // Fetch linked payment milestones
    setMilestoneLoading(true)
    try {
      const res  = await fetch(`/api/payments?poNumber=${encodeURIComponent(row.poNumber)}`)
      const data = await res.json()
      const payments = Array.isArray(data) ? data : []
      if (payments.length > 0) {
        const pmt = payments[0]
        setLinkedPaymentId(pmt.id)
        setEditMilestones((pmt.milestones ?? []).map((m: { id: string; phaseName: string; amountSar: number; dueDate: string; status: string; paidAt?: string }) => ({
          id: m.id, phaseName: m.phaseName, amountSar: String(m.amountSar),
          dueDate: m.dueDate ? m.dueDate.slice(0, 10) : '',
          status: m.status, paidAt: m.paidAt,
        })))
      }
    } finally { setMilestoneLoading(false) }
  }

  const openNew = () => {
    setEditRow(null); setLinkedPaymentId(null); setEditMilestones([])
    setForm({ customerName: '', projectName: '', kaeName: '', qtRef: '', poNumber: '', poDate: '', poAmountExVat: '', paymentTermsSplit: '', remarks: '' })
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
            <button onClick={openNew} className="btn-primary">
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
              <tr>
                <th>PO Number</th><th>Customer</th><th>Project</th><th>KAE</th><th>Date</th>
                <th className="text-right">Ex-VAT</th><th className="text-right">VAT 15%</th><th className="text-right">Inc-VAT</th>
                <th>Collection</th><th>Status</th><th>Remarks</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const s = STATUS_STYLES[row.paymentStatus] || STATUS_STYLES.Pending
                const collPct = Number(row.paymentCollectionPct)
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs font-bold" style={{ color: '#7c3aed', minWidth: 140 }}>{row.poNumber}</td>
                    <td className="font-semibold text-slate-800" style={{ minWidth: 130 }}>{row.customerName}</td>
                    <td className="text-slate-500 text-xs" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.projectName}</td>
                    <td className="text-slate-500 text-xs" style={{ minWidth: 90 }}>{row.kaeName || '—'}</td>
                    <td className="text-slate-500 text-xs" style={{ minWidth: 88 }}>{new Date(row.poDate).toLocaleDateString('en-GB')}</td>
                    <td className="text-right text-slate-700 font-medium" style={{ minWidth: 110 }}>{Number(row.poAmountExVat).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                    <td className="text-right text-xs" style={{ color: '#ea580c', minWidth: 90 }}>{Number(row.vat15).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                    <td className="text-right font-semibold text-slate-800" style={{ minWidth: 110 }}>{Number(row.totalValueIncVat).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</td>
                    <td style={{ minWidth: 110 }}>
                      <div className="flex items-center gap-1.5">
                        <div className="progress-bar" style={{ flex: 1, minWidth: 48 }}>
                          <div className="progress-bar-fill" style={{ width: `${collPct}%`, background: collPct >= 100 ? '#16a34a' : collPct >= 50 ? '#2563eb' : '#ea580c' }} />
                        </div>
                        <span className="text-xs text-slate-500">{collPct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full border inline-block"
                        style={{ background: s.bg, color: s.text, borderColor: s.border }}>{row.paymentStatus}</span>
                    </td>
                    <td className="text-slate-400 text-xs" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remarks || '—'}</td>
                    <td style={{ minWidth: 36 }}>
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
          <div className="modal-box flex flex-col" style={{ maxWidth: 600, maxHeight: '92vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{editRow ? 'Edit PO' : 'New PO'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editRow ? `Editing ${editRow.poNumber}` : 'Enter purchase order details'}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">

              {/* PO Details */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">PO Details</p>
                <div className="grid grid-cols-2 gap-3">
                  {fields.map(({ label, key, type = 'text' }) => (
                    <div key={key} className={key === 'paymentTermsSplit' ? 'col-span-2' : ''}>
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
              </div>

              {/* Payment Milestones */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    Payment Milestones
                    {milestoneLoading && <span className="text-blue-400 font-normal normal-case">Loading…</span>}
                    {!milestoneLoading && linkedPaymentId && <span className="text-green-500 font-normal normal-case">Linked to payment</span>}
                    {!milestoneLoading && !linkedPaymentId && editRow && <span className="text-slate-400 font-normal normal-case">No payment record yet</span>}
                  </p>
                  <button onClick={addMilestone}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                    <Plus size={11} /> Add Milestone
                  </button>
                </div>

                {editMilestones.filter(m => !m._deleted).length === 0 ? (
                  <button onClick={addMilestone}
                    className="w-full py-5 rounded-xl text-xs text-slate-400 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:text-blue-400 transition-all flex flex-col items-center gap-1.5">
                    <CalendarDays size={18} />
                    Add payment milestones (Mobilisation, Delivery, Commissioning…)
                  </button>
                ) : (
                  <div className="space-y-2">
                    {editMilestones.map((m, i) => m._deleted ? null : (
                      <div key={i} className="rounded-lg p-3 space-y-2" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${m.id ? 'bg-blue-400' : 'bg-green-400'}`} />
                            {m.id ? 'Existing' : 'New'} milestone
                          </span>
                          <button onClick={() => removeMilestone(i)} className="text-slate-300 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="form-label">Phase Name</label>
                            <input value={m.phaseName} onChange={e => updateMilestone(i, 'phaseName', e.target.value)} className="form-input" placeholder="e.g. Mobilisation" />
                          </div>
                          <div>
                            <label className="form-label">Amount (SAR)</label>
                            <input type="number" value={m.amountSar} onChange={e => updateMilestone(i, 'amountSar', e.target.value)} className="form-input" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="form-label">Due Date</label>
                            <input type="date" value={m.dueDate} onChange={e => updateMilestone(i, 'dueDate', e.target.value)} className="form-input" />
                          </div>
                          <div>
                            <label className="form-label">Status</label>
                            <select value={m.status} onChange={e => updateMilestone(i, 'status', e.target.value)} className="form-input">
                              <option>Pending</option>
                              <option>Paid</option>
                              <option>Overdue</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Balance indicator */}
                {editMilestones.filter(m => !m._deleted).length > 0 && poValueNum > 0 && (
                  <div className="flex items-center justify-between text-xs px-1 pt-1">
                    <span className="text-slate-400">PO Inc-VAT: SAR {poValueNum.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                    <span className="text-slate-400">Milestones: SAR {msTotal.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                    <span className="font-semibold" style={{ color: msBalance === 0 ? '#16a34a' : msBalance < 0 ? '#dc2626' : '#d97706' }}>
                      {msBalance === 0 ? '✓ Balanced' : msBalance > 0 ? `SAR ${msBalance.toLocaleString('en-SA', { maximumFractionDigits: 0 })} remaining` : `SAR ${Math.abs(msBalance).toLocaleString('en-SA', { maximumFractionDigits: 0 })} over`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 shrink-0" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              <button onClick={handleSave} className="btn-primary"><Check size={14} /> Save PO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
