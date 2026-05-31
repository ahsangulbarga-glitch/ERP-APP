import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  canSubmitForReview, canApproveAsDivMgr,
  canApproveAsSalesMgr, canMarkSubmitted,
} from '@/lib/rbac'
import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/db'

type ApprovalEntry = {
  action: string
  role: string
  by: string
  comment: string
  at: string
}

/**
 * PATCH /api/quotations/approve
 *
 * Body: { id, action, comment? }
 *
 * action values and who can call them:
 *  'submit'       → KAE/ISE      Draft → PendingDivMgrReview
 *  'divApprove'   → Div Manager  PendingDivMgrReview → PendingSmReview
 *  'divReject'    → Div Manager  PendingDivMgrReview → Draft
 *  'smApprove'    → Sales Mgr    PendingSmReview → Approved
 *  'smReject'     → Sales Mgr    PendingSmReview → Draft
 *  'markSubmitted'→ KAE/Mgmt     Approved → Submitted
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action, comment = '' } = await req.json()
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

  const role = session.user.role
  const existing = await prisma.quotation.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const currentApproval = (existing.approvalStatus as string) || 'Draft'

  // Parse existing comment history
  let history: ApprovalEntry[] = []
  try { history = JSON.parse((existing.approvalComments as string) || '[]') } catch { /* empty */ }

  const addEntry = (act: string, msg: string) => {
    history.push({ action: act, role, by: session.user!.name, comment: msg, at: new Date().toISOString() })
  }

  let nextApproval: string
  let extraData: Record<string, unknown> = {}

  switch (action) {
    case 'submit':
      if (!canSubmitForReview(role))
        return NextResponse.json({ error: 'Only KAE / Inside Sales can submit for review' }, { status: 403 })
      if (currentApproval !== 'Draft')
        return NextResponse.json({ error: `Cannot submit from status "${currentApproval}"` }, { status: 400 })
      nextApproval = 'PendingDivMgrReview'
      addEntry('submit', comment)
      break

    case 'divApprove':
      if (!canApproveAsDivMgr(role))
        return NextResponse.json({ error: 'Only Divisional / Regional Manager can approve at this stage' }, { status: 403 })
      if (currentApproval !== 'PendingDivMgrReview')
        return NextResponse.json({ error: `Expected PendingDivMgrReview, got "${currentApproval}"` }, { status: 400 })
      nextApproval = 'PendingSmReview'
      addEntry('divApprove', comment)
      break

    case 'divReject':
      if (!canApproveAsDivMgr(role))
        return NextResponse.json({ error: 'Only Divisional / Regional Manager can reject at this stage' }, { status: 403 })
      if (currentApproval !== 'PendingDivMgrReview')
        return NextResponse.json({ error: `Expected PendingDivMgrReview, got "${currentApproval}"` }, { status: 400 })
      if (!comment.trim())
        return NextResponse.json({ error: 'Rejection comment is required' }, { status: 400 })
      nextApproval = 'Draft'
      addEntry('divReject', comment)
      break

    case 'smApprove':
      if (!canApproveAsSalesMgr(role))
        return NextResponse.json({ error: 'Only Sales Manager can approve at this stage' }, { status: 403 })
      if (currentApproval !== 'PendingSmReview')
        return NextResponse.json({ error: `Expected PendingSmReview, got "${currentApproval}"` }, { status: 400 })
      nextApproval = 'Approved'
      addEntry('smApprove', comment)
      break

    case 'smReject':
      if (!canApproveAsSalesMgr(role))
        return NextResponse.json({ error: 'Only Sales Manager can reject at this stage' }, { status: 403 })
      if (currentApproval !== 'PendingSmReview')
        return NextResponse.json({ error: `Expected PendingSmReview, got "${currentApproval}"` }, { status: 400 })
      if (!comment.trim())
        return NextResponse.json({ error: 'Rejection comment is required' }, { status: 400 })
      nextApproval = 'Draft'
      addEntry('smReject', comment)
      break

    case 'markSubmitted':
      if (!canMarkSubmitted(role))
        return NextResponse.json({ error: 'Insufficient permission to mark as submitted' }, { status: 403 })
      if (currentApproval !== 'Approved')
        return NextResponse.json({ error: `Quotation must be Approved before marking Submitted` }, { status: 400 })
      nextApproval = 'Submitted'
      extraData.submittedAt = new Date()
      addEntry('markSubmitted', comment)
      break

    default:
      return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
  }

  const updated = await prisma.quotation.update({
    where: { id },
    data: {
      approvalStatus:   nextApproval,
      approvalComments: JSON.stringify(history),
      ...extraData,
    },
    include: { kaeAssigned: { select: { id: true, name: true } } },
  })

  await writeAuditLog({
    userId: session.user.id, userRole: role,
    targetTable: 'quotations', rowId: id,
    fieldName: 'approvalStatus',
    oldValue: currentApproval, newValue: nextApproval,
    action: 'UPDATE',
    relatedId: { type: 'quotation', id },
  })

  return NextResponse.json(updated)
}
