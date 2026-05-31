import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canRead } from '@/lib/rbac'
import prisma from '@/lib/db'

// Lightweight endpoint — returns all active users with id + name + role.
// Accessible to anyone who can read the customers tab (used by the KAE dropdown).
export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRead(session.user.role, 'customers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(users)
}
