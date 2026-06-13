'use client'

import { useState, useEffect, useCallback } from 'react'
import { SessionUser, CompanySetting, PublicHoliday, ROLE_LABELS } from '@/types'
import { canWrite } from '@/lib/rbac'
import { toastSuccess, toastError } from '@/components/shared/Toast'
import { Building2, Bell, Calendar, Plus, Trash2, Save, GitBranch, Edit2, X, ChevronUp, ChevronDown, Globe, ImagePlus, Shield, Pencil, Check, FileText } from 'lucide-react'
import { COUNTRY_TAX_PRESETS, COUNTRY_LIST } from '@/lib/taxConfig'

interface Props { user: SessionUser }

const SUB_TABS = [
  { id: 'company',       label: 'Company Info',       icon: Building2  },
  { id: 'templates',     label: 'Doc Templates',      icon: FileText   },
  { id: 'tax',           label: 'Tax & Region',       icon: Globe      },
  { id: 'notifications', label: 'Notifications',      icon: Bell       },
  { id: 'calendar',      label: 'Calendar',           icon: Calendar   },
  { id: 'workflows',     label: 'Workflows',          icon: GitBranch  },
]

const PROCESSES: { id: string; label: string; color: string; bg: string }[] = [
  { id: 'quotation',    label: 'Quotations',    color: '#0891b2', bg: '#e0f2fe' },
  { id: 'salesOrders',  label: 'Sales Orders',  color: '#0f766e', bg: '#f0fdfa' },
  { id: 'invoice',      label: 'Invoices',      color: '#7c3aed', bg: '#f5f3ff' },
  { id: 'expense',      label: 'Expenses',      color: '#d97706', bg: '#fef3c7' },
  { id: 'procurement',  label: 'Procurement',   color: '#0f766e', bg: '#f0fdfa' },
  { id: 'delivery',     label: 'Delivery',      color: '#2563eb', bg: '#eff6ff' },
  { id: 'leave',        label: 'Leave Requests',color: '#059669', bg: '#f0fdf4' },
]

const ALL_ROLES = Object.entries(ROLE_LABELS) as [string, string][]

type WfStep = { id: string; process: string; stepOrder: number; label: string; approverRole: string | null; isActive: boolean }

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type NotifPrefs = {
  emailEnabled: boolean; whatsappEnabled: boolean; inAppEnabled: boolean
  onApproval: boolean; onPaymentDue: boolean; onDocExpiry: boolean
  onInvoiceIssued: boolean; onNewRfq: boolean
}

// ── Reusable form helpers (declared at module scope so input focus is preserved) ──
function Field({ label, value, onChange, placeholder, type = 'text', disabled = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50" />
    </div>
  )
}

function Toggle({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-none ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

/** Render first page of a PDF file to a JPEG data URL via pdf.js */
async function pdfToImage(file: File, maxW: number, maxH: number, quality = 0.88): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  // Dynamically import pdfjs-dist (client-only)
  const pdfjsLib = await import('pdfjs-dist')
  // Point worker to local bundle
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const pdf      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page     = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })

  // Scale so the rendered page fits within maxW × maxH
  const scale    = Math.min(maxW / viewport.width, maxH / viewport.height, 3) // max 3× to avoid huge canvases
  const scaled   = page.getViewport({ scale })

  const canvas   = document.createElement('canvas')
  canvas.width   = Math.round(scaled.width)
  canvas.height  = Math.round(scaled.height)

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await page.render({ canvasContext: ctx, viewport: scaled }).promise
  return canvas.toDataURL('image/jpeg', quality)
}

/** Compress/resize an image file OR convert a PDF page 1 → JPEG data URL */
async function processUpload(file: File, maxW: number, maxH: number, quality = 0.88): Promise<string> {
  // PDF: render first page to canvas
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return pdfToImage(file, maxW, maxH, quality)
  }
  // Image: resize via canvas
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('File read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Image load failed'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxW || height > maxH) {
          const scale = Math.min(maxW / width, maxH / height)
          width  = Math.round(width  * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// Keep alias for logo uploads
const compressImage = processUpload

// ── PDF Footnotes Editor ──────────────────────────────────────────────────────
const DEFAULT_FOOTNOTES = [
  'Any deviation in specification or material of construction, quantity will warrant a change in price from the manufacturer.',
  'Any subsequent claims regarding Model Code, Material of Construction (MOC), Design, or any other discrepancies will not be honored by M/s DLIT',
  'Please note that due to the current situation, the delivery lead time may be longer than initially offered',
  'The offered prices are valid only for this enquiry and quantity. Orders are non-cancellable upon PO placement. TDS of the proposed valves is enclosed with the offer',
]

function FootnotesEditor({
  footnotes, onChange, isAdmin,
}: { footnotes: string[]; onChange: (f: string[]) => void; isAdmin: boolean }) {
  const [adding,   setAdding]   = useState(false)
  const [newNote,  setNewNote]  = useState('')
  const [editIdx,  setEditIdx]  = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  // If no custom footnotes saved, show defaults in preview
  const displayList = footnotes.length > 0 ? footnotes : DEFAULT_FOOTNOTES
  const isDefault   = footnotes.length === 0

  const add = () => {
    if (!newNote.trim()) return
    onChange([...footnotes.length > 0 ? footnotes : DEFAULT_FOOTNOTES, newNote.trim()])
    setNewNote(''); setAdding(false)
  }

  const remove = (i: number) => {
    const base = footnotes.length > 0 ? footnotes : DEFAULT_FOOTNOTES
    onChange(base.filter((_, idx) => idx !== i))
  }

  const startEdit = (i: number) => {
    setEditIdx(i)
    setEditText((footnotes.length > 0 ? footnotes : DEFAULT_FOOTNOTES)[i])
  }

  const saveEdit = () => {
    if (editIdx === null) return
    const base = [...(footnotes.length > 0 ? footnotes : DEFAULT_FOOTNOTES)]
    base[editIdx] = editText.trim()
    onChange(base); setEditIdx(null)
  }

  const moveUp = (i: number) => {
    const base = [...(footnotes.length > 0 ? footnotes : DEFAULT_FOOTNOTES)]
    if (i === 0) return; [base[i-1], base[i]] = [base[i], base[i-1]]; onChange(base)
  }

  const moveDown = (i: number) => {
    const base = [...(footnotes.length > 0 ? footnotes : DEFAULT_FOOTNOTES)]
    if (i === base.length-1) return; [base[i], base[i+1]] = [base[i+1], base[i]]; onChange(base)
  }

  const resetToDefaults = () => onChange([])

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div>
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">📝 PDF Footnotes</span>
          <p className="text-xs text-slate-500 mt-0.5">Bullet points printed at the bottom of the line-items page on every quotation PDF.</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {!isDefault && (
              <button onClick={resetToDefaults} className="text-xs text-slate-500 border border-slate-200 px-2 py-1 rounded hover:bg-slate-50">
                Reset defaults
              </button>
            )}
            {!adding && (
              <button onClick={() => { setAdding(true); setNewNote('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: '#6366f1' }}>
                <Plus size={12} /> Add Note
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        {isDefault && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            ⚠️ Showing built-in defaults. Edit or remove any line to start customising.
          </div>
        )}

        {displayList.map((note, i) => (
          <div key={i}>
            {editIdx === i ? (
              <div className="flex gap-2">
                <textarea rows={2} className="form-input text-xs flex-1 resize-none" value={editText}
                  onChange={e => setEditText(e.target.value)} />
                <div className="flex flex-col gap-1">
                  <button onClick={saveEdit} className="px-2 py-1 rounded text-xs text-white" style={{ background: '#6366f1' }}>
                    <Check size={11} />
                  </button>
                  <button onClick={() => setEditIdx(null)} className="px-2 py-1 rounded text-xs text-slate-500 border border-slate-200">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-slate-100 bg-white group">
                <span className="text-slate-400 text-xs mt-0.5 shrink-0">*</span>
                <p className="text-xs text-slate-700 flex-1 leading-relaxed">{note}</p>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => moveUp(i)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" disabled={i === 0}><ChevronUp size={11} /></button>
                    <button onClick={() => moveDown(i)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" disabled={i === displayList.length-1}><ChevronDown size={11} /></button>
                    <button onClick={() => startEdit(i)} className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil size={11} /></button>
                    <button onClick={() => remove(i)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={11} /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {adding && isAdmin && (
          <div className="flex gap-2 pt-1">
            <textarea rows={2} className="form-input text-xs flex-1 resize-none" placeholder="Enter footnote text..."
              value={newNote} onChange={e => setNewNote(e.target.value)} />
            <div className="flex flex-col gap-1">
              <button onClick={add} className="px-2 py-1.5 rounded text-xs text-white" style={{ background: '#6366f1' }}>
                <Check size={11} />
              </button>
              <button onClick={() => setAdding(false)} className="px-2 py-1.5 rounded text-xs text-slate-500 border border-slate-200">
                <X size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Prepared By Contacts Editor ───────────────────────────────────────────────
type PreparedContact = { name: string; title: string; email: string; contact: string }

function PreparedByEditor({
  contacts, onChange, isAdmin,
}: { contacts: PreparedContact[]; onChange: (c: PreparedContact[]) => void; isAdmin: boolean }) {
  const blank = (): PreparedContact => ({ name: '', title: '', email: '', contact: '' })
  const [adding, setAdding] = useState(false)
  const [form,   setForm]   = useState<PreparedContact>(blank())
  const [editIdx, setEditIdx] = useState<number | null>(null)

  const startEdit = (i: number) => { setEditIdx(i); setForm({ ...contacts[i] }); setAdding(true) }
  const remove    = (i: number) => onChange(contacts.filter((_, idx) => idx !== i))
  const moveUp    = (i: number) => { if (i === 0) return; const c = [...contacts]; [c[i-1],c[i]] = [c[i],c[i-1]]; onChange(c) }
  const moveDown  = (i: number) => { if (i === contacts.length-1) return; const c = [...contacts]; [c[i],c[i+1]] = [c[i+1],c[i]]; onChange(c) }

  const save = () => {
    if (!form.name.trim()) return
    if (editIdx !== null) {
      const c = [...contacts]; c[editIdx] = form; onChange(c)
    } else {
      onChange([...contacts, form])
    }
    setAdding(false); setEditIdx(null); setForm(blank())
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div>
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">📋 Prepared By Contacts (Override)</span>
          <p className="text-xs text-slate-500 mt-0.5">
            Each quotation PDF <strong className="text-slate-600">auto-fills</strong> from the assigned KAE + their manager.
            Add contacts here only to <em>override</em> that for all quotations.
          </p>
        </div>
        {isAdmin && !adding && (
          <button onClick={() => { setAdding(true); setEditIdx(null); setForm(blank()) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: '#6366f1' }}>
            <Plus size={12} /> Add Contact
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Add / Edit form */}
        {adding && isAdmin && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-indigo-700">{editIdx !== null ? 'Edit Contact' : 'New Contact'}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Full Name *</label>
                <input className="form-input text-xs" placeholder="Mr. Ahmed Al-Sayed"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Job Title</label>
                <input className="form-input text-xs" placeholder="Key Account Engineer"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Email</label>
                <input className="form-input text-xs" placeholder="ahmed@company.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Phone / Contact</label>
                <input className="form-input text-xs" placeholder="+966 50 000 0000"
                  value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: '#6366f1' }}>
                <Check size={11} /> {editIdx !== null ? 'Update' : 'Add'}
              </button>
              <button onClick={() => { setAdding(false); setEditIdx(null); setForm(blank()) }}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-500 border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Contacts list */}
        {contacts.length === 0 && !adding ? (
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 text-center">
            ✅ <strong>Auto mode:</strong> each quotation PDF will show the assigned KAE + their manager automatically.
            {isAdmin && <><br /><button onClick={() => { setAdding(true); setEditIdx(null); setForm(blank()) }} className="text-indigo-600 underline mt-1 inline-block">Add override contacts</button> to use fixed names instead.</>}
          </div>
        ) : (
          contacts.map((c, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 bg-white">
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{c.name}{c.title ? ` — ${c.title}` : ''}</p>
                <p className="text-xs text-slate-500 truncate">{c.email}{c.contact ? ` · ${c.contact}` : ''}</p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => moveUp(i)} title="Move up"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" disabled={i === 0}>
                    <ChevronUp size={12} />
                  </button>
                  <button onClick={() => moveDown(i)} title="Move down"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" disabled={i === contacts.length - 1}>
                    <ChevronDown size={12} />
                  </button>
                  <button onClick={() => startEdit(i)} title="Edit"
                    className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => remove(i)} title="Remove"
                    className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function TabSettings({ user }: Props) {
  const isAdmin = canWrite(user.role, 'settings')
  const [sub, setSub] = useState('company')

  const [company, setCompany]   = useState<Partial<CompanySetting>>({})
  const [cSaving, setCSaving]   = useState(false)
  const [cLoaded, setCLoaded]   = useState(false)

  const [notif,    setNotif]    = useState<NotifPrefs>({
    emailEnabled: false, whatsappEnabled: false, inAppEnabled: true,
    onApproval: true, onPaymentDue: true, onDocExpiry: true, onInvoiceIssued: true, onNewRfq: true,
  })
  const [nSaving,  setNSaving]  = useState(false)

  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [hDate,    setHDate]    = useState('')
  const [hName,    setHName]    = useState('')
  const [hSaving,  setHSaving]  = useState(false)

  // ── Workflows ─────────────────────────────────────────────────────────────────
  const [wfSteps,   setWfSteps]   = useState<WfStep[]>([])
  const [wfProcess, setWfProcess] = useState('quotation')
  const [wfModal,   setWfModal]   = useState(false)
  const [wfEdit,    setWfEdit]    = useState<WfStep | null>(null)
  const [wfForm,    setWfForm]    = useState({ label: '', approverRole: '', stepOrder: '' })
  const [wfSaving,  setWfSaving]  = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/settings/holidays'),
      ])
      if (sRes.ok) {
        const d = await sRes.json()
        setCompany(d.company ?? {})
        if (d.notifications) setNotif(d.notifications)
        setCLoaded(true)
      }
      if (hRes.ok) setHolidays(await hRes.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/api/approval-workflows')
      if (res.ok) setWfSteps(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => { if (sub === 'workflows') loadWorkflows() }, [sub, loadWorkflows])

  const openAddStep = () => {
    const existing = wfSteps.filter(s => s.process === wfProcess)
    const nextOrder = existing.length > 0 ? Math.max(...existing.map(s => s.stepOrder)) + 1 : 1
    setWfEdit(null)
    setWfForm({ label: '', approverRole: '', stepOrder: String(nextOrder) })
    setWfModal(true)
  }

  const openEditStep = (step: WfStep) => {
    setWfEdit(step)
    setWfForm({ label: step.label, approverRole: step.approverRole ?? '', stepOrder: String(step.stepOrder) })
    setWfModal(true)
  }

  const saveStep = async () => {
    if (!wfForm.label.trim()) return
    setWfSaving(true)
    try {
      const res = await fetch('/api/approval-workflows', {
        method: wfEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wfEdit
          ? { id: wfEdit.id, label: wfForm.label, approverRole: wfForm.approverRole || null, stepOrder: Number(wfForm.stepOrder) }
          : { process: wfProcess, label: wfForm.label, approverRole: wfForm.approverRole || null, stepOrder: Number(wfForm.stepOrder) }
        ),
      })
      if (res.ok) { toastSuccess(wfEdit ? 'Step updated' : 'Step added'); setWfModal(false); loadWorkflows() }
      else        { const d = await res.json(); toastError(d.error || 'Save failed') }
    } catch { toastError('Save failed') } finally { setWfSaving(false) }
  }

  const deleteStep = async (id: string) => {
    if (!confirm('Remove this approval step?')) return
    const res = await fetch('/api/approval-workflows', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { toastSuccess('Step removed'); loadWorkflows() }
    else        { toastError('Delete failed') }
  }

  const moveStep = async (step: WfStep, dir: 'up' | 'down') => {
    const siblings = wfSteps.filter(s => s.process === step.process).sort((a, b) => a.stepOrder - b.stepOrder)
    const idx = siblings.findIndex(s => s.id === step.id)
    const swap = dir === 'up' ? siblings[idx - 1] : siblings[idx + 1]
    if (!swap) return
    await Promise.all([
      fetch('/api/approval-workflows', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: step.id, stepOrder: swap.stepOrder }) }),
      fetch('/api/approval-workflows', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: swap.id, stepOrder: step.stepOrder }) }),
    ])
    loadWorkflows()
  }

  const [taxSaving, setTaxSaving] = useState(false)

  const saveCompany = async () => {
    setCSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'company', ...company }),
      })
      if (res.ok) { toastSuccess('Company settings saved') }
      else        { const d = await res.json(); toastError(d.error || 'Save failed') }
    } catch { toastError('Save failed') } finally { setCSaving(false) }
  }

  const saveTax = async () => {
    setTaxSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'company',
          country:        company.country        ?? 'Saudi Arabia',
          taxName:        company.taxName        ?? 'VAT',
          defaultVatRate: company.defaultVatRate ?? 15,
          taxNumberLabel: company.taxNumberLabel ?? 'VAT Number',
          currency:       company.currency       ?? 'SAR',
          currencySymbol: company.currencySymbol ?? 'SAR',
        }),
      })
      if (res.ok) { toastSuccess('Tax & region settings saved') }
      else        { const d = await res.json(); toastError(d.error || 'Save failed') }
    } catch { toastError('Save failed') } finally { setTaxSaving(false) }
  }

  /** Auto-fill tax fields when a country preset is selected */
  const applyCountryPreset = (countryName: string) => {
    const preset = COUNTRY_TAX_PRESETS[countryName]
    if (preset) {
      setCompany(c => ({
        ...c,
        country:        countryName,
        taxName:        preset.taxName,
        defaultVatRate: preset.taxRate,
        taxNumberLabel: preset.taxNumberLabel,
        currency:       preset.currency,
        currencySymbol: preset.currencySymbol,
      }))
    } else {
      setCompany(c => ({ ...c, country: countryName }))
    }
  }

  const saveNotif = async () => {
    setNSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'notifications', ...notif }),
      })
      if (res.ok) { toastSuccess('Notification preferences saved') }
      else        { toastError('Save failed') }
    } catch { toastError('Save failed') } finally { setNSaving(false) }
  }

  const toggleDay = (d: number) => {
    if (!isAdmin) return
    const days = (company.workingDays ?? '0,1,2,3,4').split(',').map(Number)
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort()
    setCompany(c => ({ ...c, workingDays: next.join(',') }))
  }

  const addHoliday = async () => {
    if (!hDate || !hName.trim()) return
    setHSaving(true)
    try {
      const res = await fetch('/api/settings/holidays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: hDate, name: hName.trim() }),
      })
      if (res.ok) { toastSuccess('Holiday added'); setHDate(''); setHName(''); loadAll() }
      else        { const d = await res.json(); toastError(d.error || 'Failed') }
    } catch { toastError('Failed') } finally { setHSaving(false) }
  }

  const deleteHoliday = async (id: string) => {
    const res = await fetch('/api/settings/holidays', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { toastSuccess('Holiday removed'); loadAll() }
    else        { toastError('Delete failed') }
  }

  const activeDays = (company.workingDays ?? '0,1,2,3,4').split(',').map(Number)

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">

      {/* Sub-tab bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1 flex gap-1">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg flex-1 justify-center transition-colors ${
              sub === t.id
                ? 'text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
            style={sub === t.id ? { background: '#6366f1' } : {}}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Company Info ── */}
      {sub === 'company' && cLoaded && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-5">
          {!isAdmin && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
              You have read-only access to company settings.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Company Name" value={company.companyName ?? ''} onChange={v => setCompany(c => ({ ...c, companyName: v }))} disabled={!isAdmin} />
            </div>
            <Field label="CR Number" value={company.crNumber ?? ''} onChange={v => setCompany(c => ({ ...c, crNumber: v }))} placeholder="e.g. 1010XXXXXX" disabled={!isAdmin} />
            <Field label="VAT Number" value={company.vatNumber ?? ''} onChange={v => setCompany(c => ({ ...c, vatNumber: v }))} placeholder="15-digit VAT TIN" disabled={!isAdmin} />
            <div className="col-span-2">
              <Field label="Registered Address" value={company.address ?? ''} onChange={v => setCompany(c => ({ ...c, address: v }))} placeholder="Full address" disabled={!isAdmin} />
            </div>
            <Field label="Phone" value={company.phone ?? ''} onChange={v => setCompany(c => ({ ...c, phone: v }))} placeholder="+966 XX XXX XXXX" disabled={!isAdmin} />
            <Field label="Email" value={company.email ?? ''} onChange={v => setCompany(c => ({ ...c, email: v }))} type="email" placeholder="info@company.com" disabled={!isAdmin} />
            <Field label="Website" value={company.website ?? ''} onChange={v => setCompany(c => ({ ...c, website: v }))} placeholder="https://…" disabled={!isAdmin} />
            <div className="col-span-2">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                <Globe size={13} className="shrink-0" />
                <span>VAT rate, currency and country settings have moved to the <button onClick={() => setSub('tax')} className="font-semibold underline underline-offset-2 hover:text-indigo-900">Tax &amp; Region</button> tab.</span>
              </div>
            </div>
          </div>
          {/* ── Branding / Logos ── */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              🎨 Branding &amp; Logos
            </div>
            <div className="p-4 space-y-5">

              {/* ── PDF Header / Letterhead Image ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">PDF Letterhead Header</label>
                    <p className="text-xs text-slate-500 mt-0.5">Full-width image that appears at the top of every PDF page (quotations, invoices, sales orders). Recommended: 1600×200 px PNG with white background.</p>
                  </div>
                </div>
                {(company as any).pdfHeaderDataUrl ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={(company as any).pdfHeaderDataUrl} alt="PDF header" className="w-full max-h-24 object-contain rounded border border-slate-200 bg-white" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-700 font-medium">✓ PDF letterhead uploaded</span>
                      {isAdmin && (
                        <button onClick={() => setCompany(c => ({ ...c, pdfHeaderDataUrl: null }))}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-red-500 hover:bg-red-50 border border-red-200">
                          <X size={10} /> Remove
                        </button>
                      )}
                      {isAdmin && (
                        <label className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-indigo-600 hover:bg-indigo-50 border border-indigo-200 cursor-pointer">
                          <ImagePlus size={10} /> Replace
                          <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
                            onChange={async e => {
                              const file = e.target.files?.[0]; if (!file) return
                              if (file.size > 10 * 1024 * 1024) { toastError('Image must be under 10 MB'); return }
                              try {
                                const compressed = await compressImage(file, 1600, 300, 0.88)
                                setCompany(c => ({ ...c, pdfHeaderDataUrl: compressed }))
                              } catch { toastError('Could not process image') }
                              e.target.value = ''
                            }} />
                        </label>
                      )}
                    </div>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-sm border-2 border-dashed rounded-xl transition-colors ${
                    isAdmin ? 'border-slate-300 text-slate-500 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700' : 'border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}>
                    <ImagePlus size={22} />
                    <span className="font-medium">{isAdmin ? 'Upload PDF Letterhead (PDF, PNG, JPG — max 10 MB)' : 'No letterhead uploaded — using default'}</span>
                    <span className="text-xs opacity-70">This replaces the default DLIT header on all PDF documents</span>
                    {isAdmin && (
                      <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp"
                        onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return
                          if (file.size > 10 * 1024 * 1024) { toastError('Image must be under 10 MB'); return }
                          try {
                            const compressed = await compressImage(file, 1600, 300, 0.88)
                            setCompany(c => ({ ...c, pdfHeaderDataUrl: compressed }))
                          } catch { toastError('Could not process image') }
                          e.target.value = ''
                        }} />
                    )}
                  </label>
                )}
              </div>

              {/* ── Company Logo (for app UI) ── */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Company Logo (App UI)</label>
                  <p className="text-xs text-slate-500 mt-0.5">Shown in the app header and as fallback in documents. Square or horizontal PNG recommended.</p>
                </div>
                {company.logoDataUrl ? (
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={company.logoDataUrl} alt="Company logo" className="h-14 max-w-[200px] object-contain rounded border border-slate-200 bg-white" />
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-indigo-700 font-medium">✓ Logo uploaded</span>
                      {isAdmin && (
                        <button onClick={() => setCompany(c => ({ ...c, logoDataUrl: undefined }))}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-red-500 hover:bg-red-50 border border-red-200">
                          <X size={10} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-2 px-4 py-5 text-sm border-2 border-dashed rounded-xl transition-colors ${
                    isAdmin ? 'border-slate-300 text-slate-500 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600' : 'border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}>
                    <ImagePlus size={18} />
                    <span>{isAdmin ? 'Click to upload company logo (PNG, JPG — max 2 MB)' : 'No logo uploaded'}</span>
                    {isAdmin && (
                      <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.svg,.webp"
                        onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return
                          if (file.size > 5 * 1024 * 1024) { toastError('Logo must be under 5 MB'); return }
                          try {
                            const compressed = await compressImage(file, 400, 400, 0.9)
                            setCompany(c => ({ ...c, logoDataUrl: compressed }))
                          } catch { toastError('Could not process image') }
                          e.target.value = ''
                        }} />
                    )}
                  </label>
                )}
              </div>

            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
            📄 PDF template settings (closing text, signature, footnotes, footer, contacts) have moved to the <button onClick={() => setSub('templates')} className="font-semibold underline">Doc Templates</button> tab.
          </div>

          {isAdmin && (
            <button onClick={saveCompany} disabled={cSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: '#6366f1' }}>
              <Save size={14} />
              {cSaving ? 'Saving…' : 'Save Company Info'}
            </button>
          )}
        </div>
      )}

      {/* ── Document Templates ── */}
      {sub === 'templates' && cLoaded && (
        <div className="space-y-5">

          {/* Doc type selector */}
          {(() => {
            const [docType, setDocType] = useState<'quotation' | 'invoice' | 'salesorder'>('quotation')
            const cs = company as any

            const field = (label: string, key: string, placeholder: string, rows = 1) => (
              <div>
                <label className="form-label">{label}</label>
                {rows > 1 ? (
                  <textarea rows={rows} className="form-input resize-none"
                    placeholder={placeholder}
                    value={cs[key] ?? ''}
                    onChange={e => setCompany(c => ({ ...c, [key]: e.target.value } as any))}
                    disabled={!isAdmin} />
                ) : (
                  <input className="form-input" placeholder={placeholder}
                    value={cs[key] ?? ''}
                    onChange={e => setCompany(c => ({ ...c, [key]: e.target.value } as any))}
                    disabled={!isAdmin} />
                )}
              </div>
            )

            return (
              <>
                {/* Document type tabs */}
                <div className="flex gap-2 p-1 rounded-xl bg-slate-100 w-fit">
                  {([
                    { id: 'quotation',  label: '📄 Quotation / Offer' },
                    { id: 'invoice',    label: '🧾 Invoice' },
                    { id: 'salesorder', label: '🛒 Sales Order' },
                  ] as const).map(t => (
                    <button key={t.id} onClick={() => setDocType(t.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        docType === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── QUOTATION ── */}
                {docType === 'quotation' && (
                  <div className="space-y-4">
                    {/* Shared branding */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        🎨 Letterhead &amp; Branding
                      </div>
                      <div className="p-4 space-y-3">
                        <p className="text-xs text-slate-500">Upload your PDF letterhead image in <button onClick={() => setSub('company')} className="text-indigo-600 underline">Company Info → Branding &amp; Logos</button>.</p>
                        {cs.pdfHeaderDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cs.pdfHeaderDataUrl} alt="letterhead" className="w-full max-h-20 object-contain rounded border border-slate-200 bg-white" />
                        ) : (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ No letterhead uploaded — using default DLIT header</p>
                        )}
                      </div>
                    </div>

                    {/* Closing block */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        ✍️ Closing &amp; Signature (Cover Page)
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-3">
                        <div className="col-span-2">{field('Closing Paragraph', 'pdfClosingText', 'We trust you will find our offer most competitive...', 2)}</div>
                        {field('Signatory Name', 'pdfSignatoryName', 'OMAIR AZMI')}
                        {field('Signatory Title', 'pdfSignatoryTitle', 'Manager, Water Division')}
                        <div className="col-span-2">{field('CC Line', 'pdfSignatoryCc', 'Mr. Mohammed Afaque Ahmed, CEO')}</div>
                        <div className="col-span-2">{field('Legal Notice', 'pdfLegalNotice', 'THIS OFFER IS LEGAL WITHOUT SIGNATURE DURING ELECTRONIC TRANSMISSION')}</div>
                      </div>
                    </div>

                    {/* Footnotes */}
                    <FootnotesEditor
                      footnotes={(() => { try { return JSON.parse(cs.pdfFootnotes || '[]') } catch { return [] } })()}
                      onChange={notes => setCompany(c => ({ ...c, pdfFootnotes: JSON.stringify(notes) } as any))}
                      isAdmin={isAdmin}
                    />

                    {/* Footer */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        📄 Page Footer (all pages)
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-3">
                        {field('Address (left)', 'pdfFooterAddress', '17, 3rd Floor, 7202, Saeed Ibn Zayd Rd,\nQurtubah, 13247, Riyadh, KSA', 2)}
                        {field('Emails (right, one per line)', 'pdfFooterEmails', 'sales@company.com\ninfo@company.com', 2)}
                      </div>
                    </div>

                    {/* Prepared by */}
                    <PreparedByEditor
                      contacts={(() => { try { return JSON.parse(cs.preparedByContacts || '[]') } catch { return [] } })()}
                      onChange={contacts => setCompany(c => ({ ...c, preparedByContacts: JSON.stringify(contacts) } as any))}
                      isAdmin={isAdmin}
                    />
                  </div>
                )}

                {/* ── INVOICE ── */}
                {docType === 'invoice' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-blue-50/40 p-4 text-xs text-slate-600">
                      ℹ️ These defaults are printed on every invoice PDF. You can override them per-invoice when creating/editing.
                    </div>
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        🧾 Invoice Template Defaults
                      </div>
                      <div className="p-4 space-y-3">
                        {field('Default Payment Terms', 'invoicePaymentTerms', '100% advance payment upon receipt of invoice')}
                        {field('Bank Details (printed on invoice)', 'invoiceBankDetails', 'Bank: ABC Bank | IBAN: SA00 0000 0000 0000 | Account: 000000000', 3)}
                        {field('Standard Notes / Terms', 'invoiceNotes', 'All prices are exclusive of VAT. VAT will be charged at the applicable rate.', 3)}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SALES ORDER ── */}
                {docType === 'salesorder' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-blue-50/40 p-4 text-xs text-slate-600">
                      ℹ️ These defaults appear on every Sales Order PDF. You can override them per-SO when creating/editing.
                    </div>
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wide" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        🛒 Sales Order Template Defaults
                      </div>
                      <div className="p-4 space-y-3">
                        {field('Default Terms &amp; Conditions', 'soTerms', 'Delivery: DDP, Delivered to Site | Warranty: 12 months from date of supply', 2)}
                        {field('Standard Notes (printed on SO)', 'soNotes', 'All sales orders are subject to our standard terms and conditions.', 3)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Save button */}
                {isAdmin && (
                  <button onClick={saveCompany} disabled={cSaving}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                    style={{ background: '#6366f1' }}>
                    <Save size={14} />
                    {cSaving ? 'Saving…' : `Save ${docType === 'quotation' ? 'Quotation' : docType === 'invoice' ? 'Invoice' : 'Sales Order'} Template`}
                  </button>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Tax & Region ── */}
      {sub === 'tax' && cLoaded && (
        <div className="space-y-4">
          {!isAdmin && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
              You have read-only access to tax & region settings.
            </div>
          )}

          {/* Country quick-select */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe size={15} style={{ color: '#6366f1' }} />
              <span className="text-sm font-semibold text-slate-800">Country &amp; Region</span>
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              Select your operating country. Tax fields below will be auto-filled with standard rates — you can override them manually.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
              <select
                value={company.country ?? 'Saudi Arabia'}
                onChange={e => applyCountryPreset(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-slate-50">
                {COUNTRY_LIST.map(c => <option key={c}>{c}</option>)}
                {/* Allow free text via Other */}
                {!COUNTRY_LIST.includes(company.country ?? '') && company.country && (
                  <option>{company.country}</option>
                )}
              </select>
            </div>

            {/* Preset badges */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['Saudi Arabia', 'UAE', 'Bahrain', 'Oman', 'Kuwait', 'Qatar', 'UK', 'USA', 'India'].map(c => (
                <button key={c}
                  onClick={() => isAdmin && applyCountryPreset(c)}
                  disabled={!isAdmin}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                    (company.country ?? 'Saudi Arabia') === c
                      ? 'text-white border-transparent'
                      : 'text-slate-500 border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                  } disabled:cursor-not-allowed`}
                  style={(company.country ?? 'Saudi Arabia') === c ? { background: '#6366f1' } : {}}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Tax configuration */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-800">Tax Configuration</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tax Name</label>
                <input
                  value={company.taxName ?? 'VAT'}
                  onChange={e => setCompany(c => ({ ...c, taxName: e.target.value }))}
                  placeholder="e.g. VAT, GST, Sales Tax"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-slate-50" />
                <p className="text-xs text-slate-400 mt-1">Shown on quotes &amp; invoices</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tax Rate (%)</label>
                <input type="number" min="0" max="100" step="0.5"
                  value={company.defaultVatRate ?? 15}
                  onChange={e => setCompany(c => ({ ...c, defaultVatRate: parseFloat(e.target.value) || 0 }))}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-slate-50" />
                <p className="text-xs text-slate-400 mt-1">Default rate for new documents</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tax Number Label</label>
                <input
                  value={company.taxNumberLabel ?? 'VAT Number'}
                  onChange={e => setCompany(c => ({ ...c, taxNumberLabel: e.target.value }))}
                  placeholder="e.g. VAT Number, TRN, GSTIN"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-slate-50" />
                <p className="text-xs text-slate-400 mt-1">Used next to your registration number</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{company.taxNumberLabel ?? 'VAT Number'}</label>
                <input
                  value={company.vatNumber ?? ''}
                  onChange={e => setCompany(c => ({ ...c, vatNumber: e.target.value }))}
                  placeholder="Your registration number"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-slate-50" />
              </div>
            </div>
          </div>

          {/* Currency */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-800">Currency</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Currency Code</label>
                <input
                  value={company.currency ?? 'SAR'}
                  onChange={e => setCompany(c => ({ ...c, currency: e.target.value.toUpperCase() }))}
                  placeholder="SAR"
                  maxLength={5}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 uppercase placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-slate-50" />
                <p className="text-xs text-slate-400 mt-1">ISO code (SAR, AED, USD…)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Currency Symbol</label>
                <input
                  value={company.currencySymbol ?? company.currency ?? 'SAR'}
                  onChange={e => setCompany(c => ({ ...c, currencySymbol: e.target.value }))}
                  placeholder="SAR"
                  maxLength={5}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-slate-50" />
                <p className="text-xs text-slate-400 mt-1">Symbol shown on documents (£, €, $…)</p>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Preview — how a line item will appear</div>
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Description</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Amount ({company.currency ?? 'SAR'})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700">Sample Line Item</td>
                    <td className="px-3 py-2 text-right text-slate-700">{company.currencySymbol ?? company.currency ?? 'SAR'} 10,000.00</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td className="px-3 py-2 text-slate-500">Subtotal</td>
                    <td className="px-3 py-2 text-right text-slate-700">{company.currencySymbol ?? company.currency ?? 'SAR'} 10,000.00</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-500">{company.taxName ?? 'VAT'} ({company.defaultVatRate ?? 15}%)</td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {company.currencySymbol ?? company.currency ?? 'SAR'} {(10000 * (company.defaultVatRate ?? 15) / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td className="px-3 py-2 text-slate-800">Total</td>
                    <td className="px-3 py-2 text-right text-slate-800">
                      {company.currencySymbol ?? company.currency ?? 'SAR'} {(10000 * (1 + (company.defaultVatRate ?? 15) / 100)).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {isAdmin && (
            <button onClick={saveTax} disabled={taxSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: '#6366f1' }}>
              <Save size={14} />
              {taxSaving ? 'Saving…' : 'Save Tax & Region Settings'}
            </button>
          )}
        </div>
      )}

      {/* ── Notifications ── */}
      {sub === 'notifications' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-5">
          <div>
            <p className="text-xs text-slate-500 mb-3">Choose how you receive alerts. These are your personal preferences.</p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Channels</p>
              <Toggle label="In-App Notifications" desc="Bell icon in the header" checked={notif.inAppEnabled} onChange={v => setNotif(n => ({ ...n, inAppEnabled: v }))} />
              <Toggle label="Email Notifications" desc="Sent to your registered email" checked={notif.emailEnabled} onChange={v => setNotif(n => ({ ...n, emailEnabled: v }))} />
              <Toggle label="WhatsApp Notifications" desc="Sent to your registered phone" checked={notif.whatsappEnabled} onChange={v => setNotif(n => ({ ...n, whatsappEnabled: v }))} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Event Triggers</p>
            <Toggle label="Approval Requests" desc="When a quotation needs your approval" checked={notif.onApproval} onChange={v => setNotif(n => ({ ...n, onApproval: v }))} />
            <Toggle label="Payment Due" desc="When a payment milestone is approaching" checked={notif.onPaymentDue} onChange={v => setNotif(n => ({ ...n, onPaymentDue: v }))} />
            <Toggle label="Document Expiry" desc="When a document is about to expire" checked={notif.onDocExpiry} onChange={v => setNotif(n => ({ ...n, onDocExpiry: v }))} />
            <Toggle label="Invoice Issued" desc="When a new invoice is created" checked={notif.onInvoiceIssued} onChange={v => setNotif(n => ({ ...n, onInvoiceIssued: v }))} />
            <Toggle label="New RFQ Received" desc="When a new quotation is submitted" checked={notif.onNewRfq} onChange={v => setNotif(n => ({ ...n, onNewRfq: v }))} />
          </div>
          <button onClick={saveNotif} disabled={nSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: '#6366f1' }}>
            <Save size={14} />
            {nSaving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      )}

      {/* ── Approval Workflows ── */}
      {sub === 'workflows' && (
        <div className="space-y-4">
          {!isAdmin && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
              Only Admins can manage approval workflows.
            </div>
          )}

          {/* Process selector */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex flex-wrap gap-2">
            {PROCESSES.map(p => (
              <button key={p.id} onClick={() => setWfProcess(p.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={wfProcess === p.id
                  ? { background: p.bg, color: p.color, borderColor: p.color + '55' }
                  : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                {p.label}
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: wfProcess === p.id ? p.color + '22' : '#e2e8f0', color: wfProcess === p.id ? p.color : '#94a3b8' }}>
                  {wfSteps.filter(s => s.process === p.id).length}
                </span>
              </button>
            ))}
          </div>

          {/* Steps for selected process */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100" style={{ background: '#f8fafc' }}>
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  {PROCESSES.find(p => p.id === wfProcess)?.label} — Approval Steps
                </span>
                <p className="text-xs text-slate-400 mt-0.5">Steps are evaluated in order. All steps must be approved.</p>
              </div>
              {isAdmin && (
                <button onClick={openAddStep}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ background: '#6366f1' }}>
                  <Plus size={12} /> Add Step
                </button>
              )}
            </div>

            {/* Step list */}
            {(() => {
              const steps = wfSteps.filter(s => s.process === wfProcess).sort((a, b) => a.stepOrder - b.stepOrder)
              if (steps.length === 0) return (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No approval steps defined.{isAdmin ? ' Click "Add Step" to create one.' : ''}
                </div>
              )
              return (
                <div>
                  {steps.map((step, idx) => {
                    const proc = PROCESSES.find(p => p.id === step.process)!
                    const roleName = step.approverRole ? (ROLE_LABELS[step.approverRole as keyof typeof ROLE_LABELS] ?? step.approverRole) : 'Any Approver'
                    return (
                      <div key={step.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        {/* Step number badge */}
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: proc.color }}>
                          {idx + 1}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{step.label}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Approver: <span className="font-medium text-slate-700">{roleName}</span>
                            {!step.isActive && <span className="ml-2 text-amber-500">● Inactive</span>}
                          </div>
                        </div>

                        {/* Reorder + actions */}
                        {isAdmin && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => moveStep(step, 'up')} disabled={idx === 0}
                              className="p-1.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors">
                              <ChevronUp size={14} />
                            </button>
                            <button onClick={() => moveStep(step, 'down')} disabled={idx === steps.length - 1}
                              className="p-1.5 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors">
                              <ChevronDown size={14} />
                            </button>
                            <button onClick={() => openEditStep(step)}
                              className="p-1.5 rounded text-slate-400 hover:text-blue-600 transition-colors">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => deleteStep(step.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Step modal */}
          {wfModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
              onClick={e => { if (e.target === e.currentTarget) setWfModal(false) }}>
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#eef2ff' }}>
                      <GitBranch size={15} style={{ color: '#6366f1' }} />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      {wfEdit ? 'Edit Approval Step' : 'New Approval Step'}
                    </h3>
                  </div>
                  <button onClick={() => setWfModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Process</label>
                    <div className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                      {PROCESSES.find(p => p.id === wfProcess)?.label}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Step Order</label>
                    <input type="number" min="1" value={wfForm.stepOrder}
                      onChange={e => setWfForm(f => ({ ...f, stepOrder: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Step Label *</label>
                    <input value={wfForm.label} onChange={e => setWfForm(f => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Sales Manager Approval"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Approver Role</label>
                    <select value={wfForm.approverRole}
                      onChange={e => setWfForm(f => ({ ...f, approverRole: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="">— Any approver (CEO/Admin) —</option>
                      {ALL_ROLES.map(([role, label]) => (
                        <option key={role} value={role}>{label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">CEO and Admin can always approve regardless of role.</p>
                  </div>
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
                  <button onClick={() => setWfModal(false)}
                    className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveStep} disabled={wfSaving || !wfForm.label.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                    style={{ background: '#6366f1' }}>
                    {wfSaving ? 'Saving…' : wfEdit ? 'Update Step' : 'Add Step'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Working Calendar ── */}
      {sub === 'calendar' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-6">

          {/* Working days */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Working Days</p>
            <div className="flex gap-2 flex-wrap">
              {WEEKDAY_LABELS.map((day, i) => (
                <button key={i} onClick={() => toggleDay(i)} disabled={!isAdmin}
                  className={`w-12 h-12 rounded-xl text-sm font-medium transition-all border ${
                    activeDays.includes(i)
                      ? 'text-white border-transparent shadow-sm'
                      : 'text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100'
                  } disabled:cursor-not-allowed`}
                  style={activeDays.includes(i) ? { background: '#6366f1' } : {}}>
                  {day}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">Standard Saudi working week: Sun–Thu (0–4)</p>
            {isAdmin && (
              <button onClick={saveCompany} disabled={cSaving}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: '#6366f1' }}>
                <Save size={13} />
                {cSaving ? 'Saving…' : 'Save Working Days'}
              </button>
            )}
          </div>

          {/* Public Holidays */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Public Holidays</p>
            {isAdmin && (
              <div className="flex gap-2 mb-4 flex-wrap">
                <input type="date" value={hDate} onChange={e => setHDate(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-40" />
                <input value={hName} onChange={e => setHName(e.target.value)} placeholder="Holiday name"
                  className="flex-1 min-w-[160px] px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <button onClick={addHoliday} disabled={hSaving || !hDate || !hName.trim()}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: '#6366f1' }}>
                  <Plus size={13} /> Add
                </button>
              </div>
            )}

            {holidays.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-4 text-center">No public holidays configured.</div>
            ) : (
              <div className="space-y-1.5">
                {holidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-medium text-indigo-600">
                        {new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="text-sm text-slate-700">{h.name}</span>
                    </div>
                    {isAdmin && (
                      <button onClick={() => deleteHoliday(h.id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
  )
}
