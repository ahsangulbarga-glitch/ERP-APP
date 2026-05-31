// Seed 3 realistic Saudi industrial customers for the CRM module
// Run: node prisma/seed-customers.mjs

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const customers = [
  {
    customerName: 'Saudi Electricity Company',
    status: 'Active',
    industry: 'Utilities & Power',
    website: 'www.se.com.sa',
    phone: '+966-11-200-3000',
    email: 'procurement@se.com.sa',
    primaryAddress: JSON.stringify({ street: 'Prince Abdulaziz Bin Musaed Bin Jalawi St', city: 'Riyadh', region: 'Riyadh Region', postalCode: '11682', country: 'Saudi Arabia' }),
    keyPersonnel: JSON.stringify([
      { name: 'Eng. Khalid Al-Rashidi', title: 'Director of Procurement', phone: '+966-55-100-2001', email: 'k.rashidi@se.com.sa', isPrimary: true },
      { name: 'Eng. Fahad Al-Otaibi', title: 'Senior Technical Engineer', phone: '+966-55-100-2002', email: 'f.otaibi@se.com.sa', isPrimary: false },
      { name: 'Ms. Noura Al-Zahrani', title: 'Contracts Administrator', phone: '+966-55-100-2003', email: 'n.zahrani@se.com.sa', isPrimary: false },
    ]),
    communicationPref: JSON.stringify({ preferredChannel: 'Email', preferredLanguage: 'Arabic', doNotCall: false }),
    leadSource: 'Government Tender',
    priceTier: 'PLATINUM',
    discountRate: 8.5,
    paymentTerms: 'Net 60',
    creditLimit: 2000000,
    creditBalance: 487500,
    taxId: '300012345600003',
    taxExempt: false,
    currency: 'SAR',
    shippingAddresses: JSON.stringify([
      { label: 'Riyadh Operations Hub', street: 'Industrial City, 2nd Phase', city: 'Riyadh', region: 'Riyadh Region', postalCode: '11964', country: 'Saudi Arabia', isDefault: true },
      { label: 'Eastern Region Depot', street: 'King Abdulaziz Industrial City', city: 'Jubail', region: 'Eastern Region', postalCode: '31961', country: 'Saudi Arabia', isDefault: false },
    ]),
    defaultCarrier: 'SMSA Express',
    carrierAccount: 'SMSA-SEC-0042',
    totalRfq: 34,
    totalConverted: 28,
    completionPct: 82.35,
    totalValueQuoted: 4850000,
    totalPoValue: 3920000,
    firstActivityDate: new Date('2021-03-15'),
    lastActivityDate: new Date('2024-11-20'),
    remarks: 'Key strategic account. Annual framework contract under renewal.',
  },
  {
    customerName: 'Aramco Overseas Projects',
    status: 'Active',
    industry: 'Oil & Gas',
    website: 'www.aramco.com',
    phone: '+966-13-872-0000',
    email: 'vendor.support@aramco.com',
    primaryAddress: JSON.stringify({ street: 'Dhahran 31311, Aramco HQ', city: 'Dhahran', region: 'Eastern Region', postalCode: '31311', country: 'Saudi Arabia' }),
    keyPersonnel: JSON.stringify([
      { name: 'Eng. Sultan Al-Ghamdi', title: 'Senior Procurement Officer', phone: '+966-50-872-3301', email: 's.ghamdi@aramco.com', isPrimary: true },
      { name: 'Eng. Tariq Al-Dosari', title: 'Project Engineer', phone: '+966-50-872-3302', email: 't.dosari@aramco.com', isPrimary: false },
    ]),
    communicationPref: JSON.stringify({ preferredChannel: 'Email', preferredLanguage: 'English', doNotCall: false }),
    leadSource: 'Direct Referral',
    priceTier: 'GOLD',
    discountRate: 5.0,
    paymentTerms: 'Net 45',
    creditLimit: 1500000,
    creditBalance: 312000,
    taxId: '300000000000003',
    taxExempt: false,
    currency: 'SAR',
    shippingAddresses: JSON.stringify([
      { label: 'Dhahran Main Warehouse', street: 'Aramco Supply Base, Gate 12', city: 'Dhahran', region: 'Eastern Region', postalCode: '31311', country: 'Saudi Arabia', isDefault: true },
      { label: 'Ras Tanura Terminal', street: 'Ras Tanura Refinery Complex', city: 'Ras Tanura', region: 'Eastern Region', postalCode: '31911', country: 'Saudi Arabia', isDefault: false },
    ]),
    defaultCarrier: 'Naqel Express',
    carrierAccount: 'NQL-ARMC-0187',
    totalRfq: 22,
    totalConverted: 16,
    completionPct: 72.73,
    totalValueQuoted: 3100000,
    totalPoValue: 2250000,
    firstActivityDate: new Date('2022-01-10'),
    lastActivityDate: new Date('2024-10-05'),
    remarks: 'Preferred vendor status. Pre-qualified for instrumentation and electrical scopes.',
  },
  {
    customerName: 'National Water Company',
    status: 'Active',
    industry: 'Water & Environment',
    website: 'www.nwc.com.sa',
    phone: '+966-12-618-0000',
    email: 'supply@nwc.com.sa',
    primaryAddress: JSON.stringify({ street: 'King Fahd Road, Al Sulaimaniyah', city: 'Jeddah', region: 'Makkah Region', postalCode: '23435', country: 'Saudi Arabia' }),
    keyPersonnel: JSON.stringify([
      { name: 'Eng. Mohammed Al-Balawi', title: 'Head of Material Supply', phone: '+966-54-618-0011', email: 'm.balawi@nwc.com.sa', isPrimary: true },
      { name: 'Ms. Reem Al-Harbi', title: 'Vendor Relations Manager', phone: '+966-54-618-0012', email: 'r.harbi@nwc.com.sa', isPrimary: false },
    ]),
    communicationPref: JSON.stringify({ preferredChannel: 'Phone', preferredLanguage: 'Arabic', doNotCall: false }),
    leadSource: 'Exhibition / Trade Show',
    priceTier: 'SILVER',
    discountRate: 3.0,
    paymentTerms: 'Net 30',
    creditLimit: 800000,
    creditBalance: 95000,
    taxId: '300045678900003',
    taxExempt: false,
    currency: 'SAR',
    shippingAddresses: JSON.stringify([
      { label: 'Jeddah Central Depot', street: 'Madain District, Industrial Zone 3', city: 'Jeddah', region: 'Makkah Region', postalCode: '23215', country: 'Saudi Arabia', isDefault: true },
    ]),
    defaultCarrier: 'DHL Express',
    carrierAccount: 'DHL-NWC-9902',
    totalRfq: 15,
    totalConverted: 9,
    completionPct: 60.0,
    totalValueQuoted: 1200000,
    totalPoValue: 725000,
    firstActivityDate: new Date('2022-09-01'),
    lastActivityDate: new Date('2024-09-18'),
    remarks: 'Active expansion project across Jeddah and Makkah regions. High demand for pipeline instrumentation.',
  },
]

async function main() {
  console.log('Seeding customers...')
  for (const c of customers) {
    const existing = await prisma.customer.findFirst({ where: { customerName: c.customerName } })
    if (existing) {
      await prisma.customer.update({ where: { id: existing.id }, data: c })
      console.log(`  ✔ Updated: ${c.customerName}`)
    } else {
      await prisma.customer.create({ data: c })
      console.log(`  ✔ Created: ${c.customerName}`)
    }
  }
  console.log('Done.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
