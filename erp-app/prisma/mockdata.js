const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding mock data...')

  // Clear payments + milestones so re-runs produce correct future dates
  await prisma.paymentMilestone.deleteMany({})
  await prisma.payment.deleteMany({})

  // Get existing users
  const admin = await prisma.user.findUnique({ where: { email: 'admin@company.com' } })
  const ceo   = await prisma.user.findUnique({ where: { email: 'ceo@company.com' } })

  // Create KAE users
  const kae1 = await prisma.user.upsert({
    where: { email: 'ahmed.kae@company.com' },
    update: {},
    create: { name: 'Ahmed Al-Rashid', email: 'ahmed.kae@company.com', role: 'P5_KEY_ACCOUNT_ENGINEER', pinHash: '$2b$10$UTxRFa5mnqvveMR/cD/ax.bMkgo6QnqusBooCyewHBrsHX3mNFwcC', isActive: true },
  })
  const kae2 = await prisma.user.upsert({
    where: { email: 'sara.kae@company.com' },
    update: {},
    create: { name: 'Sara Hassan', email: 'sara.kae@company.com', role: 'P5_KEY_ACCOUNT_ENGINEER', pinHash: '$2b$10$UTxRFa5mnqvveMR/cD/ax.bMkgo6QnqusBooCyewHBrsHX3mNFwcC', isActive: true },
  })
  const sm = await prisma.user.upsert({
    where: { email: 'khalid.sm@company.com' },
    update: {},
    create: { name: 'Khalid Al-Qahtani', email: 'khalid.sm@company.com', role: 'P4_SALES_MANAGER', pinHash: '$2b$10$UTxRFa5mnqvveMR/cD/ax.bMkgo6QnqusBooCyewHBrsHX3mNFwcC', isActive: true },
  })
  const finance = await prisma.user.upsert({
    where: { email: 'nadia.finance@company.com' },
    update: {},
    create: { name: 'Nadia Yousef', email: 'nadia.finance@company.com', role: 'P6_INSIDE_SALES_ENGINEER', pinHash: '$2b$10$UTxRFa5mnqvveMR/cD/ax.bMkgo6QnqusBooCyewHBrsHX3mNFwcC', isActive: true },
  })
  const accountant = await prisma.user.upsert({
    where: { email: 'faisal.acc@company.com' },
    update: {},
    create: { name: 'Faisal Al-Otaibi', email: 'faisal.acc@company.com', role: 'P7_ACCOUNTANT', pinHash: '$2b$10$UTxRFa5mnqvveMR/cD/ax.bMkgo6QnqusBooCyewHBrsHX3mNFwcC', isActive: true },
  })
  const hr = await prisma.user.upsert({
    where: { email: 'reem.hr@company.com' },
    update: {},
    create: { name: 'Reem Al-Zahrani', email: 'reem.hr@company.com', role: 'P8_HR', pinHash: '$2b$10$UTxRFa5mnqvveMR/cD/ax.bMkgo6QnqusBooCyewHBrsHX3mNFwcC', isActive: true },
  })

  console.log('Users created.')

  // ── Customers ───────────────────────────────────────────────────────────────
  const customers = [
    { customerName: 'Saudi Aramco', assignedKaeId: kae1.id, totalRfq: 18, totalConverted: 12, completionPct: 66.7, totalValueQuoted: 4500000, totalPoValue: 3100000, firstActivityDate: new Date('2023-01-10'), lastActivityDate: new Date('2025-05-01') },
    { customerName: 'SABIC Industries', assignedKaeId: kae1.id, totalRfq: 14, totalConverted: 9,  completionPct: 64.3, totalValueQuoted: 3200000, totalPoValue: 2100000, firstActivityDate: new Date('2023-03-15'), lastActivityDate: new Date('2025-04-20') },
    { customerName: 'Maaden Mining', assignedKaeId: kae2.id, totalRfq: 10, totalConverted: 6,  completionPct: 60.0, totalValueQuoted: 2800000, totalPoValue: 1750000, firstActivityDate: new Date('2023-06-01'), lastActivityDate: new Date('2025-05-10') },
    { customerName: 'STC Telecom', assignedKaeId: kae2.id, totalRfq: 8,  totalConverted: 3,  completionPct: 37.5, totalValueQuoted: 980000,  totalPoValue: 420000,  firstActivityDate: new Date('2024-01-05'), lastActivityDate: new Date('2025-03-30') },
    { customerName: 'Al Rajhi Construction', assignedKaeId: kae1.id, totalRfq: 22, totalConverted: 15, completionPct: 68.2, totalValueQuoted: 6100000, totalPoValue: 4300000, firstActivityDate: new Date('2022-11-01'), lastActivityDate: new Date('2025-05-15') },
    { customerName: 'Neom Development', assignedKaeId: kae2.id, totalRfq: 6,  totalConverted: 2,  completionPct: 33.3, totalValueQuoted: 1500000, totalPoValue: 600000,  firstActivityDate: new Date('2024-03-01'), lastActivityDate: new Date('2025-04-01') },
    { customerName: 'Saudi Electricity Co', assignedKaeId: kae1.id, totalRfq: 16, totalConverted: 11, completionPct: 68.8, totalValueQuoted: 5200000, totalPoValue: 3700000, firstActivityDate: new Date('2023-02-20'), lastActivityDate: new Date('2025-05-08') },
    { customerName: 'Acwa Power', assignedKaeId: kae2.id, totalRfq: 9,  totalConverted: 5,  completionPct: 55.6, totalValueQuoted: 2100000, totalPoValue: 1200000, firstActivityDate: new Date('2023-08-10'), lastActivityDate: new Date('2025-04-25') },
  ]

  const createdCustomers = []
  for (const c of customers) {
    const rec = await prisma.customer.upsert({
      where: { id: c.customerName.replace(/\s/g, '-').toLowerCase() },
      update: c,
      create: { id: c.customerName.replace(/\s/g, '-').toLowerCase(), ...c, createdBy: admin.id },
    })
    createdCustomers.push(rec)
  }
  console.log('Customers created.')

  // ── Quotations ───────────────────────────────────────────────────────────────
  const quotations = [
    // Saudi Aramco
    { qtRef: 'QTN-00001-REV0', qtnDate: new Date('2025-01-10'), customerName: 'Saudi Aramco', projectName: 'Pipeline Inspection System', amountSar: 480000, status: 'Converted', poNumber: 'PO-ARC-2025-001', kaeAssignedId: kae1.id, clientContactName: 'Abdullah Al-Ghamdi', clientContactDetails: '+966501234567', remarks: 'Critical infrastructure project' },
    { qtRef: 'QTN-00002-REV1', qtnDate: new Date('2025-01-25'), customerName: 'Saudi Aramco', projectName: 'SCADA Upgrade Phase 2', amountSar: 920000, status: 'Open', kaeAssignedId: kae1.id, clientContactName: 'Abdullah Al-Ghamdi', clientContactDetails: '+966501234567', remarks: 'Follow-up from Phase 1' },
    { qtRef: 'QTN-00003-REV0', qtnDate: new Date('2025-02-05'), customerName: 'Saudi Aramco', projectName: 'Instrumentation Calibration', amountSar: 155000, status: 'Lost', kaeAssignedId: kae1.id, remarks: 'Lost to competitor on price' },
    // SABIC
    { qtRef: 'QTN-00004-REV0', qtnDate: new Date('2025-02-12'), customerName: 'SABIC Industries', projectName: 'Process Control Upgrade', amountSar: 340000, status: 'Converted', poNumber: 'PO-SAB-2025-007', kaeAssignedId: kae1.id, clientContactName: 'Fatima Al-Zahrani', clientContactDetails: '+966512345678' },
    { qtRef: 'QTN-00005-REV0', qtnDate: new Date('2025-02-28'), customerName: 'SABIC Industries', projectName: 'Safety System Audit', amountSar: 87000, status: 'Open', kaeAssignedId: kae1.id, clientContactName: 'Fatima Al-Zahrani', clientContactDetails: '+966512345678' },
    // Maaden
    { qtRef: 'QTN-00006-REV0', qtnDate: new Date('2025-03-03'), customerName: 'Maaden Mining', projectName: 'Conveyor Automation', amountSar: 620000, status: 'Converted', poNumber: 'PO-MAD-2025-003', kaeAssignedId: kae2.id, clientContactName: 'Rami Al-Otaibi', clientContactDetails: '+966523456789' },
    { qtRef: 'QTN-00007-REV2', qtnDate: new Date('2025-03-15'), customerName: 'Maaden Mining', projectName: 'Dust Suppression Control', amountSar: 215000, status: 'OnHold', kaeAssignedId: kae2.id, remarks: 'Client awaiting budget approval' },
    // Al Rajhi
    { qtRef: 'QTN-00008-REV0', qtnDate: new Date('2025-03-20'), customerName: 'Al Rajhi Construction', projectName: 'Tower Crane Monitoring', amountSar: 390000, status: 'Converted', poNumber: 'PO-ARJ-2025-011', kaeAssignedId: kae1.id, clientContactName: 'Mohammed Al-Rajhi', clientContactDetails: '+966534567890' },
    { qtRef: 'QTN-00009-REV0', qtnDate: new Date('2025-04-01'), customerName: 'Al Rajhi Construction', projectName: 'Site Safety Sensors', amountSar: 175000, status: 'Open', kaeAssignedId: kae1.id, clientContactName: 'Mohammed Al-Rajhi', clientContactDetails: '+966534567890' },
    // STC
    { qtRef: 'QTN-00010-REV0', qtnDate: new Date('2025-04-08'), customerName: 'STC Telecom', projectName: 'Data Centre Monitoring', amountSar: 290000, status: 'Open', kaeAssignedId: kae2.id, clientContactName: 'Hessa Al-Shamsi', clientContactDetails: '+966545678901' },
    // SEC
    { qtRef: 'QTN-00011-REV0', qtnDate: new Date('2025-04-14'), customerName: 'Saudi Electricity Co', projectName: 'Substation Automation', amountSar: 870000, status: 'Converted', poNumber: 'PO-SEC-2025-005', kaeAssignedId: kae1.id, clientContactName: 'Turki Al-Fayez', clientContactDetails: '+966556789012' },
    { qtRef: 'QTN-00012-REV0', qtnDate: new Date('2025-04-22'), customerName: 'Saudi Electricity Co', projectName: 'Grid Monitoring Phase 3', amountSar: 1150000, status: 'Open', kaeAssignedId: kae1.id, clientContactName: 'Turki Al-Fayez', clientContactDetails: '+966556789012', remarks: 'Large project — CEO approval required' },
    // Neom
    { qtRef: 'QTN-00013-REV0', qtnDate: new Date('2025-05-01'), customerName: 'Neom Development', projectName: 'Smart City Sensors', amountSar: 540000, status: 'Open', kaeAssignedId: kae2.id, clientContactName: 'Lina Bergström', clientContactDetails: '+966567890123' },
    // Acwa
    { qtRef: 'QTN-00014-REV0', qtnDate: new Date('2025-05-08'), customerName: 'Acwa Power', projectName: 'Solar Farm SCADA', amountSar: 430000, status: 'Converted', poNumber: 'PO-ACW-2025-002', kaeAssignedId: kae2.id, clientContactName: 'Yasser Al-Dossari', clientContactDetails: '+966578901234' },
    { qtRef: 'QTN-00015-REV0', qtnDate: new Date('2025-05-15'), customerName: 'Acwa Power', projectName: 'Wind Turbine Control', amountSar: 310000, status: 'Open', kaeAssignedId: kae2.id, clientContactName: 'Yasser Al-Dossari', clientContactDetails: '+966578901234' },
  ]

  const createdQuotations = []
  for (const q of quotations) {
    const rec = await prisma.quotation.upsert({
      where: { qtRef: q.qtRef },
      update: {},
      create: { ...q, revisionNumber: parseInt(q.qtRef.split('-REV')[1]) || 0, createdBy: admin.id },
    })
    createdQuotations.push(rec)
  }
  console.log('Quotations created.')

  // ── PO Tracker ───────────────────────────────────────────────────────────────
  const poData = [
    { customerName: 'Saudi Aramco',       projectName: 'Pipeline Inspection System', kaeName: 'Ahmed Al-Rashid', qtRef: 'QTN-00001-REV0', poNumber: 'PO-ARC-2025-001', poDate: new Date('2025-02-01'), poAmountExVat: 480000, paymentTermsSplit: '30/40/30', paymentCollectionPct: 65, paymentStatus: 'PartiallyPaid' },
    { customerName: 'SABIC Industries',   projectName: 'Process Control Upgrade',    kaeName: 'Ahmed Al-Rashid', qtRef: 'QTN-00004-REV0', poNumber: 'PO-SAB-2025-007', poDate: new Date('2025-03-10'), poAmountExVat: 340000, paymentTermsSplit: '50/50',    paymentCollectionPct: 50, paymentStatus: 'PartiallyPaid' },
    { customerName: 'Maaden Mining',      projectName: 'Conveyor Automation',        kaeName: 'Sara Hassan',     qtRef: 'QTN-00006-REV0', poNumber: 'PO-MAD-2025-003', poDate: new Date('2025-03-25'), poAmountExVat: 620000, paymentTermsSplit: '25/50/25', paymentCollectionPct: 25, paymentStatus: 'Pending'        },
    { customerName: 'Al Rajhi Construction', projectName: 'Tower Crane Monitoring', kaeName: 'Ahmed Al-Rashid', qtRef: 'QTN-00008-REV0', poNumber: 'PO-ARJ-2025-011', poDate: new Date('2025-04-05'), poAmountExVat: 390000, paymentTermsSplit: '40/60',    paymentCollectionPct: 100, paymentStatus: 'Paid'           },
    { customerName: 'Saudi Electricity Co', projectName: 'Substation Automation',   kaeName: 'Ahmed Al-Rashid', qtRef: 'QTN-00011-REV0', poNumber: 'PO-SEC-2025-005', poDate: new Date('2025-04-18'), poAmountExVat: 870000, paymentTermsSplit: '20/40/40', paymentCollectionPct: 20, paymentStatus: 'Pending'        },
    { customerName: 'Acwa Power',         projectName: 'Solar Farm SCADA',           kaeName: 'Sara Hassan',     qtRef: 'QTN-00014-REV0', poNumber: 'PO-ACW-2025-002', poDate: new Date('2025-05-10'), poAmountExVat: 430000, paymentTermsSplit: '30/70',    paymentCollectionPct: 0,  paymentStatus: 'Pending'        },
  ]

  const createdPOs = []
  for (const po of poData) {
    const vat = Math.round(po.poAmountExVat * 0.15 * 100) / 100
    const rec = await prisma.pOTracker.upsert({
      where: { poNumber: po.poNumber },
      update: {},
      create: { ...po, vat15: vat, totalValueIncVat: po.poAmountExVat + vat, createdBy: admin.id },
    })
    createdPOs.push(rec)
  }
  console.log('PO Tracker records created.')

  // ── Payments & Milestones ────────────────────────────────────────────────────
  const paymentsData = [
    {
      poNumber: 'PO-ARC-2025-001', customerName: 'Saudi Aramco', kaeNameId: kae1.id, poValue: 480000, collectionPct: 65, remarks: 'Mobilisation paid, delivery milestone pending',
      milestones: [
        { phaseName: 'Mobilisation',    percentage: 30, amountSar: 144000, dueDate: new Date('2025-02-15'), status: 'Paid',    paidAt: new Date('2025-02-14') },
        { phaseName: 'Delivery',        percentage: 40, amountSar: 192000, dueDate: new Date('2025-04-01'), status: 'Paid',    paidAt: new Date('2025-04-03') },
        { phaseName: 'Commissioning',   percentage: 30, amountSar: 144000, dueDate: new Date('2025-05-15'), status: 'Overdue' },
      ]
    },
    {
      poNumber: 'PO-SAB-2025-007', customerName: 'SABIC Industries', kaeNameId: kae1.id, poValue: 340000, collectionPct: 50, remarks: '1st payment received',
      milestones: [
        { phaseName: 'Advance Payment', percentage: 50, amountSar: 170000, dueDate: new Date('2025-03-20'), status: 'Paid',    paidAt: new Date('2025-03-22') },
        { phaseName: 'Final Payment',   percentage: 50, amountSar: 170000, dueDate: new Date('2026-07-01'), status: 'Pending' },
      ]
    },
    {
      poNumber: 'PO-MAD-2025-003', customerName: 'Maaden Mining', kaeNameId: kae2.id, poValue: 620000, collectionPct: 25, remarks: 'Project ongoing',
      milestones: [
        { phaseName: 'Advance',         percentage: 25, amountSar: 155000, dueDate: new Date('2025-04-01'), status: 'Overdue' },
        { phaseName: 'Mid-Project',     percentage: 50, amountSar: 310000, dueDate: new Date('2026-08-15'), status: 'Pending' },
        { phaseName: 'Handover',        percentage: 25, amountSar: 155000, dueDate: new Date('2026-10-01'), status: 'Pending' },
      ]
    },
    {
      poNumber: 'PO-ARJ-2025-011', customerName: 'Al Rajhi Construction', kaeNameId: kae1.id, poValue: 390000, collectionPct: 100, remarks: 'Fully collected',
      milestones: [
        { phaseName: 'Advance',         percentage: 40, amountSar: 156000, dueDate: new Date('2025-04-10'), status: 'Paid', paidAt: new Date('2025-04-09') },
        { phaseName: 'Final',           percentage: 60, amountSar: 234000, dueDate: new Date('2025-05-01'), status: 'Paid', paidAt: new Date('2025-05-02') },
      ]
    },
    {
      poNumber: 'PO-SEC-2025-005', customerName: 'Saudi Electricity Co', kaeNameId: kae1.id, poValue: 870000, collectionPct: 20, remarks: 'Long-term project — 3 milestones outstanding',
      milestones: [
        { phaseName: 'Mobilisation',    percentage: 20, amountSar: 174000, dueDate: new Date('2025-05-01'), status: 'Overdue' },
        { phaseName: 'Installation',    percentage: 40, amountSar: 348000, dueDate: new Date('2026-08-15'), status: 'Pending' },
        { phaseName: 'Commissioning',   percentage: 40, amountSar: 348000, dueDate: new Date('2026-11-30'), status: 'Pending' },
      ]
    },
    {
      poNumber: 'PO-ACW-2025-002', customerName: 'Acwa Power', kaeNameId: kae2.id, poValue: 430000, collectionPct: 0, remarks: 'New PO — advance due',
      milestones: [
        { phaseName: 'Advance',         percentage: 30, amountSar: 129000, dueDate: new Date('2026-06-25'), status: 'Pending' },
        { phaseName: 'Completion',      percentage: 70, amountSar: 301000, dueDate: new Date('2026-09-30'), status: 'Pending' },
      ]
    },
  ]

  // Link quotation IDs
  const quotationMap = {}
  for (const q of createdQuotations) { quotationMap[q.qtRef] = q.id }

  for (const p of paymentsData) {
    const linked = createdPOs.find(po => po.poNumber === p.poNumber)
    const pay = await prisma.payment.upsert({
      where: { id: p.poNumber },
      update: {},
      create: {
        id: p.poNumber,
        poNumber: p.poNumber,
        customerName: p.customerName,
        kaeNameId: p.kaeNameId,
        poValue: p.poValue,
        collectionPct: p.collectionPct,
        remarks: p.remarks,
        quotationId: linked ? quotationMap[linked.qtRef] : undefined,
        createdBy: admin.id,
        milestones: {
          create: p.milestones.map(m => ({
            phaseName: m.phaseName,
            percentage: m.percentage,
            amountSar: m.amountSar,
            dueDate: m.dueDate,
            status: m.status,
            paidAt: m.paidAt || null,
          }))
        }
      }
    })
  }
  console.log('Payments & milestones created.')

  // ── Documents ────────────────────────────────────────────────────────────────
  const today = new Date()
  const daysFromNow = (d) => new Date(today.getTime() + d * 86400000)

  const documents = [
    { documentName: 'Commercial Registration',     documentOwner: 'System Admin', category: 'Legal',       department: 'Management',  issueDate: new Date('2023-01-01'), expiryDate: daysFromNow(180),  status: 'Active'       },
    { documentName: 'VAT Registration Certificate',documentOwner: 'Nadia Yousef', category: 'Financial',   department: 'Finance',     issueDate: new Date('2023-01-01'), expiryDate: daysFromNow(90),   status: 'Active'       },
    { documentName: 'ISO 9001:2015 Certificate',   documentOwner: 'System Admin', category: 'Quality',     department: 'Operations',  issueDate: new Date('2024-06-01'), expiryDate: daysFromNow(25),   status: 'ExpiringSoon' },
    { documentName: 'Professional Indemnity Insurance', documentOwner: 'System Admin', category: 'Insurance', department: 'Management', issueDate: new Date('2024-05-01'), expiryDate: daysFromNow(12), status: 'ExpiringSoon' },
    { documentName: 'General Liability Insurance', documentOwner: 'System Admin', category: 'Insurance',   department: 'Management',  issueDate: new Date('2024-05-01'), expiryDate: daysFromNow(5),    status: 'ExpiringSoon' },
    { documentName: 'Aramco Approved Vendor Cert', documentOwner: 'Ahmed Al-Rashid', category: 'Vendor',   department: 'Sales',       issueDate: new Date('2024-01-15'), expiryDate: daysFromNow(-10),  status: 'Expired'      },
    { documentName: 'SABIC Vendor Registration',   documentOwner: 'Ahmed Al-Rashid', category: 'Vendor',   department: 'Sales',       issueDate: new Date('2024-03-01'), expiryDate: daysFromNow(60),   status: 'Active'       },
    { documentName: 'IQAMA — Ahmed Al-Rashid',     documentOwner: 'Ahmed Al-Rashid', category: 'HR',       department: 'HR',          issueDate: new Date('2024-08-01'), expiryDate: daysFromNow(120),  status: 'Active'       },
    { documentName: 'IQAMA — Sara Hassan',         documentOwner: 'Sara Hassan',    category: 'HR',        department: 'HR',          issueDate: new Date('2024-09-01'), expiryDate: daysFromNow(28),   status: 'ExpiringSoon' },
    { documentName: 'Office Lease Agreement',      documentOwner: 'System Admin',   category: 'Legal',     department: 'Management',  issueDate: new Date('2024-01-01'), expiryDate: daysFromNow(220),  status: 'Active'       },
    { documentName: 'Safety Officer Certificate',  documentOwner: 'Khalid Al-Qahtani', category: 'Safety', department: 'Operations',  issueDate: new Date('2023-11-01'), expiryDate: daysFromNow(7),    status: 'ExpiringSoon' },
    { documentName: 'Electrical Contractor License', documentOwner: 'System Admin', category: 'Legal',     department: 'Operations',  issueDate: new Date('2023-06-01'), expiryDate: daysFromNow(310),  status: 'Active'       },
  ]

  for (const d of documents) {
    const remaining = Math.ceil((d.expiryDate - today) / 86400000)
    await prisma.document.create({
      data: { ...d, remainingDaysForExpiry: remaining, createdBy: admin.id }
    }).catch(() => {})  // skip duplicates on re-run
  }
  console.log('Documents created.')

  console.log('\n✅ All mock data seeded successfully!')
  console.log('   Users: 6 additional (KAE x2, SM x1, ISE x1, Accountant x1, HR x1) — PIN: 1234 for all')
  console.log('   Customers: 8')
  console.log('   Quotations: 15')
  console.log('   PO Tracker: 6')
  console.log('   Payments: 6 (with 17 milestones — 3 Overdue, 5 Paid, 9 Pending)')
  console.log('   Documents: 12 (4 ExpiringSoon, 1 Expired, 7 Active)')

  // Copy seeded DB to the root dev.db (Next.js reads from there, Prisma writes to prisma/dev.db)
  const fs = require('fs')
  const path = require('path')
  const src  = path.join(__dirname, 'dev.db')
  const dest = path.join(__dirname, '..', 'dev.db')
  if (fs.existsSync(src) && src !== dest) {
    fs.copyFileSync(src, dest)
    console.log('   ↳ Copied prisma/dev.db → dev.db ✓')
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
