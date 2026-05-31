/**
 * seed-org-draft.mjs
 * Creates one inactive draft placeholder user for every role in the org chart.
 * Default PIN: 1234  — admin MUST change these before activating.
 *
 * Run:  node prisma/seed-org-draft.mjs
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const DEFAULT_PIN = '1234'

// ─── Org chart roles → draft placeholder users ────────────────────────────────
const DRAFT_USERS = [
  // ── Sales chain ─────────────────────────────────────────────────────────────
  {
    name:  'Draft — Divisional Manager',
    email: 'div.manager@syed.local',
    role:  'P4_REGIONAL_MANAGER',
    note:  'Divisional Manager — reports to CEO',
  },
  {
    name:  'Draft — Sales Manager',
    email: 'sales.manager@syed.local',
    role:  'P5_SALES_MANAGER',
    note:  'Sales Manager — reports to Divisional Manager',
  },
  {
    name:  'Draft — Key Account Manager',
    email: 'kam@syed.local',
    role:  'P3_KEY_ACCOUNT_MANAGER',
    note:  'Key Account Manager — reports to Sales Manager, manages KAEs',
  },
  {
    name:  'Draft — Key Account Engineer',
    email: 'kae@syed.local',
    role:  'P6_KEY_ACCOUNT_ENGINEER',
    note:  'Key Account Engineer — reports to KAM',
  },
  {
    name:  'Draft — Inside Sales Engineer',
    email: 'ise@syed.local',
    role:  'P7_INSIDE_SALES_ENGINEER',
    note:  'Inside Sales Engineer — reports to KAM',
  },
  // ── Support functions (report to Divisional Manager) ────────────────────────
  {
    name:  'Draft — Accountant',
    email: 'accounts@syed.local',
    role:  'P8_ACCOUNTANT',
    note:  'Accounts — reports to Divisional Manager',
  },
  {
    name:  'Draft — HR',
    email: 'hr@syed.local',
    role:  'P9_HR',
    note:  'HR — reports to Divisional Manager',
  },
  {
    name:  'Draft — Logistics Manager',
    email: 'logistics@syed.local',
    role:  'P10_LOGISTICS_MANAGER',
    note:  'Logistics Manager — reports to Divisional Manager',
  },
  {
    name:  'Draft — Purchase Manager',
    email: 'purchase@syed.local',
    role:  'P11_PURCHASE_MANAGER',
    note:  'Purchase Manager — reports to Divisional Manager',
  },
]

async function main() {
  const pinHash = await bcrypt.hash(DEFAULT_PIN, 12)
  let created = 0, skipped = 0

  console.log('\n📋  Seeding org-chart draft users…\n')

  for (const u of DRAFT_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } })
    if (existing) {
      console.log(`  ⏭  Already exists: ${u.name}`)
      skipped++
      continue
    }

    await prisma.user.create({
      data: {
        name:      u.name,
        email:     u.email,
        role:      u.role,
        pinHash,
        isActive:  false,          // Draft — admin must activate & set a real PIN
        createdBy: 'system-seed',
      },
    })

    console.log(`  ✅  Created  [${u.role.padEnd(26)}]  ${u.name}`)
    created++
  }

  console.log(`\n✔  Done — ${created} created, ${skipped} already existed.`)
  console.log(`⚠  Default PIN is "${DEFAULT_PIN}". Admin must change PINs before activating.\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
