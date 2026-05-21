import twilio from 'twilio'
import sgMail from '@sendgrid/mail'

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !sid.startsWith('AC') || !token) return null
  return twilio(sid, token)
}

function initSendGrid() {
  const key = process.env.SENDGRID_API_KEY
  if (!key || !key.startsWith('SG.')) return false
  sgMail.setApiKey(key)
  return true
}

export async function sendWhatsApp(to: string, message: string) {
  const client = getTwilioClient()
  if (!client) return
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${to}`,
      body: message,
    })
  } catch (err) {
    console.error('WhatsApp send error:', err)
  }
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!initSendGrid()) return
  try {
    await sgMail.send({
      to,
      from: process.env.EMAIL_FROM || 'noreply@company.com',
      subject,
      html,
    })
  } catch (err) {
    console.error('Email send error:', err)
  }
}

export async function notifyQuoteStatusChange(
  kaePhone: string,
  kaeEmail: string,
  qtRef: string,
  newStatus: string,
  customerName: string
) {
  const msg = `Quote Update: ${qtRef} for ${customerName} is now "${newStatus}". — ERP System`
  await Promise.all([
    sendWhatsApp(kaePhone, msg),
    sendEmail(kaeEmail, `Quote ${qtRef} Status Changed to ${newStatus}`, `<p>${msg}</p>`),
  ])
}

export async function notifyNewRFQ(
  kaePhone: string,
  kaeEmail: string,
  customerName: string,
  qtRef: string
) {
  const msg = `New RFQ Logged: ${qtRef} from ${customerName}. Please review. — ERP System`
  await Promise.all([
    sendWhatsApp(kaePhone, msg),
    sendEmail(kaeEmail, `New RFQ: ${qtRef}`, `<p>${msg}</p>`),
  ])
}

export async function notifyOverdueMilestone(
  smPhone: string,
  smEmail: string,
  poNumber: string,
  customerName: string,
  milestone: string,
  dueDate: string,
  amount: number
) {
  const msg = `OVERDUE PAYMENT: PO ${poNumber} — ${customerName} | Milestone: ${milestone} | Due: ${dueDate} | SAR ${amount.toLocaleString()}. Immediate action required.`
  await Promise.all([
    sendWhatsApp(smPhone, msg),
    sendEmail(smEmail, `OVERDUE: Payment Milestone for ${poNumber}`, `<p style="color:red">${msg}</p>`),
  ])
}

export async function notifyDocumentExpiry(
  ownerEmail: string,
  managerEmail: string,
  docName: string,
  daysLeft: number,
  expiryDate: string
) {
  const subject = `Document Expiry Warning: ${docName} expires in ${daysLeft} days`
  const html = `<p>The document <strong>${docName}</strong> will expire on <strong>${expiryDate}</strong> (${daysLeft} days remaining).</p><p>Please renew immediately.</p>`
  await Promise.all([
    sendEmail(ownerEmail, subject, html),
    sendEmail(managerEmail, subject, html),
  ])
}
