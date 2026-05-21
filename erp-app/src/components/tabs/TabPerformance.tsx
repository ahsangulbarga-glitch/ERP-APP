'use client'

import { SessionUser } from '@/types'
import PerformancePanel from '@/components/shared/PerformancePanel'

export default function TabPerformance({ user }: { user: SessionUser }) {
  return (
    <div className="p-4 lg:p-5 max-w-7xl mx-auto space-y-4">
      <PerformancePanel user={user} defaultExpanded />
    </div>
  )
}
