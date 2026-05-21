'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Document } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, FolderOpen, Pencil, X, Check, AlertTriangle } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  ExpiringSoon: 'bg-yellow-100 text-yellow-700',
  Expired: 'bg-red-100 text-red-700',
}

export default function Tab6Documents({ user }: { user: SessionUser }) {
  const [rows, setRows] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ category: '', department: '', owner: '', expiryWindow: '' })
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState<Document | null>(null)
  const [form, setForm] = useState({ documentName: '', documentOwner: '', category: '', department: '', issueDate: '', expiryDate: '', remarks: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
    const res = await fetch(`/api/documents?${params}`)
    const data = await res.json()
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const kpis = [
    { label: 'Total Documents', value: rows.length, color: 'blue' as const },
    { label: 'Expired', value: rows.filter(r => r.status === 'Expired').length, color: 'red' as const },
    { label: 'Expiring in 30 Days', value: rows.filter(r => r.status === 'ExpiringSoon').length, color: 'orange' as const },
  ]

  const handleSave = async () => {
    const method = editRow ? 'PATCH' : 'POST'
    const body = editRow ? { id: editRow.id, ...form } : form
    await fetch('/api/documents', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setShowForm(false); setEditRow(null); load()
  }

  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'documents', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex flex-wrap gap-2">
          <input type="text" placeholder="Category..." value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} className="input-sm" />
          <input type="text" placeholder="Department..." value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))} className="input-sm" />
          <input type="text" placeholder="Owner..." value={filters.owner} onChange={e => setFilters(f => ({ ...f, owner: e.target.value }))} className="input-sm" />
          <select value={filters.expiryWindow} onChange={e => setFilters(f => ({ ...f, expiryWindow: e.target.value }))} className="input-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="expiring30">Expiring in 30 Days</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      <div className="px-4 py-2 flex gap-2 bg-white border-b border-slate-100">
        {canWrite(user.role, 'documents') && (
          <button onClick={() => { setShowForm(true); setEditRow(null) }} className="btn-primary flex items-center gap-1.5 text-sm"><Plus size={15} /> Add Document</button>
        )}
        <button onClick={handleExport} className="btn-outline flex items-center gap-1.5 text-sm"><Download size={15} /> Export</button>
      </div>

      <div className="flex-1 overflow-auto table-container">
        {loading ? <div className="flex items-center justify-center h-40 text-slate-400">Loading…</div>
          : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <FolderOpen size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No documents found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
                <tr>
                  {['Document', 'Owner', 'Category', 'Department', 'Issue Date', 'Expiry Date', 'Days Left', 'Status', 'Remarks', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className={`border-t border-slate-100 hover:bg-slate-50 ${row.status === 'Expired' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-2.5 font-medium flex items-center gap-1.5">
                      {row.status !== 'Active' && <AlertTriangle size={12} className="text-yellow-500 shrink-0" />}
                      {row.documentName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.documentOwner}</td>
                    <td className="px-3 py-2.5 text-slate-600">{row.category}</td>
                    <td className="px-3 py-2.5 text-slate-600">{row.department}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{new Date(row.issueDate).toLocaleDateString('en-GB')}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{new Date(row.expiryDate).toLocaleDateString('en-GB')}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold text-sm ${row.remainingDaysForExpiry < 0 ? 'text-red-600' : row.remainingDaysForExpiry <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {row.remainingDaysForExpiry < 0 ? `${Math.abs(row.remainingDaysForExpiry)}d ago` : `${row.remainingDaysForExpiry}d`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[row.status] || ''}`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[120px] truncate text-slate-500 text-xs">{row.remarks || '—'}</td>
                    <td className="px-3 py-2.5">
                      {canWrite(user.role, 'documents') && (
                        <button onClick={() => { setEditRow(row); setForm({ documentName: row.documentName, documentOwner: row.documentOwner, category: row.category, department: row.department, issueDate: row.issueDate.split('T')[0], expiryDate: row.expiryDate.split('T')[0], remarks: row.remarks || '' }); setShowForm(true) }} className="text-slate-400 hover:text-blue-600"><Pencil size={14} /></button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{editRow ? 'Edit Document' : 'Add Document'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Document Name', key: 'documentName' },
                { label: 'Document Owner (Email)', key: 'documentOwner', type: 'email' },
                { label: 'Category', key: 'category' },
                { label: 'Department', key: 'department' },
                { label: 'Issue Date', key: 'issueDate', type: 'date' },
                { label: 'Expiry Date', key: 'expiryDate', type: 'date' },
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
