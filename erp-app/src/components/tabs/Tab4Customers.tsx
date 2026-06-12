'use client'

import { useEffect, useState, useCallback } from 'react'
import { SessionUser, Customer } from '@/types'
import { canWrite, canBulkImport, canSetCreditLimit } from '@/lib/rbac'
import { toastSuccess, toastError } from '@/components/shared/Toast'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import {
  Plus, Download, Upload, Users, Pencil, X, Check, Trophy, TrendingUp,
  FilePlus, Eye, Building2, Phone, Mail, Globe, MapPin, CreditCard,
  Package, Truck, Star, UserPlus, Trash2, Calendar, Hash,
  ChevronDown, Landmark, BarChart2,
} from 'lucide-react'

// ─── sub-types ────────────────────────────────────────────────────────────────
interface KeyContact  { name: string; title: string; phone: string; email: string; isPrimary: boolean }
interface ShipAddress { label: string; street: string; city: string; region: string; postalCode: string; country: string; isDefault: boolean; deliveryInstructions: string; receivingHours: string }

// ─── tier config ──────────────────────────────────────────────────────────────
const TIER: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  PLATINUM: { label: 'Platinum', bg: '#f3e8ff', text: '#7c3aed', border: '#d8b4fe', dot: '#7c3aed' },
  GOLD:     { label: 'Gold',     bg: '#fffbeb', text: '#b45309', border: '#fde68a', dot: '#f59e0b' },
  SILVER:   { label: 'Silver',   bg: '#f8fafc', text: '#64748b', border: '#cbd5e1', dot: '#94a3b8' },
  STANDARD: { label: 'Standard', bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd', dot: '#38bdf8' },
}
const STATUS: Record<string, { bg: string; text: string; border: string }> = {
  Active:   { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  Inactive: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  Prospect: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
}

// ─── helpers ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseJson = <T,>(str: string | null | undefined, fallback: T): T => { try { return str ? JSON.parse(str) as T : fallback } catch { return fallback } }
const blank = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const TierBadge = ({ tier }: { tier?: string }) => {
  const t = TIER[tier || 'STANDARD'] ?? TIER.STANDARD
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border"
      style={{ background: t.bg, color: t.text, borderColor: t.border }}>
      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: t.dot }} />
      {t.label}
    </span>
  )
}
const StatusBadge = ({ status }: { status?: string }) => {
  const s = STATUS[status || 'Active'] ?? STATUS.Active
  return (
    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}>
      {status || 'Active'}
    </span>
  )
}

// ─── blank form helpers ───────────────────────────────────────────────────────
const blankForm = () => ({
  customerName: '', status: 'Active', industry: '', website: '',
  phone: '', email: '', leadSource: '', assignedKaeId: '', assignedKamId: '',
  remarks: '',
  addrStreet: '', addrCity: '', addrRegion: '', addrPostalCode: '', addrCountry: 'Saudi Arabia',
  priceTier: 'STANDARD', discountRate: 0, paymentTerms: '',
  creditLimit: 0, creditBalance: 0, taxId: '', taxExempt: false, currency: 'SAR',
  defaultCarrier: '', carrierAccount: '',
})
const blankContact  = (): KeyContact  => ({ name: '', title: '', phone: '', email: '', isPrimary: false })
const blankAddress  = (): ShipAddress => ({ label: '', street: '', city: '', region: '', postalCode: '', country: 'Saudi Arabia', isDefault: false, deliveryInstructions: '', receivingHours: '' })

interface QuotationPrefill {
  customerName: string
  clientContactName?: string
  clientContactDetails?: string
  paymentTerms?: string
  kaeAssignedId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Tab4Customers({ user, onCreateQuotation }: {
  user: SessionUser
  onCreateQuotation?: (data: QuotationPrefill) => void
}) {
  const [rows,      setRows]      = useState<Customer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filters,   setFilters]   = useState({ search: '', tier: '', status: '' })
  const [kaeUsers,  setKaeUsers]  = useState<{ id: string; name: string; role: string }[]>([])

  // Detail modal
  const [selected,   setSelected]   = useState<Customer | null>(null)
  const [detailTab,  setDetailTab]  = useState<'profile' | 'billing' | 'shipping' | 'orders'>('profile')

  // Inline credit editor
  const [creditEdit, setCreditEdit] = useState<{ id: string; limit: string; balance: string } | null>(null)
  const [creditSaving, setCreditSaving] = useState(false)

  // Form modal
  const [showForm, setShowForm] = useState(false)
  const [editRow,  setEditRow]  = useState<Customer | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState(blankForm())
  const [contacts, setContacts] = useState<KeyContact[]>([])
  const [addresses, setAddresses] = useState<ShipAddress[]>([])
  const [formSection, setFormSection] = useState<'profile' | 'billing' | 'logistics'>('profile')

  // ── load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res  = await fetch(`/api/customers?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  // ── Load KAE user list once ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/kae-list').then(r => r.json()).then(d => { if (Array.isArray(d)) setKaeUsers(d) }).catch(() => {})
  }, [])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalPoValue    = rows.reduce((s, r) => s + Number(r.totalPoValue), 0)
  const avgConversion   = rows.length ? rows.reduce((s, r) => s + Number(r.completionPct), 0) / rows.length : 0
  const topCustomer     = rows.reduce((top, r) => Number(r.totalPoValue) > Number(top?.totalPoValue || 0) ? r : top, rows[0])
  const activeCnt       = rows.filter(r => (r as Customer & { status?: string }).status !== 'Inactive').length

  const kpis = [
    { label: 'Total Customers', value: rows.length,                                   color: 'blue'   as const, icon: <Users size={16} /> },
    { label: 'Active Accounts', value: activeCnt,                                      color: 'green'  as const, icon: <Building2 size={16} /> },
    { label: 'Total PO Value',  value: `SAR ${(totalPoValue / 1_000_000).toFixed(1)}M`, color: 'purple' as const, icon: <TrendingUp size={16} /> },
    { label: 'Avg Conversion',  value: `${avgConversion.toFixed(1)}%`,                 color: 'orange' as const, icon: <Trophy size={16} /> },
  ]

  // ── form helpers ────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditRow(null)
    setForm(blankForm())
    setContacts([])
    setAddresses([])
    setFormSection('profile')
    setShowForm(true)
  }

  const openEdit = (row: Customer) => {
    const addr = parseJson(row.primaryAddress, { street: '', city: '', region: '', postalCode: '', country: 'Saudi Arabia' })
    const r = row as Customer & { status?: string; industry?: string; website?: string; phone?: string; email?: string; leadSource?: string; priceTier?: string; discountRate?: number; paymentTerms?: string; creditLimit?: number; creditBalance?: number; taxId?: string; taxExempt?: boolean; currency?: string; defaultCarrier?: string; carrierAccount?: string }
    setForm({
      customerName:    row.customerName,
      status:          r.status          || 'Active',
      industry:        r.industry        || '',
      website:         r.website         || '',
      phone:           r.phone           || '',
      email:           r.email           || '',
      leadSource:      r.leadSource      || '',
      assignedKaeId:   row.assignedKaeId || '',
      assignedKamId:   row.assignedKamId || '',
      remarks:         row.remarks       || '',
      addrStreet:      addr.street       || '',
      addrCity:        addr.city         || '',
      addrRegion:      addr.region       || '',
      addrPostalCode:  addr.postalCode   || '',
      addrCountry:     addr.country      || 'Saudi Arabia',
      priceTier:       r.priceTier      || 'STANDARD',
      discountRate:    r.discountRate   ?? 0,
      paymentTerms:    r.paymentTerms   || '',
      creditLimit:     r.creditLimit    ?? 0,
      creditBalance:   r.creditBalance  ?? 0,
      taxId:           r.taxId          || '',
      taxExempt:       r.taxExempt      ?? false,
      currency:        r.currency       || 'SAR',
      defaultCarrier:  r.defaultCarrier || '',
      carrierAccount:  r.carrierAccount || '',
    })
    setContacts(parseJson(row.keyPersonnel, []))
    setAddresses(parseJson(row.shippingAddresses, []))
    setEditRow(row)
    setFormSection('profile')
    setShowForm(true)
  }

  const saveCreditEdit = async () => {
    if (!creditEdit) return
    setCreditSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: creditEdit.id, creditLimit: Number(creditEdit.limit), creditBalance: Number(creditEdit.balance) }),
      })
      if (res.ok) toastSuccess('Credit limit updated')
      else toastError('Update failed')
    } catch { toastError('Update failed') }
    setCreditEdit(null); setCreditSaving(false); load()
  }

  const handleSave = async () => {
    if (!form.customerName.trim()) return
    setSaving(true)
    const payload = {
      customerName:    form.customerName,
      status:          form.status,
      industry:        form.industry   || undefined,
      website:         form.website    || undefined,
      phone:           form.phone      || undefined,
      email:           form.email      || undefined,
      leadSource:      form.leadSource || undefined,
      assignedKaeId:   form.assignedKaeId || undefined,
      assignedKamId:   form.assignedKamId || undefined,
      remarks:         form.remarks    || undefined,
      primaryAddress:  JSON.stringify({ street: form.addrStreet, city: form.addrCity, region: form.addrRegion, postalCode: form.addrPostalCode, country: form.addrCountry }),
      keyPersonnel:    JSON.stringify(contacts),
      priceTier:       form.priceTier,
      discountRate:    Number(form.discountRate),
      paymentTerms:    form.paymentTerms || undefined,
      // Only send credit fields if this user has permission to change them
      ...(canSetCreditLimit(user.role) ? {
        creditLimit:   Number(form.creditLimit)  || 0,
        creditBalance: Number(form.creditBalance) || 0,
      } : {}),
      taxId:           form.taxId       || undefined,
      taxExempt:       form.taxExempt,
      currency:        form.currency,
      shippingAddresses: JSON.stringify(addresses),
      defaultCarrier:  form.defaultCarrier  || undefined,
      carrierAccount:  form.carrierAccount  || undefined,
    }
    const method = editRow ? 'PATCH' : 'POST'
    const body   = editRow ? { id: editRow.id, ...payload } : payload
    try {
      const res = await fetch('/api/customers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); toastError(e.error || 'Save failed'); setSaving(false); return }
      toastSuccess(editRow ? 'Customer updated' : 'Customer added')
      setShowForm(false); setEditRow(null); setSaving(false); load()
    } catch { toastError('Save failed'); setSaving(false) }
  }

  // ── export / import ─────────────────────────────────────────────────────────
  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'customers', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('tab', 'customers')
    await fetch('/api/import', { method: 'POST', body: fd }); load()
  }

  // ── detail helpers ───────────────────────────────────────────────────────────
  const openDetail = (row: Customer) => { setSelected(row); setDetailTab('profile') }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <input type="text" placeholder="Search customer…" value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} className="input-sm w-48" />
        <select value={filters.tier} onChange={e => setFilters(f => ({ ...f, tier: e.target.value }))} className="input-sm">
          <option value="">All Tiers</option>
          {Object.keys(TIER).map(k => <option key={k} value={k}>{TIER[k].label}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="input-sm">
          <option value="">All Status</option>
          <option>Active</option><option>Prospect</option><option>Inactive</option>
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ search: '', tier: '', status: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Action bar ───────────────────────────────────────────────────────── */}
      <div className="section-header">
        <div className="flex gap-2 flex-wrap">
          {canWrite(user.role, 'customers') && (
            <button onClick={openNew} className="btn-primary"><Plus size={14} /> New Customer</button>
          )}
          <button onClick={handleExport} className="btn-outline"><Download size={14} /> Export</button>
          {canBulkImport(user.role, 'customers') && (
            <label className="btn-outline cursor-pointer">
              <Upload size={14} /> Import
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>
        <span className="text-xs text-slate-400">{rows.length} customer{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Directory Table ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><Users size={36} className="opacity-20" /><p className="text-sm font-medium">No customers found</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>KAE</th>
                <th>Phone</th>
                <th className="text-right">PO Value (SAR)</th>
                <th>Credit</th>
                <th>Conversion</th>
                <th>Status</th>
                <th>Last Activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const r   = row as Customer & { status?: string; industry?: string; phone?: string; priceTier?: string; creditLimit?: number; creditBalance?: number }
                const pct = Math.min(Number(row.completionPct), 100)
                const barColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#2563eb' : '#ea580c'
                const creditUsed = r.creditLimit ? Math.min((Number(r.creditBalance) / Number(r.creditLimit)) * 100, 100) : 0
                const creditColor = creditUsed >= 80 ? '#dc2626' : creditUsed >= 50 ? '#d97706' : '#16a34a'
                return (
                  <tr key={row.id}>
                    <td style={{ minWidth: 160 }}>
                      <p className="font-semibold text-slate-800 leading-tight">{row.customerName}</p>
                      {r.industry && <p className="text-xs text-slate-400 mt-0.5">{r.industry}</p>}
                    </td>
                    <td style={{ minWidth: 120 }}>
                      {row.assignedKam?.name && <p className="text-xs font-medium text-slate-700 leading-tight">{row.assignedKam.name}</p>}
                      {row.assignedKae?.name && <p className="text-xs text-slate-400 leading-tight">{row.assignedKae.name}</p>}
                      {!row.assignedKam?.name && !row.assignedKae?.name && <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="text-slate-500 text-xs" style={{ minWidth: 110 }}>{r.phone || '—'}</td>
                    <td className="text-right font-semibold text-slate-800" style={{ minWidth: 120 }}>
                      {Number(row.totalPoValue).toLocaleString('en-SA', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ minWidth: 150, position: 'relative' }}>
                      {/* ── Inline credit popover ─────────────────────────────── */}
                      {creditEdit?.id === row.id ? (
                        <div className="rounded-xl p-2 space-y-2 shadow-lg z-10"
                          style={{ background: '#fff', border: '1px solid #bfdbfe', minWidth: 180 }}>
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">Credit Limit (SAR)</p>
                            <input type="number" min={0} value={creditEdit.limit}
                              onChange={e => setCreditEdit(c => c ? { ...c, limit: e.target.value } : c)}
                              className="form-input text-xs py-1" style={{ fontSize: 12 }} />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">Outstanding Balance (SAR)</p>
                            <input type="number" min={0} value={creditEdit.balance}
                              onChange={e => setCreditEdit(c => c ? { ...c, balance: e.target.value } : c)}
                              className="form-input text-xs py-1" style={{ fontSize: 12 }} />
                          </div>
                          <div className="flex gap-1 pt-1">
                            <button onClick={saveCreditEdit} disabled={creditSaving}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium py-1 rounded-lg transition-all"
                              style={{ background: '#2563eb', color: '#fff' }}>
                              <Check size={11} /> {creditSaving ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setCreditEdit(null)}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium py-1 rounded-lg transition-all"
                              style={{ background: '#f1f5f9', color: '#64748b' }}>
                              <X size={11} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => canSetCreditLimit(user.role) ? setCreditEdit({ id: row.id, limit: String(r.creditLimit ?? 0), balance: String(r.creditBalance ?? 0) }) : undefined}
                          className={`w-full text-left ${canSetCreditLimit(user.role) ? 'group cursor-pointer' : 'cursor-default'}`}
                          title={canSetCreditLimit(user.role) ? 'Click to set credit values' : undefined}>
                          {r.creditLimit ? (
                            <div>
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-slate-400">{creditUsed.toFixed(0)}% used</span>
                                <span className="text-slate-500 flex items-center gap-1">
                                  {(Number(r.creditLimit) / 1000).toFixed(0)}K
                                  {canSetCreditLimit(user.role) && <Pencil size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" />}
                                </span>
                              </div>
                              <div className="progress-bar">
                                <div className="progress-bar-fill" style={{ width: `${creditUsed}%`, background: creditColor }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300 flex items-center gap-1">
                              — {canSetCreditLimit(user.role) && <span className="text-xs opacity-0 group-hover:opacity-60 group-hover:text-blue-400 transition-all">(set)</span>}
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div className="flex items-center gap-2">
                        <div className="progress-bar" style={{ flex: 1, minWidth: 40 }}>
                          <div className="progress-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="text-xs text-slate-500">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ minWidth: 80 }}><StatusBadge status={r.status} /></td>
                    <td className="text-slate-400 text-xs" style={{ minWidth: 90 }}>
                      {row.lastActivityDate ? new Date(row.lastActivityDate).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => openDetail(row)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="View profile">
                          <Eye size={13} />
                        </button>
                        {onCreateQuotation && (
                          <button onClick={() => {
                            const rr = row as Customer & { paymentTerms?: string }
                            const primaryContact = parseJson<KeyContact[]>(row.keyPersonnel, []).find(c => c.isPrimary) || parseJson<KeyContact[]>(row.keyPersonnel, [])[0]
                            onCreateQuotation({
                              customerName:        row.customerName,
                              paymentTerms:        rr.paymentTerms,
                              kaeAssignedId:       row.assignedKaeId,
                              clientContactName:   primaryContact?.name,
                              clientContactDetails: primaryContact ? [primaryContact.phone, primaryContact.email].filter(Boolean).join(' / ') : undefined,
                            })
                          }}
                            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-all"
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                            <FilePlus size={12} /> Quote
                          </button>
                        )}
                        {canWrite(user.role, 'customers') && (
                          <button onClick={() => openEdit(row)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all">
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CUSTOMER DETAIL MODAL — 360° view
      ══════════════════════════════════════════════════════════════════════ */}
      {selected && (() => {
        const r = selected as Customer & { status?: string; industry?: string; website?: string; phone?: string; email?: string; leadSource?: string; priceTier?: string; discountRate?: number; paymentTerms?: string; creditLimit?: number; creditBalance?: number; taxId?: string; taxExempt?: boolean; currency?: string; defaultCarrier?: string; carrierAccount?: string }
        const contacts_  = parseJson<KeyContact[]>(selected.keyPersonnel, [])
        const addresses_ = parseJson<ShipAddress[]>(selected.shippingAddresses, [])
        const addr_      = parseJson(selected.primaryAddress, { street: '', city: '', region: '', postalCode: '', country: '' })
        const creditUsed = r.creditLimit ? Math.min((Number(r.creditBalance) / Number(r.creditLimit)) * 100, 100) : 0
        const creditColor = creditUsed >= 80 ? '#dc2626' : creditUsed >= 50 ? '#d97706' : '#16a34a'
        const pct        = Math.min(Number(selected.completionPct), 100)
        const convColor  = pct >= 70 ? '#16a34a' : pct >= 40 ? '#2563eb' : '#ea580c'

        const Field = ({ label, value, icon }: { label: string; value?: string | number | null; icon?: React.ReactNode }) => (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{label}</p>
            <p className="text-sm text-slate-800 font-medium flex items-center gap-1">
              {icon}{value || <span className="text-slate-300 font-normal">—</span>}
            </p>
          </div>
        )
        const SectionHead = ({ title, icon }: { title: string; icon: React.ReactNode }) => (
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500" style={{ background: '#f1f5f9' }}>{icon}</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
          </div>
        )

        const DETAIL_TABS = [
          { id: 'profile',  label: 'Profile & Contacts', icon: <Users size={13} /> },
          { id: 'billing',  label: 'Billing & Finance',  icon: <CreditCard size={13} /> },
          { id: 'shipping', label: 'Shipping & Logistics', icon: <Truck size={13} /> },
          { id: 'orders',   label: 'Order History',      icon: <BarChart2 size={13} /> },
        ] as const

        return (
          <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: 16, paddingBottom: 16, overflowY: 'auto' }}>
            <div className="modal-box" style={{ maxWidth: 880, width: '97vw', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>

              {/* ── Modal header ─────────────────────────────────────────────── */}
              <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-slate-800">{selected.customerName}</h2>
                      <TierBadge tier={r.priceTier} />
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {r.industry && <span className="text-xs text-slate-500 flex items-center gap-1"><Building2 size={11} />{r.industry}</span>}
                      {r.phone    && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone size={11} />{r.phone}</span>}
                      {r.email    && <span className="text-xs text-slate-500 flex items-center gap-1"><Mail size={11} />{r.email}</span>}
                      {r.website  && <span className="text-xs text-slate-500 flex items-center gap-1"><Globe size={11} />{r.website}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canWrite(user.role, 'customers') && (
                      <button onClick={() => { setSelected(null); openEdit(selected) }}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all btn-outline">
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                    {onCreateQuotation && (
                      <button onClick={() => {
                        const primaryContact = contacts_.find(c => c.isPrimary) || contacts_[0]
                        setSelected(null)
                        onCreateQuotation({
                          customerName:         selected.customerName,
                          paymentTerms:         r.paymentTerms,
                          kaeAssignedId:        selected.assignedKaeId,
                          clientContactName:    primaryContact?.name,
                          clientContactDetails: primaryContact ? [primaryContact.phone, primaryContact.email].filter(Boolean).join(' / ') : undefined,
                        })
                      }}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all btn-primary">
                        <FilePlus size={12} /> Create Quote
                      </button>
                    )}
                    <button onClick={() => setSelected(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Total PO Value', value: `SAR ${Number(selected.totalPoValue).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: '#2563eb' },
                    { label: 'Conversion Rate', value: `${pct.toFixed(0)}% (${selected.totalConverted}/${selected.totalRfq} RFQs)`, color: convColor },
                    { label: 'Credit Utilization', value: r.creditLimit ? `${creditUsed.toFixed(0)}% of SAR ${Number(r.creditLimit).toLocaleString()}` : 'No limit set', color: creditColor },
                    { label: 'Lead Source', value: r.leadSource || 'Not specified', color: '#7c3aed' },
                  ].map(kpi => (
                    <div key={kpi.label} className="rounded-xl px-3 py-2.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <p className="text-xs text-slate-400">{kpi.label}</p>
                      <p className="text-sm font-bold mt-0.5" style={{ color: kpi.color }}>{kpi.value}</p>
                    </div>
                  ))}
                </div>

                {/* Sub-tabs */}
                <div className="flex items-center gap-0.5 mt-4">
                  {DETAIL_TABS.map(t => (
                    <button key={t.id} onClick={() => setDetailTab(t.id)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-all"
                      style={detailTab === t.id
                        ? { background: '#2563eb', color: '#fff' }
                        : { color: '#64748b' }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Tab content ───────────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-6">

                {/* ── Profile & Contacts ─────────────────────────── */}
                {detailTab === 'profile' && (
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left: Company Info */}
                    <div className="space-y-5">
                      <div>
                        <SectionHead title="Company Information" icon={<Building2 size={13} />} />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <Field label="Industry"    value={r.industry} />
                          <Field label="Website"     value={r.website}  icon={<Globe size={12} className="text-slate-400" />} />
                          <Field label="Phone"       value={r.phone}    icon={<Phone size={12} className="text-slate-400" />} />
                          <Field label="Email"       value={r.email}    icon={<Mail size={12} className="text-slate-400" />} />
                          <Field label="Lead Source" value={r.leadSource} />
                          <Field label="Key Account Manager" value={selected.assignedKam?.name} />
                          <Field label="Key Account Engineer" value={selected.assignedKae?.name} />
                          <Field label="First Activity" value={selected.firstActivityDate ? new Date(selected.firstActivityDate).toLocaleDateString('en-GB') : undefined} />
                          <Field label="Last Activity"  value={selected.lastActivityDate  ? new Date(selected.lastActivityDate).toLocaleDateString('en-GB')  : undefined} />
                        </div>
                      </div>

                      <div>
                        <SectionHead title="Primary Address" icon={<MapPin size={13} />} />
                        {addr_.street || addr_.city ? (
                          <div className="text-sm text-slate-700 space-y-0.5 p-3 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                            {addr_.street  && <p>{addr_.street}</p>}
                            {addr_.city    && <p>{addr_.city}{addr_.region ? `, ${addr_.region}` : ''} {addr_.postalCode}</p>}
                            {addr_.country && <p className="text-slate-500">{addr_.country}</p>}
                          </div>
                        ) : <p className="text-xs text-slate-300">No address on file</p>}
                      </div>


                      {selected.remarks && (
                        <div>
                          <SectionHead title="Remarks" icon={<Hash size={13} />} />
                          <p className="text-sm text-slate-600 italic px-3 py-2 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                            &ldquo;{selected.remarks}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right: Key Personnel */}
                    <div>
                      <SectionHead title={`Key Personnel (${contacts_.length})`} icon={<Users size={13} />} />
                      {contacts_.length === 0 ? (
                        <p className="text-xs text-slate-300 py-4 text-center border-2 border-dashed rounded-xl" style={{ borderColor: '#e2e8f0' }}>No contacts on file</p>
                      ) : (
                        <div className="space-y-3">
                          {contacts_.map((c, i) => (
                            <div key={i} className="p-3 rounded-xl" style={{ background: c.isPrimary ? '#eff6ff' : '#f8fafc', border: `1px solid ${c.isPrimary ? '#bfdbfe' : '#f1f5f9'}` }}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                                  <p className="text-xs text-slate-500">{c.title}</p>
                                </div>
                                {c.isPrimary && (
                                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                    <Star size={9} /> Primary
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-2">
                                {c.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                                {c.email && <span className="text-xs text-slate-500 flex items-center gap-1"><Mail size={10} />{c.email}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Billing & Finance ──────────────────────────── */}
                {detailTab === 'billing' && (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-5">
                      <div>
                        <SectionHead title="Payment & Pricing" icon={<CreditCard size={13} />} />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <Field label="Payment Terms" value={r.paymentTerms} />
                          <Field label="Currency"      value={r.currency} />
                          <Field label="Price Tier"    value={r.priceTier ? TIER[r.priceTier]?.label : undefined} />
                          <Field label="Discount Rate" value={r.discountRate != null ? `${r.discountRate}%` : undefined} />
                        </div>
                      </div>
                      <div>
                        <SectionHead title="Tax Information" icon={<Landmark size={13} />} />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <Field label="VAT / Tax ID" value={r.taxId} />
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">Tax Exempt</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.taxExempt ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {r.taxExempt ? 'Yes — Exempt' : 'No — Taxable'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <SectionHead title="Credit Facility" icon={<TrendingUp size={13} />} />
                      {r.creditLimit ? (
                        <div className="p-4 rounded-xl space-y-4" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-slate-400">Credit Limit</p>
                              <p className="text-base font-bold text-slate-800 mt-0.5">SAR {Number(r.creditLimit).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Outstanding Balance</p>
                              <p className="text-base font-bold mt-0.5" style={{ color: creditColor }}>SAR {Number(r.creditBalance).toLocaleString()}</p>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-400">Credit Utilization</span>
                              <span className="font-bold" style={{ color: creditColor }}>{creditUsed.toFixed(1)}%</span>
                            </div>
                            <div className="h-3 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${creditUsed}%`, background: creditColor }} />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              SAR {(Number(r.creditLimit) - Number(r.creditBalance)).toLocaleString()} available
                            </p>
                          </div>
                        </div>
                      ) : <p className="text-xs text-slate-300">No credit facility configured</p>}
                    </div>
                  </div>
                )}

                {/* ── Shipping & Logistics ───────────────────────── */}
                {detailTab === 'shipping' && (
                  <div className="space-y-6">
                    <div>
                      <SectionHead title="Default Carrier" icon={<Truck size={13} />} />
                      <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 480 }}>
                        <Field label="Carrier" value={r.defaultCarrier} icon={<Truck size={12} className="text-slate-400" />} />
                        <Field label="Account Number" value={r.carrierAccount} />
                      </div>
                    </div>
                    <div>
                      <SectionHead title={`Shipping Addresses (${addresses_.length})`} icon={<MapPin size={13} />} />
                      {addresses_.length === 0 ? (
                        <p className="text-xs text-slate-300 py-4 text-center border-2 border-dashed rounded-xl" style={{ borderColor: '#e2e8f0' }}>No shipping addresses on file</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {addresses_.map((a, i) => (
                            <div key={i} className="p-4 rounded-xl" style={{ background: a.isDefault ? '#f0fdf4' : '#f8fafc', border: `1px solid ${a.isDefault ? '#bbf7d0' : '#f1f5f9'}` }}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-semibold text-slate-800">{a.label || `Address ${i + 1}`}</p>
                                {a.isDefault && <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>Default</span>}
                              </div>
                              <div className="text-xs text-slate-600 space-y-0.5">
                                <p>{a.street}</p>
                                <p>{a.city}{a.region ? `, ${a.region}` : ''} {a.postalCode}</p>
                                <p className="text-slate-400">{a.country}</p>
                                {a.deliveryInstructions && <p className="mt-1 pt-1 border-t italic" style={{ borderColor: '#e2e8f0' }}>📋 {a.deliveryInstructions}</p>}
                                {a.receivingHours && <p className="text-slate-500">🕐 {a.receivingHours}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Order History ──────────────────────────────── */}
                {detailTab === 'orders' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                      {[
                        { label: 'Total RFQs',   value: selected.totalRfq,       color: '#2563eb' },
                        { label: 'Converted',     value: selected.totalConverted,  color: '#15803d' },
                        { label: 'Total Quoted',  value: `SAR ${Number(selected.totalValueQuoted).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: '#7c3aed' },
                        { label: 'Total PO Value', value: `SAR ${Number(selected.totalPoValue).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`,    color: '#0891b2' },
                      ].map(k => (
                        <div key={k.label} className="p-4 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                          <p className="text-xs text-slate-400">{k.label}</p>
                          <p className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Conversion Performance</p>
                      <div className="p-4 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-slate-500">{selected.totalConverted} of {selected.totalRfq} RFQs converted</span>
                          <span className="font-bold" style={{ color: convColor }}>{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-4 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: convColor }} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">First Activity</p>
                        <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
                          <Calendar size={12} className="text-slate-400" />
                          {selected.firstActivityDate ? new Date(selected.firstActivityDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Last Activity</p>
                        <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
                          <Calendar size={12} className="text-slate-400" />
                          {selected.lastActivityDate ? new Date(selected.lastActivityDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <p className="text-xs text-amber-700 font-semibold mb-1">Note</p>
                      <p className="text-xs text-amber-600">Detailed quotation and PO history can be found in the Quotations and PO Tracker tabs, filtered by this customer name.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══════════════════════════════════════════════════════════════════════
          NEW / EDIT CUSTOMER FORM MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: 20, paddingBottom: 20, overflowY: 'auto' }}>
          <div className="modal-box" style={{ maxWidth: 840, width: '97vw', maxHeight: '92vh', overflowY: 'auto' }}>

            {/* Form Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <Building2 size={16} className="text-blue-500" />
                  {editRow ? `Edit — ${editRow.customerName}` : 'New Customer'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Fill in all sections to build a complete customer profile</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>

            {/* Section tabs */}
            <div className="flex items-center gap-1 mb-5 p-1 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
              {([
                { id: 'profile',   label: 'Profile & Contacts', icon: <Building2 size={12} /> },
                { id: 'billing',   label: 'Billing & Finance',  icon: <CreditCard size={12} /> },
                { id: 'logistics', label: 'Shipping & Logistics', icon: <Truck size={12} /> },
              ] as const).map(s => (
                <button key={s.id} onClick={() => setFormSection(s.id)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-all flex-1 justify-center"
                  style={formSection === s.id ? { background: '#fff', color: '#2563eb', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' } : { color: '#64748b' }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            {/* ── Section: Profile & Contacts ──────────────────────────────── */}
            {formSection === 'profile' && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Company Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="form-label">Customer / Company Name <span className="text-red-500">*</span></label>
                      <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className="form-input" placeholder="e.g. Saudi Electricity Company" />
                    </div>
                    <div>
                      <label className="form-label">Status</label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                        <option>Active</option><option>Prospect</option><option>Inactive</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Industry</label>
                      <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} className="form-input" placeholder="e.g. Oil & Gas" />
                    </div>
                    <div>
                      <label className="form-label">Phone</label>
                      <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="form-input" placeholder="+966-11-200-3000" />
                    </div>
                    <div>
                      <label className="form-label">Email</label>
                      <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="form-input" placeholder="procurement@company.com" />
                    </div>
                    <div>
                      <label className="form-label">Website</label>
                      <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="form-input" placeholder="www.company.com" />
                    </div>
                    <div>
                      <label className="form-label">Key Account Manager (KAM)</label>
                      <select value={form.assignedKamId} onChange={e => setForm(f => ({ ...f, assignedKamId: e.target.value }))} className="form-input">
                        <option value="">— Unassigned —</option>
                        {kaeUsers.filter(u => ['P1_CEO','P2_ADMIN','P3_KEY_ACCOUNT_MANAGER','P4_REGIONAL_MANAGER','P5_SALES_MANAGER'].includes(u.role)).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Key Account Engineer (KAE)</label>
                      <select value={form.assignedKaeId} onChange={e => setForm(f => ({ ...f, assignedKaeId: e.target.value }))} className="form-input">
                        <option value="">— Unassigned —</option>
                        {kaeUsers.filter(u => ['P6_KEY_ACCOUNT_ENGINEER','P7_INSIDE_SALES_ENGINEER'].includes(u.role)).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Primary Address</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="form-label">Street</label>
                      <input value={form.addrStreet} onChange={e => setForm(f => ({ ...f, addrStreet: e.target.value }))} className="form-input" placeholder="Street address" />
                    </div>
                    <div>
                      <label className="form-label">City</label>
                      <input value={form.addrCity} onChange={e => setForm(f => ({ ...f, addrCity: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Region / Province</label>
                      <input value={form.addrRegion} onChange={e => setForm(f => ({ ...f, addrRegion: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Postal Code</label>
                      <input value={form.addrPostalCode} onChange={e => setForm(f => ({ ...f, addrPostalCode: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Country</label>
                      <input value={form.addrCountry} onChange={e => setForm(f => ({ ...f, addrCountry: e.target.value }))} className="form-input" />
                    </div>
                  </div>
                </div>

                {/* Key Personnel */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Key Personnel ({contacts.length})</p>
                    <button onClick={() => setContacts(c => [...c, blankContact()])}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all"
                      style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                      <UserPlus size={11} /> Add Contact
                    </button>
                  </div>
                  <div className="space-y-3">
                    {contacts.map((c, i) => (
                      <div key={i} className="p-3 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input value={c.name}  onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value }  : x))} className="form-input" style={{ fontSize: 12 }} placeholder="Full Name" />
                          <input value={c.title} onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} className="form-input" style={{ fontSize: 12 }} placeholder="Title / Position" />
                          <input value={c.phone} onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} className="form-input" style={{ fontSize: 12 }} placeholder="Phone" />
                          <input value={c.email} onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} className="form-input" style={{ fontSize: 12 }} placeholder="Email" />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
                            <input type="checkbox" checked={c.isPrimary} onChange={e => setContacts(prev => prev.map((x, j) => j === i ? { ...x, isPrimary: e.target.checked } : x))} className="w-3.5 h-3.5 accent-blue-600" />
                            Primary Contact
                          </label>
                          <button onClick={() => setContacts(prev => prev.filter((_, j) => j !== i))}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label">Remarks (internal)</label>
                  <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" />
                </div>
              </div>
            )}

            {/* ── Section: Billing & Finance ─────────────────────────────────── */}
            {formSection === 'billing' && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Pricing & Payment</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Price Tier</label>
                      <select value={form.priceTier} onChange={e => setForm(f => ({ ...f, priceTier: e.target.value }))} className="form-input">
                        {Object.keys(TIER).map(k => <option key={k} value={k}>{TIER[k].label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Discount Rate (%)</label>
                      <input type="number" min={0} max={100} step={0.5} value={form.discountRate} onChange={e => setForm(f => ({ ...f, discountRate: parseFloat(e.target.value) || 0 }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Payment Terms</label>
                      <input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} className="form-input" placeholder="e.g. Net 30, Net 60" />
                    </div>
                    <div>
                      <label className="form-label">Currency</label>
                      <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="form-input">
                        <option>SAR</option><option>USD</option><option>EUR</option><option>AED</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Credit Facility</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Credit Limit (SAR)</label>
                      <input type="number" min={0} value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: parseFloat(e.target.value) || 0 }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Outstanding Balance (SAR)</label>
                      <input type="number" min={0} value={form.creditBalance} onChange={e => setForm(f => ({ ...f, creditBalance: parseFloat(e.target.value) || 0 }))} className="form-input" />
                    </div>
                  </div>
                  {form.creditLimit > 0 && (
                    <div className="mt-3 p-3 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Credit utilization preview</span>
                        <span className="font-bold" style={{ color: form.creditLimit > 0 ? ((form.creditBalance / form.creditLimit * 100) >= 80 ? '#dc2626' : '#16a34a') : '#64748b' }}>
                          {form.creditLimit > 0 ? (form.creditBalance / form.creditLimit * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(form.creditLimit > 0 ? (form.creditBalance / form.creditLimit * 100) : 0, 100)}%`,
                          background: form.creditLimit > 0 ? ((form.creditBalance / form.creditLimit * 100) >= 80 ? '#dc2626' : '#16a34a') : '#16a34a'
                        }} />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Tax Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">VAT / Tax ID</label>
                      <input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} className="form-input" placeholder="e.g. 300012345600003" />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.taxExempt} onChange={e => setForm(f => ({ ...f, taxExempt: e.target.checked }))} className="w-4 h-4 accent-green-600" />
                        <span className="text-sm text-slate-700 font-medium">Tax Exempt</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Section: Logistics ─────────────────────────────────────────── */}
            {formSection === 'logistics' && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Default Carrier</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Carrier Name</label>
                      <input value={form.defaultCarrier} onChange={e => setForm(f => ({ ...f, defaultCarrier: e.target.value }))} className="form-input" placeholder="e.g. SMSA Express, DHL, Naqel" />
                    </div>
                    <div>
                      <label className="form-label">Carrier Account #</label>
                      <input value={form.carrierAccount} onChange={e => setForm(f => ({ ...f, carrierAccount: e.target.value }))} className="form-input" placeholder="e.g. SMSA-001-XYZ" />
                    </div>
                  </div>
                </div>

                {/* Shipping Addresses */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Shipping Addresses ({addresses.length})</p>
                    <button onClick={() => setAddresses(a => [...a, blankAddress()])}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all"
                      style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                      <Plus size={11} /> Add Address
                    </button>
                  </div>
                  <div className="space-y-4">
                    {addresses.map((a, i) => (
                      <div key={i} className="p-4 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <input value={a.label} onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                              className="form-input" style={{ fontSize: 12, width: 180 }} placeholder="Label e.g. Main Warehouse" />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
                              <input type="checkbox" checked={a.isDefault} onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, isDefault: e.target.checked } : x))} className="w-3.5 h-3.5 accent-green-600" />
                              Default
                            </label>
                            <button onClick={() => setAddresses(prev => prev.filter((_, j) => j !== i))}
                              className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <input value={a.street} onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, street: e.target.value } : x))}
                              className="form-input" style={{ fontSize: 12 }} placeholder="Street address" />
                          </div>
                          <input value={a.city}       onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, city:       e.target.value } : x))} className="form-input" style={{ fontSize: 12 }} placeholder="City" />
                          <input value={a.region}     onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, region:     e.target.value } : x))} className="form-input" style={{ fontSize: 12 }} placeholder="Region" />
                          <input value={a.postalCode} onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, postalCode: e.target.value } : x))} className="form-input" style={{ fontSize: 12 }} placeholder="Postal Code" />
                          <input value={a.country}    onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, country:    e.target.value } : x))} className="form-input" style={{ fontSize: 12 }} placeholder="Country" />
                          <input value={a.deliveryInstructions} onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, deliveryInstructions: e.target.value } : x))}
                            className="form-input col-span-2" style={{ fontSize: 12 }} placeholder="Delivery instructions (e.g. Use Gate B, call before delivery)" />
                          <input value={a.receivingHours} onChange={e => setAddresses(prev => prev.map((x, j) => j === i ? { ...x, receivingHours: e.target.value } : x))}
                            className="form-input col-span-2" style={{ fontSize: 12 }} placeholder="Receiving hours (e.g. Sun–Thu 8am–5pm)" />
                        </div>
                      </div>
                    ))}
                    {addresses.length === 0 && (
                      <div className="text-center py-6 text-xs text-slate-300 border-2 border-dashed rounded-xl" style={{ borderColor: '#e2e8f0' }}>
                        No shipping addresses added yet. Click &quot;Add Address&quot; to add one.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Form footer */}
            <div className="flex items-center justify-between pt-5 mt-5" style={{ borderTop: '1px solid #f1f5f9' }}>
              <div className="flex gap-1">
                {(['profile', 'billing', 'logistics'] as const).map((s, i) => (
                  <button key={s} onClick={() => setFormSection(s)}
                    className="w-2 h-2 rounded-full transition-all"
                    style={{ background: formSection === s ? '#2563eb' : '#e2e8f0' }}
                    title={['Profile', 'Billing', 'Logistics'][i]} />
                ))}
              </div>
              <div className="flex gap-2">
                {formSection !== 'profile' && (
                  <button onClick={() => setFormSection(s => s === 'logistics' ? 'billing' : 'profile')} className="btn-outline">← Back</button>
                )}
                {formSection !== 'logistics' ? (
                  <button onClick={() => setFormSection(s => s === 'profile' ? 'billing' : 'logistics')} className="btn-primary">
                    Next <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
                  </button>
                ) : (
                  <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ opacity: saving ? 0.7 : 1 }}>
                    <Check size={14} /> {saving ? 'Saving…' : editRow ? 'Save Changes' : 'Create Customer'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
