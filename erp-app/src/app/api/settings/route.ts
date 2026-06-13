import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { canWrite } from '@/lib/rbac'

// ── GET — company settings + caller's notification prefs ──────────────────────
export async function GET() {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session, tenantId } = result

  const [company, notifSetting] = await Promise.all([
    db.companySetting.findFirst({ where: { tenantId } }),
    db.notificationSetting.findFirst({ where: { userId: session.user.id } }),
  ])

  return NextResponse.json({
    company: company ?? {
      id: 'singleton', companyName: 'Syed Contracting LLC', defaultVatRate: 15,
      currency: 'SAR', currencySymbol: 'SAR', workingDays: '0,1,2,3,4',
      country: 'Saudi Arabia', taxName: 'VAT', taxNumberLabel: 'VAT Number',
    },
    notifications: notifSetting ?? {
      userId: session.user.id, emailEnabled: false, whatsappEnabled: false,
      inAppEnabled: true, onApproval: true, onPaymentDue: true,
      onDocExpiry: true, onInvoiceIssued: true, onNewRfq: true,
    },
  })
}

// ── PATCH — update company settings (admin) or notification prefs (self) ──────
export async function PATCH(req: NextRequest) {
  const result = await requireTenant()
  if ('error' in result) return result.error
  const { db, session, tenantId } = result

  const body = await req.json()
  const { type, ...data } = body

  // Notification preferences — any user can update their own
  if (type === 'notifications') {
    const setting = await db.notificationSetting.upsert({
      where:  { userId: session.user.id },
      update: {
        emailEnabled:    data.emailEnabled    ?? undefined,
        whatsappEnabled: data.whatsappEnabled ?? undefined,
        inAppEnabled:    data.inAppEnabled    ?? undefined,
        onApproval:      data.onApproval      ?? undefined,
        onPaymentDue:    data.onPaymentDue    ?? undefined,
        onDocExpiry:     data.onDocExpiry     ?? undefined,
        onInvoiceIssued: data.onInvoiceIssued ?? undefined,
        onNewRfq:        data.onNewRfq        ?? undefined,
      },
      create: {
        userId:          session.user.id,
        emailEnabled:    data.emailEnabled    ?? false,
        whatsappEnabled: data.whatsappEnabled ?? false,
        inAppEnabled:    data.inAppEnabled    ?? true,
        onApproval:      data.onApproval      ?? true,
        onPaymentDue:    data.onPaymentDue    ?? true,
        onDocExpiry:     data.onDocExpiry     ?? true,
        onInvoiceIssued: data.onInvoiceIssued ?? true,
        onNewRfq:        data.onNewRfq        ?? true,
      },
    })
    return NextResponse.json(setting)
  }

  // Company settings — admin only
  if (!canWrite(session.user.role, 'settings')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const setting = await db.companySetting.upsert({
    where:  { tenantId },
    update: {
      ...(data.companyName    !== undefined && { companyName:    data.companyName }),
      ...(data.crNumber       !== undefined && { crNumber:       data.crNumber }),
      ...(data.vatNumber      !== undefined && { vatNumber:      data.vatNumber }),
      ...(data.address        !== undefined && { address:        data.address }),
      ...(data.phone          !== undefined && { phone:          data.phone }),
      ...(data.email          !== undefined && { email:          data.email }),
      ...(data.website        !== undefined && { website:        data.website }),
      ...(data.defaultVatRate !== undefined && { defaultVatRate: parseFloat(data.defaultVatRate) || 0 }),
      ...(data.currency       !== undefined && { currency:       data.currency }),
      ...(data.currencySymbol !== undefined && { currencySymbol: data.currencySymbol }),
      ...(data.workingDays    !== undefined && { workingDays:    data.workingDays }),
      ...(data.country        !== undefined && { country:        data.country }),
      ...(data.taxName        !== undefined && { taxName:        data.taxName }),
      ...(data.taxNumberLabel !== undefined && { taxNumberLabel: data.taxNumberLabel }),
      ...(data.logoDataUrl          !== undefined && { logoDataUrl:          data.logoDataUrl       ?? null }),
      ...(data.pdfHeaderDataUrl     !== undefined && { pdfHeaderDataUrl:     data.pdfHeaderDataUrl  ?? null }),
      ...(data.preparedByContacts   !== undefined && { preparedByContacts:   data.preparedByContacts !== null ? JSON.stringify(data.preparedByContacts) : null }),
      ...(data.pdfCompanyFullName   !== undefined && { pdfCompanyFullName:   data.pdfCompanyFullName  ?? null }),
      ...(data.pdfClosingText       !== undefined && { pdfClosingText:       data.pdfClosingText      ?? null }),
      ...(data.pdfSignatoryName     !== undefined && { pdfSignatoryName:     data.pdfSignatoryName    ?? null }),
      ...(data.pdfSignatoryTitle    !== undefined && { pdfSignatoryTitle:    data.pdfSignatoryTitle   ?? null }),
      ...(data.pdfSignatoryCc       !== undefined && { pdfSignatoryCc:       data.pdfSignatoryCc      ?? null }),
      ...(data.pdfLegalNotice       !== undefined && { pdfLegalNotice:       data.pdfLegalNotice      ?? null }),
      ...(data.pdfFooterAddress     !== undefined && { pdfFooterAddress:     data.pdfFooterAddress    ?? null }),
      ...(data.pdfFooterEmails      !== undefined && { pdfFooterEmails:      data.pdfFooterEmails     ?? null }),
      updatedBy: session.user.id,
    },
    create: {
      companyName:    data.companyName    ?? 'Syed Contracting LLC',
      crNumber:       data.crNumber       ?? null,
      vatNumber:      data.vatNumber      ?? null,
      address:        data.address        ?? null,
      phone:          data.phone          ?? null,
      email:          data.email          ?? null,
      website:        data.website        ?? null,
      defaultVatRate: parseFloat(data.defaultVatRate) || 15,
      currency:       data.currency       ?? 'SAR',
      currencySymbol: data.currencySymbol ?? 'SAR',
      workingDays:    data.workingDays    ?? '0,1,2,3,4',
      country:        data.country        ?? 'Saudi Arabia',
      taxName:        data.taxName        ?? 'VAT',
      taxNumberLabel: data.taxNumberLabel ?? 'VAT Number',
      logoDataUrl:         data.logoDataUrl         ?? null,
      pdfHeaderDataUrl:    data.pdfHeaderDataUrl    ?? null,
      preparedByContacts:  data.preparedByContacts  != null ? JSON.stringify(data.preparedByContacts) : null,
      pdfCompanyFullName:  data.pdfCompanyFullName  ?? null,
      pdfClosingText:      data.pdfClosingText      ?? null,
      pdfSignatoryName:    data.pdfSignatoryName    ?? null,
      pdfSignatoryTitle:   data.pdfSignatoryTitle   ?? null,
      pdfSignatoryCc:      data.pdfSignatoryCc      ?? null,
      pdfLegalNotice:      data.pdfLegalNotice      ?? null,
      pdfFooterAddress:    data.pdfFooterAddress    ?? null,
      pdfFooterEmails:     data.pdfFooterEmails     ?? null,
      updatedBy:        session.user.id,
    },
  })

  return NextResponse.json(setting)
}
