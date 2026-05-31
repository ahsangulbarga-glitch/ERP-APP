// seed-analytics.mjs — generates 12-month synthetic inventory transaction + lot data
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasources: { db: { url: 'file:./dev.db' } } })

function rnd(min, max) { return Math.round(min + Math.random() * (max - min)) }
function rndF(min, max) { return parseFloat((min + Math.random() * (max - min)).toFixed(2)) }

function monthsAgo(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  d.setDate(rnd(1, 28))
  return d
}

async function main() {
  const materials = await prisma.materialItem.findMany({ orderBy: { productRef: 'asc' } })
  if (materials.length === 0) { console.log('No materials found — run seed first'); return }

  console.log(`Seeding analytics data for ${materials.length} items...`)

  // Upsert valuation config
  await prisma.stockValuationConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', method: 'WEIGHTED_AVERAGE' },
    update: {},
  })

  // Clear existing transaction/lot data to avoid duplicates on re-run
  await prisma.inventoryTransaction.deleteMany()
  await prisma.inventoryLot.deleteMany()

  for (const mat of materials) {
    // Assign a realistic unit cost based on product ref prefix
    const ref = mat.productRef.toUpperCase()
    let baseUnitCost = 250
    if (ref.includes('VALVE') || ref.includes('BFV') || ref.includes('GV')) baseUnitCost = rnd(800, 4500)
    else if (ref.includes('PUMP') || ref.includes('PMP')) baseUnitCost = rnd(3000, 12000)
    else if (ref.includes('METER') || ref.includes('MTR') || ref.includes('EMF')) baseUnitCost = rnd(1500, 8000)
    else if (ref.includes('FILTER') || ref.includes('FLT')) baseUnitCost = rnd(200, 1200)
    else if (ref.includes('SENSOR') || ref.includes('SNS')) baseUnitCost = rnd(500, 3000)
    else if (ref.includes('CABLE') || ref.includes('CBL')) baseUnitCost = rnd(50, 400)
    else if (ref.includes('PIPE') || ref.includes('PIP')) baseUnitCost = rnd(100, 800)
    else baseUnitCost = rnd(150, 2000)

    await prisma.materialItem.update({ where: { id: mat.id }, data: { unitCost: baseUnitCost } })

    // Create 3-4 lots covering the past 12 months
    const lotCount = rnd(3, 4)
    for (let l = lotCount - 1; l >= 0; l--) {
      const lotDate = monthsAgo(l * 3 + rnd(0, 1))
      const initialQty = rnd(10, 80)
      const remainingQty = l === 0 ? rnd(Math.floor(initialQty * 0.4), initialQty) : rnd(0, Math.floor(initialQty * 0.2))
      const costVariance = 1 + (lotCount - 1 - l) * rndF(0.02, 0.05) // older lots cheaper
      await prisma.inventoryLot.create({
        data: {
          materialItemId: mat.id,
          lotDate,
          initialQty,
          remainingQty,
          unitCost: parseFloat((baseUnitCost * costVariance).toFixed(2)),
          reference: `LOT-${mat.productRef}-Q${l + 1}`,
        },
      })
    }

    // Generate monthly RECEIPT + occasional ISSUE for 12 months
    for (let month = 11; month >= 0; month--) {
      const receiptDate = monthsAgo(month)
      const receiptQty = rnd(5, 50)
      const receiptCost = parseFloat((baseUnitCost * rndF(0.95, 1.05)).toFixed(2))

      await prisma.inventoryTransaction.create({
        data: {
          materialItemId: mat.id,
          type: 'RECEIPT',
          quantity: receiptQty,
          unitCost: receiptCost,
          reference: `REC-${mat.productRef}-M${12 - month}`,
          transactionDate: receiptDate,
          createdBy: 'seed',
        },
      })

      // ~75% chance of an ISSUE each month
      if (Math.random() < 0.75) {
        const issueDate = new Date(receiptDate)
        issueDate.setDate(issueDate.getDate() + rnd(3, 20))
        const issueQty = rnd(2, Math.min(receiptQty, 35))

        await prisma.inventoryTransaction.create({
          data: {
            materialItemId: mat.id,
            type: 'ISSUE',
            quantity: -issueQty,
            unitCost: baseUnitCost,
            reference: `ISS-${mat.productRef}-M${12 - month}`,
            transactionDate: issueDate,
            createdBy: 'seed',
          },
        })
      }

      // ~15% chance of an extra ISSUE (high-demand items)
      if (Math.random() < 0.15) {
        const issueDate2 = new Date(receiptDate)
        issueDate2.setDate(issueDate2.getDate() + rnd(15, 28))
        const issueQty2 = rnd(1, 15)

        await prisma.inventoryTransaction.create({
          data: {
            materialItemId: mat.id,
            type: 'ISSUE',
            quantity: -issueQty2,
            unitCost: baseUnitCost,
            reference: `ISS2-${mat.productRef}-M${12 - month}`,
            transactionDate: issueDate2,
            createdBy: 'seed',
          },
        })
      }
    }
  }

  const txCount = await prisma.inventoryTransaction.count()
  const lotCount = await prisma.inventoryLot.count()
  console.log(`✓ Created ${txCount} transactions and ${lotCount} lots for ${materials.length} items`)
  console.log('✓ StockValuationConfig set to WEIGHTED_AVERAGE')
}

main().catch(console.error).finally(() => prisma.$disconnect())
