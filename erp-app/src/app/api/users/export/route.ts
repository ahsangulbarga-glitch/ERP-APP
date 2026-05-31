import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canManageUsers } from '@/lib/rbac'
import prisma from '@/lib/db'
import { createElement } from 'react'
import UsersPDF from '@/components/pdf/UsersPDF'

export const runtime = 'nodejs'

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageUsers(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const data = users.map(u => ({
    id:        u.id,
    name:      u.name,
    email:     u.email,
    role:      u.role,
    isActive:  u.isActive,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
  }))

  const { renderToBuffer } = await import('@react-pdf/renderer')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer: Buffer = await renderToBuffer(createElement(UsersPDF, { users: data, reportDate: today() }) as any)

  const filename = `DLIT-Users-${today().replace(/\//g, '-')}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
