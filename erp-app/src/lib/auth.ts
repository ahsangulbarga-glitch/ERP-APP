import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionUser } from '@/types'
import { NextRequest } from 'next/server'

export const SESSION_OPTIONS = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'erp_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 60 * 8, // 8 hours
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<{ user?: SessionUser }>(cookieStore, SESSION_OPTIONS)
}

export async function getSessionFromRequest(req: NextRequest) {
  // @ts-expect-error iron-session v8 accepts NextRequest in some contexts
  return getIronSession<{ user?: SessionUser }>(req, SESSION_OPTIONS)
}

export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function detectDeviceType(userAgent: string): string {
  const mobile = /mobile|android|iphone|ipad|tablet/i.test(userAgent)
  return mobile ? 'Mobile' : 'Desktop'
}
