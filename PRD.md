# Product Requirements Document
## Enterprise ERP Application — Syed Contracting LLC
**Version:** 1.0  
**Date:** 2026-05-21  
**Status:** Approved — In Development

---

## 1. Executive Summary

A 6-tab enterprise web application for Syed Contracting LLC built on a mobile-first, role-gated architecture. The system manages the full commercial lifecycle: quotations → PO tracking → payments → customer directory → documentation, with a real-time analytics dashboard. All data writes replicate simultaneously to a Supabase cloud database and a local on-premises PostgreSQL mirror.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS v3 (mobile-first) |
| Cloud DB | Supabase (PostgreSQL) |
| Local DB | Prisma ORM → local PostgreSQL / SQLite |
| Auth | bcrypt PIN hashing + JWT sessions (iron-session) |
| Charts | Recharts |
| Excel | SheetJS (xlsx) |
| OCR | Tesseract.js / Google Vision API |
| WhatsApp | Twilio WhatsApp API |
| Email | SendGrid SMTP |
| State | Zustand |
| Forms | React Hook Form + Zod |

---

## 3. User Roles (RBAC)

| Code | Role | Key Privileges |
|---|---|---|
| P1 | CEO | Full read/write/export all tabs + Forecast Modeler |
| P2 | Admin | Full access + user creation + password control + Master Key |
| P3 | Regional Manager | Regional read/write/export |
| P4 | Sales Manager | Sales mgmt + payment tracking + Forecast Modeler + export |
| P5 | Key Account Engineer | Own accounts only + limited export |
| P6 | Inside Sales Engineer | Quotation edit/revision + bulk import + view export |
| P7 | Accountant | Full financial edit (PO + Payments) + Excel reporting |
| P8 | HR | HR docs + personnel data + HR export |

---

## 4. Authentication Specifications

- **PIN Format:** Exactly 4 numeric digits (0000–9999), validated client + server
- **Hashing:** bcrypt (salt rounds: 12)
- **Sessions:** iron-session JWT, 8-hour inactivity timeout
- **Master Key:** Admin-only cryptographic bypass; every use logged to immutable audit table
- **User Creation:** P2 only — form with PIN field enforcing 4-digit numeric constraint
- **Password Reset:** P2 only — can force-reset any user's PIN

---

## 5. Tab Specifications Summary

### Tab 1 — Dashboard Analytics
- 6 auto-updating analytics modules (charts, KPIs)
- Forecast Modeler widget: P1 + P4 only
  - Sliders: win-rate %, collection timeline weeks
  - Output: Optimistic vs Baseline revenue chart (quarterly)
- RBAC-scoped data: each role sees their own data slice

### Tab 2 — Quotations
- Fields: qt_ref (REV0/REV1…), qtn_date, customer_name, project_name, amount_sar, status, po_number, kae_assigned, client_contact_name, client_contact_details, remarks
- Status values: Open | Lost | Converted | On Hold
- One-click Converted → auto-creates Tab 3 (PO) + Tab 5 (Payment) draft records
- Bulk Excel import: P2, P4, P6
- PDF OCR upload: all write roles
- Summary panel: Total Quoted (SAR) | Open Count | Converted Count | Lost Value (SAR)

### Tab 3 — PO Tracker
- Fields: customer_name, project_name, kae_name, qt_ref, po_number, po_date, po_amount_ex_vat, vat_15 (auto), total_value_inc_vat (auto), payment_terms_split, payment_collection_percentage, payment_status, remarks
- Write: P2, P7
- Summary: Total PO Ex-VAT | Total VAT 15% | Total Inc-VAT | Collection %

### Tab 4 — Customer Directory
- Fields: customer_name, assigned_kae, total_rfq, total_converted, completion_percentage (auto), total_value_quoted, total_po_value, first_activity_date, last_activity_date, remarks
- Write: P1, P2, P3, P4, P5 (own accounts)
- Bulk import: P2, P4, P5
- Summary: Total Customers | Top Customer by Volume | Avg Conversion %

### Tab 5 — Payments & AR
- Fields: po_number, customer_name, kae_name, po_value, milestone_payments (dynamic matrix), collection_percentage, remarks
- Overdue milestone: flashing red UI + auto WhatsApp/email to P4
- Write: P2, P4, P7
- Summary: Total AR Outstanding | Total Collected | Overdue Count

### Tab 6 — Documentation
- Fields: document_name, document_owner, category, department, issue_date, expiry_date, remaining_days_for_expiry (auto), status (auto), remarks
- Auto email alerts at 30/15/7 days before expiry
- Write: P2, P3, P4, P8
- Summary: Total Docs | Expired Count | Expiring in 30 Days

---

## 6. Cross-Cutting Features

### Excel Export (All Tabs 2–6)
- Exports only what the user can see (RBAC enforced)
- If filters active → export filtered subset
- If no filters → export full table
- Preserves: SAR currency, % formatting, dates, remarks

### Bulk Excel Import
- Tab 2: P2, P4, P6
- Tab 4: P2, P4, P5 (P5 = assigned accounts only)
- Template download available per tab

### Hybrid Storage
- All writes → Supabase (cloud) + local PostgreSQL simultaneously
- Offline mode: graceful fallback to local instance
- Conflict resolution: timestamp-based last-write-wins on sync restore

### Audit Trail (Immutable)
- Session log: user_id, role, login_ts, logout_ts, ip_address, device_type
- Field-level history: timestamp, user_id, role, target_table, row_id, field_name, old_value, new_value
- Admin override log: timestamp, admin_id, action_type, target_user_id, reason

### Notifications
- WhatsApp (Twilio): quote status change → P5, new RFQ logged → P5
- Email (SendGrid): doc expiry at 30/15/7 days → owner + managers
- Platform alert + email: payment milestone due → P4 + P7
- Overdue milestone: WhatsApp + email → P4

---

## 7. Database Tables

```
users, user_sessions
quotations, quotation_audit
po_tracker, po_audit
customers, customer_audit
payments, payment_milestones, payment_audit
documents, document_audit
audit_log (immutable field-level history)
admin_override_log
```

---

## 8. File Structure

```
ERP-APP/
├── prisma/schema.prisma
├── src/
│   ├── app/
│   │   ├── page.tsx               ← Login
│   │   ├── dashboard/page.tsx     ← Main app shell (6 tabs)
│   │   └── api/
│   │       ├── auth/[...]/route.ts
│   │       ├── users/route.ts
│   │       ├── quotations/route.ts
│   │       ├── po-tracker/route.ts
│   │       ├── customers/route.ts
│   │       ├── payments/route.ts
│   │       ├── documents/route.ts
│   │       ├── export/route.ts
│   │       ├── import/route.ts
│   │       └── ocr/route.ts
│   ├── components/
│   │   ├── auth/LoginForm.tsx
│   │   ├── layout/AppShell.tsx
│   │   ├── layout/TabNav.tsx
│   │   ├── shared/KPISummaryPanel.tsx
│   │   ├── shared/FilterPanel.tsx
│   │   ├── shared/DataTable.tsx
│   │   ├── shared/ExportButton.tsx
│   │   ├── shared/ImportButton.tsx
│   │   ├── tabs/Tab1Dashboard.tsx
│   │   ├── tabs/Tab2Quotations.tsx
│   │   ├── tabs/Tab3POTracker.tsx
│   │   ├── tabs/Tab4Customers.tsx
│   │   ├── tabs/Tab5Payments.tsx
│   │   └── tabs/Tab6Documents.tsx
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── rbac.ts
│   │   ├── db.ts (Supabase client)
│   │   ├── db-local.ts (Prisma client)
│   │   ├── dual-write.ts
│   │   ├── audit.ts
│   │   ├── notifications.ts
│   │   └── excel.ts
│   └── types/index.ts
└── public/templates/
    ├── quotations-template.xlsx
    └── customers-template.xlsx
```

---

## 9. Development Phases

| Phase | Scope | Target |
|---|---|---|
| 1 | Auth + RBAC + DB schema + app shell | Week 1 |
| 2 | Tab 2 Quotations + Tab 3 PO Tracker + Tab 4 Customers | Week 2 |
| 3 | Tab 5 Payments + Tab 6 Documents + Tab 1 Dashboard | Week 3 |
| 4 | Excel export/import + OCR + Notifications + Audit | Week 4 |
| 5 | Hybrid sync + offline mode + performance + mobile QA | Week 5 |
