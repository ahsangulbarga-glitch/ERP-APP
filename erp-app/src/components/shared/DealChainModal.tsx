'use client'

import { useEffect, useState } from 'react'
import { X, FileText, ShoppingCart, CreditCard, ChevronRight, CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react'

interface Quotation { id: string; qtRef: string; qtnDate: string; customerName: string; projectName: string; amountSar: number; status: string; poNumber?: string; kaeAssigned?: { name: string } }
interface PO        { id: string; poNumber: string; poDate: string; customerName: string; projectName: string; totalValueIncVat: number; paymentCollectionPct: number; paymentStatus: string; qtRef?: string }
interface Milestone { id: string; phaseName: string; amountSar: number; dueDate: string; status: string }
interface Payment   { id: string; poNumber: string; customerName: string; poValue: number; collectionPct: number; milestones: Milestone[] }

interface DealChainSeed {
  qtRef?:    string
  poNumber?: string
}

interface Props {
  seed: DealChainSeed
  onClose: () => void
  onMilestonePaid?: () => void
}

const QSTATUS: Record<string, { bg: string; text: string; label: string }> = {
  Open:      { bg: '#eff6ff', text: '#1d4ed8', label: 'Open' },
  Converted: { bg: '#f0fdf4', text: '#15803d', label: 'Converted' },
  Lost:      { bg: '#fef2f2', text: '#b91c1c', label: 'Lost' },
  OnHold:    { bg: '#fffbeb', text: '#b45309', label: 'On Hold' },
}
const MSTATUS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  Paid:    { bg: '#f0fdf4', text: '#15803d', icon: <CheckCircle2 size={12} /> },
  Pending: { bg: '#fffbeb', text: '#b45309', icon: <Clock size={12} /> },
  Overdue: { bg: '#fef2f2', text: '#b91c1c', icon: <AlertTriangle size={12} /> },
}

function fmt(n: number) { return n.toLocaleString('en-SA', { maximumFractionDigits: 0 }) }

export default function DealChainModal({ seed, onClose, onMilestonePaid }: Props) {
  const [quote,   setQuote]   = useState<Quotation | null>(null)
  const [po,      setPo]      = useState<PO | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [seed.qtRef, seed.poNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true)
    try {
      let resolvedPoNumber = seed.poNumber
      let resolvedQtRef    = seed.qtRef

      // Fetch quote by qtRef
      if (resolvedQtRef) {
        const res = await fetch(`/api/quotations?qtRef=${encodeURIComponent(resolvedQtRef)}`)
        const data = await res.json()
        const q: Quotation | undefined = Array.isArray(data) ? data[0] : undefined
        if (q) { setQuote(q); resolvedPoNumber = resolvedPoNumber || q.poNumber }
      }

      // Fetch PO
      if (resolvedPoNumber) {
        const res = await fetch(`/api/po-tracker?poNumber=${encodeURIComponent(resolvedPoNumber)}`)
        const data = await res.json()
        const p: PO | undefined = Array.isArray(data) ? data[0] : undefined
        if (p) {
          setPo(p)
          // If we don't have the quote yet, try via qtRef on PO
          if (!resolvedQtRef && p.qtRef) {
            resolvedQtRef = p.qtRef
            const qRes = await fetch(`/api/quotations?qtRef=${encodeURIComponent(p.qtRef)}`)
            const qData = await qRes.json()
            const q2: Quotation | undefined = Array.isArray(qData) ? qData[0] : undefined
            if (q2) setQuote(q2)
          }
        }
      }

      // Fetch payment
      if (resolvedPoNumber) {
        const res = await fetch(`/api/payments?poNumber=${encodeURIComponent(resolvedPoNumber)}`)
        const data = await res.json()
        const pmt: Payment | undefined = Array.isArray(data) ? data[0] : undefined
        if (pmt) setPayment(pmt)
      }
    } finally { setLoading(false) }
  }

  const markPaid = async (milestoneId: string) => {
    if (!payment) return
    setMarking(milestoneId)
    await fetch('/api/payments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: payment.id, milestoneId, milestoneStatus: 'Paid' }),
    })
    await load()
    setMarking(null)
    onMilestonePaid?.()
  }

  const customer = quote?.customerName || po?.customerName || payment?.customerName || ''
  const project  = quote?.projectName  || po?.projectName  || ''

  return (
    <div className="modal-overlay" style={{ zIndex: 60 }}>
      <div className="modal-box flex flex-col" style={{ maxWidth: 540, maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <span className="text-blue-600">Deal Chain</span>
              {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">{customer}{project ? ` · ${project}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-1">

          {/* ── QUOTATION ── */}
          <ChainBlock
            icon={<FileText size={15} />}
            iconBg="#eff6ff" iconColor="#2563eb"
            label="Quotation"
            empty={!loading && !quote}
            emptyText="No quotation linked"
          >
            {quote && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600">{quote.qtRef}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: QSTATUS[quote.status]?.bg, color: QSTATUS[quote.status]?.text }}>
                    {QSTATUS[quote.status]?.label || quote.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Row label="Customer"  value={quote.customerName} />
                  <Row label="Date"      value={new Date(quote.qtnDate).toLocaleDateString('en-GB')} />
                  <Row label="Amount"    value={`SAR ${fmt(quote.amountSar)}`} bold />
                  <Row label="KAE"       value={quote.kaeAssigned?.name || '—'} />
                  {quote.poNumber && <Row label="PO Ref" value={quote.poNumber} mono />}
                </div>
              </div>
            )}
          </ChainBlock>

          <Connector />

          {/* ── PURCHASE ORDER ── */}
          <ChainBlock
            icon={<ShoppingCart size={15} />}
            iconBg="#f0fdf4" iconColor="#16a34a"
            label="Purchase Order"
            empty={!loading && !po}
            emptyText="No PO linked"
          >
            {po && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold" style={{ color: '#7c3aed' }}>{po.poNumber}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: po.paymentStatus === 'Paid' ? '#f0fdf4' : po.paymentStatus === 'Overdue' ? '#fef2f2' : '#fffbeb',
                             color:      po.paymentStatus === 'Paid' ? '#15803d' : po.paymentStatus === 'Overdue' ? '#b91c1c' : '#b45309' }}>
                    {po.paymentStatus}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Row label="PO Date"    value={new Date(po.poDate).toLocaleDateString('en-GB')} />
                  <Row label="Inc-VAT"    value={`SAR ${fmt(po.totalValueIncVat)}`} bold />
                  {po.qtRef && <Row label="QT Ref" value={po.qtRef} mono />}
                </div>
                {/* Collection bar */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: '#e2e8f0' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(po.paymentCollectionPct, 100)}%`, background: po.paymentCollectionPct >= 100 ? '#16a34a' : po.paymentCollectionPct >= 50 ? '#2563eb' : '#ea580c' }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{Number(po.paymentCollectionPct).toFixed(0)}% collected</span>
                </div>
              </div>
            )}
          </ChainBlock>

          <Connector />

          {/* ── PAYMENT ── */}
          <ChainBlock
            icon={<CreditCard size={15} />}
            iconBg="#faf5ff" iconColor="#7c3aed"
            label="Payment & Milestones"
            empty={!loading && !payment}
            emptyText="No payment record linked"
          >
            {payment && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Row label="PO Value"    value={`SAR ${fmt(payment.poValue)}`} bold />
                  <Row label="Outstanding" value={`SAR ${fmt(payment.poValue * (1 - payment.collectionPct / 100))}`} bold />
                  <Row label="Collected"   value={`SAR ${fmt(payment.poValue * payment.collectionPct / 100)}`} />
                  <Row label="Milestones"  value={`${payment.milestones.length} total`} />
                </div>
                {payment.milestones.length > 0 && (
                  <div className="space-y-1.5 pt-1" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Milestones</p>
                    {payment.milestones.map(m => {
                      const ms = MSTATUS[m.status] || MSTATUS.Pending
                      return (
                        <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg"
                          style={{ background: ms.bg, border: `1px solid ${ms.text}22` }}>
                          <span style={{ color: ms.text }}>{ms.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: ms.text }}>{m.phaseName}</p>
                            <p className="text-xs opacity-70" style={{ color: ms.text }}>
                              Due {new Date(m.dueDate).toLocaleDateString('en-GB')} · SAR {fmt(m.amountSar)}
                            </p>
                          </div>
                          {m.status !== 'Paid' && (
                            <button onClick={() => markPaid(m.id)} disabled={marking === m.id}
                              className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md transition-all flex items-center gap-1"
                              style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                              {marking === m.id ? <Loader2 size={10} className="animate-spin" /> : '✓'} Paid
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </ChainBlock>

        </div>

        <div className="mt-4 pt-3 shrink-0 flex justify-end" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="btn-outline">Close</button>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */
function ChainBlock({ icon, iconBg, iconColor, label, children, empty, emptyText }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; label: string
  children?: React.ReactNode; empty?: boolean; emptyText?: string
}) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      </div>
      {empty
        ? <p className="text-xs text-slate-400 italic">{emptyText}</p>
        : children}
    </div>
  )
}

function Connector() {
  return (
    <div className="flex justify-center py-0.5">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-3" style={{ background: '#cbd5e1' }} />
        <ChevronRight size={14} className="text-slate-300 -rotate-90" />
      </div>
    </div>
  )
}

function Row({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-slate-400 shrink-0">{label}:</span>
      <span className={`text-slate-700 truncate ${bold ? 'font-semibold' : ''} ${mono ? 'font-mono text-purple-600' : ''}`}>{value}</span>
    </div>
  )
}
