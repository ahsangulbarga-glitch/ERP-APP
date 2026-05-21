import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canBulkImport } from '@/lib/rbac'
import { parseExcelImport } from '@/lib/excel'
import { writeAuditLog } from '@/lib/audit'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const tab = formData.get('tab') as string

  if (!file || !tab) return NextResponse.json({ error: 'File and tab required' }, { status: 400 })
  if (!canBulkImport(session.user.role, tab)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const rows = parseExcelImport(buffer)
  let imported = 0

  for (const row of rows) {
    try {
      if (tab === 'quotations') {
        const count = await prisma.quotation.count()
        await prisma.quotation.create({
          data: {
            qtRef: `QTN-${String(count + imported + 1).padStart(5, '0')}-REV0`,
            qtnDate: new Date((row.qtnDate as string) || new Date()),
            customerName: String(row.customerName || ''),
            projectName: String(row.projectName || ''),
            amountSar: Number(row.amountSar || 0),
            status: (row.status as 'Open' | 'Lost' | 'Converted' | 'OnHold') || 'Open',
            clientContactName: String(row.clientContactName || ''),
            clientContactDetails: String(row.clientContactDetails || ''),
            remarks: String(row.remarks || ''),
            createdBy: session.user!.id,
          },
        })
      } else if (tab === 'customers') {
        await prisma.customer.create({
          data: {
            customerName: String(row.customerName || ''),
            firstActivityDate: row.firstActivityDate ? new Date(row.firstActivityDate as string) : undefined,
            lastActivityDate: row.lastActivityDate ? new Date(row.lastActivityDate as string) : undefined,
            remarks: String(row.remarks || ''),
            createdBy: session.user!.id,
          },
        })
      }
      imported++
    } catch (e) {
      console.error('Import row error:', e)
    }
  }

  await writeAuditLog({ userId: session.user.id, userRole: session.user.role, targetTable: tab, rowId: 'bulk', action: 'BULK_IMPORT', newValue: `${imported} rows imported` })
  return NextResponse.json({ imported, total: rows.length })
}
