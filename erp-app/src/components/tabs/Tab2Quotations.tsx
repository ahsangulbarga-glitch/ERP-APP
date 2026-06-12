'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { SessionUser, Quotation, QuotationLineItem, QuotationStatus, ApprovalStatus, APPROVAL_STATUS_LABELS, MaterialItem } from '@/types'
import { canWrite, canBulkImport, canSubmitForReview, canMarkSubmitted, canRead } from '@/lib/rbac'
import { toastSuccess, toastError } from '@/components/shared/Toast'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import {
  Plus, Download, Upload, FileText, Pencil, Check, X,
  DollarSign, TrendingUp, TrendingDown, Link2, Trash2,
  FilePlus, FileDown, ChevronDown, ChevronUp,
  SendHorizonal, ThumbsUp, ThumbsDown, History, ClipboardCheck,
  GitBranch, ShoppingCart, CornerDownRight,
} from 'lucide-react'
import DealChainModal from '@/components/shared/DealChainModal'

// ─── status styles ────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<QuotationStatus, { bg: string; text: string; border: string }> = {
  Open:      { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  Lost:      { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  Converted: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  OnHold:    { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
}

// ─── approval status styles ───────────────────────────────────────────────────
const APPROVAL_STYLES: Record<ApprovalStatus, { bg: string; text: string; border: string }> = {
  Draft:           { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  PendingApproval: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  Approved:        { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  Submitted:       { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
  Rejected:        { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
}

// ordered list used by the approval-status progress strip in the modal
const APPROVAL_STEPS: ApprovalStatus[] = ['Draft', 'PendingApproval', 'Approved', 'Submitted']

type WfStep = { id: string; stepOrder: number; label: string; approverRole: string | null }
const APPROVER_ROLES = ['P1_CEO', 'P2_ADMIN', 'P4_REGIONAL_MANAGER', 'P5_SALES_MANAGER']

// ─── stock availability badge styles ─────────────────────────────────────────
const STOCK_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  'In Stock':     { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  'Low Stock':    { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' },
  'Out of Stock': { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' },
  'Reserved':     { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
}

// ─── blank helpers ────────────────────────────────────────────────────────────
const blankItem = (): Omit<QuotationLineItem, 'id' | 'quotationId'> => ({
  sNo: 1, itemType: 'item', description: '', specifications: '',
  reference: '', make: 'TECOFI', qty: 1, unit: 'NO.S', rate: 0, discountPct: 0, amount: 0, delivery: '',
})

const blankHeader = (): Omit<QuotationLineItem, 'id' | 'quotationId'> => ({
  sNo: 0, itemType: 'header', description: '', reference: '',
  make: '', qty: 0, unit: '', rate: 0, amount: 0, delivery: '',
})

const blankForm = () => ({
  qtRef: '', qtnDate: '', customerName: '', projectName: '', amountSar: '',
  discount: '0', status: 'Open', kaeAssignedId: '', clientContactName: '',
  clientContactDetails: '', remarks: '', poNumber: '',
  subject: '', rfqCode: '', application: '', poBox: '',
  paymentTerms: '', deliveryWeeks: '', validityDays: '30', notes: '',
})

// ─── revision grouping helpers ────────────────────────────────────────────────
const baseOf   = (ref: string | null | undefined) => (ref ?? '').replace(/-R\d+$/i, '')
const revNumOf = (ref: string | null | undefined) => { if (!ref) return 0; const m = ref.match(/-R(\d+)$/i); return m ? parseInt(m[1]) : 0 }

// ─── blank convert-to-SO form ─────────────────────────────────────────────────
type ConvertAttached = { name: string; type: string; size: number; data: string }
const blankSoForm = () => ({
  poNumber: '', poDate: new Date().toISOString().split('T')[0],
  paymentTermsSplit: '', fulfilmentType: 'FactoryOrder', remarks: '',
  deliveryDate: '', deliveryTerms: '', vatRate: '15',
  customerPO: null as ConvertAttached | null,
})

const MAX_CONVERT_FILE_BYTES = 5 * 1024 * 1024  // 5 MB

function readConvertFile(file: File): Promise<ConvertAttached> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve({ name: file.name, type: file.type, size: file.size, data: String(r.result) })
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

// ─── suggest revision ref ─────────────────────────────────────────────────────
const suggestRevisionRef = (ref: string): string => {
  const match = ref.match(/^(.*?)-R(\d+)$/i)
  if (match) return `${match[1]}-R${parseInt(match[2]) + 1}`
  return `${ref}-R1`
}

// ─── props ────────────────────────────────────────────────────────────────────
interface PrefillData {
  customerName: string
  clientContactName?: string
  clientContactDetails?: string
  paymentTerms?: string
  kaeAssignedId?: string
}

export default function Tab2Quotations({
  user,
  prefill,
  onPrefillConsumed,
  onConvertedToSO,
}: {
  user: SessionUser
  prefill?: PrefillData | null
  onPrefillConsumed?: () => void
  onConvertedToSO?: () => void
}) {
  const [rows, setRows]           = useState<Quotation[]>([])
  const [loading, setLoading]     = useState(true)
  const [filters, setFilters]     = useState({ dateFrom: '', dateTo: '', kaeId: '', customer: '', qtRef: '', status: '' })
  const [showForm, setShowForm]   = useState(false)
  const [editRow, setEditRow]     = useState<Quotation | null>(null)
  const [chainSeed, setChainSeed] = useState<{ qtRef?: string; poNumber?: string } | null>(null)
  const [formError, setFormError] = useState('')

  // Approval workflow state
  const [approvalModal, setApprovalModal] = useState<{ row: Quotation; action: string; label: string } | null>(null)
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalError, setApprovalError]     = useState('')
  const [historyRow, setHistoryRow]           = useState<Quotation | null>(null)
  const [wfSteps, setWfSteps]                 = useState<WfStep[]>([])
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())

  // Revision state
  const [isRevision, setIsRevision]           = useState(false)
  const [revisionSourceRef, setRevisionSourceRef] = useState('')

  // Form state
  const [form, setForm]           = useState(blankForm())
  const [lineItems, setLineItems] = useState<Omit<QuotationLineItem, 'id' | 'quotationId'>[]>([])
  const [showItems, setShowItems] = useState(true)

  // Materials catalog for reference lookup (keyed by productRef uppercase)
  const [materials, setMaterials] = useState<Map<string, MaterialItem>>(new Map())

  // Tax config from company settings
  const [taxCfg, setTaxCfg] = useState({ taxName: 'VAT', taxRate: 15, currency: 'SAR', currencySymbol: 'SAR' })

  // ── Row expansion (inline line-items + approval history) ────────────────────
  const [expandedRow,  setExpandedRow]  = useState<string | null>(null)
  const [qtItemsCache, setQtItemsCache] = useState<Map<string, QuotationLineItem[]>>(new Map())
  const [qtItemsLoading, setQtItemsLoading] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback(async (row: Quotation) => {
    if (expandedRow === row.id) { setExpandedRow(null); return }
    setExpandedRow(row.id)
    if (qtItemsCache.has(row.id)) return
    setQtItemsLoading(prev => new Set(prev).add(row.id))
    try {
      const res = await fetch(`/api/quotations?qtRef=${encodeURIComponent(row.qtRef)}&withItems=1`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].lineItems)) {
          setQtItemsCache(prev => new Map(prev).set(row.id, data[0].lineItems as QuotationLineItem[]))
        } else {
          setQtItemsCache(prev => new Map(prev).set(row.id, []))
        }
      }
    } catch { /* best effort */ }
    finally {
      setQtItemsLoading(prev => { const n = new Set(prev); n.delete(row.id); return n })
    }
  }, [expandedRow, qtItemsCache])

  const qtFmt = (n: number) => Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Convert to Sales Order modal state
  const [soModal, setSoModal]       = useState<Quotation | null>(null)
  const [soForm,  setSoForm]        = useState(blankSoForm())
  const [soLoading,  setSoLoading]  = useState(false)
  const [soError,    setSoError]    = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [soLineItems, setSoLineItems] = useState<any[]>([])

  // ── load tax config once ────────────────────────────────────────────────────
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

  // ── load materials for reference lookup ─────────────────────────────────────
  const loadMaterials = useCallback(async () => {
    try {
      const res = await fetch('/api/materials')
      const data = await res.json()
      if (Array.isArray(data)) {
        const map = new Map<string, MaterialItem>()
        data.forEach((m: MaterialItem) => map.set(m.productRef.toUpperCase().trim(), m))
        setMaterials(map)
      }
    } catch { /* ignore — stock lookup is best-effort */ }
  }, [])

  useEffect(() => { if (showForm) loadMaterials() }, [showForm, loadMaterials])

  // ── handle prefill from customers tab ──────────────────────────────────────
  useEffect(() => {
    if (!prefill) return
    setEditRow(null)
    setIsRevision(false)
    setRevisionSourceRef('')
    setFormError('')
    setForm({
      ...blankForm(),
      customerName:         prefill.customerName,
      clientContactName:    prefill.clientContactName    || '',
      clientContactDetails: prefill.clientContactDetails || '',
      paymentTerms:         prefill.paymentTerms         || '',
      kaeAssignedId:        prefill.kaeAssignedId        || '',
      qtnDate:              new Date().toISOString().split('T')[0],
    })
    setLineItems([{ ...blankItem() }])
    setShowItems(true)
    setShowForm(true)
    onPrefillConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  // ── data loading ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const [qRes, wfRes] = await Promise.all([
        fetch(`/api/quotations?${params}`),
        fetch('/api/approval-workflows'),
      ])
      const text = await qRes.text()
      if (!text) { setRows([]); return }
      const data = JSON.parse(text)
      setRows(Array.isArray(data) ? data : [])
      if (wfRes.ok) {
        const all: (WfStep & { process?: string })[] = await wfRes.json()
        setWfSteps(all.filter(s => s.process === 'quotation').sort((a, b) => a.stepOrder - b.stepOrder))
      }
    } catch (e) {
      console.error('Failed to load quotations:', e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = [
    { label: 'Total Quoted', value: `SAR ${rows.reduce((s, r) => s + Number(r.amountSar), 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'blue' as const, icon: <DollarSign size={16} /> },
    { label: 'Open Quotes',  value: rows.filter(r => r.status === 'Open').length,      color: 'cyan' as const,  icon: <TrendingUp size={16} /> },
    { label: 'Converted',    value: rows.filter(r => r.status === 'Converted').length, color: 'green' as const, icon: <Check size={16} /> },
    { label: 'Lost Value',   value: `SAR ${rows.filter(r => r.status === 'Lost').reduce((s, r) => s + Number(r.amountSar), 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`, color: 'red' as const, icon: <TrendingDown size={16} /> },
  ]

  // ── form helpers ────────────────────────────────────────────────────────────
  const resetForm = () => {
    setForm(blankForm())
    setLineItems([{ ...blankItem() }])
    setShowItems(true)
    setFormError('')
    setIsRevision(false)
    setRevisionSourceRef('')
  }

  const openNew = () => { setEditRow(null); resetForm(); setShowForm(true) }

  const openEdit = async (row: Quotation) => {
    setEditRow(row)
    setIsRevision(false)
    setRevisionSourceRef('')
    setFormError('')
    setForm({
      qtRef: row.qtRef, qtnDate: row.qtnDate.split('T')[0],
      customerName: row.customerName, projectName: row.projectName,
      amountSar: String(row.amountSar), discount: String(row.discount ?? 0),
      status: row.status, kaeAssignedId: row.kaeAssignedId || '',
      clientContactName: row.clientContactName || '',
      clientContactDetails: row.clientContactDetails || '',
      remarks: row.remarks || '', poNumber: row.poNumber || '',
      subject: row.subject || '', rfqCode: row.rfqCode || '',
      application: row.application || '', poBox: row.poBox || '',
      paymentTerms: row.paymentTerms || '', deliveryWeeks: row.deliveryWeeks || '',
      validityDays: String(row.validityDays ?? 30), notes: row.notes || '',
    })
    try {
      const res = await fetch(`/api/quotations?qtRef=${encodeURIComponent(row.qtRef)}&withItems=1`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].lineItems)) {
        setLineItems(data[0].lineItems.map((li: QuotationLineItem) => ({
          sNo: li.sNo, itemType: li.itemType || 'item',
          description: li.description, specifications: li.specifications || '',
          reference: li.reference || '', make: li.make || '',
          qty: li.qty, unit: li.unit || '', rate: li.rate, discountPct: li.discountPct ?? 0, amount: li.amount, delivery: li.delivery || '',
        })))
      } else { setLineItems([]) }
    } catch { setLineItems([]) }
    setShowItems(true)
    setShowForm(true)
  }

  // ── open revision ────────────────────────────────────────────────────────────
  // Creates a NEW quotation pre-filled from source — original is preserved
  const openRevise = async (row: Quotation) => {
    setEditRow(null)             // null → handleSave uses POST (creates new)
    setIsRevision(true)
    setRevisionSourceRef(row.qtRef)
    setFormError('')
    setForm({
      qtRef: suggestRevisionRef(row.qtRef),
      qtnDate: new Date().toISOString().split('T')[0],
      customerName: row.customerName, projectName: row.projectName,
      amountSar: String(row.amountSar), discount: String(row.discount ?? 0),
      status: 'Open', kaeAssignedId: row.kaeAssignedId || '',
      clientContactName: row.clientContactName || '',
      clientContactDetails: row.clientContactDetails || '',
      remarks: row.remarks || '', poNumber: '',
      subject: row.subject || '', rfqCode: row.rfqCode || '',
      application: row.application || '', poBox: row.poBox || '',
      paymentTerms: row.paymentTerms || '', deliveryWeeks: row.deliveryWeeks || '',
      validityDays: String(row.validityDays ?? 30), notes: row.notes || '',
    })
    try {
      const res = await fetch(`/api/quotations?qtRef=${encodeURIComponent(row.qtRef)}&withItems=1`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].lineItems)) {
        setLineItems(data[0].lineItems.map((li: QuotationLineItem) => ({
          sNo: li.sNo, itemType: li.itemType || 'item',
          description: li.description, specifications: li.specifications || '',
          reference: li.reference || '', make: li.make || '',
          qty: li.qty, unit: li.unit || '', rate: li.rate, discountPct: li.discountPct ?? 0, amount: li.amount, delivery: li.delivery || '',
        })))
      } else { setLineItems([{ ...blankItem() }]) }
    } catch { setLineItems([{ ...blankItem() }]) }
    setShowItems(true)
    setShowForm(true)
  }

  // ── line item helpers ───────────────────────────────────────────────────────
  const updateItem = (idx: number, field: string, value: string | number) => {
    setLineItems(prev => {
      const next = prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [field]: value }
        // auto-calculate amount (applying per-line discount %)
        if (field === 'qty' || field === 'rate' || field === 'discountPct') {
          const q = field === 'qty'         ? Number(value) : Number(updated.qty)
          const r = field === 'rate'        ? Number(value) : Number(updated.rate)
          const d = field === 'discountPct' ? Number(value) : Number(updated.discountPct ?? 0)
          updated.amount = parseFloat((q * r * (1 - d / 100)).toFixed(2))
        }
        // Reference lookup → auto-fill description & specs if currently empty
        if (field === 'reference' && typeof value === 'string') {
          const mat = materials.get(value.toUpperCase().trim())
          if (mat) {
            if (!updated.description) updated.description = mat.description
            if (!updated.specifications && mat.specifications) updated.specifications = mat.specifications
          }
        }
        return updated
      })
      // Re-number all items by array position
      return next.map((item, i) => ({ ...item, sNo: i + 1 }))
    })
  }

  const addItem   = () => setLineItems(prev => [...prev, { ...blankItem(), sNo: prev.length + 1 }])
  const addHeader = () => setLineItems(prev => [...prev, { ...blankHeader(), sNo: prev.length + 1 }])
  const removeItem = (idx: number) =>
    setLineItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sNo: i + 1 })))

  // ── serial numbers: skip section headers ────────────────────────────────────
  // Items get sequential numbers; headers get 0 (not shown)
  const displayNumbers: number[] = (() => {
    const nums: number[] = []
    let n = 0
    for (const item of lineItems) {
      nums.push(item.itemType === 'header' ? 0 : ++n)
    }
    return nums
  })()

  // ── totals ──────────────────────────────────────────────────────────────────
  const itemsSubtotal = lineItems.reduce((s, li) => s + Number(li.amount), 0)
  const discountVal   = parseFloat(form.discount) || 0
  const netTotal      = itemsSubtotal - discountVal

  useEffect(() => {
    if (lineItems.length > 0 && itemsSubtotal > 0)
      setForm(f => ({ ...f, amountSar: String(Math.round(netTotal * 100) / 100) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSubtotal, discountVal])

  // ── save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setFormError('')
    const method = editRow ? 'PATCH' : 'POST'
    const body   = editRow ? { id: editRow.id, ...form, lineItems } : { ...form, lineItems }
    const res = await fetch('/api/quotations', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Save failed' }))
      setFormError(err.error || 'Save failed')
      toastError(err.error || 'Save failed')
      return
    }
    toastSuccess(editRow ? 'Quotation updated' : 'Quotation created')
    setShowForm(false); setEditRow(null); setFormError(''); setIsRevision(false); setRevisionSourceRef(''); load()
  }

  // ── status change ───────────────────────────────────────────────────────────
  const handleStatusChange = async (id: string, status: string) => {
    const res = await fetch('/api/quotations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    if (res.ok) toastSuccess(`Status → ${status}`)
    load()
  }

  // ── approval actions ────────────────────────────────────────────────────────
  const openApprovalModal = (row: Quotation, action: string, label: string) => {
    setApprovalModal({ row, action, label }); setApprovalComment(''); setApprovalError('')
  }

  const handleApprovalAction = async () => {
    if (!approvalModal) return
    setApprovalError('')
    if ((approvalModal.action === 'revise' || approvalModal.action === 'reject') && !approvalComment.trim()) {
      setApprovalError('A comment is required for this action')
      return
    }
    const res = await fetch('/api/quotations/approve', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: approvalModal.row.id, action: approvalModal.action, comment: approvalComment }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Action failed' }))
      setApprovalError(err.error || 'Action failed')
      toastError(err.error || 'Approval action failed')
      return
    }
    toastSuccess(`Approval action: ${approvalModal.label}`)
    setApprovalModal(null); load()
  }

  // ── export / import ─────────────────────────────────────────────────────────
  const handleExport = () => {
    const params = new URLSearchParams({ tab: 'quotations', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
    window.open(`/api/export?${params}`)
  }
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('tab', 'quotations')
    await fetch('/api/import', { method: 'POST', body: fd }); load()
  }
  const handleDownloadPDF = (row: Quotation) => window.open(`/api/quotations/${row.id}/pdf`, '_blank', 'noopener,noreferrer')

  // ── Convert to Sales Order ──────────────────────────────────────────────────
  const openSoModal = async (row: Quotation) => {
    setSoModal(row)
    setSoForm({
      ...blankSoForm(),
      paymentTermsSplit: row.paymentTerms || '',
      deliveryDate:      '',
      deliveryTerms:     '',
      vatRate:           String(taxCfg.taxRate),
    })
    setSoError('')
    setSoLineItems([])
    // Fetch line items for the quotation
    try {
      const res = await fetch(`/api/quotations?qtRef=${encodeURIComponent(row.qtRef)}&withItems=1`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].lineItems)) {
          // Keep only actual items (skip section headers)
          const items = data[0].lineItems
            .filter((li: QuotationLineItem) => li.itemType !== 'header')
            .map((li: QuotationLineItem, idx: number) => ({
              sNo:            idx + 1,
              description:    li.description,
              specifications: li.specifications || '',
              reference:      li.reference   || '',
              make:           li.make        || '',
              qty:            li.qty,
              unit:           li.unit        || 'Unit',
              unitPrice:      li.rate,
              amount:         li.amount,
              delivery:       li.delivery    || '',
            }))
          setSoLineItems(items)
        }
      }
    } catch { /* line items are best-effort */ }
  }

  const handleConvertToSO = async () => {
    if (!soModal) return
    if (!soForm.poNumber.trim()) { setSoError('PO Number is required'); return }
    if (!soForm.poDate)          { setSoError('PO Date is required');    return }
    if (!soForm.customerPO)      { setSoError('Please upload the Client PO before submitting'); return }
    setSoLoading(true); setSoError('')
    try {
      // 1. Create Sales Order (with client PO attached)
      const soRes  = await fetch('/api/sales-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName:  soModal.customerName,
          poNumber:      soForm.poNumber.trim(),
          qtRef:         soModal.qtRef,
          soDate:        new Date().toISOString().split('T')[0],
          deliveryDate:  soForm.deliveryDate  || null,
          paymentTerms:  soForm.paymentTermsSplit || soModal.paymentTerms || null,
          deliveryTerms: soForm.deliveryTerms || null,
          notes:         soModal.notes        || null,
          remarks:       soForm.remarks       || null,
          vatRate:       Number(soForm.vatRate) || 15,
          lineItems:     soLineItems,
          customerPOFile:     JSON.stringify(soForm.customerPO),
          customerPOFileName: soForm.customerPO.name,
        }),
      })
      // Read body as text first so we can always log it; then parse JSON
      const rawText = await soRes.text().catch(() => '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let soData: any = null
      try { soData = JSON.parse(rawText) } catch {
        console.error('[SO create] HTTP', soRes.status, '— non-JSON body:', rawText.slice(0, 600))
      }
      if (!soRes.ok) {
        const msg = soData?.error || `Server error (HTTP ${soRes.status}) — see browser console for details`
        setSoError(msg); return
      }

      // Mark quotation as Converted
      await fetch('/api/quotations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: soModal.id, status: 'Converted' }),
      })

      toastSuccess(`Sales Order ${soData?.soNumber ?? ''} created · Accounts team notified · Jumping to Sales Orders`)
      setSoModal(null); load()
      // Jump to the Sales Orders tab (under Accounts) so the user sees the new SO immediately
      onConvertedToSO?.()
    } catch { setSoError('An unexpected error occurred'); toastError('Conversion failed') }
    finally  { setSoLoading(false) }
  }

  // ── stock badge helper ───────────────────────────────────────────────────────
  const getStockInfo = (ref: string) => {
    if (!ref?.trim()) return null
    return materials.get(ref.toUpperCase().trim()) ?? null
  }

  // ── Group rows: originals first, revisions as indented sub-rows ──────────────
  const displayRows: Array<{ row: Quotation; isRevision: boolean; parentRef?: string }> = (() => {
    const map = new Map<string, Quotation[]>()
    for (const r of rows) {
      const base = baseOf(r.qtRef)
      if (!map.has(base)) map.set(base, [])
      map.get(base)!.push(r)
    }
    const result: Array<{ row: Quotation; isRevision: boolean; parentRef?: string }> = []
    const added = new Set<string>()
    for (const row of rows) {
      const base = baseOf(row.qtRef)
      if (!added.has(base)) {
        added.add(base)
        const group = (map.get(base) ?? []).sort((a, b) => revNumOf(a.qtRef) - revNumOf(b.qtRef))
        for (const r of group) {
          result.push({ row: r, isRevision: revNumOf(r.qtRef) > 0, parentRef: revNumOf(r.qtRef) > 0 ? base : undefined })
        }
      }
    }
    return result
  })()

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <KPISummaryPanel kpis={kpis} />

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="input-sm" />
        <span className="text-slate-400 text-xs">to</span>
        <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="input-sm" />
        <input type="text" placeholder="Customer…" value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))} className="input-sm w-36" />
        <input type="text" placeholder="QT Ref…" value={filters.qtRef} onChange={e => setFilters(f => ({ ...f, qtRef: e.target.value }))} className="input-sm w-32" />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="input-sm">
          <option value="">All Status</option>
          <option>Open</option><option>Lost</option><option>Converted</option><option>OnHold</option>
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ dateFrom: '', dateTo: '', kaeId: '', customer: '', qtRef: '', status: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Action Bar ──────────────────────────────────────────────────────── */}
      <div className="section-header">
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite(user.role, 'quotations') && (
            <button onClick={openNew} className="btn-primary"><Plus size={14} /> New Quote</button>
          )}
          <button onClick={handleExport} className="btn-outline"><Download size={14} /> Export</button>
          {canBulkImport(user.role, 'quotations') && (
            <label className="btn-outline cursor-pointer">
              <Upload size={14} /> Import
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>
        <span className="text-xs text-slate-400">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><FileText size={36} className="opacity-20" /><p className="text-sm font-medium">No quotations found</p><p className="text-xs">Try adjusting your filters</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>QT Ref</th><th>Date</th><th>Customer</th><th>Project</th>
                <th className="text-right">Amount (SAR)</th><th>Status</th><th>Approval</th>
                <th>KAE</th><th>Contact</th><th>Remarks</th><th></th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(({ row, isRevision, parentRef }) => {
                const st    = STATUS_STYLES[row.status]
                const approval = (row.approvalStatus || 'Draft') as ApprovalStatus
                const apSt  = APPROVAL_STYLES[approval] || APPROVAL_STYLES.Draft
                const currStep    = row.approvalStep ?? 1
                const currWfStep  = wfSteps.find(s => s.stepOrder === currStep)
                const isMyTurn    = APPROVER_ROLES.includes(user.role) && approval === 'PendingApproval' && (
                  user.role === 'P1_CEO' || user.role === 'P2_ADMIN' ||
                  !currWfStep || currWfStep.approverRole === user.role
                )
                const showSubmit  = canSubmitForReview(user.role) && approval === 'Draft'
                const showMarkSub = canMarkSubmitted(user.role)   && approval === 'Approved'
                const canSO       = canWrite(user.role, 'salesOrders') && row.status !== 'Converted'
                const isConverted = row.status === 'Converted'
                const isExp       = expandedRow === row.id
                const cachedItems = qtItemsCache.get(row.id)
                const isLoading   = qtItemsLoading.has(row.id)
                return (
                  <React.Fragment key={row.id}>
                  <tr onClick={() => toggleExpand(row)} className="cursor-pointer hover:bg-slate-50"
                    style={isRevision
                      ? { background: '#fafaf7', borderLeft: '3px solid #f59e0b' }
                      : {}}>
                    {/* QT Ref — indented with arrow for revisions */}
                    <td style={{ minWidth: 160, paddingLeft: isRevision ? 6 : undefined }}>
                      {isRevision && (
                        <div className="flex items-center gap-1 text-xs text-amber-500 mb-0.5">
                          <CornerDownRight size={10} />
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>rev of {parentRef}</span>
                        </div>
                      )}
                      <span className="font-mono text-xs font-bold" style={{ color: isRevision ? '#d97706' : '#2563eb' }}>
                        {row.qtRef}
                      </span>
                    </td>
                    <td className="text-slate-500 text-xs" style={{ minWidth: 90 }}>{new Date(row.qtnDate).toLocaleDateString('en-GB')}</td>
                    <td className="font-semibold text-slate-800" style={{ minWidth: 140 }}>{row.customerName}</td>
                    <td className="text-slate-500 text-xs" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.projectName}</td>
                    <td className="text-right font-semibold text-slate-800" style={{ minWidth: 120 }}>
                      {Number(row.amountSar).toLocaleString('en-SA', { minimumFractionDigits: 2 })}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ minWidth: 110 }}>
                      {canWrite(user.role, 'quotations') ? (
                        <select value={row.status} onChange={e => handleStatusChange(row.id, e.target.value)}
                          className="text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer outline-none transition-colors"
                          style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                          <option value="Open">Open</option><option value="Lost">Lost</option>
                          <option value="Converted">Converted</option><option value="OnHold">On Hold</option>
                        </select>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full border inline-block"
                          style={{ background: st.bg, color: st.text, borderColor: st.border }}>{row.status}</span>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ minWidth: 180 }}>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border inline-block w-fit"
                          style={{ background: apSt.bg, color: apSt.text, borderColor: apSt.border }}>
                          {APPROVAL_STATUS_LABELS[approval] ?? approval}
                        </span>
                        {approval === 'PendingApproval' && wfSteps.length > 0 && (
                          <span className="text-xs text-slate-400">
                            Step {currStep}/{wfSteps.length} · {currWfStep?.label ?? ''}
                          </span>
                        )}
                        <div className="flex items-center gap-0.5 flex-wrap">
                          {showSubmit && (
                            <button onClick={() => openApprovalModal(row, 'submit', 'Submit for Review')}
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg transition-all font-medium"
                              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                              <SendHorizonal size={10} /> Submit
                            </button>
                          )}
                          {/* Resubmit after revision — Draft with a revise history entry */}
                          {(() => {
                            if (approval !== 'Draft' || !row.approvalComments) return null
                            try {
                              const hist: { action: string }[] = JSON.parse(row.approvalComments)
                              if (!hist.some(h => h.action === 'revise')) return null
                            } catch { return null }
                            return (
                              <button onClick={() => openApprovalModal(row, 'submit', 'Resubmit for Review')}
                                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium text-white"
                                style={{ background: '#d97806' }}>
                                ↩ Resubmit
                              </button>
                            )
                          })()}
                          {isMyTurn && (<>
                            <button onClick={() => openApprovalModal(row, 'approve', `Approve — ${currWfStep?.label ?? `Step ${currStep}`}`)}
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium"
                              style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                              <ThumbsUp size={10} /> Approve
                            </button>
                            <button onClick={() => openApprovalModal(row, 'revise', '↩ Request Revision')}
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium"
                              style={{ background: '#fffbeb', color: '#d97806', border: '1px solid #fde68a' }}>
                              ↩ Revise
                            </button>
                            <button onClick={() => openApprovalModal(row, 'reject', '✕ Reject')}
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium"
                              style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                              <ThumbsDown size={10} /> Reject
                            </button>
                          </>)}
                          {showMarkSub && (
                            <button onClick={() => openApprovalModal(row, 'markSubmitted', 'Mark as Submitted')}
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium"
                              style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                              <ClipboardCheck size={10} /> Submitted
                            </button>
                          )}
                          {row.approvalComments && (
                            <button onClick={() => setHistoryRow(row)}
                              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                              title="View approval history">
                              <History size={11} />
                            </button>
                          )}
                        </div>
                        {/* Revision / rejection note banners */}
                        {(() => {
                          if (!row.approvalComments) return null
                          try {
                            const hist: { action: string; comment: string; by: string }[] = JSON.parse(row.approvalComments)
                            const last = [...hist].reverse().find(h => h.action === 'revise' || h.action === 'reject')
                            if (!last) return null
                            if (last.action === 'revise' && approval === 'Draft') {
                              return (
                                <div className="mt-1 text-xs px-2 py-1 rounded" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                                  ↩ <span className="font-medium">Revision by {last.by}:</span> {last.comment}
                                </div>
                              )
                            }
                            if (last.action === 'reject' && approval === 'Rejected') {
                              return (
                                <div className="mt-1 text-xs px-2 py-1 rounded" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                                  ✕ <span className="font-medium">Rejected by {last.by}:</span> {last.comment}
                                </div>
                              )
                            }
                          } catch { /* ignore */ }
                          return null
                        })()}
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs" style={{ minWidth: 100 }}>{row.kaeAssigned?.name || '—'}</td>
                    <td className="text-slate-500 text-xs" style={{ minWidth: 100 }}>{row.clientContactName || '—'}</td>
                    <td className="text-slate-400 text-xs" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remarks || '—'}</td>
                    <td onClick={e => e.stopPropagation()} style={{ minWidth: 148 }}>
                      <div className="flex items-center gap-0.5 flex-wrap">
                        {/* PDF */}
                        <button onClick={() => handleDownloadPDF(row)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all" title="View PDF">
                          <FileDown size={13} />
                        </button>
                        {/* Deal chain */}
                        <button onClick={() => setChainSeed({ qtRef: row.qtRef, poNumber: row.poNumber })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-all" title="View deal chain">
                          <Link2 size={13} />
                        </button>
                        {/* Convert to Sales Order / View SO */}
                        {canSO && (
                          <button onClick={() => openSoModal(row)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all" title="Convert to Sales Order">
                            <ShoppingCart size={13} />
                          </button>
                        )}
                        {isConverted && canWrite(user.role, 'salesOrders') && (
                          <button
                            onClick={() => onConvertedToSO?.()}
                            title="Sales Order created — click to view in Accounts"
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                            <ShoppingCart size={13} />
                          </button>
                        )}
                        {/* Revise */}
                        {canWrite(user.role, 'quotations') && (
                          <button onClick={() => openRevise(row)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all" title="Create revision">
                            <GitBranch size={13} />
                          </button>
                        )}
                        {/* Edit */}
                        {canWrite(user.role, 'quotations') && (
                          <button onClick={() => openEdit(row)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Edit">
                            <Pencil size={13} />
                          </button>
                        )}
                        {/* Expand toggle */}
                        <button onClick={(e) => { e.stopPropagation(); toggleExpand(row) }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                          title={isExp ? 'Collapse details' : 'Expand details'}>
                          {isExp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded: line items + approval history ───────────── */}
                  {isExp && (() => {
                    const items = (cachedItems ?? []).filter(li => li.itemType !== 'header')
                    const subtotal = items.reduce((s, li) => s + Number(li.amount || 0), 0)
                    const vatAmount = subtotal * taxCfg.taxRate / 100
                    const total     = subtotal + vatAmount
                    // Approval history
                    let history: { action: string; by: string; comment?: string; at?: string; step?: number; label?: string }[] = []
                    try { if (row.approvalComments) history = JSON.parse(row.approvalComments) } catch { /* */ }

                    return (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={11} className="px-6 py-3">
                          <div className="space-y-3">

                            {/* Line items table */}
                            {isLoading ? (
                              <div className="text-center text-xs text-slate-400 py-4">Loading line items…</div>
                            ) : items.length === 0 ? (
                              <div className="text-center text-xs text-slate-400 py-4 italic">No line items recorded for this quotation.</div>
                            ) : (
                              <div className="rounded-lg overflow-hidden border border-slate-200">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr style={{ background: '#e2e8f0' }}>
                                      {['#', 'Description', 'Ref', 'Make', 'Qty', 'Unit', 'Rate', 'Amount'].map(h => (
                                        <th key={h} className="text-left px-3 py-1.5 text-slate-600 font-semibold">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((li, i) => (
                                      <tr key={li.id ?? i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td className="px-3 py-1.5 text-slate-500">{li.sNo}</td>
                                        <td className="px-3 py-1.5 text-slate-700 font-medium">{li.description}</td>
                                        <td className="px-3 py-1.5 text-slate-500">{li.reference || '—'}</td>
                                        <td className="px-3 py-1.5 text-slate-500">{li.make || '—'}</td>
                                        <td className="px-3 py-1.5 text-slate-600">{li.qty}</td>
                                        <td className="px-3 py-1.5 text-slate-500">{li.unit || ''}</td>
                                        <td className="px-3 py-1.5 text-slate-600">{qtFmt(li.rate)}</td>
                                        <td className="px-3 py-1.5 font-semibold text-slate-800">{taxCfg.currencySymbol} {qtFmt(li.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: '#f1f5f9' }}>
                                      <td colSpan={7} className="px-3 py-1.5 text-right text-slate-500 font-semibold">Sub-total</td>
                                      <td className="px-3 py-1.5 font-semibold text-slate-800">{taxCfg.currencySymbol} {qtFmt(subtotal)}</td>
                                    </tr>
                                    <tr style={{ background: '#f1f5f9' }}>
                                      <td colSpan={7} className="px-3 py-1.5 text-right text-slate-500 font-semibold">{taxCfg.taxName} {taxCfg.taxRate}%</td>
                                      <td className="px-3 py-1.5 font-semibold text-slate-800">{taxCfg.currencySymbol} {qtFmt(vatAmount)}</td>
                                    </tr>
                                    <tr style={{ background: '#e2e8f0' }}>
                                      <td colSpan={7} className="px-3 py-1.5 text-right text-slate-700 font-bold">TOTAL</td>
                                      <td className="px-3 py-1.5 font-bold text-slate-900">{taxCfg.currencySymbol} {qtFmt(total)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}

                            {/* Approval history */}
                            {history.length > 0 && (
                              <div className="space-y-1.5 pl-1">
                                {history.map((h, i) => {
                                  const isApprove = h.action === 'approve' || h.action === 'submit'
                                  const isReject  = h.action === 'reject'
                                  const isRevise  = h.action === 'revise'
                                  const color     = isReject ? '#b91c1c' : isRevise ? '#b45309' : '#15803d'
                                  const icon      = isReject ? '✕' : isRevise ? '↩' : '✓'
                                  return (
                                    <div key={i} className="flex items-start gap-2 text-xs">
                                      <span className="font-bold shrink-0" style={{ color }}>{icon}</span>
                                      <span className="text-slate-500">
                                        <span className="text-slate-700 font-medium">
                                          {h.step ? `Step ${h.step}` : String(h.action ?? 'Action').replace(/^./, c => c.toUpperCase())}
                                        </span>
                                        {h.label ? ` · ${h.label}` : ''} —{' '}
                                        <span style={{ color }}>{h.by}</span>
                                        {h.at && (
                                          <span className="text-slate-400 ml-1">
                                            {new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        )}
                                        {h.comment && <span className="text-slate-500 italic ml-1">— {h.comment}</span>}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Notes / Payment terms */}
                            {(row.notes || row.paymentTerms || row.deliveryWeeks || row.validityDays) && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs pl-1">
                                {row.paymentTerms && (
                                  <div><span className="text-slate-400">Payment Terms: </span><span className="text-slate-700 font-medium">{row.paymentTerms}</span></div>
                                )}
                                {row.deliveryWeeks && (
                                  <div><span className="text-slate-400">Delivery: </span><span className="text-slate-700 font-medium">{row.deliveryWeeks} wks</span></div>
                                )}
                                {row.validityDays && (
                                  <div><span className="text-slate-400">Validity: </span><span className="text-slate-700 font-medium">{row.validityDays} days</span></div>
                                )}
                                {row.notes && (
                                  <div className="col-span-full"><span className="text-slate-400">Notes: </span><span className="text-slate-600">{row.notes}</span></div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })()}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {chainSeed && <DealChainModal seed={chainSeed} onClose={() => setChainSeed(null)} />}

      {/* ── Convert to Sales Order modal ───────────────────────────────────── */}
      {soModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 560 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <ShoppingCart size={16} className="text-green-600" />
                  Convert to Sales Order
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="font-mono font-bold text-blue-600">{soModal.qtRef}</span>
                  {' · '}{soModal.customerName}
                  {soModal.projectName ? ` · ${soModal.projectName}` : ''}
                </p>
              </div>
              <button onClick={() => setSoModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Summary strip */}
            <div className="flex items-center gap-4 p-3 rounded-xl mb-4 text-sm"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div>
                <p className="text-xs text-slate-500">Quotation Value</p>
                <p className="font-bold text-slate-800">{taxCfg.currencySymbol} {Number(soModal.amountSar).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">+{taxCfg.taxName} ({soForm.vatRate}%)</p>
                <p className="font-bold text-slate-800">{taxCfg.currencySymbol} {(Number(soModal.amountSar) * (1 + Number(soForm.vatRate) / 100)).toLocaleString('en-SA', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Line Items</p>
                <p className="font-bold text-slate-800">{soLineItems.length} {soLineItems.length === 1 ? 'item' : 'items'}</p>
              </div>
              <div className="ml-auto text-xs text-green-700 font-medium flex items-center gap-1">
                <Check size={12} /> Quotation → Converted
              </div>
            </div>

            <div className="space-y-3">
              {/* PO Number + PO Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Customer PO Number <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="e.g. PO-2026-0042"
                    value={soForm.poNumber}
                    onChange={e => setSoForm(f => ({ ...f, poNumber: e.target.value }))}
                    className="form-input" />
                </div>
                <div>
                  <label className="form-label">PO Date <span className="text-red-500">*</span></label>
                  <input type="date" value={soForm.poDate}
                    onChange={e => setSoForm(f => ({ ...f, poDate: e.target.value }))}
                    className="form-input" />
                </div>
              </div>

              {/* Delivery Date + VAT Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Delivery Date</label>
                  <input type="date" value={soForm.deliveryDate}
                    onChange={e => setSoForm(f => ({ ...f, deliveryDate: e.target.value }))}
                    className="form-input" />
                </div>
                <div>
                  <label className="form-label">{taxCfg.taxName} Rate (%)</label>
                  <select value={soForm.vatRate}
                    onChange={e => setSoForm(f => ({ ...f, vatRate: e.target.value }))}
                    className="form-input">
                    <option value="0">0% (Zero-rated / Exempt)</option>
                    <option value="5">5%</option>
                    <option value="10">10%</option>
                    <option value="13">13%</option>
                    <option value="15">15%</option>
                    <option value="16">16%</option>
                    <option value="17">17%</option>
                    <option value="18">18%</option>
                    <option value="19">19%</option>
                    <option value="20">20%</option>
                    {/* configured default, if not already listed */}
                    {!['0','5','10','13','15','16','17','18','19','20'].includes(String(taxCfg.taxRate)) && (
                      <option value={String(taxCfg.taxRate)}>{taxCfg.taxRate}% (configured)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Payment Terms + Delivery Terms */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Payment Terms</label>
                  <input type="text" placeholder="e.g. 30% advance, 70% on delivery"
                    value={soForm.paymentTermsSplit}
                    onChange={e => setSoForm(f => ({ ...f, paymentTermsSplit: e.target.value }))}
                    className="form-input" />
                </div>
                <div>
                  <label className="form-label">Delivery Terms</label>
                  <input type="text" placeholder="e.g. DDP Riyadh"
                    value={soForm.deliveryTerms}
                    onChange={e => setSoForm(f => ({ ...f, deliveryTerms: e.target.value }))}
                    className="form-input" />
                </div>
              </div>

              {/* Fulfilment Type + Remarks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Fulfilment Type</label>
                  <select value={soForm.fulfilmentType}
                    onChange={e => setSoForm(f => ({ ...f, fulfilmentType: e.target.value }))}
                    className="form-input">
                    <option value="FactoryOrder">🏭 Factory Order (all from supplier)</option>
                    <option value="Stock">📦 From Stock (all from inventory)</option>
                    <option value="Split">⚖️ Split (mix of stock + supplier)</option>
                  </select>
                  {soForm.fulfilmentType === 'Split' && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      ℹ️ The exact stock/supplier split per line item is set in Procurement after approval.
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Remarks</label>
                  <input type="text" placeholder="Optional notes…"
                    value={soForm.remarks}
                    onChange={e => setSoForm(f => ({ ...f, remarks: e.target.value }))}
                    className="form-input" />
                </div>
              </div>

              {/* ── Client PO upload (required) ────────────────────────────── */}
              <div className="p-3 rounded-xl border-2 border-dashed"
                style={{ borderColor: soForm.customerPO ? '#bbf7d0' : '#fde68a', background: soForm.customerPO ? '#f0fdf4' : '#fffbeb' }}>
                <label className="form-label flex items-center gap-1.5 mb-2">
                  <FileText size={12} />
                  Client PO Document <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal text-[10px]">· PDF or image, max 5 MB</span>
                </label>
                {soForm.customerPO ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-green-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={13} className="text-green-700 shrink-0" />
                      <span className="text-xs font-medium text-slate-700 truncate">{soForm.customerPO.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">
                        ({(soForm.customerPO.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={soForm.customerPO.data} download={soForm.customerPO.name}
                        className="p-1 rounded text-slate-400 hover:text-green-700" title="Download">
                        <FileDown size={12} />
                      </a>
                      <button onClick={() => setSoForm(f => ({ ...f, customerPO: null }))}
                        className="p-1 rounded text-slate-400 hover:text-red-500" title="Remove">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-amber-700 cursor-pointer hover:bg-amber-100 rounded transition-colors">
                    <Upload size={13} />
                    <span className="font-medium">Click to upload Client PO</span>
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return
                        if (file.size > MAX_CONVERT_FILE_BYTES) {
                          setSoError(`File too large (max ${MAX_CONVERT_FILE_BYTES/1024/1024} MB)`)
                          e.target.value = ''
                          return
                        }
                        const att = await readConvertFile(file)
                        setSoForm(f => ({ ...f, customerPO: att }))
                        setSoError('')
                        e.target.value = ''
                      }} />
                  </label>
                )}
                <p className="text-[10px] text-slate-500 mt-1.5">
                  ℹ️ The Sales Order will appear under <span className="font-semibold">Accounts → Sales Orders</span> for review &amp; approval.
                </p>
              </div>

              {/* Line items preview */}
              {soLineItems.length > 0 && (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                    style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    Line Items to Transfer ({soLineItems.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                    {soLineItems.map((li, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700">
                        <span className="w-5 text-slate-400 text-center shrink-0">{li.sNo}</span>
                        <span className="flex-1 truncate">{li.description}</span>
                        {li.make && <span className="text-slate-400 shrink-0">{li.make}</span>}
                        <span className="text-slate-500 shrink-0">{li.qty} {li.unit}</span>
                        <span className="font-medium text-slate-700 shrink-0 w-24 text-right">
                          SAR {Number(li.amount).toLocaleString('en-SA', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {soLineItems.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-1">
                  No line items found — Sales Order will be created without items.
                </p>
              )}
            </div>

            {soError && (
              <div className="mt-3 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                <X size={13} /> {soError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setSoModal(null)} className="btn-outline">Cancel</button>
              <button onClick={handleConvertToSO} disabled={soLoading}
                className="btn-primary"
                style={{ background: '#16a34a', opacity: soLoading ? 0.7 : 1 }}>
                <ShoppingCart size={14} />
                {soLoading ? 'Creating Sales Order…' : 'Create Sales Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approval modal ────────────────────────────────────────────────────── */}
      {approvalModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 460 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                {approvalModal.action === 'revise' ? (
                  <span style={{ color: '#d97806' }}>↩</span>
                ) : approvalModal.action === 'reject' ? (
                  <ThumbsDown size={16} className="text-red-500" />
                ) : (
                  <ClipboardCheck size={16} className="text-blue-500" />
                )}
                {approvalModal.label}
              </h3>
              <button onClick={() => setApprovalModal(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
            </div>
            <p className="text-sm text-slate-600 mb-1">Quotation: <span className="font-mono font-bold text-blue-600">{approvalModal.row.qtRef}</span></p>
            <p className="text-xs text-slate-400 mb-4">{approvalModal.row.customerName} · {approvalModal.row.projectName}</p>
            {approvalModal.action !== 'revise' && approvalModal.action !== 'reject' && (
              <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                {APPROVAL_STEPS.map((step, i) => {
                  const curIdx = APPROVAL_STEPS.indexOf((approvalModal.row.approvalStatus || 'Draft') as ApprovalStatus)
                  const apSt = APPROVAL_STYLES[step]
                  const active = i <= curIdx
                  return (
                    <div key={step} className="flex items-center gap-1 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full border font-medium"
                        style={{ background: active ? apSt.bg : '#f8fafc', color: active ? apSt.text : '#94a3b8', borderColor: active ? apSt.border : '#e2e8f0' }}>
                        {APPROVAL_STATUS_LABELS[step]}
                      </span>
                      {i < APPROVAL_STEPS.length - 1 && <span className="text-slate-300 text-xs">→</span>}
                    </div>
                  )
                })}
              </div>
            )}
            {approvalModal.action === 'revise' && (
              <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                The quotation will be returned to the KAE for changes. A comment is required.
              </p>
            )}
            {approvalModal.action === 'reject' && (
              <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                This will permanently reject the quotation. A reason is required.
              </p>
            )}
            <div className="mb-4">
              <label className="form-label">
                Comment {(approvalModal.action === 'revise' || approvalModal.action === 'reject') && <span className="text-red-500">*</span>}
              </label>
              <textarea value={approvalComment} onChange={e => setApprovalComment(e.target.value)}
                placeholder={
                  approvalModal.action === 'revise' ? 'Describe what needs to change…' :
                  approvalModal.action === 'reject' ? 'Reason for rejection…' :
                  'Optional notes…'
                }
                rows={3} className="form-input resize-none" />
            </div>
            {approvalError && (
              <div className="mb-3 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                <X size={13} /> {approvalError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setApprovalModal(null)} className="btn-outline">Cancel</button>
              <button onClick={handleApprovalAction}
                disabled={(approvalModal.action === 'revise' || approvalModal.action === 'reject') && !approvalComment.trim()}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                style={
                  approvalModal.action === 'reject' ? { background: '#dc2626' } :
                  approvalModal.action === 'revise' ? { background: '#d97806' } :
                  {}
                }>
                {approvalModal.action === 'reject' ? <ThumbsDown size={13} /> :
                 approvalModal.action === 'revise' ? <span>↩</span> :
                 <Check size={13} />}
                {' '}{(approvalModal.label ?? approvalModal.action ?? '').replace(/^[↩✕]\s*/, '')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approval history modal ──────────────────────────────────────────── */}
      {historyRow && (() => {
        let history: { action: string; role: string; by: string; comment: string; at: string }[] = []
        try { history = JSON.parse(historyRow.approvalComments || '[]') } catch { /* empty */ }
        const actionLabel: Record<string, string> = {
          submit: 'Submitted for Review', approve: 'Approved', reject: 'Rejected',
          markSubmitted: 'Marked as Submitted',
          // legacy labels kept for old records
          divApprove: 'Approved by Div Mgr', divReject: 'Rejected by Div Mgr',
          smApprove: 'Approved by Sales Mgr', smReject: 'Rejected by Sales Mgr',
        }
        const actionColor: Record<string, string> = {
          submit: '#1d4ed8', approve: '#15803d', reject: '#b91c1c',
          markSubmitted: '#0369a1', divApprove: '#15803d', divReject: '#b91c1c',
          smApprove: '#15803d', smReject: '#b91c1c',
        }
        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: 480 }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <History size={16} className="text-slate-500" /> Approval History — {historyRow.qtRef}
                </h3>
                <button onClick={() => setHistoryRow(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><X size={16} /></button>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No history yet</p>
              ) : (
                <div className="space-y-3">
                  {history.map((entry, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-1.5 rounded-full shrink-0 mt-1" style={{ background: actionColor[entry.action] || '#94a3b8', minHeight: 40 }} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: actionColor[entry.action] || '#64748b' }}>{actionLabel[entry.action] || entry.action}</span>
                          <span className="text-xs text-slate-400">{new Date(entry.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{entry.by}{entry.role ? ` · ${entry.role.replace(/_/g, ' ')}` : ''}</p>
                        {entry.comment && (
                          <p className="text-xs mt-1 italic px-2 py-1 rounded"
                            style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                            &ldquo;{entry.comment}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Quotation Form Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: 20, paddingBottom: 20, overflowY: 'auto' }}>
          <div className="modal-box" style={{ maxWidth: 880, width: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  {isRevision
                    ? <><GitBranch size={16} className="text-amber-500" /> Create Revision</>
                    : editRow
                    ? <><FilePlus size={16} className="text-blue-500" /> Edit Quotation</>
                    : <><FilePlus size={16} className="text-blue-500" /> New Quotation</>
                  }
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-400">
                    {editRow ? `Editing ${editRow.qtRef}` : isRevision ? `Revision of ${revisionSourceRef}` : 'Fill in the details, then add line items'}
                  </p>
                  {isRevision && (
                    <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                      <GitBranch size={10} /> Revising {revisionSourceRef} — original is preserved
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => { setShowForm(false); setIsRevision(false); setRevisionSourceRef('') }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-2"
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                <X size={14} /> {formError}
              </div>
            )}

            {/* ── Cover Details ─────────────────────────────────────────────── */}
            <div className="mb-4 pb-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Cover Page Details</p>
              <div className="space-y-3">
                <div>
                  <label className="form-label">QT Reference <span className="text-red-500">*</span>{isRevision && <span className="ml-1 text-amber-500">(new revision ref)</span>}</label>
                  <input type="text" placeholder="e.g. DLITSA0526A018QN01-R1" value={form.qtRef}
                    onChange={e => setForm(f => ({ ...f, qtRef: e.target.value.toUpperCase() }))}
                    disabled={!!editRow && !isRevision}
                    className="form-input font-mono"
                    style={editRow && !isRevision ? { background: '#f8fafc', color: '#94a3b8' } : {}} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Date</label>
                    <input type="date" value={form.qtnDate} onChange={e => setForm(f => ({ ...f, qtnDate: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                      <option>Open</option><option>Lost</option><option>Converted</option><option>OnHold</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Customer Name</label>
                    <input type="text" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Project Name</label>
                    <input type="text" value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} className="form-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Subject</label>
                    <input type="text" placeholder="e.g. Supply of Valves & Fittings" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Customer RFQ / Inquiry Ref</label>
                    <input type="text" placeholder="e.g. J / RFQ-0123" value={form.rfqCode} onChange={e => setForm(f => ({ ...f, rfqCode: e.target.value }))} className="form-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Application</label>
                    <input type="text" placeholder="e.g. Water Distribution" value={form.application} onChange={e => setForm(f => ({ ...f, application: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Customer PO Box</label>
                    <input type="text" placeholder="e.g. 261192" value={form.poBox} onChange={e => setForm(f => ({ ...f, poBox: e.target.value }))} className="form-input" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="form-label">Attn (Contact Name)</label>
                    <input type="text" value={form.clientContactName} onChange={e => setForm(f => ({ ...f, clientContactName: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Contact Details</label>
                    <input type="text" value={form.clientContactDetails} onChange={e => setForm(f => ({ ...f, clientContactDetails: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Payment Terms</label>
                    <input type="text" placeholder="e.g. 50% Advance & balance prior to Delivery" value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} className="form-input" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="form-label">Delivery (Weeks)</label>
                    <input type="text" placeholder="e.g. 16-18" value={form.deliveryWeeks} onChange={e => setForm(f => ({ ...f, deliveryWeeks: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Validity (Days)</label>
                    <input type="number" value={form.validityDays} onChange={e => setForm(f => ({ ...f, validityDays: e.target.value }))} className="form-input" min={1} />
                  </div>
                  {editRow && (
                    <div>
                      <label className="form-label">PO Number</label>
                      <input type="text" value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))} className="form-input" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">Footnote / Notes (printed on PDF)</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="form-input resize-none" />
                </div>
                <div>
                  <label className="form-label">Remarks (internal only)</label>
                  <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="form-input resize-none" />
                </div>
              </div>
            </div>

            {/* ── Line Items ────────────────────────────────────────────────── */}
            <div className="mb-4">
              <button onClick={() => setShowItems(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3 hover:text-blue-600 transition-colors">
                {showItems ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Line Items ({lineItems.filter(li => li.itemType !== 'header').length})
              </button>

              {showItems && (
                <>
                  {/* Stock-check legend (internal only indicator) */}
                  {materials.size > 0 && (
                    <div className="flex items-center gap-3 mb-2 px-2 py-1.5 rounded-lg text-xs"
                      style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1' }}>
                      <span className="font-medium">📦 Stock Check (internal — not printed):</span>
                      {Object.entries(STOCK_BADGE).map(([label, style]) => (
                        <span key={label} className="flex items-center gap-1">
                          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: style.dot }} />
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#e2e8f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'center', width: 36, fontSize: 11 }}>#</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', minWidth: 200, fontSize: 11 }}>Description</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', width: 120, fontSize: 11 }}>Reference</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', width: 80, fontSize: 11 }}>Make</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', width: 60, fontSize: 11 }}>Qty</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', width: 60, fontSize: 11 }}>Unit</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', width: 90, fontSize: 11 }}>Rate (SAR)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', width: 60, fontSize: 11 }}>Disc %</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', width: 100, fontSize: 11 }}>Amount (SAR)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', width: 80, fontSize: 11 }}>Delivery</th>
                          <th style={{ width: 32 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, idx) =>
                          item.itemType === 'header' ? (
                            /* ── Section header row — no serial number ── */
                            <tr key={idx} style={{ background: '#e2e8f0' }}>
                              <td style={{ padding: '3px 8px', textAlign: 'center', color: '#94a3b8', fontSize: 10 }}>§</td>
                              <td colSpan={9} style={{ padding: '3px 8px' }}>
                                <input
                                  value={item.description}
                                  onChange={e => updateItem(idx, 'description', e.target.value)}
                                  placeholder="SECTION HEADING E.G. ELECTRICALLY OPERATED BUTTERFLY"
                                  className="form-input"
                                  style={{ fontSize: 11, padding: '3px 6px', fontWeight: 700, background: 'transparent', border: 'none', width: '100%', textTransform: 'uppercase' }} />
                              </td>
                              <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                                <button onClick={() => removeItem(idx)}
                                  className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                  <Trash2 size={11} />
                                </button>
                              </td>
                            </tr>
                          ) : (
                          /* ── Regular item row ── */
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            {/* Serial number — only counts item rows, not headers */}
                            <td style={{ padding: '4px 8px', textAlign: 'center', color: '#64748b', fontSize: 11 }}>
                              {displayNumbers[idx]}
                            </td>
                            <td style={{ padding: '2px 4px', minWidth: 220 }}>
                              <input value={item.description}
                                onChange={e => updateItem(idx, 'description', e.target.value)}
                                placeholder="Title e.g. BUTTERFLY VALVE"
                                className="form-input"
                                style={{ fontSize: 11, padding: '4px 6px', width: '100%', fontWeight: 600 }} />
                              <textarea value={item.specifications || ''}
                                onChange={e => updateItem(idx, 'specifications', e.target.value)}
                                placeholder="Specifications e.g. DN100, PN16, GGG50 Body, EPDM Seat, SS316 disc"
                                rows={2} className="form-input resize-none"
                                style={{ fontSize: 10, padding: '3px 6px', width: '100%', marginTop: 2, color: '#475569', lineHeight: 1.4 }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input value={item.reference || ''}
                                onChange={e => updateItem(idx, 'reference', e.target.value)}
                                placeholder="VP4248-08"
                                className="form-input" style={{ fontSize: 11, padding: '4px 6px', width: 112 }} />
                              {/* Stock availability badge — internal, not in PDF */}
                              {(() => {
                                const mat = getStockInfo(item.reference || '')
                                if (!mat) return null
                                const badge = STOCK_BADGE[mat.stockAvailability] || STOCK_BADGE['Out of Stock']
                                const avail = mat.quantity - mat.reservedQty
                                return (
                                  <div style={{ fontSize: 9, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, padding: '2px 5px', borderRadius: 4, background: badge.bg, color: badge.text, border: `1px solid ${badge.dot}40`, whiteSpace: 'nowrap' }}>
                                    <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: badge.dot, flexShrink: 0 }} />
                                    {mat.stockAvailability}
                                    {avail > 0 ? ` · ${avail} avail` : ''}
                                    {mat.reservedQty > 0 ? ` · ${mat.reservedQty} resv` : ''}
                                  </div>
                                )
                              })()}
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input value={item.make || ''}
                                onChange={e => updateItem(idx, 'make', e.target.value)}
                                placeholder="TECOFI"
                                className="form-input" style={{ fontSize: 11, padding: '4px 6px', width: 74 }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" min={0} value={item.qty}
                                onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)}
                                className="form-input" style={{ fontSize: 11, padding: '4px 6px', width: 54, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input value={item.unit || ''}
                                onChange={e => updateItem(idx, 'unit', e.target.value)}
                                placeholder="NOS"
                                className="form-input" style={{ fontSize: 11, padding: '4px 6px', width: 54 }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" min={0} value={item.rate}
                                onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                                className="form-input" style={{ fontSize: 11, padding: '4px 6px', width: 84, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" min={0} max={100} step={0.5}
                                value={item.discountPct ?? 0}
                                onChange={e => updateItem(idx, 'discountPct', parseFloat(e.target.value) || 0)}
                                className="form-input"
                                style={{ fontSize: 11, padding: '4px 6px', width: 54, textAlign: 'right', background: (item.discountPct ?? 0) > 0 ? '#fff7ed' : undefined }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" min={0} value={item.amount}
                                onChange={e => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                                className="form-input" style={{ fontSize: 11, padding: '4px 6px', width: 94, textAlign: 'right', background: '#f0fdf4' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input value={item.delivery || ''}
                                onChange={e => updateItem(idx, 'delivery', e.target.value)}
                                placeholder="4-6 Weeks"
                                className="form-input" style={{ fontSize: 11, padding: '4px 6px', width: 74 }} />
                            </td>
                            <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                              <button onClick={() => removeItem(idx)}
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                <Trash2 size={11} />
                              </button>
                            </td>
                          </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* add row + totals */}
                  <div className="flex items-start justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button onClick={addItem}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 border border-blue-200 transition-all">
                        <Plus size={12} /> Add Row
                      </button>
                      <button onClick={addHeader}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 border border-slate-200 transition-all">
                        <Plus size={12} /> Add Section Header
                      </button>
                    </div>
                    {lineItems.length > 0 && (
                      <div className="text-right space-y-1" style={{ minWidth: 240 }}>
                        <div className="flex items-center justify-between gap-8 text-xs text-slate-500">
                          <span>Subtotal (Ex-VAT)</span>
                          <span className="font-semibold text-slate-700">SAR {itemsSubtotal.toLocaleString('en-SA', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center justify-between gap-8 text-xs text-slate-500">
                          <span>Discount</span>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">SAR</span>
                            <input type="number" min={0} value={form.discount}
                              onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                              className="form-input" style={{ fontSize: 11, padding: '2px 6px', width: 90, textAlign: 'right' }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-8 text-xs font-bold border-t pt-1" style={{ borderColor: '#e2e8f0' }}>
                          <span style={{ color: '#1a1a2e' }}>Grand Total (Net)</span>
                          <span style={{ color: '#1d4ed8' }}>SAR {netTotal.toLocaleString('en-SA', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Footer ──────────────────────────────────────────────────────── */}
            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => { setShowForm(false); setIsRevision(false); setRevisionSourceRef('') }} className="btn-outline">Cancel</button>
              <button onClick={handleSave} className="btn-primary">
                {isRevision ? <><GitBranch size={14} /> Save Revision</> : <><Check size={14} /> Save Quotation</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
