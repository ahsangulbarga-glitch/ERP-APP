'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Payment } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, CreditCard, ChevronDown, ChevronUp, X, Check, AlertTriangle, DollarSign, Activity } from 'lucide-react'

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
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ poNumber: '', customerName: '', poValue: '', remarks: '' })

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
    await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setShowForm(false); load()
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
            <button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={14} /> New Payment</button>
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
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
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
                    <div className="shrink-0 text-slate-400">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </button>

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

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-800 text-base">New Payment Record</h3>
                <p className="text-xs text-slate-400 mt-0.5">Link a payment to a PO</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'PO Number', key: 'poNumber' },
                { label: 'Customer Name', key: 'customerName' },
                { label: 'PO Value (SAR)', key: 'poValue', type: 'number' },
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
              <button onClick={handleSave} className="btn-primary"><Check size={14} /> Save Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
