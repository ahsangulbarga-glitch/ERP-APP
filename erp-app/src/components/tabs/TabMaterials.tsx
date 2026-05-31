'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { SessionUser, MaterialItem, StockAvailability } from '@/types'
import { canWrite, canBulkImport, canRead } from '@/lib/rbac'
import KPISummaryPanel from '@/components/shared/KPISummaryPanel'
import TabInventoryAnalytics from '@/components/tabs/TabInventoryAnalytics'
import {
  Plus, Pencil, X, Check, Trash2, Package,
  PackageCheck, PackageX, AlertTriangle, Factory,
  Download, Upload, FileSpreadsheet, BookMarked, BarChart2,
} from 'lucide-react'

// ── stock availability styles ─────────────────────────────────────────────────
const STOCK_STYLES: Record<StockAvailability, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  'In Stock':    { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', icon: <PackageCheck size={12} /> },
  'Low Stock':   { bg: '#fffbeb', text: '#b45309', border: '#fde68a', icon: <AlertTriangle size={12} /> },
  'Out of Stock':{ bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', icon: <PackageX size={12} />    },
  'Reserved':    { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', icon: <BookMarked size={12} />  },
}

const blankForm = () => ({
  productRef: '', description: '', specifications: '',
  stockAvailability: 'In Stock' as StockAvailability,
  quantity: '0', orderToFactory: false, remarks: '',
  reservedQty: '0', reservedForPO: '',
})

export default function TabMaterials({ user }: { user: SessionUser }) {
  const [activeSubTab, setActiveSubTab] = useState<'items' | 'analytics'>('items')
  const hasAnalytics = canRead(user.role, 'inventoryAnalytics')

  const [rows, setRows]         = useState<MaterialItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [filters, setFilters]   = useState({ search: '', availability: '', orderToFactory: '' })
  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow]   = useState<MaterialItem | null>(null)
  const [form, setForm]         = useState(blankForm())
  const [formError, setFormError] = useState('')
  const [exporting, setExporting]   = useState(false)
  const [importing, setImporting]   = useState(false)
  const [importMsg, setImportMsg]   = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res  = await fetch(`/api/materials?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [load])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const inStock    = rows.filter(r => r.stockAvailability === 'In Stock').length
  const lowStock   = rows.filter(r => r.stockAvailability === 'Low Stock').length
  const outOfStock = rows.filter(r => r.stockAvailability === 'Out of Stock').length
  const reserved   = rows.filter(r => r.stockAvailability === 'Reserved').length
  const pendingFactory = rows.filter(r => r.orderToFactory).length

  const kpis = [
    { label: 'Total Items',      value: rows.length,      color: 'blue'   as const, icon: <Package size={16} /> },
    { label: 'In Stock',         value: inStock,           color: 'green'  as const, icon: <PackageCheck size={16} /> },
    { label: 'Low Stock',        value: lowStock,          color: 'orange' as const, icon: <AlertTriangle size={16} /> },
    { label: 'Out of Stock',     value: outOfStock,        color: 'red'    as const, icon: <PackageX size={16} /> },
    { label: 'Reserved',         value: reserved,          color: 'purple' as const, icon: <BookMarked size={16} /> },
    { label: 'Order to Factory', value: pendingFactory,    color: 'purple' as const, icon: <Factory size={16} /> },
  ]

  // ── helpers ───────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditRow(null); setForm(blankForm()); setFormError(''); setShowForm(true)
  }

  const openEdit = (row: MaterialItem) => {
    setEditRow(row)
    setForm({
      productRef:        row.productRef,
      description:       row.description,
      specifications:    row.specifications || '',
      stockAvailability: row.stockAvailability,
      quantity:          String(row.quantity),
      orderToFactory:    row.orderToFactory,
      remarks:           row.remarks || '',
      reservedQty:       String(row.reservedQty ?? 0),
      reservedForPO:     row.reservedForPO || '',
    })
    setFormError(''); setShowForm(true)
  }

  const handleSave = async () => {
    setFormError('')
    // Basic client-side validation for reservation
    if (form.stockAvailability === 'Reserved') {
      if (!form.reservedForPO.trim()) { setFormError('PO number is required for Reserved status'); return }
      if (!form.reservedQty || Number(form.reservedQty) <= 0) { setFormError('Reserved quantity must be greater than 0'); return }
      if (Number(form.reservedQty) > Number(form.quantity)) { setFormError('Reserved quantity cannot exceed total quantity'); return }
    }
    const method = editRow ? 'PATCH' : 'POST'
    const body   = editRow ? { id: editRow.id, ...form } : form
    const res = await fetch('/api/materials', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Save failed' }))
      setFormError(err.error || 'Save failed'); return
    }
    setShowForm(false); setEditRow(null); load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await fetch('/api/materials', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  const toggleFactory = async (row: MaterialItem) => {
    await fetch('/api/materials', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, orderToFactory: !row.orderToFactory }),
    })
    load()
  }

  // ── export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ tab: 'materials', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
      const res = await fetch(`/api/export?${params}`)
      if (!res.ok) { setExporting(false); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `inventory-${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  // ── template download ─────────────────────────────────────────────────────
  const handleTemplate = () => {
    const header = ['productRef', 'description', 'stockAvailability', 'quantity', 'orderToFactory', 'remarks']
    const sample = ['BFV-DN100-PN16', 'Butterfly Valve DN100 PN16', 'In Stock', '10', 'No', 'Optional note']
    const rows   = [header, sample].map(r => r.join(',')).join('\n')
    const blob   = new Blob([rows], { type: 'text/csv' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href       = url
    a.download   = 'inventory-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── import ────────────────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tab', 'materials')
      const res  = await fetch('/api/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setImportMsg(`✓ Imported ${data.imported} of ${data.total} rows`)
        load()
      } else {
        setImportMsg(`✗ ${data.error || 'Import failed'}`)
      }
    } catch { setImportMsg('✗ Upload failed') }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  // ── Sub-tab switcher bar (rendered regardless of active sub-tab) ──────────
  const SubTabBar = hasAnalytics ? (
    <div className="flex items-center gap-1 px-4 pt-3 pb-0 shrink-0">
      <button
        onClick={() => setActiveSubTab('items')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        style={activeSubTab === 'items' ? { background: '#0891b2', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}
      >
        <Package size={13} /> Items
      </button>
      <button
        onClick={() => setActiveSubTab('analytics')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        style={activeSubTab === 'analytics' ? { background: '#059669', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}
      >
        <BarChart2 size={13} /> Analytics
      </button>
    </div>
  ) : null

  // ── Analytics view ────────────────────────────────────────────────────────
  if (activeSubTab === 'analytics' && hasAnalytics) {
    return (
      <div className="flex flex-col h-full">
        {SubTabBar}
        <div className="flex-1 overflow-y-auto">
          <TabInventoryAnalytics user={user} />
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {SubTabBar}
      <KPISummaryPanel kpis={kpis} />

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <input
          type="text" placeholder="Search ref or description…"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          className="input-sm w-52" />
        <select value={filters.availability} onChange={e => setFilters(f => ({ ...f, availability: e.target.value }))} className="input-sm">
          <option value="">All Availability</option>
          <option>In Stock</option>
          <option>Low Stock</option>
          <option>Out of Stock</option>
          <option>Reserved</option>
        </select>
        <select value={filters.orderToFactory} onChange={e => setFilters(f => ({ ...f, orderToFactory: e.target.value }))} className="input-sm">
          <option value="">All</option>
          <option value="true">Order to Factory</option>
          <option value="false">No Factory Order</option>
        </select>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ search: '', availability: '', orderToFactory: '' })}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="section-header">
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite(user.role, 'materials') && (
            <button onClick={openNew} className="btn-primary">
              <Plus size={14} /> New Item
            </button>
          )}

          {/* Export */}
          <button onClick={handleExport} disabled={exporting}
            className="btn-outline flex items-center gap-1.5 text-xs"
            title="Export current view to Excel">
            <Download size={13} />
            {exporting ? 'Exporting…' : 'Export'}
          </button>

          {/* Import — write-access roles only */}
          {canBulkImport(user.role, 'materials') && (
            <>
              <button onClick={() => fileInputRef.current?.click()} disabled={importing}
                className="btn-outline flex items-center gap-1.5 text-xs"
                title="Import from Excel / CSV">
                <Upload size={13} />
                {importing ? 'Importing…' : 'Import'}
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                className="hidden" onChange={handleImport} />

              <button onClick={handleTemplate}
                className="btn-outline flex items-center gap-1.5 text-xs"
                title="Download import template">
                <FileSpreadsheet size={13} /> Template
              </button>
            </>
          )}

          {importMsg && (
            <span className={`text-xs font-medium px-2 py-1 rounded-lg ${importMsg.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
              {importMsg}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto table-container">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <Package size={36} className="opacity-20" />
            <p className="text-sm font-medium">No inventory items found</p>
            <p className="text-xs">Try adjusting filters or add a new item</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Ref</th>
                <th>Description</th>
                <th>Stock Availability</th>
                <th className="text-right">Quantity</th>
                <th>Order to Factory</th>
                <th>Remarks</th>
                {canWrite(user.role, 'materials') && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const st = STOCK_STYLES[row.stockAvailability] || STOCK_STYLES['In Stock']
                return (
                  <tr key={row.id}>
                    {/* Product Ref */}
                    <td className="font-mono text-xs font-bold" style={{ color: '#2563eb', minWidth: 130 }}>
                      {row.productRef}
                    </td>

                    {/* Description */}
                    <td style={{ minWidth: 220 }}>
                      <div className="font-semibold text-slate-800 text-sm leading-snug">{row.description}</div>
                      {row.specifications && (
                        <div className="text-xs text-slate-500 mt-0.5 leading-snug">{row.specifications}</div>
                      )}
                    </td>

                    {/* Stock availability badge */}
                    <td style={{ minWidth: 150 }}>
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border w-fit"
                          style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                          {st.icon}{row.stockAvailability}
                        </span>
                        {row.stockAvailability === 'Reserved' && row.reservedForPO && (
                          <span className="text-xs text-slate-500 pl-1 flex items-center gap-1">
                            <span className="font-medium text-violet-600">{row.reservedForPO}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Quantity */}
                    <td className="text-right" style={{ minWidth: 110 }}>
                      {row.stockAvailability === 'Reserved' ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold text-slate-700 text-xs">{row.quantity.toLocaleString()} <span className="text-slate-400 font-normal">total</span></span>
                          <span className="text-xs text-violet-600 font-semibold">{(row.reservedQty ?? 0).toLocaleString()} <span className="font-normal">rsvd</span></span>
                          <span className="text-xs text-emerald-600 font-semibold">{Math.max(0, row.quantity - (row.reservedQty ?? 0)).toLocaleString()} <span className="font-normal">avail</span></span>
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-700">{row.quantity.toLocaleString()}</span>
                      )}
                    </td>

                    {/* Order to Factory toggle */}
                    <td style={{ minWidth: 140 }}>
                      {canWrite(user.role, 'materials') ? (
                        <button
                          onClick={() => toggleFactory(row)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all hover:opacity-80"
                          style={row.orderToFactory
                            ? { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }
                            : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                          <Factory size={11} />
                          {row.orderToFactory ? 'Ordered' : 'Order'}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
                          style={row.orderToFactory
                            ? { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }
                            : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                          <Factory size={11} />
                          {row.orderToFactory ? 'Ordered' : '—'}
                        </span>
                      )}
                    </td>

                    {/* Remarks */}
                    <td className="text-slate-400 text-xs"
                      style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.remarks || '—'}
                    </td>

                    {/* Actions */}
                    {canWrite(user.role, 'materials') && (
                      <td style={{ minWidth: 72 }}>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => openEdit(row)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(row.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Form Modal ──────────────────────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Package size={16} className="text-blue-500" />
                {editRow ? 'Edit Inventory Item' : 'New Inventory Item'}
              </h3>
              <button onClick={() => setShowForm(false)}
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

            <div className="space-y-3">
              <div>
                <label className="form-label">Product Reference <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. TCFI-BFV-200-PN16"
                  value={form.productRef}
                  onChange={e => setForm(f => ({ ...f, productRef: e.target.value.toUpperCase() }))}
                  disabled={!!editRow}
                  className="form-input font-mono"
                  style={editRow ? { background: '#f8fafc', color: '#94a3b8' } : {}} />
              </div>

              <div>
                <label className="form-label">
                  Product Description <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal ml-1 text-xs">— Title</span>
                </label>
                <input type="text" placeholder="e.g. Butterfly Valve"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="form-input font-semibold" />
              </div>

              <div>
                <label className="form-label">
                  Specifications
                  <span className="text-slate-400 font-normal ml-1 text-xs">— Body / Technical Details</span>
                </label>
                <textarea
                  placeholder="e.g. DN200 PN16, Body: GGG50, Disc: SS316, Seat: EPDM, Flanged to EN1092-2"
                  value={form.specifications}
                  onChange={e => setForm(f => ({ ...f, specifications: e.target.value }))}
                  rows={3} className="form-input resize-none text-sm"
                  style={{ color: '#475569' }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Stock Availability</label>
                  <select value={form.stockAvailability}
                    onChange={e => setForm(f => ({ ...f, stockAvailability: e.target.value as StockAvailability, reservedQty: '0', reservedForPO: '' }))}
                    className="form-input">
                    <option>In Stock</option>
                    <option>Low Stock</option>
                    <option>Out of Stock</option>
                    <option>Reserved</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Total Quantity</label>
                  <input type="number" min={0}
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="form-input" />
                </div>
              </div>

              {/* ── Reservation fields (shown only when Reserved) ─────────── */}
              {form.stockAvailability === 'Reserved' && (
                <div className="rounded-xl p-3 space-y-3" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                  <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                    <BookMarked size={13} /> Reservation Details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Reserved For PO <span className="text-red-500">*</span></label>
                      <input type="text" placeholder="e.g. PO-2026-0042"
                        value={form.reservedForPO}
                        onChange={e => setForm(f => ({ ...f, reservedForPO: e.target.value.toUpperCase() }))}
                        className="form-input font-mono text-sm" />
                    </div>
                    <div>
                      <label className="form-label">
                        Reserved Qty <span className="text-red-500">*</span>
                        {form.quantity && Number(form.quantity) > 0 && (
                          <span className="text-slate-400 font-normal ml-1">
                            (avail: {Math.max(0, Number(form.quantity) - Number(form.reservedQty || 0))})
                          </span>
                        )}
                      </label>
                      <input type="number" min={1} max={Number(form.quantity) || undefined}
                        value={form.reservedQty}
                        onChange={e => setForm(f => ({ ...f, reservedQty: e.target.value }))}
                        className="form-input" />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <input type="checkbox" id="orderToFactory"
                  checked={form.orderToFactory}
                  onChange={e => setForm(f => ({ ...f, orderToFactory: e.target.checked }))}
                  className="w-4 h-4 rounded accent-blue-600" />
                <label htmlFor="orderToFactory" className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <Factory size={14} className="text-blue-500" /> Order to Factory
                </label>
              </div>

              <div>
                <label className="form-label">Remarks</label>
                <textarea value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                  rows={2} className="form-input resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 mt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              <button onClick={handleSave} className="btn-primary"><Check size={14} /> Save Item</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
