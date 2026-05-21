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

  const { userId, pin, isActive } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const updateData: Record<string, unknown> = {}

  if (pin !== undefined) {
    if (!validatePin(pin)) return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
    updateData.pinHash = await bcrypt.hash(pin, 12)
    await writeAdminOverride(session.user.id, 'PASSWORD_RESET', userId, 'Admin reset user PIN')
  }

  if (isActive !== undefined) updateData.isActive = isActive

  await prisma.user.update({ where: { id: userId }, data: updateData })

  await writeAuditLog({
    userId: session.user.id,
    userRole: session.user.role,
    targetTable: 'users',
    rowId: userId,
    action: 'UPDATE',
    fieldName: pin ? 'pinHash' : 'isActive',
    newValue: pin ? '[REDACTED]' : String(isActive),
  })

  return NextResponse.json({ success: true })
}
