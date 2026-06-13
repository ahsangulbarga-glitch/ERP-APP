'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, ROLE_LABELS, Role } from '@/types'
import { canExportReport } from '@/lib/rbac'
import {
  UserPlus, Pencil, Power, FileDown, Sheet, AlertTriangle,
  Users, GitBranch, GitMerge, Plus, Trash2, ChevronDown, ChevronRight, Save,
  CheckCircle2, Circle,
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

interface WorkflowStep {
  id: string
  process: string
  stepOrder: number
  label: string
  approverRole: string | null
  approverId: string | null
  isActive: boolean
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
  const [sub, setSub] = useState<'users' | 'hierarchy' | 'workflows'>('users')
  const [users, setUsers]         = useState<UserRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [workflows, setWorkflows] = useState<WorkflowStep[]>([])
  const [wLoading, setWLoading]   = useState(false)

  // Custom roles from DB
  type CRole = { id: string; roleKey: string; displayName: string; baseRole: string; color: string; isActive: boolean }
  const [customRoles, setCustomRoles] = useState<CRole[]>([])
  useEffect(() => {
    fetch('/api/roles').then(r => r.ok ? r.json() : []).then(d => setCustomRoles(Array.isArray(d) ? d.filter((r: CRole) => r.isActive) : []))
  }, [])

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

  const loadWorkflows = useCallback(async () => {
    setWLoading(true)
    const res  = await fetch('/api/approval-workflows')
    const data = res.ok ? await res.json().catch(() => []) : []
    setWorkflows(Array.isArray(data) ? data : [])
    setWLoading(false)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { if (sub === 'workflows') loadWorkflows() }, [sub, loadWorkflows])

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
          { id: 'users',     label: 'Users',              icon: Users },
          { id: 'hierarchy', label: 'Org Hierarchy',      icon: GitBranch },
          { id: 'workflows', label: 'Approval Workflows', icon: GitMerge },
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

      {/* ── Approval Workflows Tab ─────────────────────────────────────────── */}
      {sub === 'workflows' && (
        <WorkflowsTab
          workflows={workflows} users={users}
          loading={wLoading} onRefresh={loadWorkflows}
        />
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

// ═══════════════════════════════════════════════════════════════════════════════
// Approval Workflows Tab
// ═══════════════════════════════════════════════════════════════════════════════
function WorkflowsTab({
  workflows, users, loading, onRefresh,
}: { workflows: WorkflowStep[]; users: UserRow[]; loading: boolean; onRefresh: () => void }) {
  const [activeProcess, setActiveProcess] = useState('quotation')
  const [showAdd, setShowAdd]   = useState(false)
  const [stepForm, setStepForm] = useState({
    label: '', approverType: 'role', approverRole: 'P4_REGIONAL_MANAGER', approverId: '',
  })
  const [saving, setSaving] = useState(false)

  const steps = workflows
    .filter(w => w.process === activeProcess)
    .sort((a, b) => a.stepOrder - b.stepOrder)

  const [addError, setAddError] = useState('')

  const addStep = async () => {
    setAddError('')
    setSaving(true)
    // Always append AFTER the current highest stepOrder to avoid collisions on gaps
    const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1
    const res = await fetch('/api/approval-workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process:      activeProcess,
        stepOrder:    nextOrder,
        label:        stepForm.label,
        approverRole: stepForm.approverType === 'role' ? stepForm.approverRole : null,
        approverId:   stepForm.approverType === 'user' ? stepForm.approverId  : null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      try { const d = await res.json(); setAddError(d?.error || 'Failed to add step') } catch { setAddError('Failed to add step') }
      return
    }
    setShowAdd(false)
    setStepForm({ label: '', approverType: 'role', approverRole: 'P4_REGIONAL_MANAGER', approverId: '' })
    onRefresh()
  }

  const deleteStep = async (id: string) => {
    await fetch('/api/approval-workflows', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    onRefresh()
  }

  const toggleStep = async (step: WorkflowStep) => {
    await fetch('/api/approval-workflows', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: step.id, isActive: !step.isActive }),
    })
    onRefresh()
  }

  const proc = PROCESSES.find(p => p.id === activeProcess)!

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        Define the approval chain for each business process. Steps are executed in order — each approver must sign off before the next is notified.
      </div>

      <div className="flex gap-4 flex-wrap lg:flex-nowrap">
        {/* Process list (left column) */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {PROCESSES.map(p => {
              const count = workflows.filter(w => w.process === p.id && w.isActive).length
              return (
                <button key={p.id} onClick={() => { setActiveProcess(p.id); setShowAdd(false) }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors border-b last:border-b-0 border-slate-100 ${
                    activeProcess === p.id ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: p.color }} />
                    <span className={activeProcess === p.id ? 'text-slate-800' : 'text-slate-600'}>{p.label}</span>
                  </div>
                  {count > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: `${p.color}18`, color: p.color }}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Steps (right column) */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">{proc.label}</h3>
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white transition-colors"
              style={{ background: proc.color }}>
              <Plus size={14} /> Add Step
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
          ) : steps.length === 0 && !showAdd ? (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-300">
              <GitMerge size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">No approval steps defined</p>
              <p className="text-xs text-slate-400 mt-1">Click "Add Step" to build the workflow</p>
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step, idx) => {
                const assignee = step.approverId
                  ? users.find(u => u.id === step.approverId)
                  : null
                const approverLabel = assignee
                  ? `${assignee.name} (${ROLE_LABELS[assignee.role as Role] || assignee.role})`
                  : step.approverRole
                  ? ROLE_LABELS[step.approverRole as Role] || step.approverRole
                  : '—'

                return (
                  <div key={step.id}
                    className={`flex items-start gap-3 p-4 bg-white rounded-xl border transition-all ${
                      step.isActive ? 'border-slate-200' : 'border-slate-100 opacity-50'
                    }`}>
                    {/* Step number */}
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-none text-white"
                      style={{ background: step.isActive ? proc.color : '#94a3b8' }}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{step.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${proc.color}15`, color: proc.color }}>
                          {step.approverId ? 'Specific User' : 'By Role'}
                        </span>
                        <span className="text-xs text-slate-500">{approverLabel}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-none">
                      <button onClick={() => toggleStep(step)}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                          step.isActive
                            ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}>
                        {step.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => deleteStep(step.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add step form */}
          {showAdd && (
            <div className="bg-white rounded-xl border-2 border-dashed p-4 space-y-3"
              style={{ borderColor: proc.color + '60' }}>
              <p className="text-sm font-semibold text-slate-700">New Step — #{steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1}</p>
              {addError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addError}</p>}
              <div>
                <label className="text-xs font-medium text-slate-600">Step Label</label>
                <input className="input-sm w-full mt-1" placeholder="e.g. Department Head Review"
                  value={stepForm.label} onChange={e => setStepForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Assign approver by</label>
                <div className="flex gap-2 mt-1">
                  {[{ v: 'role', l: 'Role' }, { v: 'user', l: 'Specific Person' }].map(opt => (
                    <button key={opt.v} onClick={() => setStepForm(f => ({ ...f, approverType: opt.v }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        stepForm.approverType === opt.v
                          ? 'text-white border-transparent'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      style={stepForm.approverType === opt.v ? { background: proc.color } : {}}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              {stepForm.approverType === 'role' ? (
                <div>
                  <label className="text-xs font-medium text-slate-600">Approver Role</label>
                  <select className="input-sm w-full mt-1"
                    value={stepForm.approverRole}
                    onChange={e => setStepForm(f => ({ ...f, approverRole: e.target.value }))}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-slate-600">Approver Person</label>
                  <select className="input-sm w-full mt-1"
                    value={stepForm.approverId}
                    onChange={e => setStepForm(f => ({ ...f, approverId: e.target.value }))}>
                    <option value="">— Select person —</option>
                    {users.filter(u => u.isActive).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {ROLE_LABELS[u.role as Role] || u.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)} className="btn-outline flex-1 text-sm">Cancel</button>
                <button onClick={addStep} disabled={saving || !stepForm.label}
                  className="flex-1 text-sm py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: proc.color }}>
                  {saving ? 'Adding…' : 'Add Step'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
