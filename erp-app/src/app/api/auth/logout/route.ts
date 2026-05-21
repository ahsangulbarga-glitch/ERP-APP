import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { closeSession } from '@/lib/audit'

export async function POST() {
  const session = await getSession()
  if (session.user?.sessionId) {
    await closeSession(session.user.sessionId)
  }
  session.destroy()
  return NextResponse.json({ success: true })
}
