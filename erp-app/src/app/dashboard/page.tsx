import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/layout/AppShell'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session.user) redirect('/')

  return <AppShell user={session.user} />
}
