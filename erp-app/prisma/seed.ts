import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const pinHash = await bcrypt.hash('1234', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@company.com',
      role: 'P2_ADMIN',
      pinHash,
      isActive: true,
    },
  })

  const ceo = await prisma.user.upsert({
    where: { email: 'ceo@company.com' },
    update: {},
    create: {
      name: 'CEO',
      email: 'ceo@company.com',
      role: 'P1_CEO',
      pinHash,
      isActive: true,
    },
  })

  console.log('Seeded users:', admin.email, ceo.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
