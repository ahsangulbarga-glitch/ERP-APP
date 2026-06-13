'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, ROLE_LABELS, Role } from '@/types'
import { canExportReport } from '@/lib/rbac'
import {
  UserPlus, Pencil, Power, FileDown, Sheet, AlertTriangle,
  Users, GitBranch, Plus, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, Circle, Shield, Check, X, ChevronUp,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRow {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  managerId: string | null
  createdBy: string | null   // null = seed user (protected)
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLE_OPTIONS: Role[] = [
  'P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER',
  'P3_KEY_ACCOUNT_MANAGER', 'P6_KEY_ACCOUNT_ENGINEER', 'P7_INSIDE_SALES_ENGINEER',
  'P8_ACCOUNTANT', 'P9_HR', 'P10_LOGISTICS_MANAGER', 'P11_PURCHASE_MANAGER', 'P12_WAREHOUSE_MANAGER',
]

const PROCESSES: { id: string; label: string; color: string }[] = [
  { id: 'quotation',   label: 'Quotation Approval',   color: '#2563eb' },
  { id: 'expense',     label: 'Expense Claim',         color: '#d97706' },
  { id: 'procurement', label: 'Purchase Order',        color: '#0f766e' },
  { id: 'delivery',    label: 'Delivery Confirmation', color: '#7c3aed' },
  { id: 'leave',       label: 'Leave Request',         color: '#059669' },
  { id: 'invoice',     label: 'Invoice Approval',      color: '#dc2626' },
]

const ROLE_COLORS: Record<string, string> = {
  P1_CEO: '#f59e0b', P2_ADMIN: '#6366f1', P4_REGIONAL_MANAGER: '#0891b2',
  P5_SALES_MANAGER: '#059669', P3_KEY_ACCOUNT_MANAGER: '#8b5cf6',
  P6_KEY_ACCOUNT_ENGINEER: '#2563eb', P7_INSIDE_SALES_ENGINEER: '#0284c7',
  P8_ACCOUNTANT: '#dc2626', P9_HR: '#db2777', P10_LOGISTICS_MANAGER: '#0f766e',
  P11_PURCHASE_MANAGER: '#7c3aed', P12_WAREHOUSE_MANAGER: '#92400e',
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TabUsers({ user: currentUser }: { user: SessionUser }) {
  const [sub, setSub] = useState<'users' | 'hierarchy' | 'roles'>('users')
  const [users, setUsers]         = useState<UserRow[]>([])
  const [loading, setLoading]     = useState(true)

  // Custom roles from DB
  type CRole = { id: string; roleKey: string; displayName: string; baseRole: string; description?: string; color: string; isActive: boolean }
  const [customRoles,  setCustomRoles]  = useState<CRole[]>([])
  const [allRoles,     setAllRoles]     = useState<CRole[]>([])  // includes inactive, for the management tab
  const [roleForm,     setRoleForm]     = useState({ displayName: '', baseRole: 'P6_KEY_ACCOUNT_ENGINEER', description: '', color: '#6366f1' })
  const [editingRole,  setEditingRole]  = useState<CRole | null>(null)
  const [roleSaving,   setRoleSaving]   = useState(false)
  const [showRoleForm, setShowRoleForm] = useState(false)

  const loadRoles = useCallback(async () => {
    const res  = await fetch('/api/roles')
    const data = res.ok ? await res.json() : []
    if (Array.isArray(data)) {
      setAllRoles(data)
      setCustomRoles(data.filter((r: CRole) => r.isActive))
    }
  }, [])

  useEffect(() => { loadRoles() }, [loadRoles])

  const saveRole = async () => {
    if (!roleForm.displayName.trim()) return
    setRoleSaving(true)
    try {
      const res = await fetch('/api/roles', {
        method: editingRole ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRole ? { id: editingRole.id, ...roleForm } : roleForm),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Save failed'); return }
      setShowRoleForm(false); setEditingRole(null)
      setRoleForm({ displayName: '', baseRole: 'P6_KEY_ACCOUNT_ENGINEER', description: '', color: '#6366f1' })
      loadRoles()
    } catch { /* ignore */ } finally { setRoleSaving(false) }
  }

  const deleteRole = async (id: string) => {
    if (!confirm('Delete this role? Users assigned to it will need reassigning.')) return
    const res = await fetch('/api/roles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) loadRoles()
  }

  const toggleRoleActive = async (role: CRole) => {
    await fetch('/api/roles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: role.id, isActive: !role.isActive }) })
    loadRoles()
  }

  // User modal state
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser]   = useState<UserRow | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'P6_KEY_ACCOUNT_ENGINEER', pin: '' })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/users')
    const data = res.ok ? await res.json().catch(() => []) : []
    setUsers(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  // ── User CRUD ──────────────────────────────────────────────────────────────
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

  const safeErr = async (res: Response, fallback = 'Request failed') => {
    try { const d = await res.json(); return d?.error || fallback } catch { return fallback }
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      if (editUser) {
        const body: Record<string, string> = { name: form.name, role: form.role }
        if (form.pin) body.pin = form.pin
        const res = await fetch(`/api/users?id=${editUser.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(await safeErr(res))
      } else {
        const res = await fetch('/api/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error(await safeErr(res))
      }
      setShowModal(false); loadUsers()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  const toggleActive = async (u: UserRow) => {
    await fetch(`/api/users?id=${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    })
    loadUsers()
  }

  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const deleteUser = async () => {
    if (!confirmDelete) return
    setDeleting(true); setDeleteError('')
    const res = await fetch('/api/users', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: confirmDelete.id }),
    })
    if (res.ok) {
      setConfirmDelete(null); loadUsers()
    } else {
      const d = res.ok ? {} : await res.json().catch(() => ({}))
      setDeleteError(d?.error || 'Delete failed')
    }
    setDeleting(false)
  }

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Role', 'Status', 'Created']
    const rows = users.map(u => [
      `"${u.name}"`, `"${u.email}"`,
      `"${ROLE_LABELS[u.role as Role] || u.role}"`,
      u.isActive ? 'Active' : 'Inactive',
      new Date(u.createdAt).toLocaleDateString(),
    ])
    const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url; a.download = `DLIT-Users-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 lg:p-5 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">User Management</h2>
        <div className="flex items-center gap-2">
          {canExportReport(currentUser.role, 'users') && (
            <>
              <a href="/api/users/export" download
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
                style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626', borderColor: 'rgba(220,38,38,0.25)' }}>
                <FileDown size={13} /> PDF
              </a>
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
                style={{ background: 'rgba(22,163,74,0.08)', color: '#16A34A', borderColor: 'rgba(22,163,74,0.25)' }}>
                <Sheet size={13} /> CSV
              </button>
            </>
          )}
          {sub === 'users' && (
            <button onClick={openNew} className="btn-primary flex items-center gap-2 text-sm">
              <UserPlus size={16} /> Add User
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        {[
          { id: 'users',     label: 'Users',         icon: Users },
          { id: 'hierarchy', label: 'Org Hierarchy', icon: GitBranch },
          { id: 'roles',     label: 'Custom Roles',  icon: Shield },
        ].map(t => (
          <button key={t.id} onClick={() => setSub(t.id as typeof sub)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              sub === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Users Tab ──────────────────────────────────────────────────────── */}
      {sub === 'users' && (
        loading ? (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Name', 'Email', 'Role', 'Reports To', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => {
                  const mgr = users.find(m => m.id === u.managerId)
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            background: u.role.startsWith('CUSTOM_')
                              ? `${customRoles.find(r => r.roleKey === u.role)?.color || '#6366f1'}18`
                              : `${ROLE_COLORS[u.role]}18`,
                            color: u.role.startsWith('CUSTOM_')
                              ? (customRoles.find(r => r.roleKey === u.role)?.color || '#6366f1')
                              : ROLE_COLORS[u.role],
                          }}>
                          {u.role.startsWith('CUSTOM_')
                            ? (customRoles.find(r => r.roleKey === u.role)?.displayName || u.role)
                            : (ROLE_LABELS[u.role as Role] || u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{mgr ? mgr.name : '—'}</td>
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
                            <button onClick={() => toggleActive(u)}
                              className={u.isActive ? 'text-amber-400 hover:text-amber-600' : 'text-green-500 hover:text-green-700'}
                              title={u.isActive ? 'Deactivate' : 'Activate'}>
                              <Power size={15} />
                            </button>
                          )}
                          {u.id !== currentUser.id && u.createdBy && (
                            <button onClick={() => { setDeleteError(''); setConfirmDelete(u) }}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              title="Delete user">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Org Hierarchy Tab ──────────────────────────────────────────────── */}
      {sub === 'hierarchy' && (
        <HierarchyTab users={users} currentUserId={currentUser.id} onRefresh={loadUsers} />
      )}

      {/* ── Custom Roles ─────────────────────────────────────────────────── */}
      {sub === 'roles' && (
        <div className="space-y-4 p-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Custom Roles</p>
              <p className="text-xs text-slate-500 mt-0.5">Create roles that inherit permissions from a built-in role and appear in the user assignment dropdown.</p>
            </div>
            <button onClick={() => { setShowRoleForm(true); setEditingRole(null); setRoleForm({ displayName: '', baseRole: 'P6_KEY_ACCOUNT_ENGINEER', description: '', color: '#6366f1' }) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#6366f1' }}>
              <Plus size={14} /> New Role
            </button>
          </div>

          {/* Create / Edit form */}
          {showRoleForm && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-indigo-800">{editingRole ? 'Edit Role' : 'Create New Role'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Display Name *</label>
                  <input className="form-input" placeholder="e.g. Senior Sales Engineer"
                    value={roleForm.displayName} onChange={e => setRoleForm(f => ({ ...f, displayName: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Inherits Permissions From *</label>
                  <select className="form-input" value={roleForm.baseRole} onChange={e => setRoleForm(f => ({ ...f, baseRole: e.target.value }))}>
                    <option value="P1_CEO">CEO</option>
                    <option value="P2_ADMIN">Admin</option>
                    <option value="P3_KEY_ACCOUNT_MANAGER">Key Account Manager</option>
                    <option value="P4_REGIONAL_MANAGER">Divisional Manager</option>
                    <option value="P5_SALES_MANAGER">Sales Manager</option>
                    <option value="P6_KEY_ACCOUNT_ENGINEER">Key Account Engineer</option>
                    <option value="P7_INSIDE_SALES_ENGINEER">Inside Sales Engineer</option>
                    <option value="P8_ACCOUNTANT">Accountant</option>
                    <option value="P9_HR">HR</option>
                    <option value="P10_LOGISTICS_MANAGER">Logistics Manager</option>
                    <option value="P11_PURCHASE_MANAGER">Purchase Manager</option>
                    <option value="P12_WAREHOUSE_MANAGER">Warehouse Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Description</label>
                  <input className="form-input" placeholder="Brief description" value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-medium">Badge Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={roleForm.color} onChange={e => setRoleForm(f => ({ ...f, color: e.target.value }))}
                      className="w-10 h-9 rounded cursor-pointer border border-slate-200 p-0.5 bg-white" />
                    <span className="text-xs text-slate-500">Choose a badge color</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveRole} disabled={roleSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: '#6366f1' }}>
                  <Check size={13} /> {roleSaving ? 'Saving…' : editingRole ? 'Update' : 'Create Role'}
                </button>
                <button onClick={() => { setShowRoleForm(false); setEditingRole(null) }}
                  className="px-4 py-2 rounded-lg text-sm text-slate-500 border border-slate-200 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Roles list */}
          {allRoles.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <Shield size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500">No custom roles yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Role" to create your first custom role</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allRoles.map(role => (
                <div key={role.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border bg-white hover:border-slate-300 transition-colors"
                  style={{ borderColor: role.isActive ? '#e2e8f0' : '#fee2e2', opacity: role.isActive ? 1 : 0.7 }}>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ background: role.color }}>
                      {role.displayName}
                    </span>
                    <div>
                      <p className="text-xs text-slate-500">
                        Inherits: <span className="font-medium text-slate-700">{role.baseRole.replace(/^P\d+_/, '').replace(/_/g, ' ')}</span>
                        {' · '}<span className="font-mono text-slate-400 text-[10px]">{role.roleKey}</span>
                      </p>
                      {role.description && <p className="text-xs text-slate-400 mt-0.5">{role.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleRoleActive(role)}
                      className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${role.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {role.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => { setEditingRole(role); setRoleForm({ displayName: role.displayName, baseRole: role.baseRole, description: role.description || '', color: role.color }); setShowRoleForm(true) }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteRole(role.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">How custom roles work:</p>
            <p>• Custom roles <strong>inherit all permissions</strong> from the built-in role you select</p>
            <p>• They appear in the role dropdown when creating or editing users</p>
            <p>• Deactivating hides a role from new assignments but doesn{"'"}t affect existing users</p>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Delete User</h3>
                <p className="text-sm text-slate-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold">{confirmDelete.name}</span>
              {' '}({confirmDelete.email})?
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{deleteError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmDelete(null)} className="btn-outline flex-1">Cancel</button>
              <button onClick={deleteUser} disabled={deleting}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit User Modal ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">{editUser ? 'Edit User' : 'Add New User'}</h3>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Full Name</label>
                <input className="input-sm w-full mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              {!editUser && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Email</label>
                  <input type="email" className="input-sm w-full mt-1" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-600">Role</label>
                <select className="input-sm w-full mt-1" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <optgroup label="Standard Roles">
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </optgroup>
                  {customRoles.length > 0 && (
                    <optgroup label="Custom Roles">
                      {customRoles.map(r => <option key={r.roleKey} value={r.roleKey}>{r.displayName}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">{editUser ? 'New PIN (leave blank to keep)' : '4-Digit PIN'}</label>
                <input type="password" maxLength={4} inputMode="numeric" className="input-sm w-full mt-1"
                  placeholder="••••" value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
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

// ═══════════════════════════════════════════════════════════════════════════════
// Org Hierarchy Tab
// ═══════════════════════════════════════════════════════════════════════════════
function HierarchyTab({
  users, currentUserId, onRefresh,
}: { users: UserRow[]; currentUserId: string; onRefresh: () => void }) {
  const [pendingManagers, setPendingManagers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const getManagerId = (u: UserRow) =>
    pendingManagers[u.id] !== undefined ? pendingManagers[u.id] : (u.managerId ?? '')

  const saveManager = async (userId: string) => {
    setSaving(userId)
    await fetch(`/api/users?id=${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerId: pendingManagers[userId] || null }),
    })
    const next = { ...pendingManagers }
    delete next[userId]
    setPendingManagers(next)
    setSaving(null)
    onRefresh()
  }

  // Build tree: top-level = no manager
  const buildTree = (parentId: string | null): UserRow[] =>
    users.filter(u => (u.managerId ?? null) === parentId)

  const TreeNode = ({ u, depth }: { u: UserRow; depth: number }) => {
    const [open, setOpen] = useState(true)
    const children = buildTree(u.id)
    const selected = getManagerId(u)
    const isDirty  = pendingManagers[u.id] !== undefined

    return (
      <div>
        <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group"
          style={{ paddingLeft: `${12 + depth * 24}px` }}>
          {/* Expand toggle */}
          <button onClick={() => setOpen(v => !v)} className="text-slate-400 w-4 flex-none">
            {children.length > 0
              ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
              : <span className="w-4" />}
          </button>

          {/* Avatar */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-none"
            style={{ background: ROLE_COLORS[u.role] ?? '#64748b' }}>
            {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
            <p className="text-xs text-slate-400 truncate">{ROLE_LABELS[u.role as Role] || u.role}</p>
          </div>

          {/* Reports-to selector */}
          <div className="flex items-center gap-2 flex-none">
            <span className="text-xs text-slate-400 hidden sm:block">Reports to:</span>
            <select
              className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400"
              value={selected}
              onChange={e => setPendingManagers(prev => ({ ...prev, [u.id]: e.target.value }))}>
              <option value="">— No manager —</option>
              {users
                .filter(m => m.id !== u.id && m.isActive)
                .map(m => <option key={m.id} value={m.id}>{m.name} ({ROLE_LABELS[m.role as Role] || m.role})</option>)}
            </select>
            {isDirty && (
              <button onClick={() => saveManager(u.id)} disabled={saving === u.id}
                className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                <Save size={11} /> {saving === u.id ? '…' : 'Save'}
              </button>
            )}
            {!isDirty && u.managerId && (
              <CheckCircle2 size={14} className="text-green-500" />
            )}
            {!isDirty && !u.managerId && u.id !== currentUserId && (
              <Circle size={14} className="text-slate-300" />
            )}
          </div>
        </div>
        {open && children.map(c => <TreeNode key={c.id} u={c} depth={depth + 1} />)}
      </div>
    )
  }

  const rootNodes = buildTree(null)

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        Assign each employee's direct manager. The org chart is built automatically from these relationships.
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {rootNodes.map(u => <TreeNode key={u.id} u={u} depth={0} />)}
        {/* Users whose manager ID points to someone not in the list */}
        {users.filter(u => u.managerId && !users.find(m => m.id === u.managerId)).map(u => (
          <TreeNode key={u.id} u={u} depth={0} />
        ))}
      </div>
    </div>
  )
}

