import {
  BarChart3,
  ClipboardList,
  FileCog,
  LayoutDashboard,
  Menu,
  PackageCheck,
  ScrollText,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { Logo } from '@/components/brand/Logo'
import { SkipLink } from '@/components/layout/StudentLayout'
import { UserMenu } from '@/components/layout/UserMenu'
import { ThemeToggle } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const SECTIONS = [
  {
    title: 'Work',
    items: [
      { to: '/registrar', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/registrar/requests', label: 'Request queue', icon: ClipboardList },
      { label: 'Payments', icon: Wallet, phase: 3 },
      { label: 'Releases', icon: PackageCheck, phase: 3 },
    ],
  },
  {
    title: 'Admin',
    admin: true,
    items: [
      { label: 'Document types', icon: FileCog, phase: 4 },
      { label: 'Users', icon: Users, phase: 4 },
      { label: 'Reports', icon: BarChart3, phase: 4 },
      { label: 'Audit logs', icon: ScrollText, phase: 4 },
      { label: 'Settings', icon: Settings, phase: 4 },
    ],
  },
]

function SidebarNav() {
  const { user } = useAuth()
  return (
    <nav aria-label="Registrar" className="space-y-6">
      {SECTIONS.filter((s) => !s.admin || user.role === 'admin').map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map(({ to, label, icon: Icon, end, phase }) => (
              <li key={label}>
                {to ? (
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                        isActive ? 'bg-primary-soft text-link' : 'text-muted hover:bg-surface-muted hover:text-fg',
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" /> {label}
                  </NavLink>
                ) : (
                  <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-subtle" aria-disabled="true">
                    <Icon className="size-4" aria-hidden="true" /> {label}
                    <span className="ml-auto rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold">
                      Phase {phase}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function RegistrarLayout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <SkipLink />
      <div className="hidden border-r border-border bg-surface lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto p-4">
          <Logo subtitle="Registrar Back Office" className="px-2 pt-1" />
          <SidebarNav />
        </aside>
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="lg:hidden">
            <Logo subtitle="Registrar" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 p-4 focus:outline-none sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="left-0 top-0 h-dvh max-w-[280px] translate-x-0 translate-y-0 rounded-none rounded-r-2xl">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <div onClick={() => setOpen(false)} className="space-y-6">
            <Logo subtitle="Registrar Back Office" />
            <SidebarNav />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
