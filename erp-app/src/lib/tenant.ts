import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createTenantPrisma, prismaBase } from '@/lib/db'
import { isTrialExpired } from '@/lib/planLimits'
import type { SessionUser } from '@/types'

// Session with user guaranteed non-null (used after auth check)
type AuthedSession = { user: SessionUser }

// ── requireTenant ─────────────────────────────────────────────────────────────
// Drop-in replacement for `getSession()` in API routes.
// Returns a tenant-scoped Prisma client plus session/tenantId.
//
// Usage in any route:
//   const result = await requireTenant()
//   if ('error' in result) return result.error
//   const { db, session, tenantId } = result
//
export async function requireTenant() {
  const session = await getSession()

  if (!session.user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    } as const
  }

  // Super-admins calling tenant-scoped routes — require explicit tenantId header
  if (session.user.isSuperAdmin && !session.user.tenantId) {
    return {
      error: NextResponse.json({ error: 'Super-admin must supply x-tenant-id header' }, { status: 400 }),
    } as const
  }

  const tenantId = session.user.tenantId!
  const db       = createTenantPrisma(tenantId)

  // Load the tenant record to check plan status and trial expiry
  const tenant = await prismaBase.tenant.findUnique({ where: { id: tenantId } })

  if (tenant) {
    if (tenant.status === 'suspended') {
      return {
        error: NextResponse.json({ error: 'Account suspended' }, { status: 403 }),
      } as const
    }

    if (isTrialExpired(tenant)) {
      return {
        error: NextResponse.json(
          { error: 'Trial expired. Please upgrade your plan.', code: 'TRIAL_EXPIRED' },
          { status: 402 }
        ),
      } as const
    }
  }

  // Resolve custom roles → base role for RBAC checks
  // If a user has a CUSTOM_* role, look up its baseRole and use that for permissions
  const userRole = session.user.role
  if (userRole?.startsWith('CUSTOM_')) {
    try {
      const customRole = await db.customRole.findFirst({ where: { roleKey: userRole, isActive: true } })
      if (customRole) {
        // Override session role with the inherited base role for permission checks
        // but keep the original roleKey in a separate field for display
        ;(session.user as any).effectiveRole = customRole.baseRole
        ;(session.user as any).customRoleLabel = customRole.displayName
      }
    } catch { /* non-critical — fall through to normal role */ }
  }

  // Cast so downstream routes see session.user as required (not optional)
  return { session: session as unknown as AuthedSession, tenantId, db, tenant } as const
}

// ── requireSuperAdmin ─────────────────────────────────────────────────────────
// For super-admin-only routes. Returns the raw (unscoped) Prisma client.
export async function requireSuperAdmin() {
  const session = await getSession()
  if (!session.user?.isSuperAdmin) {
    return {
      error: NextResponse.json({ error: 'Forbidden — super-admin only' }, { status: 403 }),
    } as const
  }
  return { session: session as unknown as AuthedSession, db: prismaBase } as const
}

// ── resolveTenantBySlug ───────────────────────────────────────────────────────
// Used during login to resolve tenantId from the workspace slug.
export async function resolveTenantBySlug(slug: string) {
  return prismaBase.tenant.findFirst({ where: { slug: slug.toLowerCase().trim() } })
}

// ── resolveTenantByHost ───────────────────────────────────────────────────────
// Used by middleware. Extracts tenant slug from the request host header.
// e.g. "acme.yourapp.com" → "acme"
export function extractSlugFromHost(host: string, appDomain: string): string | null {
  // Remove port if present
  const h = host.split(':')[0]
  if (!h.endsWith(`.${appDomain}`) && h !== appDomain) return null
  const sub = h.replace(`.${appDomain}`, '')
  if (sub === appDomain || sub === 'www' || sub === '') return null
  return sub
}
