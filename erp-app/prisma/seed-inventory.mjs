import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const items = [
  // ── Butterfly Valves ──────────────────────────────────────────────────────
  { productRef: 'BFV-DN50-PN16-GGG50',   description: 'Butterfly Valve DN50 PN16 GGG50 Body, EPDM Seat',            stockAvailability: 'In Stock',    quantity: 48, orderToFactory: false, remarks: 'Wafer type, SS316 disc' },
  { productRef: 'BFV-DN80-PN16-GGG50',   description: 'Butterfly Valve DN80 PN16 GGG50 Body, EPDM Seat',            stockAvailability: 'In Stock',    quantity: 36, orderToFactory: false, remarks: null },
  { productRef: 'BFV-DN100-PN16-GGG50',  description: 'Butterfly Valve DN100 PN16 GGG50 Body, EPDM Seat',           stockAvailability: 'In Stock',    quantity: 60, orderToFactory: false, remarks: 'High demand item' },
  { productRef: 'BFV-DN150-PN16-GGG50',  description: 'Butterfly Valve DN150 PN16 GGG50 Body, EPDM Seat',           stockAvailability: 'Low Stock',   quantity: 8,  orderToFactory: true,  remarks: 'Reorder triggered' },
  { productRef: 'BFV-DN200-PN16-GGG50',  description: 'Butterfly Valve DN200 PN16 GGG50 Body, NBR Seat',            stockAvailability: 'In Stock',    quantity: 22, orderToFactory: false, remarks: null },
  { productRef: 'BFV-DN250-PN10-GGG50',  description: 'Butterfly Valve DN250 PN10 GGG50 Body, NBR Seat',            stockAvailability: 'Out of Stock',quantity: 0,  orderToFactory: true,  remarks: 'Awaiting factory delivery' },
  { productRef: 'BFV-DN300-PN10-GGG50',  description: 'Butterfly Valve DN300 PN10 GGG50 Body, NBR Seat',            stockAvailability: 'Low Stock',   quantity: 4,  orderToFactory: true,  remarks: null },

  // ── Gate Valves ───────────────────────────────────────────────────────────
  { productRef: 'GTV-DN50-PN16-CI',      description: 'Gate Valve DN50 PN16 Cast Iron, OS&Y Stem',                  stockAvailability: 'In Stock',    quantity: 30, orderToFactory: false, remarks: null },
  { productRef: 'GTV-DN80-PN16-CI',      description: 'Gate Valve DN80 PN16 Cast Iron, OS&Y Stem',                  stockAvailability: 'In Stock',    quantity: 24, orderToFactory: false, remarks: null },
  { productRef: 'GTV-DN100-PN16-DI',     description: 'Gate Valve DN100 PN16 Ductile Iron, Flanged',                stockAvailability: 'In Stock',    quantity: 18, orderToFactory: false, remarks: 'FBE coated internally' },
  { productRef: 'GTV-DN150-PN16-DI',     description: 'Gate Valve DN150 PN16 Ductile Iron, Flanged',                stockAvailability: 'Low Stock',   quantity: 6,  orderToFactory: true,  remarks: null },
  { productRef: 'GTV-DN200-PN16-DI',     description: 'Gate Valve DN200 PN16 Ductile Iron, Flanged',                stockAvailability: 'Out of Stock',quantity: 0,  orderToFactory: true,  remarks: 'Lead time 8 weeks' },

  // ── Globe Valves ──────────────────────────────────────────────────────────
  { productRef: 'GLV-DN25-PN40-SS316',   description: 'Globe Valve DN25 PN40 Stainless Steel 316',                  stockAvailability: 'In Stock',    quantity: 40, orderToFactory: false, remarks: null },
  { productRef: 'GLV-DN50-PN40-SS316',   description: 'Globe Valve DN50 PN40 Stainless Steel 316',                  stockAvailability: 'In Stock',    quantity: 28, orderToFactory: false, remarks: null },
  { productRef: 'GLV-DN80-PN40-CS',      description: 'Globe Valve DN80 PN40 Carbon Steel A216 WCB',               stockAvailability: 'Low Stock',   quantity: 5,  orderToFactory: false, remarks: 'Check with warehouse' },

  // ── Ball Valves ───────────────────────────────────────────────────────────
  { productRef: 'BLV-DN15-PN40-SS316',   description: 'Ball Valve DN15 PN40 Full Bore SS316 2-Piece',               stockAvailability: 'In Stock',    quantity: 120,orderToFactory: false, remarks: null },
  { productRef: 'BLV-DN25-PN40-SS316',   description: 'Ball Valve DN25 PN40 Full Bore SS316 2-Piece',               stockAvailability: 'In Stock',    quantity: 95, orderToFactory: false, remarks: null },
  { productRef: 'BLV-DN50-PN40-SS316',   description: 'Ball Valve DN50 PN40 Full Bore SS316 3-Piece',               stockAvailability: 'In Stock',    quantity: 52, orderToFactory: false, remarks: 'Popular SKU' },
  { productRef: 'BLV-DN80-PN40-CS',      description: 'Ball Valve DN80 PN40 Carbon Steel Trunnion Mounted',         stockAvailability: 'Low Stock',   quantity: 7,  orderToFactory: true,  remarks: null },
  { productRef: 'BLV-DN100-PN40-CS',     description: 'Ball Valve DN100 PN40 Carbon Steel Trunnion Mounted',        stockAvailability: 'Out of Stock',quantity: 0,  orderToFactory: true,  remarks: 'Order placed 2026-05-10' },

  // ── Check Valves ──────────────────────────────────────────────────────────
  { productRef: 'CKV-DN50-PN16-CI',      description: 'Check Valve DN50 PN16 Cast Iron Swing Type',                 stockAvailability: 'In Stock',    quantity: 35, orderToFactory: false, remarks: null },
  { productRef: 'CKV-DN100-PN16-DI',     description: 'Check Valve DN100 PN16 Ductile Iron Swing Type',             stockAvailability: 'In Stock',    quantity: 20, orderToFactory: false, remarks: null },
  { productRef: 'CKV-DN150-PN16-DI',     description: 'Check Valve DN150 PN16 Ductile Iron Swing Type',             stockAvailability: 'Low Stock',   quantity: 3,  orderToFactory: true,  remarks: null },

  // ── Pressure Relief Valves ────────────────────────────────────────────────
  { productRef: 'PRV-DN25-10BAR-SS',     description: 'Pressure Relief Valve DN25 Set 10 Bar SS316 Body',           stockAvailability: 'In Stock',    quantity: 15, orderToFactory: false, remarks: null },
  { productRef: 'PRV-DN40-16BAR-SS',     description: 'Pressure Relief Valve DN40 Set 16 Bar SS316 Body',           stockAvailability: 'In Stock',    quantity: 10, orderToFactory: false, remarks: null },
  { productRef: 'PRV-DN50-25BAR-CS',     description: 'Pressure Relief Valve DN50 Set 25 Bar Carbon Steel',         stockAvailability: 'Out of Stock',quantity: 0,  orderToFactory: true,  remarks: 'Critical item - expedite' },

  // ── Actuators ─────────────────────────────────────────────────────────────
  { productRef: 'ACT-ELEC-230V-NOM',     description: 'Electric Actuator 230V AC Normally Open Multi-turn',         stockAvailability: 'In Stock',    quantity: 12, orderToFactory: false, remarks: null },
  { productRef: 'ACT-ELEC-24V-NOM',      description: 'Electric Actuator 24V DC Normally Open Quarter-turn',        stockAvailability: 'Low Stock',   quantity: 4,  orderToFactory: true,  remarks: 'Used with BFV series' },
  { productRef: 'ACT-PNEU-DA-100',       description: 'Pneumatic Actuator Double-Acting 100 cm² Scotch-Yoke',       stockAvailability: 'In Stock',    quantity: 8,  orderToFactory: false, remarks: null },
  { productRef: 'ACT-PNEU-SR-063',       description: 'Pneumatic Actuator Spring-Return 63 cm² Rack & Pinion',      stockAvailability: 'In Stock',    quantity: 14, orderToFactory: false, remarks: null },

  // ── Pipes ─────────────────────────────────────────────────────────────────
  { productRef: 'PIPE-DI-DN100-K9-6M',   description: 'Ductile Iron Pipe DN100 Class K9 6m Length FBE Coated',      stockAvailability: 'In Stock',    quantity: 200,orderToFactory: false, remarks: 'Per length in warehouse' },
  { productRef: 'PIPE-DI-DN150-K9-6M',   description: 'Ductile Iron Pipe DN150 Class K9 6m Length FBE Coated',      stockAvailability: 'In Stock',    quantity: 150,orderToFactory: false, remarks: null },
  { productRef: 'PIPE-DI-DN200-K9-6M',   description: 'Ductile Iron Pipe DN200 Class K9 6m Length FBE Coated',      stockAvailability: 'Low Stock',   quantity: 40, orderToFactory: true,  remarks: null },
  { productRef: 'PIPE-DI-DN300-K9-6M',   description: 'Ductile Iron Pipe DN300 Class K9 6m Length FBE Coated',      stockAvailability: 'Out of Stock',quantity: 0,  orderToFactory: true,  remarks: 'Project DLITSA0526A018 requirement' },
  { productRef: 'PIPE-GI-DN50-SCH40-6M', description: 'Galvanized Iron Pipe DN50 Schedule 40 6m Length',            stockAvailability: 'In Stock',    quantity: 80, orderToFactory: false, remarks: null },
  { productRef: 'PIPE-GI-DN80-SCH40-6M', description: 'Galvanized Iron Pipe DN80 Schedule 40 6m Length',            stockAvailability: 'In Stock',    quantity: 60, orderToFactory: false, remarks: null },

  // ── Fittings ──────────────────────────────────────────────────────────────
  { productRef: 'FIT-DI-ELBOW-DN100-90', description: 'Ductile Iron 90° Elbow DN100 PN16 FBE Coated',               stockAvailability: 'In Stock',    quantity: 55, orderToFactory: false, remarks: null },
  { productRef: 'FIT-DI-ELBOW-DN150-90', description: 'Ductile Iron 90° Elbow DN150 PN16 FBE Coated',               stockAvailability: 'Low Stock',   quantity: 9,  orderToFactory: false, remarks: null },
  { productRef: 'FIT-DI-TEE-DN100',      description: 'Ductile Iron Equal Tee DN100 PN16 FBE Coated',               stockAvailability: 'In Stock',    quantity: 30, orderToFactory: false, remarks: null },
  { productRef: 'FIT-DI-TEE-DN150',      description: 'Ductile Iron Equal Tee DN150 PN16 FBE Coated',               stockAvailability: 'In Stock',    quantity: 18, orderToFactory: false, remarks: null },
  { productRef: 'FIT-DI-REDUCER-150X100',description: 'Ductile Iron Concentric Reducer DN150×DN100 PN16',           stockAvailability: 'In Stock',    quantity: 22, orderToFactory: false, remarks: null },
  { productRef: 'FIT-DI-FLANGE-DN100',   description: 'Ductile Iron Blank Flange DN100 PN16',                       stockAvailability: 'In Stock',    quantity: 40, orderToFactory: false, remarks: null },

  // ── Flanges & Gaskets ─────────────────────────────────────────────────────
  { productRef: 'FLG-CS-SLIP-DN50-PN16', description: 'Carbon Steel Slip-On Flange DN50 PN16 ASME B16.5',           stockAvailability: 'In Stock',    quantity: 70, orderToFactory: false, remarks: null },
  { productRef: 'FLG-CS-SLIP-DN100-PN16',description: 'Carbon Steel Slip-On Flange DN100 PN16 ASME B16.5',          stockAvailability: 'In Stock',    quantity: 50, orderToFactory: false, remarks: null },
  { productRef: 'FLG-CS-WELD-DN100-PN40',description: 'Carbon Steel Weld Neck Flange DN100 PN40 ASME B16.5',        stockAvailability: 'Low Stock',   quantity: 6,  orderToFactory: false, remarks: null },
  { productRef: 'GSK-RING-DN100-PN16',   description: 'Ring Joint Gasket DN100 PN16 Spiral Wound SS+Graphite',      stockAvailability: 'In Stock',    quantity: 100,orderToFactory: false, remarks: 'Box of 10 units' },
  { productRef: 'GSK-RING-DN150-PN16',   description: 'Ring Joint Gasket DN150 PN16 Spiral Wound SS+Graphite',      stockAvailability: 'In Stock',    quantity: 80, orderToFactory: false, remarks: null },

  // ── Strainers & Filters ───────────────────────────────────────────────────
  { productRef: 'STR-Y-DN50-PN16-CI',    description: 'Y-Type Strainer DN50 PN16 Cast Iron 40 Mesh Screen',         stockAvailability: 'In Stock',    quantity: 18, orderToFactory: false, remarks: null },
  { productRef: 'STR-Y-DN100-PN16-DI',   description: 'Y-Type Strainer DN100 PN16 Ductile Iron 40 Mesh Screen',     stockAvailability: 'In Stock',    quantity: 10, orderToFactory: false, remarks: null },
  { productRef: 'STR-BSKT-DN100-PN16',   description: 'Basket Strainer DN100 PN16 Carbon Steel Duplex Screen',      stockAvailability: 'Low Stock',   quantity: 3,  orderToFactory: true,  remarks: null },

  // ── Flow Meters ───────────────────────────────────────────────────────────
  { productRef: 'FMT-MAG-DN50-SS316',    description: 'Electromagnetic Flow Meter DN50 SS316 Liner 24V DC',         stockAvailability: 'In Stock',    quantity: 6,  orderToFactory: false, remarks: 'HART protocol, 4-20mA output' },
  { productRef: 'FMT-MAG-DN100-PTFE',    description: 'Electromagnetic Flow Meter DN100 PTFE Liner Flanged',        stockAvailability: 'Low Stock',   quantity: 2,  orderToFactory: true,  remarks: null },
  { productRef: 'FMT-MAG-DN150-PTFE',    description: 'Electromagnetic Flow Meter DN150 PTFE Liner Flanged',        stockAvailability: 'Out of Stock',quantity: 0,  orderToFactory: true,  remarks: 'Long lead time — 12 weeks' },
  { productRef: 'FMT-ULT-CLAMP-DN50',    description: 'Ultrasonic Clamp-On Flow Meter DN50–DN300 Portable',         stockAvailability: 'In Stock',    quantity: 4,  orderToFactory: false, remarks: 'Rental & site inspection use' },

  // ── Pressure Instruments ──────────────────────────────────────────────────
  { productRef: 'PGS-SS-63-0-16BAR',     description: 'Pressure Gauge SS316 Ø63 0-16 Bar Bottom Entry',             stockAvailability: 'In Stock',    quantity: 45, orderToFactory: false, remarks: null },
  { productRef: 'PGS-SS-100-0-25BAR',    description: 'Pressure Gauge SS316 Ø100 0-25 Bar Bottom Entry',            stockAvailability: 'In Stock',    quantity: 30, orderToFactory: false, remarks: null },
  { productRef: 'PTX-4-20MA-0-16BAR',    description: 'Pressure Transmitter 4-20mA 0-16 Bar SS316 Diaphragm',       stockAvailability: 'In Stock',    quantity: 14, orderToFactory: false, remarks: null },
  { productRef: 'PTX-4-20MA-0-40BAR',    description: 'Pressure Transmitter 4-20mA 0-40 Bar SS316 Diaphragm',       stockAvailability: 'Low Stock',   quantity: 3,  orderToFactory: false, remarks: null },

  // ── Pumps ─────────────────────────────────────────────────────────────────
  { productRef: 'PMP-CEN-50-32-160-7KW', description: 'Centrifugal End-Suction Pump 50/32-160 7.5kW 1450 RPM',      stockAvailability: 'In Stock',    quantity: 3,  orderToFactory: false, remarks: 'SS316 impeller, mechanical seal' },
  { productRef: 'PMP-CEN-80-65-160-15KW',description: 'Centrifugal End-Suction Pump 80/65-160 15kW 1450 RPM',       stockAvailability: 'Low Stock',   quantity: 1,  orderToFactory: true,  remarks: null },
  { productRef: 'PMP-SUBM-DN80-4KW',     description: 'Submersible Dewatering Pump DN80 4kW SS316 Body',            stockAvailability: 'In Stock',    quantity: 5,  orderToFactory: false, remarks: 'Used for pit dewatering' },

  // ── Expansion Joints ─────────────────────────────────────────────────────
  { productRef: 'EXP-RBBER-DN100-PN16',  description: 'Rubber Expansion Joint DN100 PN16 EPDM Single Sphere',       stockAvailability: 'In Stock',    quantity: 12, orderToFactory: false, remarks: null },
  { productRef: 'EXP-RBBER-DN150-PN16',  description: 'Rubber Expansion Joint DN150 PN16 EPDM Single Sphere',       stockAvailability: 'Low Stock',   quantity: 4,  orderToFactory: false, remarks: null },
  { productRef: 'EXP-BELLOW-DN100-PN40', description: 'Stainless Steel Bellows Expansion Joint DN100 PN40',         stockAvailability: 'Out of Stock',quantity: 0,  orderToFactory: true,  remarks: null },

  // ── Couplings & Repair Clamps ─────────────────────────────────────────────
  { productRef: 'CPL-GRIP-DN100-SS',     description: 'Grip Coupling DN100 SS316 Victaulic Style Range 108–114mm',  stockAvailability: 'In Stock',    quantity: 24, orderToFactory: false, remarks: null },
  { productRef: 'CPL-GRIP-DN150-SS',     description: 'Grip Coupling DN150 SS316 Victaulic Style Range 159–165mm',  stockAvailability: 'In Stock',    quantity: 16, orderToFactory: false, remarks: null },
  { productRef: 'RCL-SLEEVE-DN100',      description: 'Repair Clamp Sleeve DN100 316 SS Bolted 200mm Length',       stockAvailability: 'In Stock',    quantity: 20, orderToFactory: false, remarks: 'Emergency stock' },
]

async function main() {
  console.log('Seeding inventory items…')
  let created = 0
  let skipped = 0

  for (const item of items) {
    const existing = await prisma.materialItem.findUnique({ where: { productRef: item.productRef } })
    if (existing) { skipped++; continue }

    await prisma.materialItem.create({
      data: {
        productRef:        item.productRef,
        description:       item.description,
        stockAvailability: item.stockAvailability,
        quantity:          item.quantity,
        orderToFactory:    item.orderToFactory,
        remarks:           item.remarks ?? null,
      },
    })
    created++
  }

  console.log(`Done — ${created} created, ${skipped} skipped (already existed)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
