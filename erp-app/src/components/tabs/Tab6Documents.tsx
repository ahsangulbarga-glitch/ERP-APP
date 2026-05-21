'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Document } from '@/types'
import { canWrite } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import { Plus, Download, FolderOpen, Pencil, X, Check, AlertTriangle, ShieldCheck, Clock } from 'lucide-react'

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Active:       { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  ExpiringSoon: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  Expired:      { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
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
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await fetch(`/api/documents?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  const kpis = [
    { label: 'Total Documents', value: rows.length, color: 'blue' as const, icon: <FolderOpen size={16} /> },
    { label: 'Active', value: rows.filter(r => r.status === 'Active').length, color: 'green' as const, icon: <ShieldCheck size={16} /> },
    { label: 'Expiring Soon', value: rows.filter(r => r.status === 'ExpiringSoon').length, color: 'orange' as const, icon: <Clock size={16} /> },
    { label: 'Expired', value: rows.filter(r => r.status === 'Expired').length, color: 'red' as const, icon: <AlertTriangle size={16} /> },
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

  const openEdit = (row: Document) => {
    setEditRow(row)
    setForm({ documentName: row.documentName, documentOwner: row.documentOwner, category: row.category, department: row.department, issueDate: row.issueDate.split('T')[0], expiryDate: row.expiryDate.split('T')[0], remarks: row.remarks || '' })
    setShowForm(true)
  }

  const formFields = [
    { label: 'Document Name', key: 'documentName' },
    { label: 'Document Owner (Email)', key: 'documentOwner', type: 'email' },
    { label: 'Category', key: 'category' },
    { label: 'Department', key: 'department' },
    { label: 'Issue Date', key: 'issueDate', type: 'date' },
    { label: 'Expiry Date', key: 'expiryDate', type: 'date' },
  ]

  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      <div className="filter-bar">
        <input type="text" placeholder="Category…" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} className="input-sm w-32" />
        <input type="text" placeholder="Department…" value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))} className="input-sm w-32" />
        <input type="text" placeholder="Owner…" value={filters.owner} onChange={e => setFilters(f => ({ ...f, owner: e.target.value }))} className="input-sm w-32" />
        <select value={filters.expiryWindow} onChange={e => setFilters(f => ({ ...f, expiryWindow: e.target.value }))} className="input-sm">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="expiring30">Expiring in 30 Days</option>
          <option value="expired">Expired</option>
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ category: '', department: '', owner: '', expiryWindow: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      <div className="section-header">
        <div className="flex gap-2">
          {canWrite(user.role, 'documents') && (
            <button onClick={() => { setShowForm(true); setEditRow(null); setForm({ documentName: '', documentOwner: '', category: '', department: '', issueDate: '', expiryDate: '', remarks: '' }) }} className="btn-primary">
              <Plus size={14} /> Add Document
            </button>
          )}
          <button onClick={handleExport} className="btn-outline"><Download size={14} /> Export</button>
        </div>
        <span className="text-xs text-slate-400">{rows.length} document{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><FolderOpen size={36} className="opacity-20" /><p className="text-sm font-medium">No documents found</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>{['Document', 'Owner', 'Category', 'Department', 'Issue Date', 'Expiry Date', 'Days Left', 'Status', 'Remarks', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const s = STATUS_STYLES[row.status] || STATUS_STYLES.Active
                const days = row.remainingDaysForExpiry
                const daysColor = days < 0 ? '#b91c1c' : days <= 30 ? '#b45309' : '#15803d'
                return (
                  <tr key={row.id} style={row.status === 'Expired' ? { background: '#fef9f9' } : {}}>
                    <td className="font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {row.status !== 'Active' && <AlertTriangle size={11} style={{ color: row.status === 'Expired' ? '#dc2626' : '#d97706' }} className="shrink-0" />}
                        {row.documentName}
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs">{row.documentOwner}</td>
                    <td className="text-slate-500 text-xs">{row.category}</td>
                    <td className="text-slate-500 text-xs">{row.department}</td>
                    <td className="text-slate-400 text-xs whitespace-nowrap">{new Date(row.issueDate).toLocaleDateString('en-GB')}</td>
                    <td className="text-slate-500 text-xs whitespace-nowrap">{new Date(row.expiryDate).toLocaleDateString('en-GB')}</td>
                    <td>
                      <span className="font-bold text-sm" style={{ color: daysColor }}>
                        {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full border inline-block whitespace-nowrap"
                        style={{ background: s.bg, color: s.text, borderColor: s.border }}>{row.status}</span>
                    </td>
                    <td className="text-slate-400 text-xs max-w-[110px] truncate">{row.remarks || '—'}</td>
                    <td>
                      {canWrite(user.role, 'documents') && (
                        <button onClick={() => openEdit(row)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
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
                <h3 className="font-bold text-slate-800 text-base">{editRow ? 'Edit Document' : 'Add Document'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editRow ? `Editing ${editRow.documentName}` : 'Add a compliance document'}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {formFields.map(({ label, key, type = 'text' }) => (
                <div key={key} className={key === 'documentName' || key === 'documentOwner' ? 'col-span-2' : ''}>
                  <label className="form-label">{label}</label>
                  <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="form-input" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="form-label">Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              <button onClick={handleSave} className="btn-primary"><Check size={14} /> Save Document</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
