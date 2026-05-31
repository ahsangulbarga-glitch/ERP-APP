import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession, validatePin } from '@/lib/auth'
import { canManageUsers } from '@/lib/rbac'
import { writeAuditLog, writeAdminOverride } from '@/lib/audit'
import prisma from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageUsers(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageUsers(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, email, role, pin } = await req.json()

  if (!name || !email || !role || !pin) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }
  if (!validatePin(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 409 })

  const pinHash = await bcrypt.hash(pin, 12)
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), role, pinHash, createdBy: session.user.id },
  })

  await writeAuditLog({
    userId: session.user.id,
    userRole: session.user.role,
    targetTable: 'users',
    rowId: user.id,
    action: 'CREATE',
    newValue: JSON.stringify({ name, email, role }),
  })

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageUsers(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ID is sent as a query param: /api/users?id=xxx
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { name, role, pin, isActive } = await req.json()

  const updateData: Record<string, unknown> = {}

  if (name     !== undefined) updateData.name = name
  if (role     !== undefined) updateData.role = role
  if (isActive !== undefined) updateData.isActive = isActive

  if (pin !== undefined) {
    if (!validatePin(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
    updateData.pinHash = await bcrypt.hash(pin, 12)
    await writeAdminOverride(session.user.id, 'PASSWORD_RESET', id, 'Admin reset user PIN')
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  await prisma.user.update({ where: { id }, data: updateData })

  await writeAuditLog({
    userId:    session.user.id,
    userRole:  session.user.role,
    targetTable: 'users',
    rowId:     id,
    action:    'UPDATE',
    fieldName: pin ? 'pinHash' : isActive !== undefined ? 'isActive' : 'profile',
    newValue:  pin ? '[REDACTED]' : isActive !== undefined ? String(isActive) : JSON.stringify({ name, role }),
  })

  return NextResponse.json({ success: true })
}
