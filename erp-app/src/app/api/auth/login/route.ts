import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession, validatePin, detectDeviceType } from '@/lib/auth'
import { logSession, writeAdminOverride } from '@/lib/audit'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { email, pin, masterKey } = await req.json()

    if (!email || (!pin && !masterKey)) {
      return NextResponse.json({ error: 'Email and PIN required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    let authenticated = false
    let usedMasterKey = false

    if (masterKey) {
      // Admin Master Key bypass
      if (user.role !== 'P2_ADMIN') {
        return NextResponse.json({ error: 'Master key only valid for Admin' }, { status: 403 })
      }
      const masterKeyHash = process.env.ADMIN_MASTER_KEY || ''
      authenticated = await bcrypt.compare(masterKey, masterKeyHash) || masterKey === process.env.ADMIN_MASTER_KEY
      usedMasterKey = authenticated
    } else {
      if (!validatePin(pin)) {
        return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
      }
      authenticated = await bcrypt.compare(pin, user.pinHash)
    }

    if (!authenticated) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const ua = req.headers.get('user-agent') || ''
    const deviceType = detectDeviceType(ua)
    const sessionId = await logSession(user.id, ip, deviceType)

    if (usedMasterKey) {
      await writeAdminOverride(user.id, 'MASTER_KEY_LOGIN', undefined, 'Admin used Master Key to login')
    }

    const session = await getSession()
    session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as import('@/types').Role,
      sessionId,
    }
    await session.save()

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, role: user.role } })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
