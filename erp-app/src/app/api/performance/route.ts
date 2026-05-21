import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import prisma from '@/lib/db'

const VIEWER_ROLES = ['P1_CEO', 'P2_ADMIN', 'P3_REGIONAL_MANAGER', 'P4_SALES_MANAGER']

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const isViewer = VIEWER_ROLES.includes(session.user.role)

  /* ── Return user list for the selector dropdown ── */
  if (searchParams.get('list') === 'true') {
    if (!isViewer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { role: 'asc' },
    })
    return NextResponse.json(users)
  }

  /* ── Resolve target user ── */
  const requestedId = searchParams.get('userId')
  const targetId = (isViewer && requestedId) ? requestedId : session.user.id
  const targetUser = await prisma.user.findUnique({ where: { id: targetId } })
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  /* ══════════════════════════════════════════════════════════
     P5 — Key Account Engineer
  ══════════════════════════════════════════════════════════ */
  if (targetUser.role === 'P5_KEY_ACCOUNT_ENGINEER') {
    const customers = await prisma.customer.findMany({ where: { assignedKaeId: targetId } })
    const pos       = await prisma.pOTracker.findMany({ where: { kaeName: targetUser.name } })
    const payments  = await prisma.payment.findMany({
      where: { kaeNameId: targetId },
      include: { milestones: true },
    })

    const totalRfq       = customers.reduce((s, c) => s + c.totalRfq, 0)
    const totalConverted = customers.reduce((s, c) => s + c.totalConverted, 0)
    const winRate        = totalRfq > 0 ? (totalConverted / totalRfq) * 100 : 0
    const totalPoValue   = pos.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
    const avgCollection  = pos.length > 0
      ? pos.reduce((s, p) => s + Number(p.paymentCollectionPct), 0) / pos.length : 0

    const engaged = customers.filter(c => c.firstActivityDate && c.lastActivityDate)
    const avgEngagementDays = engaged.length > 0
      ? engaged.reduce((s, c) => {
          const d = Math.round((new Date(c.lastActivityDate!).getTime() - new Date(c.firstActivityDate!).getTime()) / 86_400_000)
          return s + d
        }, 0) / engaged.length
      : 0

    const overdueCount = payments.flatMap(p => p.milestones).filter(m => m.status === 'Overdue').length

    return NextResponse.json({
      role: targetUser.role, userId: targetId, userName: targetUser.name,
      kae: {
        winRate, totalRfq, totalConverted,
        totalPoValue, avgCollection, avgEngagementDays,
        overdueCount,
        customerCount: customers.length,
        accountBreakdown: customers.map(c => ({
          name:          c.customerName,
          rfq:           c.totalRfq,
          converted:     c.totalConverted,
          poValue:       Number(c.totalPoValue),
          conversionPct: Number(c.completionPct),
        })),
        collectionByPo: pos.map(p => ({
          poNumber:   p.poNumber,
          customer:   p.customerName,
          pct:        Number(p.paymentCollectionPct),
          totalValue: Number(p.totalValueIncVat),
        })),
      },
    })
  }

  /* ══════════════════════════════════════════════════════════
     P6 — Inside Sales Engineer
  ══════════════════════════════════════════════════════════ */
  if (targetUser.role === 'P6_INSIDE_SALES_ENGINEER') {
    const quotes = await prisma.quotation.findMany({ where: { kaeAssignedId: targetId } })

    const avgRevisions     = quotes.length > 0
      ? quotes.reduce((s, q) => s + q.revisionNumber, 0) / quotes.length : 0
    const openPipelineValue = quotes.filter(q => q.status === 'Open')
      .reduce((s, q) => s + Number(q.amountSar), 0)
    const totalManaged     = quotes.reduce((s, q) => s + Number(q.amountSar), 0)

    const statusBreakdown = ['Open', 'Converted', 'Lost', 'OnHold'].map(status => ({
      status,
      count: quotes.filter(q => q.status === status).length,
      value: quotes.filter(q => q.status === status).reduce((s, q) => s + Number(q.amountSar), 0),
    }))

    const revisionDist = [0, 1, 2, 3, 4].map(r => ({
      label: `REV${r}`,
      count: quotes.filter(q => q.revisionNumber === r).length,
    }))

    const recentQuotes = quotes
      .sort((a, b) => new Date(b.qtnDate).getTime() - new Date(a.qtnDate).getTime())
      .slice(0, 5)
      .map(q => ({
        ref:      q.qtRef,
        customer: q.customerName,
        status:   q.status,
        value:    Number(q.amountSar),
        date:     q.qtnDate,
        revision: q.revisionNumber,
      }))

    return NextResponse.json({
      role: targetUser.role, userId: targetId, userName: targetUser.name,
      ise: {
        totalQuotes: quotes.length, avgRevisions,
        openPipelineValue, totalManaged,
        statusBreakdown, revisionDist, recentQuotes,
      },
    })
  }

  /* ══════════════════════════════════════════════════════════
     P4 — Sales Manager (team overview)
  ══════════════════════════════════════════════════════════ */
  if (targetUser.role === 'P4_SALES_MANAGER' || targetUser.role === 'P3_REGIONAL_MANAGER') {
    const kaes = await prisma.user.findMany({
      where: { role: 'P5_KEY_ACCOUNT_ENGINEER', isActive: true },
    })
    const ises = await prisma.user.findMany({
      where: { role: 'P6_INSIDE_SALES_ENGINEER', isActive: true },
    })

    const kaeLeaderboard = await Promise.all(kaes.map(async kae => {
      const customers = await prisma.customer.findMany({ where: { assignedKaeId: kae.id } })
      const pos       = await prisma.pOTracker.findMany({ where: { kaeName: kae.name } })
      const totalRfq  = customers.reduce((s, c) => s + c.totalRfq, 0)
      const converted = customers.reduce((s, c) => s + c.totalConverted, 0)
      const revenue   = pos.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
      const avgColl   = pos.length > 0 ? pos.reduce((s, p) => s + Number(p.paymentCollectionPct), 0) / pos.length : 0
      return { name: kae.name, totalRfq, converted, revenue, avgCollection: avgColl, winRate: totalRfq > 0 ? (converted / totalRfq) * 100 : 0 }
    }))

    const overdueMilestones = await prisma.paymentMilestone.findMany({ where: { status: 'Overdue' } })
    const avgOverdueDays = overdueMilestones.length > 0
      ? overdueMilestones.reduce((s, m) => s + Math.round((today.getTime() - new Date(m.dueDate).getTime()) / 86_400_000), 0) / overdueMilestones.length
      : 0

    const totalTeamRevenue = kaeLeaderboard.reduce((s, k) => s + k.revenue, 0)

    const isePipeline = await Promise.all(ises.map(async ise => {
      const quotes = await prisma.quotation.findMany({ where: { kaeAssignedId: ise.id } })
      return {
        name: ise.name,
        openQuotes:    quotes.filter(q => q.status === 'Open').length,
        pipelineValue: quotes.filter(q => q.status === 'Open').reduce((s, q) => s + Number(q.amountSar), 0),
        avgRevisions:  quotes.length > 0 ? quotes.reduce((s, q) => s + q.revisionNumber, 0) / quotes.length : 0,
      }
    }))

    return NextResponse.json({
      role: targetUser.role, userId: targetId, userName: targetUser.name,
      sm: {
        kaeLeaderboard: kaeLeaderboard.sort((a, b) => b.revenue - a.revenue),
        isePipeline,
        avgOverdueDays,
        overdueCount: overdueMilestones.length,
        totalTeamRevenue,
      },
    })
  }

  /* ══════════════════════════════════════════════════════════
     P7 — Accountant
  ══════════════════════════════════════════════════════════ */
  if (targetUser.role === 'P7_ACCOUNTANT') {
    const milestones = await prisma.paymentMilestone.findMany({
      where: { status: { not: 'Paid' } },
    })
    const payments = await prisma.payment.findMany()

    const agingBuckets = [
      { label: 'Not Due',   min: -Infinity, max: 0   },
      { label: '1–30 d',   min: 0,          max: 30  },
      { label: '31–60 d',  min: 30,         max: 60  },
      { label: '61–90 d',  min: 60,         max: 90  },
      { label: '91+ d',    min: 90,         max: Infinity },
    ]
    const aging = agingBuckets.map(({ label, min, max }) => ({
      label,
      value: milestones
        .filter(m => {
          const days = Math.round((today.getTime() - new Date(m.dueDate).getTime()) / 86_400_000)
          return days > min && days <= max
        })
        .reduce((s, m) => s + Number(m.amountSar), 0),
      count: milestones.filter(m => {
        const days = Math.round((today.getTime() - new Date(m.dueDate).getTime()) / 86_400_000)
        return days > min && days <= max
      }).length,
    }))

    const avgCollectionRate = payments.length > 0
      ? payments.reduce((s, p) => s + Number(p.collectionPct), 0) / payments.length : 0

    const totalOutstanding = milestones.reduce((s, m) => s + Number(m.amountSar), 0)
    const totalBilled      = payments.reduce((s, p) => s + Number(p.poValue), 0)
    const totalCollected   = payments.reduce((s, p) => s + Number(p.poValue) * (Number(p.collectionPct) / 100), 0)

    return NextResponse.json({
      role: targetUser.role, userId: targetId, userName: targetUser.name,
      accountant: { aging, avgCollectionRate, totalOutstanding, totalBilled, totalCollected },
    })
  }

  /* ══════════════════════════════════════════════════════════
     P8 — HR
  ══════════════════════════════════════════════════════════ */
  if (targetUser.role === 'P8_HR') {
    const docs = await prisma.document.findMany({ orderBy: { remainingDaysForExpiry: 'asc' } })

    const total       = docs.length
    const active      = docs.filter(d => d.status === 'Active').length
    const expiring    = docs.filter(d => d.status === 'ExpiringSoon').length
    const expired     = docs.filter(d => d.status === 'Expired').length
    const complianceScore = total > 0 ? (active / total) * 100 : 100
    const proactiveIndex  = total > 0 ? ((total - expired) / total) * 100 : 100

    const expiryBuckets = [
      { label: 'Expired',    docs: docs.filter(d => d.remainingDaysForExpiry < 0) },
      { label: '0–30 d',     docs: docs.filter(d => d.remainingDaysForExpiry >= 0  && d.remainingDaysForExpiry <= 30)  },
      { label: '31–60 d',    docs: docs.filter(d => d.remainingDaysForExpiry > 30  && d.remainingDaysForExpiry <= 60)  },
      { label: '61–90 d',    docs: docs.filter(d => d.remainingDaysForExpiry > 60  && d.remainingDaysForExpiry <= 90)  },
      { label: '91–180 d',   docs: docs.filter(d => d.remainingDaysForExpiry > 90  && d.remainingDaysForExpiry <= 180) },
      { label: '180+ d',     docs: docs.filter(d => d.remainingDaysForExpiry > 180) },
    ].map(b => ({ label: b.label, count: b.docs.length }))

    const riskDocs = docs
      .filter(d => d.status !== 'Active' || d.remainingDaysForExpiry <= 30)
      .map(d => ({
        name: d.documentName, status: d.status,
        daysLeft: d.remainingDaysForExpiry, department: d.department,
      }))

    return NextResponse.json({
      role: targetUser.role, userId: targetId, userName: targetUser.name,
      hr: { total, active, expiring, expired, complianceScore, proactiveIndex, expiryBuckets, riskDocs },
    })
  }

  /* ══════════════════════════════════════════════════════════
     P1 CEO / P2 Admin — org-wide snapshot
  ══════════════════════════════════════════════════════════ */
  const quotes   = await prisma.quotation.findMany()
  const pos      = await prisma.pOTracker.findMany()
  const payments = await prisma.payment.findMany({ include: { milestones: true } })
  const docs     = await prisma.document.findMany()

  const totalPipeline  = quotes.reduce((s, q) => s + Number(q.amountSar), 0)
  const totalPO        = pos.reduce((s, p) => s + Number(p.totalValueIncVat), 0)
  const totalBilled    = payments.reduce((s, p) => s + Number(p.poValue), 0)
  const totalCollected = payments.reduce((s, p) => s + Number(p.poValue) * (Number(p.collectionPct) / 100), 0)
  const docExpiring    = docs.filter(d => d.status === 'ExpiringSoon' || d.status === 'Expired').length

  const conversionRate = totalPipeline > 0 ? (totalPO / totalPipeline) * 100 : 0
  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0

  const monthlyRevenue = pos.reduce((acc, p) => {
    const key = new Date(p.poDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    acc[key] = (acc[key] || 0) + Number(p.totalValueIncVat)
    return acc
  }, {} as Record<string, number>)

  return NextResponse.json({
    role: targetUser.role, userId: targetId, userName: targetUser.name,
    ceo: {
      totalPipeline, totalPO, totalBilled, totalCollected,
      totalOutstanding: totalBilled - totalCollected,
      conversionRate, collectionRate, docExpiring,
      monthlyRevenue: Object.entries(monthlyRevenue).map(([month, value]) => ({ month, value })),
    },
  })
}
