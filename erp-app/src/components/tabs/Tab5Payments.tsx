'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Payment } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, CreditCard, ChevronDown, ChevronUp, X, Check, AlertTriangle, DollarSign, Activity, Trash2, CalendarDays, Pencil, Link2 } from 'lucide-react'
import DealChainModal from '@/components/shared/DealChainModal'

const MILESTONE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Pending: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  Paid:    { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  Overdue: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
}

export default function Tab5Payments({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [filters, setFilters] = useState({ poNumber: '', customer: '', kaeId: '', milestoneStatus: '' })
  const [chainSeed, setChainSeed] = useState<{ poNumber?: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ poNumber: '', customerName: '', poValue: '', remarks: '' })
  const [milestones, setMilestones] = useState<{ phaseName: string; amountSar: string; dueDate: string; status: string }[]>([])

  const addMilestone = () => setMilestones(ms => [...ms, { phaseName: '', amountSar: '', dueDate: '', status: 'Pending' }])
  const removeMilestone = (i: number) => setMilestones(ms => ms.filter((_, idx) => idx !== i))
  const updateMilestone = (i: number, field: string, value: string) =>
    setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: value } : m))

  const milestoneTotalSar = milestones.reduce((s, m) => s + (parseFloat(m.amountSar) || 0), 0)
  const poValueNum = parseFloat(form.poValue) || 0
  const milestoneBalance = poValueNum - milestoneTotalSar

  // ── Edit modal state ──
  type EditMilestone = { id?: string; phaseName: string; amountSar: string; dueDate: string; status: string; paidAt?: string; _deleted?: boolean }
  const [editTarget, setEditTarget]     = useState<Payment | null>(null)
  const [editForm,   setEditForm]       = useState({ poNumber: '', customerName: '', poValue: '', remarks: '' })
  const [editMilestones, setEditMilestones] = useState<EditMilestone[]>([])

  const openEdit = (row: Payment) => {
    setEditTarget(row)
    setEditForm({ poNumber: row.poNumber, customerName: row.customerName, poValue: String(row.poValue), remarks: row.remarks ?? '' })
    setEditMilestones(row.milestones.map(m => ({
      id: m.id, phaseName: m.phaseName, amountSar: String(m.amountSar),
      dueDate: m.dueDate ? m.dueDate.slice(0, 10) : '',
      status: m.status, paidAt: m.paidAt,
    })))
  }

  const addEditMilestone = () => setEditMilestones(ms => [...ms, { phaseName: '', amountSar: '', dueDate: '', status: 'Pending' }])
  const removeEditMilestone = (i: number) => setEditMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, _deleted: true } : m))
  const updateEditMilestone = (i: number, field: string, value: string) =>
    setEditMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: value } : m))

  const handleEditSave = async () => {
    if (!editTarget) return
    const existing  = editMilestones.filter(m => m.id && !m._deleted)
    const deleted   = editMilestones.filter(m => m.id && m._deleted).map(m => m.id as string)
    const created   = editMilestones.filter(m => !m.id && !m._deleted && m.phaseName && m.amountSar && m.dueDate)
    await fetch('/api/payments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editTarget.id,
        ...editForm,
        milestoneUpdates:   existing,
        newMilestones:      created,
        deleteMilestoneIds: deleted,
      }),
    })
    setEditTarget(null)
    load()
  }

  const editPoValueNum      = parseFloat(editForm.poValue) || 0
  const editMilestoneTotalSar = editMilestones.filter(m => !m._deleted).reduce((s, m) => s + (parseFloat(m.amountSar) || 0), 0)
  const editMilestoneBalance  = editPoValueNum - editMilestoneTotalSar

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await fetch(`/api/payments?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.poValue) * (1 - Number(r.collectionPct) / 100), 0)
  const totalCollected   = rows.reduce((s, r) => s + Number(r.poValue) * (Number(r.collectionPct) / 100), 0)
  const overdueCount     = rows.flatMap(r => r.milestones).filter(m => m.status === 'Overdue').length

  const kpis = [
    { label: 'AR Outstanding', value: `SAR ${totalOutstanding.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'red' as const, icon: <AlertTriangle size={16} /> },
    { label: 'Total Collected', value: `SAR ${totalCollected.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'green' as const, icon: <DollarSign size={16} /> },
    { label: 'Overdue Milestones', value: overdueCount, color: overdueCount > 0 ? 'red' as const : 'blue' as const, icon: <Activity size={16} /> },
  ]

  const handleMilestoneUpdate = async (paymentId: string, milestoneId: string, status: string) => {
    await fetch('/api/payments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: paymentId, milestoneId, milestoneStatus: status }) })
    load()
  }

  const handleSave = async () => {
    const validMilestones = milestones.filter(m => m.phaseName && m.amountSar && m.dueDate)
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        milestones: validMilestones.length > 0 ? validMilestones.map(m => ({ phaseName: m.phaseName, amountSar: parseFloat(m.amountSar), dueDate: new Date(m.dueDate).toISOString(), status: m.status })) : undefined,
      }),
    })
    setShowForm(false)
    setForm({ poNumber: '', customerName: '', poValue: '', remarks: '' })
    setMilestones([])
    load()
  }

  const openForm = () => {
    setForm({ poNumber: '', customerName: '', poValue: '', remarks: '' })
    setMilestones([])
    setShowForm(true)
  }

  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'payments', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      <div className="filter-bar">
        <input type="text" placeholder="PO Number…" value={filters.poNumber} onChange={e => setFilters(f => ({ ...f, poNumber: e.target.value }))} className="input-sm w-32" />
        <input type="text" placeholder="Customer…" value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="input-sm w-36" />
        <select value={filters.milestoneStatus} onChange={e => setFilters(f => ({ ...f, milestoneStatus: e.target.value }))} className="input-sm">
          <option value="">All Milestones</option>
          <option>Paid</option><option>Overdue</option><option>Pending</option>
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ poNumber: '', customer: '', kaeId: '', milestoneStatus: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      <div className="section-header">
        <div className="flex gap-2">
          {canWrite(user.role, 'payments') && (
            <button onClick={openForm} className="btn-primary"><Plus size={14} /> New Payment</button>
          )}
          <button onClick={handleExport} className="btn-outline"><Download size={14} /> Export</button>
        </div>
        <span className="text-xs text-slate-400">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><CreditCard size={36} className="opacity-20" /><p className="text-sm font-medium">No payment records</p></div>
        ) : (
          <div className="p-3 space-y-2">
            {rows.map(row => {
              const isExpanded = expandedRow === row.id
              const hasOverdue = row.milestones.some(m => m.status === 'Overdue')
              const collPct = Math.min(Number(row.collectionPct), 100)

              return (
                <div key={row.id} className="rounded-xl overflow-hidden transition-all"
                  style={{
                    background: '#fff',
                    border: `1px solid ${hasOverdue ? '#fecaca' : '#e2e8f0'}`,
                    boxShadow: hasOverdue ? '0 0 0 1px #fecaca, 0 2px 8px rgba(239,68,68,0.08)' : '0 1px 4px rgba(0,0,0,0.05)',
                  }}>
                  {/* Header row */}
                  <div className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : row.id)}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: hasOverdue ? '#fef2f2' : '#f0fdf4' }}>
                      <CreditCard size={16} style={{ color: hasOverdue ? '#dc2626' : '#16a34a' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold" style={{ color: '#7c3aed' }}>{row.poNumber}</span>
                        <span className="font-semibold text-sm text-slate-800">{row.customerName}</span>
                        {hasOverdue && (
                          <span className="chip" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                            ⚠ OVERDUE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-slate-500">SAR {Number(row.poValue).toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                        <div className="flex items-center gap-1.5 flex-1 max-w-[160px]">
                          <div className="progress-bar flex-1">
                            <div className="progress-bar-fill"
                              style={{ width: `${collPct}%`, background: collPct >= 100 ? '#16a34a' : collPct >= 50 ? '#2563eb' : '#ea580c' }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{collPct.toFixed(1)}%</span>
                        </div>
                        <span className="text-xs text-slate-400">{row.milestones.length} milestones</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={e => { e.stopPropagation(); setChainSeed({ poNumber: row.poNumber }) }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-all" title="View deal chain">
                        <Link2 size={13} />
                      </button>
                      {canWrite(user.role, 'payments') && (
                        <button onClick={e => { e.stopPropagation(); openEdit(row) }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                          <Pencil size={13} />
                        </button>
                      )}
                      <span className="text-slate-400">{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                    </div>
                  </div>

                  {/* Milestones */}
                  {isExpanded && row.milestones.length > 0 && (
                    <div className="border-t border-slate-100 px-4 py-3" style={{ background: '#fafbfc' }}>
                      <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Payment Milestones</p>
                      <div className="space-y-2">
                        {row.milestones.map(m => {
                          const ms = MILESTONE_STYLES[m.status] || MILESTONE_STYLES.Pending
                          return (
                            <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg"
                              style={{ background: ms.bg, border: `1px solid ${ms.border}` }}>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-xs" style={{ color: ms.text }}>{m.phaseName}</p>
                                <p className="text-xs mt-0.5" style={{ color: ms.text, opacity: 0.7 }}>
                                  Due: {new Date(m.dueDate).toLocaleDateString('en-GB')} ·{' '}
                                  SAR {Number(m.amountSar).toLocaleString('en-SA', { maximumFractionDigits: 0 })}
                                </p>
                              </div>
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full border"
                                style={{ background: '#fff', color: ms.text, borderColor: ms.border }}>
                                {m.status}
                              </span>
                              {canWrite(user.role, 'payments') && m.status !== 'Paid' && (
                                <button onClick={() => handleMilestoneUpdate(row.id, m.id, 'Paid')}
                                  className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                                  style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#15803d'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.color = '#15803d' }}>
                                  ✓ Mark Paid
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {chainSeed && <DealChainModal seed={chainSeed} onClose={() => setChainSeed(null)} onMilestonePaid={load} />}

      {/* ── Edit Payment Modal ── */}
      {editTarget && (
        <div className="modal-overlay">
          <div className="modal-box flex flex-col" style={{ maxWidth: 580, maxHeight: '92vh' }}>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Edit Payment Record</h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{editTarget.poNumber}</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {/* PO Details */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">PO Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">PO Number</label>
                    <input value={editForm.poNumber} onChange={e => setEditForm(f => ({ ...f, poNumber: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">PO Value (SAR)</label>
                    <input type="number" value={editForm.poValue} onChange={e => setEditForm(f => ({ ...f, poValue: e.target.value }))} className="form-input" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Customer Name</label>
                  <input value={editForm.customerName} onChange={e => setEditForm(f => ({ ...f, customerName: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Remarks</label>
                  <textarea value={editForm.remarks} onChange={e => setEditForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" />
                </div>
              </div>

              {/* Milestones */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Payment Milestones
                    <span className="ml-2 normal-case font-normal text-slate-400">
                      ({editMilestones.filter(m => !m._deleted).length} active)
                    </span>
                  </p>
                  <button onClick={addEditMilestone}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                    <Plus size={11} /> Add Milestone
                  </button>
                </div>

                {editMilestones.filter(m => !m._deleted).length === 0 ? (
                  <button onClick={addEditMilestone}
                    className="w-full py-5 rounded-xl text-xs text-slate-400 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:text-blue-400 transition-all flex flex-col items-center gap-1.5">
                    <CalendarDays size={18} />
                    No milestones — click to add
                  </button>
                ) : (
                  <div className="space-y-2">
                    {editMilestones.map((m, i) => m._deleted ? null : (
                      <div key={i} className="rounded-lg p-3 space-y-2" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                            {m.id ? <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" /> : <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
                            {m.id ? 'Existing' : 'New'} milestone
                          </span>
                          <button onClick={() => removeEditMilestone(i)} className="text-slate-300 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="form-label">Phase Name</label>
                            <input value={m.phaseName} onChange={e => updateEditMilestone(i, 'phaseName', e.target.value)} className="form-input" placeholder="e.g. Mobilisation" />
                          </div>
                          <div>
                            <label className="form-label">Amount (SAR)</label>
                            <input type="number" value={m.amountSar} onChange={e => updateEditMilestone(i, 'amountSar', e.target.value)} className="form-input" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="form-label">Due Date</label>
                            <input type="date" value={m.dueDate} onChange={e => updateEditMilestone(i, 'dueDate', e.target.value)} className="form-input" />
                          </div>
                          <div>
                            <label className="form-label">Status</label>
                            <select value={m.status} onChange={e => updateEditMilestone(i, 'status', e.target.value)} className="form-input">
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
                {editMilestones.filter(m => !m._deleted).length > 0 && editPoValueNum > 0 && (
                  <div className="flex items-center justify-between text-xs px-1 pt-1">
                    <span className="text-slate-400">PO Value: SAR {editPoValueNum.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                    <span className="text-slate-400">Milestones: SAR {editMilestoneTotalSar.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                    <span className="font-semibold" style={{ color: editMilestoneBalance === 0 ? '#16a34a' : editMilestoneBalance < 0 ? '#dc2626' : '#d97706' }}>
                      {editMilestoneBalance === 0 ? '✓ Balanced' : editMilestoneBalance > 0 ? `SAR ${editMilestoneBalance.toLocaleString('en-SA', { maximumFractionDigits: 0 })} remaining` : `SAR ${Math.abs(editMilestoneBalance).toLocaleString('en-SA', { maximumFractionDigits: 0 })} over`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 shrink-0" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setEditTarget(null)} className="btn-outline">Cancel</button>
              <button onClick={handleEditSave} className="btn-primary"><Check size={14} /> Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box flex flex-col" style={{ maxWidth: 560, maxHeight: '90vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-base">New Payment Record</h3>
                <p className="text-xs text-slate-400 mt-0.5">Link a PO and define payment milestones</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 space-y-4 pr-1">

              {/* PO Details */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">PO Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">PO Number</label>
                    <input value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))} className="form-input" placeholder="e.g. PO-ARC-2025-001" />
                  </div>
                  <div>
                    <label className="form-label">PO Value (SAR)</label>
                    <input type="number" value={form.poValue} onChange={e => setForm(f => ({ ...f, poValue: e.target.value }))} className="form-input" placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Customer Name</label>
                  <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className="form-input" placeholder="e.g. Saudi Aramco" />
                </div>
                <div>
                  <label className="form-label">Remarks</label>
                  <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" placeholder="Optional notes…" />
                </div>
              </div>

              {/* Milestones */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Milestones</p>
                  <button onClick={addMilestone}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                    <Plus size={11} /> Add Milestone
                  </button>
                </div>

                {milestones.length === 0 ? (
                  <button onClick={addMilestone}
                    className="w-full py-6 rounded-xl text-xs text-slate-400 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:text-blue-400 transition-all flex flex-col items-center gap-1.5">
                    <CalendarDays size={20} />
                    Click to add payment milestones (Mobilisation, Delivery, etc.)
                  </button>
                ) : (
                  <div className="space-y-2">
                    {milestones.map((m, i) => (
                      <div key={i} className="rounded-lg p-3 space-y-2" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500">Milestone {i + 1}</span>
                          <button onClick={() => removeMilestone(i)} className="text-slate-300 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="form-label">Phase Name</label>
                            <input value={m.phaseName} onChange={e => updateMilestone(i, 'phaseName', e.target.value)}
                              className="form-input" placeholder="e.g. Mobilisation" />
                          </div>
                          <div>
                            <label className="form-label">Amount (SAR)</label>
                            <input type="number" value={m.amountSar} onChange={e => updateMilestone(i, 'amountSar', e.target.value)}
                              className="form-input" placeholder="0" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="form-label">Due Date</label>
                            <input type="date" value={m.dueDate} onChange={e => updateMilestone(i, 'dueDate', e.target.value)}
                              className="form-input" />
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
                {milestones.length > 0 && poValueNum > 0 && (
                  <div className="flex items-center justify-between text-xs px-1 pt-1">
                    <span className="text-slate-400">PO Value: SAR {poValueNum.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                    <span className="text-slate-400">Milestones: SAR {milestoneTotalSar.toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                    <span className="font-semibold" style={{ color: milestoneBalance === 0 ? '#16a34a' : milestoneBalance < 0 ? '#dc2626' : '#d97706' }}>
                      {milestoneBalance === 0 ? '✓ Balanced' : milestoneBalance > 0 ? `SAR ${milestoneBalance.toLocaleString('en-SA', { maximumFractionDigits: 0 })} remaining` : `SAR ${Math.abs(milestoneBalance).toLocaleString('en-SA', { maximumFractionDigits: 0 })} over`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 mt-4 pt-4 shrink-0" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              <button onClick={handleSave} disabled={!form.poNumber || !form.customerName || !form.poValue}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                <Check size={14} /> Save Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
