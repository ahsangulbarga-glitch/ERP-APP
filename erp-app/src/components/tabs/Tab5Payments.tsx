'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Payment } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, CreditCard, ChevronDown, ChevronUp, X, Check } from 'lucide-react'

const MILESTONE_COLORS: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Paid: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700 animate-pulse',
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
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
    const res = await fetch(`/api/payments?${params}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.poValue) * (1 - Number(r.collectionPct) / 100), 0)
  const totalCollected = rows.reduce((s, r) => s + Number(r.poValue) * (Number(r.collectionPct) / 100), 0)
  const overdueCount = rows.flatMap(r => r.milestones).filter(m => m.status === 'Overdue').length

  const kpis = [
    { label: 'AR Outstanding (SAR)', value: `SAR ${totalOutstanding.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'red' as const },
    { label: 'Total Collected (SAR)', value: `SAR ${totalCollected.toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'green' as const },
    { label: 'Overdue Milestones', value: overdueCount, color: overdueCount > 0 ? 'red' as const : 'blue' as const },
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

      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex flex-wrap gap-2">
          <input type="text" placeholder="PO Number..." value={filters.poNumber} onChange={e => setFilters(f => ({ ...f, poNumber: e.target.value }))} className="input-sm" />
          <input type="text" placeholder="Customer..." value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="input-sm" />
          <select value={filters.milestoneStatus} onChange={e => setFilters(f => ({ ...f, milestoneStatus: e.target.value }))} className="input-sm">
            <option value="">All Milestones</option>
            <option>Paid</option><option>Overdue</option><option>Pending</option>
          </select>
        </div>
      </div>

      <div className="px-4 py-2 flex gap-2 bg-white border-b border-slate-100">
        {canWrite(user.role, 'payments') && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm"><Plus size={15} /> New Payment</button>
        )}
        <button onClick={handleExport} className="btn-outline flex items-center gap-1.5 text-sm"><Download size={15} /> Export</button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? <div className="flex items-center justify-center h-40 text-slate-400">Loading…</div>
          : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <CreditCard size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No payment records</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map(row => {
                const hasOverdue = row.milestones.some(m => m.status === 'Overdue')
                return (
                  <div key={row.id} className={hasOverdue ? 'overdue-row' : ''}>
                    <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-blue-700">{row.poNumber}</span>
                          <span className="font-medium text-sm">{row.customerName}</span>
                          {hasOverdue && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">⚠ OVERDUE</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          <span className="text-xs text-slate-500">SAR {Number(row.poValue).toLocaleString('en-SA', { maximumFractionDigits: 0 })}</span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-24 bg-slate-100 rounded-full h-1.5">
                              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(Number(row.collectionPct), 100)}%` }} />
                            </div>
                            <span className="text-xs font-medium">{Number(row.collectionPct).toFixed(1)}% collected</span>
                          </div>
                          <span className="text-xs text-slate-400">{row.milestones.length} milestones</span>
                        </div>
                      </div>
                      {expandedRow === row.id ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                    </div>

                    {expandedRow === row.id && row.milestones.length > 0 && (
                      <div className="px-4 pb-3 bg-slate-50">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500">
                              <th className="text-left py-1.5 font-medium">Phase</th>
                              <th className="text-right py-1.5 font-medium">Amount</th>
                              <th className="text-center py-1.5 font-medium">Due Date</th>
                              <th className="text-center py-1.5 font-medium">Status</th>
                              {canWrite(user.role, 'payments') && <th className="text-center py-1.5 font-medium">Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {row.milestones.map(m => (
                              <tr key={m.id} className="border-t border-slate-200">
                                <td className="py-1.5 font-medium">{m.phaseName}</td>
                                <td className="py-1.5 text-right">SAR {Number(m.amountSar).toLocaleString('en-SA', { maximumFractionDigits: 0 })}</td>
                                <td className="py-1.5 text-center text-slate-500">{new Date(m.dueDate).toLocaleDateString('en-GB')}</td>
                                <td className="py-1.5 text-center">
                                  <span className={`px-2 py-0.5 rounded-full font-medium ${MILESTONE_COLORS[m.status] || ''}`}>{m.status}</span>
                                </td>
                                {canWrite(user.role, 'payments') && (
                                  <td className="py-1.5 text-center">
                                    {m.status !== 'Paid' && (
                                      <button onClick={() => handleMilestoneUpdate(row.id, m.id, 'Paid')} className="text-green-600 hover:text-green-800 text-xs font-medium">Mark Paid</button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">New Payment Record</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'PO Number', key: 'poNumber' },
                { label: 'Customer Name', key: 'customerName' },
                { label: 'PO Value (SAR)', key: 'poValue', type: 'number' },
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
