import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { canWrite } from '@/lib/rbac'

// Only admins/CEO can manage roles
function canManageRoles(role: string) {
  return ['P1_CEO', 'P2_ADMIN'].includes(role)
}

export async function GET() {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db } = result

  const roles = await db.customRole.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(roles)
}

export async function POST(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result

  if (!canManageRoles(session.user.role))
    return NextResponse.json({ error: 'Forbidden — only CEO/Admin can create roles' }, { status: 403 })

  const { displayName, baseRole, description, color } = await req.json()

  if (!displayName?.trim()) return NextResponse.json({ error: 'Role name is required' }, { status: 400 })
  if (!baseRole)            return NextResponse.json({ error: 'Base role is required' }, { status: 400 })

  // Generate a unique roleKey from displayName
  const roleKey = 'CUSTOM_' + displayName.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30)

  // Check duplicate
  const existing = await db.customRole.findFirst({ where: { roleKey } })
  if (existing) return NextResponse.json({ error: `A role with that name already exists (${roleKey})` }, { status: 409 })

  const role = await db.customRole.create({
    data: {
      roleKey,
      displayName: displayName.trim(),
      baseRole,
      description: description?.trim() || null,
      color: color || '#6366f1',
      createdBy: session.user.id,
    },
  })
  return NextResponse.json(role, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result

  if (!canManageRoles(session.user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, displayName, baseRole, description, color, isActive } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updated = await db.customRole.update({
    where: { id },
    data: {
      ...(displayName !== undefined && { displayName: displayName.trim() }),
      ...(baseRole    !== undefined && { baseRole }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(color       !== undefined && { color }),
      ...(isActive    !== undefined && { isActive }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session } = result

  if (!canManageRoles(session.user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Check if any users are using this role
  const roleRecord = await db.customRole.findFirst({ where: { id } })
  if (!roleRecord) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.customRole.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
