'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { SessionUser, SalesOrder, SalesOrderItem } from '@/types'
import { canWrite } from '@/lib/rbac'
import { toastSuccess, toastError } from '@/components/shared/Toast'
import {
  FileText, Plus, Pencil, Trash2, Download, RefreshCw,
  ChevronDown, ChevronUp, X, Search, CheckCircle2, Receipt, CalendarDays, FileCheck,
} from 'lucide-react'

interface Props { user: SessionUser }

interface WfStep { id: string; stepOrder: number; label: string; approverRole: string | null }

type LineForm = {
  sNo: number; description: string; specifications: string; reference: string; make: string
  qty: string; unit: string; unitPrice: string; amount: string; delivery: string
}

const APPROVER_ROLES = ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER']

const SO_STATUSES = ['Draft', 'Confirmed', 'Processing', 'Dispatched', 'Delivered', 'Cancelled']

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  Draft:      { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  Confirmed:  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  Processing: { bg: '#fefce8', text: '#a16207', border: '#fde047' },
  Dispatched: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  Delivered:  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  Cancelled:  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
}

const AP_STYLE: Record<string, { bg: string; text: string }> = {
  Draft:    { bg: '#f8fafc', text: '#64748b' },
  Pending:  { bg: '#fffbeb', text: '#d97706' },
  Approved: { bg: '#f0fdf4', text: '#15803d' },
  Rejected: { bg: '#fef2f2', text: '#b91c1c' },
}

const fmt   = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDt = (s: string)  => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const blankLine = (sNo = 1): LineForm => ({
  sNo, description: '', specifications: '', reference: '', make: '',
  qty: '1', unit: 'Unit', unitPrice: '0', amount: '0', delivery: '',
})

type AttachedFile = { name: string; type: string; size: number; data: string }
const blankForm = () => ({
  customerName: '', poNumber: '', qtRef: '',
  soDate: new Date().toISOString().split('T')[0],
  deliveryDate: '', paymentTerms: '', deliveryTerms: '',
  notes: '', remarks: '', vatRate: '15',
  // Attachments — JSON-encoded for submission, but managed as objects in UI state
  customerPO: null as AttachedFile | null,
  attachments: [] as AttachedFile[],
})

const MAX_FILE_BYTES = 5 * 1024 * 1024  // 5 MB per file

function readFileAsDataUrl(file: File): Promise<AttachedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve({ name: file.name, type: file.type, size: file.size, data: String(reader.result) })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

type ActionModal = { id: string; action: 'revise' | 'reject'; comment: string }

// ── Invoice + Milestones modal types ──────────────────────────────────────────
type InvType = 'PROFORMA' | 'TAX'
type MilestoneStatus = 'Pending' | 'Invoiced' | 'Paid'
type MilestoneForm = { id: string; phaseName: string; pct: string; amountSar: string; dueDate: string; status: MilestoneStatus }
type InvLineForm   = { sNo: number; description: string; qty: string; unit: string; unitPrice: string; amount: string }

const MS_STATUS_CFG: Record<MilestoneStatus, { label: string; bg: string; color: string; border: string; icon: string }> = {
  Pending:  { label: 'Pending',  bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', icon: '⏳' },
  Invoiced: { label: 'Invoiced', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: '📄' },
  Paid:     { label: 'Paid',     bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', icon: '✅' },
}

const blankMilestone = (id: string): MilestoneForm => ({
  id, phaseName: '', pct: '', amountSar: '', dueDate: new Date().toISOString().split('T')[0], status: 'Pending',
})

const INV_SPLIT_PRESETS = [
  { label: '100%',       splits: [100] },
  { label: '50/50',      splits: [50, 50] },
  { label: '30/40/30',   splits: [30, 40, 30] },
  { label: '25/50/25',   splits: [25, 50, 25] },
  { label: '25/25/25/25',splits: [25, 25, 25, 25] },
]

export default function TabSalesOrders({ user }: Props) {
  const canEdit    = canWrite(user.role, 'salesOrders')
  const isApprover = APPROVER_ROLES.includes(user.role)

  // Tax config from company settings
  const [taxCfg, setTaxCfg] = useState({ taxName: 'VAT', taxRate: 15, currency: 'SAR', currencySymbol: 'SAR' })

  const [rows,     setRows]     = useState<SalesOrder[]>([])
  const [wfSteps,  setWfSteps]  = useState<WfStep[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [statusF,  setStatusF]  = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // ── Invoice lookup: keyed by poNumber or soNumber ─────────────────────────
  const [invByPO, setInvByPO] = useState<Record<string, { id: string; invoiceNumber: string; invoiceType: string }[]>>({})

  const loadInvoices = useCallback(async () => {
    try {
      const res  = await fetch('/api/invoices')
      const data = await res.json()
      if (!Array.isArray(data)) return
      const map: Record<string, { id: string; invoiceNumber: string; invoiceType: string }[]> = {}
      for (const inv of data) {
        const keys = [inv.poNumber, inv.qtRef].filter(Boolean) as string[]
        for (const key of keys) {
          if (!map[key]) map[key] = []
          if (!map[key].find(x => x.id === inv.id))
            map[key].push({ id: inv.id, invoiceNumber: inv.invoiceNumber, invoiceType: inv.invoiceType })
        }
      }
      setInvByPO(map)
    } catch { /* non-critical */ }
  }, [])

  const handleDownloadInvoicePdf = async (invId: string, invNumber: string) => {
    try {
      const res = await fetch(`/api/invoices/${invId}/pdf`)
      if (!res.ok) { toastError(`Invoice PDF failed (${res.status})`); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${invNumber}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { toastError('Invoice PDF download failed') }
  }

  // form
  const [showForm,    setShowForm]    = useState(false)
  const [editTarget,  setEditTarget]  = useState<SalesOrder | null>(null)
  const [form,        setForm]        = useState(blankForm())
  const [lines,       setLines]       = useState<LineForm[]>([blankLine()])
  const [formErr,     setFormErr]     = useState('')
  const [saving,      setSaving]      = useState(false)

  // modals
  const [actionModal, setActionModal] = useState<ActionModal | null>(null)
  const [delId,       setDelId]       = useState<string | null>(null)

  // ── Invoice + Milestones modal ─────────────────────────────────────────────
  const [invModal,      setInvModal]      = useState<SalesOrder | null>(null)
  const [invType,       setInvType]       = useState<InvType>('PROFORMA')
  const [invDate,       setInvDate]       = useState(new Date().toISOString().split('T')[0])
  const [supplyDate,    setSupplyDate]    = useState('')
  const [custVatNo,     setCustVatNo]     = useState('')
  const [invLines,      setInvLines]      = useState<InvLineForm[]>([])
  const [invMilestones, setInvMilestones] = useState<MilestoneForm[]>([])
  const [invErr,        setInvErr]        = useState('')
  const [invSaving,     setInvSaving]     = useState(false)

  // ── load tax config once ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.company) {
        setTaxCfg({
          taxName:        d.company.taxName        ?? 'VAT',
          taxRate:        d.company.defaultVatRate ?? 15,
          currency:       d.company.currency       ?? 'SAR',
          currencySymbol: d.company.currencySymbol ?? d.company.currency ?? 'SAR',
        })
      }
    }).catch(() => {/* use defaults */})
  }, [])

  // ── load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)  params.set('search', search)
      if (statusF) params.set('status', statusF)
      const res  = await fetch(`/api/sales-orders?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toastError(err.error || `Failed to load (HTTP ${res.status})`)
        return
      }
      const data = await res.json()
      setRows(data.rows    ?? [])
      setWfSteps(data.wfSteps ?? [])
    } catch (e) {
      toastError('Could not load sales orders')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search, statusF])

  useEffect(() => { load(); loadInvoices() }, [load, loadInvoices])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpi = {
    total:     rows.length,
    confirmed: rows.filter(r => r.status === 'Confirmed').length,
    delivered: rows.filter(r => r.status === 'Delivered').length,
    value:     rows.reduce((s, r) => s + Number(r.total), 0),
  }

  // ── line helpers ─────────────────────────────────────────────────────────────
  const addLine = () => setLines(ls => [...ls, blankLine(ls.length + 1)])
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, sNo: idx + 1 })))
  const updateLine = (i: number, field: keyof LineForm, value: string) => {
    setLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: value }
      if (field === 'qty' || field === 'unitPrice') {
        const q = parseFloat(field === 'qty' ? value : l.qty) || 0
        const p = parseFloat(field === 'unitPrice' ? value : l.unitPrice) || 0
        updated.amount = (q * p).toFixed(2)
      }
      return updated
    }))
  }

  const subtotal  = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const vatRate   = parseFloat(form.vatRate) || 15
  const vatAmount = subtotal * vatRate / 100
  const total     = subtotal + vatAmount

  // ── open form ────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null)
    setForm({ ...blankForm(), vatRate: String(taxCfg.taxRate) })
    setLines([blankLine()])
    setFormErr('')
    setShowForm(true)
  }

  const openEdit = (so: SalesOrder) => {
    setEditTarget(so)
    setForm({
      customerName:  so.customerName,
      poNumber:      so.poNumber      ?? '',
      qtRef:         so.qtRef         ?? '',
      soDate:        so.soDate        ? so.soDate.split('T')[0] : new Date().toISOString().split('T')[0],
      deliveryDate:  so.deliveryDate  ? so.deliveryDate.split('T')[0] : '',
      paymentTerms:  so.paymentTerms  ?? '',
      deliveryTerms: so.deliveryTerms ?? '',
      notes:         so.notes         ?? '',
      remarks:       so.remarks       ?? '',
      vatRate:       String(so.vatRate ?? 15),
      customerPO:    (() => { try { return so.customerPOFile ? JSON.parse(so.customerPOFile) as AttachedFile : null } catch { return null } })(),
      attachments:   (() => { try { return so.attachments    ? JSON.parse(so.attachments)    as AttachedFile[] : [] } catch { return [] } })(),
    })
    setLines(
      (so.lineItems ?? []).length > 0
        ? so.lineItems!.map(l => ({
            sNo: l.sNo, description: l.description,
            specifications: l.specifications ?? '',
            reference: l.reference ?? '', make: l.make ?? '',
            qty: String(l.qty), unit: l.unit ?? 'Unit',
            unitPrice: String(l.unitPrice), amount: String(l.amount),
            delivery: l.delivery ?? '',
          }))
        : [blankLine()]
    )
    setFormErr('')
    setShowForm(true)
  }

  // ── save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.customerName.trim()) { setFormErr('Customer name is required'); return }
    if (lines.some(l => !l.description.trim())) { setFormErr('All line items need a description'); return }
    setSaving(true); setFormErr('')

    // Separate attachment objects from primitive form fields before sending
    const { customerPO, attachments, ...rest } = form
    const payload = {
      ...rest,
      customerPOFile:     customerPO ? JSON.stringify(customerPO) : null,
      customerPOFileName: customerPO?.name ?? null,
      attachments:        attachments && attachments.length > 0 ? JSON.stringify(attachments) : null,
      lineItems: lines.map(l => ({
        sNo: l.sNo, description: l.description,
        specifications: l.specifications || null,
        reference: l.reference || null, make: l.make || null,
        qty: parseFloat(l.qty) || 1, unit: l.unit || null,
        unitPrice: parseFloat(l.unitPrice) || 0,
        amount:    parseFloat(l.amount)    || 0,
        delivery:  l.delivery || null,
      })),
    }

    const method = editTarget ? 'PATCH' : 'POST'
    const body   = editTarget ? { id: editTarget.id, ...payload } : payload

    const res = await fetch('/api/sales-orders', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })

    if (!res.ok) {
      const e = await res.json()
      setFormErr(e.error || 'Save failed')
      setSaving(false); return
    }

    const data = await res.json().catch(() => null)
    if (editTarget) {
      toastSuccess('Sales Order updated')
    } else {
      toastSuccess(`Sales Order ${data?.soNumber ?? ''} created · Submit for approval to trigger procurement`)
    }
    setSaving(false); setShowForm(false); load()
  }

  // ── approval actions ─────────────────────────────────────────────────────────
  const handleSubmit = async (id: string) => {
    const res = await fetch('/api/sales-orders', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'submitForApproval' }),
    })
    if (!res.ok) { const e = await res.json(); toastError(e.error || 'Submit failed'); return }
    toastSuccess('Submitted for approval'); load()
  }

  const handleApprove = async (id: string) => {
    const res = await fetch('/api/sales-orders', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'approve' }),
    })
    if (!res.ok) { const e = await res.json(); toastError(e.error || 'Approve failed'); return }
    const data = await res.json().catch(() => null)
    if (data?.warning) {
      // SO is approved, but procurement step did not complete
      toastSuccess(`Approved — but: ${data.warning}`)
      console.warn('[SO approve]', data.warning)
    } else if (data?.procurementPoNumber) {
      toastSuccess(`Approved · Draft Supplier PO ${data.procurementPoNumber} created · Purchase Manager notified`)
    } else {
      toastSuccess('Approved · Next step pending')
    }
    load()
  }

  const handleResubmit = async (id: string) => {
    const res = await fetch('/api/sales-orders', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'submitForApproval' }),
    })
    if (!res.ok) { const e = await res.json(); toastError(e.error || 'Resubmit failed'); return }
    toastSuccess('Resubmitted for approval'); load()
  }

  const submitAction = async () => {
    if (!actionModal?.comment.trim()) return
    const { id, action, comment } = actionModal
    const res = await fetch('/api/sales-orders', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, comment }),
    })
    if (!res.ok) { const e = await res.json(); toastError(e.error || 'Action failed'); return }
    toastSuccess(action === 'revise' ? 'Returned for revision' : 'Rejected')
    setActionModal(null); load()
  }

  const handleStatusChange = async (id: string, status: string) => {
    const res = await fetch('/api/sales-orders', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'updateStatus', status }),
    })
    if (!res.ok) { const e = await res.json(); toastError(e.error || 'Update failed'); return }
    toastSuccess('Status updated'); load()
  }

  const handleDelete = async () => {
    if (!delId) return
    const res = await fetch('/api/sales-orders', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: delId }),
    })
    if (!res.ok) { const e = await res.json(); toastError(e.error || 'Delete failed'); return }
    toastSuccess('Sales Order deleted'); setDelId(null); load()
  }

  const handlePdf = async (so: SalesOrder) => {
    try {
      const res = await fetch(`/api/sales-orders/${so.id}/pdf`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toastError(err.error || `PDF failed (${res.status})`)
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${so.soNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toastError('PDF download failed — please try again')
    }
  }

  // ── Invoice modal helpers ──────────────────────────────────────────────────
  const openInvModal = (so: SalesOrder) => {
    setInvModal(so)
    setInvType('PROFORMA')
    setInvDate(new Date().toISOString().split('T')[0])
    setSupplyDate('')
    setCustVatNo('')
    setInvErr('')
    setInvLines(
      (so.lineItems ?? []).map(l => ({
        sNo: l.sNo, description: l.description,
        qty: String(l.qty), unit: l.unit ?? 'Unit',
        unitPrice: String(l.unitPrice), amount: String(l.amount),
      }))
    )
    // Default: single 100% milestone
    const total = Number(so.total)
    setInvMilestones([{ id: '1', phaseName: 'Full Payment', pct: '100', amountSar: total.toFixed(2), dueDate: new Date().toISOString().split('T')[0], status: 'Pending' }])
  }

  const applyMilestoneSplit = (splits: number[], soTotal: number) => {
    const today = new Date()
    setInvMilestones(splits.map((pct, i) => {
      const due = new Date(today); due.setDate(today.getDate() + (i + 1) * 30)
      return {
        id: String(i + 1), phaseName: splits.length === 1 ? 'Full Payment' : `Milestone ${i + 1}`,
        pct: String(pct), amountSar: ((soTotal * pct) / 100).toFixed(2),
        dueDate: due.toISOString().split('T')[0], status: 'Pending' as MilestoneStatus,
      }
    }))
  }

  const updateMilestone = (idx: number, field: keyof MilestoneForm, val: string) => {
    setInvMilestones(ms => ms.map((m, i) => {
      if (i !== idx) return m
      const updated = { ...m, [field]: val }
      if (field === 'pct' && invModal) {
        const pct = parseFloat(val) || 0
        updated.amountSar = ((Number(invModal.total) * pct) / 100).toFixed(2)
      }
      return updated as MilestoneForm
    }))
  }

  const invSubtotal = invLines.reduce((s, l) => s + (parseFloat(l.unitPrice) * parseFloat(l.qty) || 0), 0)
  const invVatRate  = parseFloat(String(invModal?.vatRate ?? 15))
  const invVat      = invSubtotal * invVatRate / 100
  const invTotal    = invSubtotal + invVat

  const handleInvSave = async () => {
    if (!invModal) return
    if (invLines.length === 0) { setInvErr('Add at least one line item'); return }
    const msPctSum = invMilestones.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0)
    if (invMilestones.length > 0 && Math.abs(msPctSum - 100) > 0.1) {
      setInvErr(`Milestone percentages must total 100% (currently ${msPctSum.toFixed(1)}%)`); return
    }
    setInvSaving(true); setInvErr('')

    try {
      // 1. Create invoice
      const invRes = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceType:     invType,
          invoiceDate:     invDate,
          supplyDate:      supplyDate || null,
          customerName:    invModal.customerName,
          customerVatNo:   custVatNo || null,
          poNumber:        invModal.poNumber || null,
          // qtRef: use quotation ref if present, otherwise fall back to soNumber
          // so the invByPO lookup can always find this invoice from the SO row
          qtRef:           invModal.qtRef || invModal.soNumber || null,
          vatRate:         invVatRate,
          status:          'Draft',
          lineItems: invLines.map((l, i) => ({
            sNo: l.sNo ?? i + 1, description: l.description,
            qty: parseFloat(l.qty) || 1, unit: l.unit,
            unitPrice: parseFloat(l.unitPrice) || 0,
          })),
        }),
      })
      if (!invRes.ok) {
        const e = await invRes.json()
        setInvErr(e.error || 'Invoice creation failed'); setInvSaving(false); return
      }
      const invoice = await invRes.json()

      // 2. Create payment record with milestones (if any milestones set)
      if (invMilestones.length > 0) {
        const pmRes = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poNumber:     invModal.poNumber || invModal.soNumber,
            customerName: invModal.customerName,
            poValue:      invTotal.toFixed(2),
            remarks:      `Auto-created from ${invModal.soNumber} — ${invoice.invoiceNumber}`,
            milestones: invMilestones.map(m => ({
              phaseName: m.phaseName || `Milestone`,
              amountSar: parseFloat(m.amountSar) || 0,
              dueDate:   m.dueDate,
              status:    m.status,
              paidAt:    m.status === 'Paid' ? new Date().toISOString() : null,
            })),
          }),
        })
        if (!pmRes.ok) {
          // Invoice was created; show the actual error from the API
          const pmErr = await pmRes.json().catch(() => ({}))
          toastError(`Invoice ${invoice.invoiceNumber} created but payment milestones failed: ${pmErr.error || pmErr.detail || `HTTP ${pmRes.status}`}`)
          setInvModal(null); setInvSaving(false); return
        }
      }

      toastSuccess(`${invType === 'PROFORMA' ? 'Proforma Invoice' : 'Tax Invoice'} ${invoice.invoiceNumber} created${invMilestones.length > 0 ? ` · ${invMilestones.length} payment milestone${invMilestones.length > 1 ? 's' : ''} added` : ''}`)
      setInvModal(null)
      loadInvoices()  // refresh invoice map so download button appears immediately
    } catch {
      setInvErr('Unexpected error — please try again')
    } finally {
      setInvSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-screen-xl mx-auto">

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders',  value: kpi.total,              color: '#1d4ed8' },
          { label: 'Confirmed',     value: kpi.confirmed,          color: '#d97706' },
          { label: 'Delivered',     value: kpi.delivered,          color: '#15803d' },
          { label: 'Total Value',   value: `${taxCfg.currencySymbol} ${fmt(kpi.value)}`, color: '#7c3aed' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${k.color}15` }}>
              <FileText size={18} style={{ color: k.color }} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className="text-sm font-bold text-slate-800">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search SO #, customer, PO…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>

        <div className="flex gap-1 flex-wrap">
          {['', ...SO_STATUSES].map(s => (
            <button key={s} onClick={() => setStatusF(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={statusF === s
                ? { background: '#1d4ed8', color: '#fff' }
                : { background: '#f1f5f9', color: '#64748b' }}>
              {s || 'All'}
            </button>
          ))}
        </div>

        <button onClick={load} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>

        {canEdit && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors">
            <Plus size={14} /> New Sales Order
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
            <RefreshCw size={15} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm">No sales orders found</p>
            {canEdit && (
              <button onClick={openAdd} className="mt-3 text-xs text-blue-600 hover:underline">
                + Create your first sales order
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['SO #', 'Date', 'Customer', 'PO / QT Ref', `Total (${taxCfg.currency})`, 'Status', 'Approval', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((so, idx) => {
                const sStyle   = STATUS_STYLE[so.status] ?? STATUS_STYLE.Draft
                const apStatus = (so.approvalStatus as string) ?? 'Draft'
                const apStyle  = AP_STYLE[apStatus] ?? AP_STYLE.Draft
                const apStep   = so.approvalStep ?? 1
                const wfStep   = wfSteps.find(s => s.stepOrder === apStep)
                const isExp    = expanded === so.id

                const canSubmit   = canEdit && apStatus === 'Draft' && so.status === 'Draft'
                const isMyTurn    = isApprover && apStatus === 'Pending' && (
                  user.role === 'P1_CEO' || user.role === 'P2_ADMIN' ||
                  !wfStep || wfStep.approverRole === user.role
                )
                const canResubmit = canEdit && apStatus === 'Draft' && !!so.rejectionNote

                // Parse approval history
                let history: { step: number; label: string; approverName: string; approvedAt: string }[] = []
                try { if (so.approvalHistory) history = JSON.parse(so.approvalHistory) } catch { /* */ }

                return (
                  <React.Fragment key={so.id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                      onClick={() => setExpanded(isExp ? null : so.id)}
                    >
                      {/* SO # */}
                      <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{so.soNumber}</td>

                      {/* Date */}
                      <td className="px-4 py-3 text-slate-600">{fmtDt(so.soDate)}</td>

                      {/* Customer */}
                      <td className="px-4 py-3 text-slate-700 font-medium">{so.customerName}</td>

                      {/* PO / QT */}
                      <td className="px-4 py-3 text-slate-500">
                        {so.poNumber && <span className="block">{so.poNumber}</span>}
                        {so.qtRef    && <span className="block text-slate-400">{so.qtRef}</span>}
                        {!so.poNumber && !so.qtRef && '—'}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 font-semibold text-slate-800">{taxCfg.currencySymbol} {fmt(Number(so.total))}</td>

                      {/* Status */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {canEdit && !['Delivered', 'Cancelled'].includes(so.status) && apStatus === 'Approved' ? (
                          <select
                            value={so.status}
                            onChange={e => handleStatusChange(so.id, e.target.value)}
                            className="text-xs rounded-lg px-2 py-0.5 border font-semibold focus:outline-none"
                            style={{ background: sStyle.bg, color: sStyle.text, borderColor: sStyle.border }}
                          >
                            {SO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold border"
                            style={{ background: sStyle.bg, color: sStyle.text, borderColor: sStyle.border }}>
                            {so.status}
                          </span>
                        )}
                      </td>

                      {/* Approval */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold w-fit"
                            style={{ background: apStyle.bg, color: apStyle.text }}>
                            {apStatus}
                          </span>
                          {apStatus === 'Pending' && wfSteps.length > 0 && (
                            <span className="text-xs text-slate-400">
                              Step {apStep}/{wfSteps.length}{wfStep ? ` · ${wfStep.label}` : ''}
                            </span>
                          )}
                          <div className="flex gap-1 flex-wrap">
                            {canSubmit && (
                              <button onClick={() => handleSubmit(so.id)}
                                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium"
                                style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                ↑ Submit
                              </button>
                            )}
                            {canResubmit && (
                              <button onClick={() => handleResubmit(so.id)}
                                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium text-white"
                                style={{ background: '#d97806' }}>
                                ↩ Resubmit
                              </button>
                            )}
                            {isMyTurn && (<>
                              <button onClick={() => handleApprove(so.id)}
                                className="text-xs px-2 py-0.5 rounded-lg font-medium"
                                style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                                ✓ Approve
                              </button>
                              <button onClick={() => setActionModal({ id: so.id, action: 'revise', comment: '' })}
                                className="text-xs px-2 py-0.5 rounded-lg font-medium"
                                style={{ background: '#fffbeb', color: '#d97806', border: '1px solid #fde68a' }}>
                                ↩ Revise
                              </button>
                              <button onClick={() => setActionModal({ id: so.id, action: 'reject', comment: '' })}
                                className="text-xs px-2 py-0.5 rounded-lg font-medium"
                                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                                ✕ Reject
                              </button>
                            </>)}
                          </div>
                          {/* Banners */}
                          {apStatus === 'Draft' && so.rejectionNote && (
                            <div className="mt-1 text-xs px-2 py-1 rounded"
                              style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                              ↩ <span className="font-medium">Revision:</span> {so.rejectionNote}
                            </div>
                          )}
                          {apStatus === 'Rejected' && so.rejectionNote && (
                            <div className="mt-1 text-xs px-2 py-1 rounded"
                              style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                              ✕ <span className="font-medium">Rejected:</span> {so.rejectionNote}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handlePdf(so)} title="Download Sales Order PDF"
                            className="text-slate-400 hover:text-blue-600 transition-colors">
                            <Download size={14} />
                          </button>
                          {/* Download existing invoice(s) */}
                          {(() => {
                            const linked = [
                              ...(invByPO[so.poNumber ?? ''] ?? []),
                              ...(invByPO[so.qtRef    ?? ''] ?? []),   // invoices linked via quotation ref
                              ...(invByPO[so.soNumber]       ?? []),   // invoices where qtRef = soNumber (fallback)
                            ].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
                            if (linked.length === 0) return null
                            // Show one button per invoice (usually 1)
                            return linked.map(inv => (
                              <button
                                key={inv.id}
                                onClick={() => handleDownloadInvoicePdf(inv.id, inv.invoiceNumber)}
                                title={`Download ${inv.invoiceType === 'TAX' ? 'Tax Invoice' : 'Proforma Invoice'} ${inv.invoiceNumber}`}
                                className="transition-colors"
                                style={{ color: inv.invoiceType === 'TAX' ? '#059669' : '#7c3aed' }}
                              >
                                <FileCheck size={14} />
                              </button>
                            ))
                          })()}
                          {canEdit && (
                            <button onClick={() => openInvModal(so)}
                              title="Create PI / Tax Invoice"
                              className="text-slate-400 hover:text-emerald-600 transition-colors">
                              <Receipt size={14} />
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => openEdit(so)} title="Edit Sales Order"
                              className="text-slate-400 hover:text-blue-600 transition-colors">
                              <Pencil size={14} />
                            </button>
                          )}
                          {canEdit && ['Draft', 'Cancelled'].includes(so.status) && (
                            <button onClick={() => setDelId(so.id)} title="Delete"
                              className="text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                          {isExp
                            ? <ChevronUp size={14} className="text-slate-400" />
                            : <ChevronDown size={14} className="text-slate-400" />
                          }
                        </div>
                      </td>
                    </tr>

                    {/* Expanded: line items + history */}
                    {isExp && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={8} className="px-6 py-3">
                          <div className="space-y-3">

                            {/* Line items */}
                            <div className="rounded-lg overflow-hidden border border-slate-200">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ background: '#e2e8f0' }}>
                                    {['#', 'Description', 'Ref', 'Make', 'Qty', 'Unit', 'Unit Price', 'Amount'].map(h => (
                                      <th key={h} className="text-left px-3 py-1.5 text-slate-600 font-semibold">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(so.lineItems ?? []).map((li, i) => (
                                    <tr key={li.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                      <td className="px-3 py-1.5 text-slate-500 align-top">{li.sNo}</td>
                                      <td className="px-3 py-1.5 text-slate-700">
                                        <div className="font-medium">{li.description}</div>
                                        {li.specifications && (
                                          <div className="text-[11px] text-slate-500 whitespace-pre-line mt-0.5">{li.specifications}</div>
                                        )}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-500">{li.reference ?? '—'}</td>
                                      <td className="px-3 py-1.5 text-slate-500">{li.make ?? '—'}</td>
                                      <td className="px-3 py-1.5 text-slate-600">{li.qty}</td>
                                      <td className="px-3 py-1.5 text-slate-500">{li.unit ?? ''}</td>
                                      <td className="px-3 py-1.5 text-slate-600">{fmt(li.unitPrice)}</td>
                                      <td className="px-3 py-1.5 font-semibold text-slate-800">{taxCfg.currencySymbol} {fmt(li.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ background: '#f1f5f9' }}>
                                    <td colSpan={7} className="px-3 py-1.5 text-right text-slate-500 font-semibold">Sub-total</td>
                                    <td className="px-3 py-1.5 font-semibold text-slate-800">{taxCfg.currencySymbol} {fmt(Number(so.subtotal))}</td>
                                  </tr>
                                  <tr style={{ background: '#f1f5f9' }}>
                                    <td colSpan={7} className="px-3 py-1.5 text-right text-slate-500 font-semibold">{taxCfg.taxName} {so.vatRate}%</td>
                                    <td className="px-3 py-1.5 font-semibold text-slate-800">{taxCfg.currencySymbol} {fmt(Number(so.vatAmount))}</td>
                                  </tr>
                                  <tr style={{ background: '#e2e8f0' }}>
                                    <td colSpan={7} className="px-3 py-1.5 text-right text-slate-700 font-bold">TOTAL</td>
                                    <td className="px-3 py-1.5 font-bold text-slate-900">{taxCfg.currencySymbol} {fmt(Number(so.total))}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* Approval history */}
                            {history.length > 0 && (
                              <div className="space-y-1.5 pl-1">
                                {history.map((h, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <CheckCircle2 size={11} className="text-green-600 shrink-0" />
                                    <span className="text-slate-500">
                                      <span className="text-slate-700 font-medium">Step {h.step}</span>
                                      {h.label ? ` · ${h.label}` : ''} —{' '}
                                      <span className="text-green-700">{h.approverName}</span>{' '}
                                      <span className="text-slate-400">
                                        {new Date(h.approvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Notes */}
                            {(so.notes || so.remarks) && (
                              <p className="text-xs text-slate-500 italic px-1">
                                {so.notes}{so.notes && so.remarks ? ' — ' : ''}{so.remarks}
                              </p>
                            )}

                            {/* Attachments */}
                            {(so.customerPOFile || so.attachments) && (() => {
                              let poFile: AttachedFile | null = null
                              let extras:  AttachedFile[]      = []
                              try { if (so.customerPOFile) poFile = JSON.parse(so.customerPOFile) } catch { /* */ }
                              try { if (so.attachments)    extras = JSON.parse(so.attachments) }    catch { /* */ }
                              if (!poFile && extras.length === 0) return null
                              return (
                                <div className="pl-1 space-y-1">
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Documents</div>
                                  <div className="flex flex-wrap gap-2">
                                    {poFile && (
                                      <a href={poFile.data} download={poFile.name}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
                                        <FileText size={11} /> Customer PO · {poFile.name}
                                      </a>
                                    )}
                                    {extras.map((a, i) => (
                                      <a key={i} href={a.data} download={a.name}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border bg-white border-slate-200 text-slate-600 hover:bg-slate-50">
                                        <FileText size={11} /> {a.name}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Procurement link badge */}
                            {so.procurementPoNumber && (
                              <div className="text-xs px-2 py-1 rounded inline-flex items-center gap-1.5"
                                style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                                🛒 Procurement: <span className="font-mono font-semibold">{so.procurementPoNumber}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create / Edit Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-2xl my-8">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"
              style={{ background: '#f8fafc' }}>
              <h3 className="text-sm font-semibold text-slate-800">
                {editTarget ? `Edit — ${editTarget.soNumber}` : 'New Sales Order'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              {formErr && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{formErr}</div>
              )}

              {/* Customer + Refs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Customer Name *</label>
                  <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Customer PO No.</label>
                  <input value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))}
                    placeholder="e.g. PO-2026-001"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Quotation Ref.</label>
                  <input value={form.qtRef} onChange={e => setForm(f => ({ ...f, qtRef: e.target.value }))}
                    placeholder="e.g. DLITSA0526A001QN01"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              {/* Dates + Terms */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SO Date</label>
                  <input type="date" value={form.soDate} onChange={e => setForm(f => ({ ...f, soDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Expected Delivery</label>
                  <input type="date" value={form.deliveryDate} onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Payment Terms</label>
                  <input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
                    placeholder="e.g. 30 days net"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Delivery Terms</label>
                  <input value={form.deliveryTerms} onChange={e => setForm(f => ({ ...f, deliveryTerms: e.target.value }))}
                    placeholder="e.g. DDP Riyadh"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              {/* Tax rate */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600">{taxCfg.taxName} Rate (%)</label>
                <input type="number" min="0" max="100" value={form.vatRate}
                  onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))}
                  className="w-24 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400" />
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Line Items</p>
                  <button onClick={addLine}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors">
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['#', 'Description *', 'Ref', 'Make', 'Qty', 'Unit', 'Unit Price', 'Amount', ''].map(h => (
                          <th key={h} className="text-left px-2 py-2 text-slate-500 font-semibold border-b border-slate-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td className="px-2 py-1.5 text-slate-400 w-8">{l.sNo}</td>
                          <td className="px-2 py-1.5 align-top">
                            <input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)}
                              placeholder="Title line"
                              className="w-full min-w-[180px] px-2 py-1 rounded border border-slate-200 font-medium focus:outline-none focus:border-blue-400" />
                            <textarea value={l.specifications} onChange={e => updateLine(i, 'specifications', e.target.value)}
                              placeholder="Specifications (optional, multi-line)" rows={2}
                              className="w-full min-w-[180px] mt-1 px-2 py-1 rounded border border-slate-100 text-xs text-slate-500 focus:outline-none focus:border-blue-300 resize-y" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={l.reference} onChange={e => updateLine(i, 'reference', e.target.value)}
                              className="w-24 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-blue-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={l.make} onChange={e => updateLine(i, 'make', e.target.value)}
                              className="w-24 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-blue-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" step="0.01" value={l.qty}
                              onChange={e => updateLine(i, 'qty', e.target.value)}
                              className="w-16 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-blue-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={l.unit} onChange={e => updateLine(i, 'unit', e.target.value)}
                              className="w-16 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-blue-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" step="0.01" value={l.unitPrice}
                              onChange={e => updateLine(i, 'unitPrice', e.target.value)}
                              className="w-24 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-blue-400" />
                          </td>
                          <td className="px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap">
                            {taxCfg.currencySymbol} {fmt(parseFloat(l.amount) || 0)}
                          </td>
                          <td className="px-2 py-1.5">
                            {lines.length > 1 && (
                              <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                                <X size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                        <td colSpan={7} className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">
                          Sub-total
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-700">{taxCfg.currencySymbol} {fmt(subtotal)}</td>
                        <td />
                      </tr>
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={7} className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">
                          {taxCfg.taxName} {vatRate}%
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-700">{taxCfg.currencySymbol} {fmt(vatAmount)}</td>
                        <td />
                      </tr>
                      <tr style={{ background: '#e2e8f0' }}>
                        <td colSpan={7} className="px-3 py-2 text-right text-xs text-slate-700 font-bold">TOTAL</td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-900">{taxCfg.currencySymbol} {fmt(total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3} placeholder="Special instructions, delivery notes…"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Internal Remarks</label>
                  <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                    rows={3} placeholder="Internal notes (not shown on PDF)…"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 resize-none" />
                </div>
              </div>

              {/* ── Customer PO + supporting documents ─────────────────────── */}
              <div className="space-y-3 p-4 rounded-xl border border-slate-200" style={{ background: '#fafbff' }}>
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-blue-600" />
                  <span className="text-sm font-semibold text-slate-700">Customer PO &amp; Documents</span>
                </div>

                {/* Customer PO */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Customer PO Scan / PDF
                    <span className="text-slate-400 font-normal"> · max 5 MB</span>
                  </label>
                  {form.customerPO ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-blue-200 bg-blue-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className="text-blue-600 shrink-0" />
                        <span className="text-xs font-medium text-slate-700 truncate">{form.customerPO.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">
                          ({(form.customerPO.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <a href={form.customerPO.data} download={form.customerPO.name}
                          className="p-1 rounded text-slate-400 hover:text-blue-600" title="Download">
                          <Download size={12} />
                        </a>
                        <button onClick={() => setForm(f => ({ ...f, customerPO: null }))}
                          className="p-1 rounded text-slate-400 hover:text-red-500" title="Remove">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-slate-500 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-colors">
                      <FileText size={14} />
                      <span>Click to upload customer PO</span>
                      <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return
                          if (file.size > MAX_FILE_BYTES) { setFormErr(`File too large (max ${MAX_FILE_BYTES/1024/1024} MB)`); return }
                          const att = await readFileAsDataUrl(file)
                          setForm(f => ({ ...f, customerPO: att }))
                          e.target.value = ''
                        }} />
                    </label>
                  )}
                </div>

                {/* Supporting docs */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Supporting Documents <span className="text-slate-400 font-normal">· optional</span>
                  </label>
                  {form.attachments.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {form.attachments.map((a, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white border border-slate-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={12} className="text-slate-400 shrink-0" />
                            <span className="text-xs text-slate-700 truncate">{a.name}</span>
                            <span className="text-xs text-slate-400 shrink-0">({(a.size/1024).toFixed(1)} KB)</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <a href={a.data} download={a.name}
                              className="p-1 rounded text-slate-400 hover:text-blue-600"><Download size={12} /></a>
                            <button onClick={() => setForm(f => ({ ...f, attachments: f.attachments.filter((_, idx) => idx !== i) }))}
                              className="p-1 rounded text-slate-400 hover:text-red-500"><X size={12} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-colors">
                    <Plus size={12} />
                    <span>Add document</span>
                    <input type="file" className="hidden" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                      onChange={async e => {
                        const files = Array.from(e.target.files ?? [])
                        const valid = files.filter(f => {
                          if (f.size > MAX_FILE_BYTES) { setFormErr(`"${f.name}" too large (max ${MAX_FILE_BYTES/1024/1024} MB)`); return false }
                          return true
                        })
                        const atts = await Promise.all(valid.map(readFileAsDataUrl))
                        setForm(f => ({ ...f, attachments: [...f.attachments, ...atts] }))
                        e.target.value = ''
                      }} />
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3" style={{ background: '#f8fafc' }}>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
                {saving ? 'Saving…' : editTarget ? 'Update Order' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revise / Reject Modal ─────────────────────────────────────────────── */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl border p-5 space-y-4 shadow-xl bg-white"
            style={{ borderColor: actionModal.action === 'revise' ? '#fde68a' : '#fecaca' }}>
            <div>
              <p className="text-sm font-semibold"
                style={{ color: actionModal.action === 'revise' ? '#d97806' : '#dc2626' }}>
                {actionModal.action === 'revise' ? '↩ Request Revision' : '✕ Reject Sales Order'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {actionModal.action === 'revise'
                  ? 'The order will be returned to Draft. A comment is required.'
                  : 'This will permanently reject the order. A comment is required.'}
              </p>
            </div>
            <textarea
              value={actionModal.comment}
              onChange={e => setActionModal(m => m ? { ...m, comment: e.target.value } : m)}
              rows={3} autoFocus
              placeholder={actionModal.action === 'revise' ? 'What needs to be changed?' : 'Reason for rejection…'}
              className="w-full px-3 py-2 text-sm rounded-lg text-slate-800 focus:outline-none resize-none"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={submitAction} disabled={!actionModal.comment.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ background: actionModal.action === 'revise' ? '#d97806' : '#dc2626' }}>
                {actionModal.action === 'revise' ? 'Return for Revision' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create PI / Tax Invoice + Milestones Modal ─────────────────────── */}
      {invModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={e => { if (e.target === e.currentTarget) setInvModal(null) }}>
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl my-8 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100" style={{ background: '#f8fafc' }}>
              <div className="flex items-center gap-3">
                <Receipt size={16} className="text-emerald-600" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Create Invoice from {invModal.soNumber}</h3>
                  <p className="text-xs text-slate-400">{invModal.customerName} · {taxCfg.currencySymbol} {fmt(Number(invModal.total))}</p>
                </div>
              </div>
              <button onClick={() => setInvModal(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[78vh]">
              {invErr && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{invErr}</div>
              )}

              {/* Invoice type toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Invoice Type</label>
                <div className="flex gap-2">
                  {(['PROFORMA', 'TAX'] as InvType[]).map(t => (
                    <button key={t} onClick={() => setInvType(t)}
                      className="px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-all"
                      style={invType === t
                        ? { background: '#ecfdf5', color: '#065f46', borderColor: '#6ee7b7' }
                        : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                      {t === 'PROFORMA' ? '📄 Proforma Invoice (PI)' : '🧾 Tax Invoice'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {invType === 'PROFORMA'
                    ? 'Proforma Invoice: Non-binding draft for customer reference. Can be converted to Tax Invoice later.'
                    : 'Tax Invoice: Official ZATCA-compliant invoice with QR code. Used for VAT purposes.'}
                </p>
              </div>

              {/* Dates + VAT number */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Invoice Date</label>
                  <input type="date" value={invDate} onChange={e => setInvDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400" />
                </div>
                {invType === 'TAX' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Supply Date</label>
                    <input type="date" value={supplyDate} onChange={e => setSupplyDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Customer VAT No.</label>
                  <input value={custVatNo} onChange={e => setCustVatNo(e.target.value)}
                    placeholder="e.g. 3xxxxxxxxxxxxxxxxx3"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400" />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Line Items</p>
                  <button onClick={() => setInvLines(ls => [...ls, { sNo: ls.length + 1, description: '', qty: '1', unit: 'Unit', unitPrice: '0', amount: '0' }])}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 transition-colors">
                    <Plus size={12} /> Add Row
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['#', 'Description', 'Qty', 'Unit', 'Unit Price', 'Amount', ''].map(h => (
                          <th key={h} className="text-left px-2 py-2 text-slate-500 font-semibold border-b border-slate-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invLines.map((l, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td className="px-2 py-1.5 text-slate-400 w-8">{l.sNo}</td>
                          <td className="px-2 py-1.5">
                            <input value={l.description}
                              onChange={e => setInvLines(ls => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                              className="w-full min-w-[160px] px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-emerald-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" value={l.qty}
                              onChange={e => setInvLines(ls => ls.map((x, j) => {
                                if (j !== i) return x
                                const q = e.target.value; const amt = ((parseFloat(q)||0)*(parseFloat(x.unitPrice)||0)).toFixed(2)
                                return { ...x, qty: q, amount: amt }
                              }))}
                              className="w-16 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-emerald-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={l.unit}
                              onChange={e => setInvLines(ls => ls.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))}
                              className="w-16 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-emerald-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" step="0.01" value={l.unitPrice}
                              onChange={e => setInvLines(ls => ls.map((x, j) => {
                                if (j !== i) return x
                                const p = e.target.value; const amt = ((parseFloat(x.qty)||0)*(parseFloat(p)||0)).toFixed(2)
                                return { ...x, unitPrice: p, amount: amt }
                              }))}
                              className="w-24 px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-emerald-400" />
                          </td>
                          <td className="px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap">
                            {taxCfg.currencySymbol} {fmt(parseFloat(l.amount)||0)}
                          </td>
                          <td className="px-2 py-1.5">
                            {invLines.length > 1 && (
                              <button onClick={() => setInvLines(ls => ls.filter((_, j) => j !== i).map((x, j) => ({ ...x, sNo: j+1 })))}
                                className="text-slate-300 hover:text-red-500 transition-colors"><X size={13} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                        <td colSpan={5} className="px-3 py-1.5 text-right text-xs text-slate-500 font-semibold">Sub-total</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-slate-700">{taxCfg.currencySymbol} {fmt(invSubtotal)}</td><td/>
                      </tr>
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={5} className="px-3 py-1.5 text-right text-xs text-slate-500 font-semibold">{taxCfg.taxName} {invVatRate}%</td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-slate-700">{taxCfg.currencySymbol} {fmt(invVat)}</td><td/>
                      </tr>
                      <tr style={{ background: '#e2e8f0' }}>
                        <td colSpan={5} className="px-3 py-2 text-right text-xs font-bold text-slate-700">TOTAL</td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-900">{taxCfg.currencySymbol} {fmt(invTotal)}</td><td/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Payment Milestones ────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3" style={{ background: '#f0fdf4' }}>
                  <div className="flex items-center gap-2">
                    <CalendarDays size={14} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-800">Payment Milestones</span>
                    <span className="text-xs text-slate-400">· define how the customer will pay</span>
                  </div>
                  <button onClick={() => setInvMilestones(ms => [...ms, blankMilestone(String(Date.now()))])}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-50 transition-colors">
                    <Plus size={11} /> Add Milestone
                  </button>
                </div>

                {/* Quick split presets */}
                <div className="px-4 py-2 flex items-center gap-2 flex-wrap border-b border-slate-100" style={{ background: '#fafffe' }}>
                  <span className="text-xs text-slate-400 mr-1">Quick split:</span>
                  {INV_SPLIT_PRESETS.map(p => (
                    <button key={p.label} onClick={() => applyMilestoneSplit(p.splits, invTotal)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-slate-600 font-medium">
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Milestone rows */}
                <div className="p-4 space-y-0">
                  {invMilestones.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No milestones yet — add one or use a quick split above</p>
                  )}
                  {invMilestones.map((m, i) => {
                    const cfg = MS_STATUS_CFG[m.status] ?? MS_STATUS_CFG.Pending
                    const isLast = i === invMilestones.length - 1
                    return (
                      <div key={m.id} className="flex gap-3">
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center shrink-0 pt-3">
                          <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold shrink-0 transition-all"
                            style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}>
                            {m.status === 'Paid' ? '✓' : m.status === 'Invoiced' ? '►' : String(i + 1)}
                          </div>
                          {!isLast && (
                            <div className="w-0.5 flex-1 my-1 min-h-[24px]"
                              style={{ background: m.status === 'Paid' ? '#bbf7d0' : m.status === 'Invoiced' ? '#bfdbfe' : '#e2e8f0' }} />
                          )}
                        </div>

                        {/* Card */}
                        <div className="flex-1 mb-3 rounded-xl border p-3 transition-all"
                          style={{ borderColor: cfg.border, background: m.status === 'Paid' ? '#f0fdf4' : m.status === 'Invoiced' ? '#eff6ff' : '#f8fafc' }}>

                          {/* Status selector row */}
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-1.5">
                              {(['Pending', 'Invoiced', 'Paid'] as MilestoneStatus[]).map(s => {
                                const sc = MS_STATUS_CFG[s]
                                const active = m.status === s
                                return (
                                  <button key={s} onClick={() => updateMilestone(i, 'status', s)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all"
                                    style={active
                                      ? { background: sc.bg, color: sc.color, borderColor: sc.border, boxShadow: `0 0 0 2px ${sc.border}` }
                                      : { background: '#fff', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                                    <span>{sc.icon}</span> {sc.label}
                                  </button>
                                )
                              })}
                            </div>
                            <button onClick={() => setInvMilestones(ms => ms.filter((_, j) => j !== i))}
                              className="p-1 rounded text-slate-300 hover:text-red-400 transition-colors">
                              <X size={12} />
                            </button>
                          </div>

                          {/* Fields row */}
                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-2">
                              <label className="block text-[10px] text-slate-400 mb-0.5">Phase Name</label>
                              <input value={m.phaseName} onChange={e => updateMilestone(i, 'phaseName', e.target.value)}
                                placeholder="e.g. Advance Payment"
                                className="w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none transition-colors"
                                style={{ borderColor: cfg.border, background: '#fff' }} />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">% of Total</label>
                              <input type="number" min="0" max="100" value={m.pct}
                                onChange={e => updateMilestone(i, 'pct', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none"
                                style={{ borderColor: cfg.border, background: '#fff' }} />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Amount ({taxCfg.currency})</label>
                              <input type="number" min="0" step="0.01" value={m.amountSar}
                                onChange={e => updateMilestone(i, 'amountSar', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none"
                                style={{ borderColor: cfg.border, background: '#fff' }} />
                            </div>
                          </div>

                          {/* Due date + summary line */}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              <CalendarDays size={11} className="text-slate-400" />
                              <label className="text-[10px] text-slate-400">Due:</label>
                              <input type="date" value={m.dueDate} onChange={e => updateMilestone(i, 'dueDate', e.target.value)}
                                className="px-2 py-1 text-xs rounded-lg border focus:outline-none"
                                style={{ borderColor: cfg.border, background: '#fff' }} />
                            </div>
                            {m.amountSar && (
                              <span className="text-xs font-bold" style={{ color: cfg.color }}>
                                {taxCfg.currencySymbol} {fmt(parseFloat(m.amountSar) || 0)}
                                {m.status === 'Paid' && <span className="ml-1 text-[10px] font-medium">(Payment Received ✓)</span>}
                                {m.status === 'Invoiced' && <span className="ml-1 text-[10px] font-medium">(Invoice Sent — Awaiting Payment)</span>}
                                {m.status === 'Pending' && <span className="ml-1 text-[10px] font-normal text-slate-400">(Not yet invoiced)</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Milestone totals + payment status summary */}
                  {invMilestones.length > 0 && (() => {
                    const pctSum      = invMilestones.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0)
                    const amtSum      = invMilestones.reduce((s, m) => s + (parseFloat(m.amountSar) || 0), 0)
                    const paidAmt     = invMilestones.filter(m => m.status === 'Paid').reduce((s, m) => s + (parseFloat(m.amountSar) || 0), 0)
                    const invoicedAmt = invMilestones.filter(m => m.status === 'Invoiced').reduce((s, m) => s + (parseFloat(m.amountSar) || 0), 0)
                    const pendingAmt  = invMilestones.filter(m => m.status === 'Pending').reduce((s, m) => s + (parseFloat(m.amountSar) || 0), 0)
                    const ok          = Math.abs(pctSum - 100) < 0.1
                    return (
                      <div className="space-y-2 mt-1">
                        {/* Totals validation */}
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold"
                          style={ok
                            ? { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }
                            : { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
                          <span>{ok ? '✓ Milestones total 100%' : `⚠ Milestones total ${pctSum.toFixed(1)}% — must be exactly 100%`}</span>
                          <span>{taxCfg.currencySymbol} {fmt(amtSum)} / {fmt(invTotal)}</span>
                        </div>
                        {/* Payment status breakdown */}
                        <div className="grid grid-cols-3 gap-2">
                          {(['Paid', 'Invoiced', 'Pending'] as MilestoneStatus[]).map(s => {
                            const sc  = MS_STATUS_CFG[s]
                            const amt = s === 'Paid' ? paidAmt : s === 'Invoiced' ? invoicedAmt : pendingAmt
                            return (
                              <div key={s} className="flex flex-col px-3 py-2 rounded-lg border text-center"
                                style={{ background: sc.bg, borderColor: sc.border }}>
                                <span className="text-[10px] font-semibold mb-0.5" style={{ color: sc.color }}>
                                  {sc.icon} {sc.label}
                                </span>
                                <span className="text-xs font-bold" style={{ color: sc.color }}>
                                  {taxCfg.currencySymbol} {fmt(amt)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between" style={{ background: '#f8fafc' }}>
              <p className="text-xs text-slate-400">
                Invoice will be saved as <strong>Draft</strong> — submit for approval from the Invoices module
              </p>
              <div className="flex gap-3">
                <button onClick={() => setInvModal(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                <button onClick={handleInvSave} disabled={invSaving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                  style={{ background: '#059669' }}>
                  <Receipt size={14} />
                  {invSaving ? 'Creating…' : `Create ${invType === 'PROFORMA' ? 'Proforma Invoice' : 'Tax Invoice'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {delId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-80 rounded-2xl border border-red-200 p-6 space-y-4 bg-white shadow-xl">
            <p className="text-sm font-medium text-slate-800">Delete Sales Order?</p>
            <p className="text-xs text-slate-500">Only Draft or Cancelled orders can be deleted. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDelId(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
