'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SessionUser, Role, ROLE_LABELS } from '@/types'
import { canRead, canManageUsers } from '@/lib/rbac'
import Tab1Dashboard from '@/components/tabs/Tab1Dashboard'
import Tab2Quotations from '@/components/tabs/Tab2Quotations'
import Tab3POTracker from '@/components/tabs/Tab3POTracker'
import Tab4Customers from '@/components/tabs/Tab4Customers'
import Tab5Payments from '@/components/tabs/Tab5Payments'
import Tab6Documents from '@/components/tabs/Tab6Documents'
import TabUsers from '@/components/tabs/TabUsers'
import {
  LayoutDashboard, FileText, ShoppingCart, Users, CreditCard, FolderOpen,
  LogOut, Menu, X, UserCog, ChevronDown,
} from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tab: null },
  { id: 'quotations', label: 'Quotations', icon: FileText, tab: 'quotations' },
  { id: 'poTracker', label: 'PO Tracker', icon: ShoppingCart, tab: 'poTracker' },
  { id: 'customers', label: 'Customers', icon: Users, tab: 'customers' },
  { id: 'payments', label: 'Payments', icon: CreditCard, tab: 'payments' },
  { id: 'documents', label: 'Documents', icon: FolderOpen, tab: 'documents' },
]

export default function AppShell({ user }: { user: SessionUser }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const visibleTabs = TABS.filter((t) => !t.tab || canRead(user.role, t.tab))

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Tab1Dashboard user={user} />
      case 'quotations': return <Tab2Quotations user={user} />
      case 'poTracker': return <Tab3POTracker user={user} />
      case 'customers': return <Tab4Customers user={user} />
      case 'payments': return <Tab5Payments user={user} />
      case 'documents': return <Tab6Documents user={user} />
      case 'users': return <TabUsers user={user} />
      default: return <Tab1Dashboard user={user} />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-slate-900 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">ERP</span>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">ERP System</p>
            <p className="text-slate-400 text-xs">Management Portal</p>
          </div>
          <button className="ml-auto lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setSidebarOpen(false) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}

          {canManageUsers(user.role) && (
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <UserCog size={18} />
              User Management
            </button>
          )}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{user.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.name}</p>
              <p className="text-slate-400 text-xs">{ROLE_LABELS[user.role as Role]}</p>
            </div>
            <button onClick={handleLogout} title="Sign out" className="text-slate-400 hover:text-red-400 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-slate-800">
            {TABS.find((t) => t.id === activeTab)?.label || 'Dashboard'}
          </span>
        </header>

        {/* Tab content */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
