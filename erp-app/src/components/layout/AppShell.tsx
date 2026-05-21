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
import TabPerformance from '@/components/tabs/TabPerformance'
import { canViewPerformanceAnalytics } from '@/lib/rbac'
import {
  LayoutDashboard, FileText, ShoppingCart, Users, CreditCard,
  FolderOpen, LogOut, Menu, X, UserCog, ChevronRight, BarChart2,
} from 'lucide-react'

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',  icon: LayoutDashboard, tab: null,         accent: '#2563eb' },
  { id: 'quotations',  label: 'Quotations', icon: FileText,         tab: 'quotations', accent: '#0891b2' },
  { id: 'poTracker',   label: 'PO Tracker', icon: ShoppingCart,     tab: 'poTracker',  accent: '#7c3aed' },
  { id: 'customers',   label: 'Customers',  icon: Users,            tab: 'customers',  accent: '#059669' },
  { id: 'payments',    label: 'Payments',   icon: CreditCard,       tab: 'payments',   accent: '#d97706' },
  { id: 'documents',   label: 'Documents',  icon: FolderOpen,       tab: 'documents',  accent: '#dc2626' },
]

const PAGE_TITLES: Record<string, string> = {
  dashboard:   'Dashboard Overview',
  quotations:  'Quotations',
  poTracker:   'PO Tracker',
  customers:   'Customers',
  payments:    'Payments',
  documents:   'Documents',
  performance: 'Performance Analytics',
  users:       'User Management',
}

export default function AppShell({ user }: { user: SessionUser }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const visibleTabs = TABS.filter(t => !t.tab || canRead(user.role, t.tab))
  const currentAccent = TABS.find(t => t.id === activeTab)?.accent || '#2563eb'

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':  return <Tab1Dashboard user={user} />
      case 'quotations': return <Tab2Quotations user={user} />
      case 'poTracker':  return <Tab3POTracker user={user} />
      case 'customers':  return <Tab4Customers user={user} />
      case 'payments':   return <Tab5Payments user={user} />
      case 'documents':  return <Tab6Documents user={user} />
      case 'users':      return <TabUsers user={user} />
      case 'performance': return <TabPerformance user={user} />
      default:           return <Tab1Dashboard user={user} />
    }
  }

  const NavItem = ({ id, label, icon: Icon, accent }: { id: string; label: string; icon: React.ElementType; accent: string }) => {
    const isActive = activeTab === id
    return (
      <button
        onClick={() => { setActiveTab(id); setSidebarOpen(false) }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative"
        style={isActive ? {
          background: `${accent}20`,
          color: '#fff',
        } : {}}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
            style={{ background: accent }} />
        )}
        <span className="flex-none w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={isActive
            ? { background: accent, boxShadow: `0 4px 12px ${accent}55` }
            : { background: 'rgba(255,255,255,0.04)' }}>
          <Icon size={15} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'} />
        </span>
        <span className={isActive ? 'text-white font-semibold' : 'text-slate-400 group-hover:text-slate-200'}>
          {label}
        </span>
        {isActive && <ChevronRight size={13} className="ml-auto text-white opacity-50" />}
      </button>
    )
  }

  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f0f4f8' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-60 flex flex-col transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ background: '#0f172a', borderRight: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
            <span className="text-white text-xs font-bold">ERP</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight truncate">ERP System</p>
            <p className="text-slate-500 text-xs truncate">Management Portal</p>
          </div>
          <button className="lg:hidden text-slate-500 hover:text-white transition-colors" onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
          {visibleTabs.map(t => <NavItem key={t.id} {...t} />)}

          {canViewPerformanceAnalytics(user.role) && (
            <NavItem id="performance" label="Performance" icon={BarChart2} accent="#7c3aed" />
          )}
          {canManageUsers(user.role) && (
            <NavItem id="users" label="User Mgmt" icon={UserCog} accent="#e11d48" />
          )}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold shadow"
              style={{ background: `linear-gradient(135deg, ${currentAccent}, ${currentAccent}bb)` }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user.name}</p>
              <p className="text-slate-500 text-xs truncate">{ROLE_LABELS[user.role as Role]}</p>
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="shrink-0 flex items-center gap-3 px-4 py-3"
          style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <button className="lg:hidden text-slate-500 hover:text-slate-900 transition-colors"
            onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full" style={{ background: currentAccent }} />
            <h1 className="font-semibold text-slate-800 text-base">{PAGE_TITLES[activeTab] || 'Dashboard'}</h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {user.name}
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ color: '#94a3b8', border: '1px solid #e2e8f0' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#fecaca'; (e.currentTarget as HTMLElement).style.background = '#fef2f2' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="fade-in h-full">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  )
}
