import prisma from './db'

interface AuditParams {
  userId?: string
  userRole?: string
  targetTable: string
  rowId: string
  fieldName?: string
  oldValue?: string
  newValue?: string
  action: string
  relatedId?: { type: 'quotation' | 'po' | 'customer' | 'payment' | 'document'; id: string }
}

export async function writeAuditLog(params: AuditParams) {
  const rel = params.relatedId
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      userRole: params.userRole,
      targetTable: params.targetTable,
      rowId: params.rowId,
      fieldName: params.fieldName,
      oldValue: params.oldValue,
      newValue: params.newValue,
      action: params.action,
      quotationId: rel?.type === 'quotation' ? rel.id : undefined,
      poId: rel?.type === 'po' ? rel.id : undefined,
      customerId: rel?.type === 'customer' ? rel.id : undefined,
      paymentId: rel?.type === 'payment' ? rel.id : undefined,
      documentId: rel?.type === 'document' ? rel.id : undefined,
    },
  })
}

export async function writeAdminOverride(
  adminId: string,
  actionType: string,
  targetUserId?: string,
  reason?: string
) {
  await prisma.adminOverrideLog.create({
    data: { adminId, actionType, targetUserId, reason, severity: 'HIGH' },
  })
}

export async function logSession(
  userId: string,
  ipAddress?: string,
  deviceType?: string
): Promise<string> {
  const session = await prisma.userSession.create({
    data: { userId, ipAddress, deviceType, isActive: true },
  })
  return session.id
}

export async function closeSession(sessionId: string) {
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { logoutAt: new Date(), isActive: false },
  })
}
