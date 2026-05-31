'use client'

import { useEffect, useState } from 'react'
import { SessionUser, ROLE_LABELS, Role } from '@/types'
import { canExportReport } from '@/lib/rbac'
import { UserPlus, Pencil, Power, FileDown, Sheet } from 'lucide-react'

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

export default function TabUsers({ user: currentUser }: { user: SessionUser }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'P6_KEY_ACCOUNT_ENGINEER', pin: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/users')
    const data = await res.json()
    setUsers(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  const openNew = () => {
    setEditUser(null)
    setForm({ name: '', email: '', role: 'P6_KEY_ACCOUNT_ENGINEER', pin: '' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (u: UserRow) => {
    setEditUser(u)
    setForm({ name: u.name, email: u.email, role: u.role, pin: '' })
    setError('')
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      if (editUser) {
        const body: Record<string, string> = { name: form.name, role: form.role }
        if (form.pin) body.pin = form.pin
        const res = await fetch(`/api/users?id=${editUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      }
      setShowModal(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (u: UserRow) => {
    await fetch(`/api/users?id=${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    })
    load()
  }

  const ROLE_OPTIONS: Role[] = [
    'P1_CEO',
    'P2_ADMIN',
    'P4_REGIONAL_MANAGER',      // Divisional Manager
    'P5_SALES_MANAGER',
    'P3_KEY_ACCOUNT_MANAGER',   // Key Account Manager
    'P6_KEY_ACCOUNT_ENGINEER',
    'P7_INSIDE_SALES_ENGINEER',
    'P8_ACCOUNTANT',
    'P9_HR',
    'P10_LOGISTICS_MANAGER',
    'P11_PURCHASE_MANAGER',
    'P12_WAREHOUSE_MANAGER',
  ]

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Role', 'Status', 'Created']
    const rows = users.map(u => [
      `"${u.name}"`,
      `"${u.email}"`,
      `"${ROLE_LABELS[u.role as Role] || u.role}"`,
      u.isActive ? 'Active' : 'Inactive',
      new Date(u.createdAt).toLocaleDateString(),
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    a.href     = url
    a.download = `DLIT-Users-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">User Management</h2>
        <div className="flex items-center gap-2">
          {/* Export PDF â€” admin only */}
          {canExportReport(currentUser.role, 'users') && (
            <a href="/api/users/export" download
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
              style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626', borderColor: 'rgba(220,38,38,0.25)' }}
              title="Export Users PDF">
              <FileDown size={13} /> PDF
            </a>
          )}
          {/* Export CSV â€” admin only */}
          {canExportReport(currentUser.role, 'users') && (
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
              style={{ background: 'rgba(22,163,74,0.08)', color: '#16A34A', borderColor: 'rgba(22,163,74,0.25)' }}
              title="Export Users CSV">
              <Sheet size={13} /> CSV
            </button>
          )}
          <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm">
            <UserPlus size={16} /> Add User
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                      {ROLE_LABELS[u.role as Role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)} className="text-blue-600 hover:text-blue-800" title="Edit">
                        <Pencil size={15} />
                      </button>
                      {u.id !== currentUser.id && (
                        <button onClick={() => toggleActive(u)} className={u.isActive ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'} title={u.isActive ? 'Deactivate' : 'Activate'}>
                          <Power size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">{editUser ? 'Edit User' : 'Add New User'}</h3>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Full Name</label>
                <input className="input-sm w-full mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              {!editUser && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Email</label>
                  <input type="email" className="input-sm w-full mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-600">Role</label>
                <select className="input-sm w-full mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{editUser ? 'New PIN (leave blank to keep current)' : '4-Digit PIN'}</label>
                <input type="password" maxLength={4} inputMode="numeric" className="input-sm w-full mt-1" placeholder="â€¢â€¢â€¢â€¢"
                  value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-outline flex-1">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
