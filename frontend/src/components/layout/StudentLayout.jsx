import { Bell, FileStack, House, Plus, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

import { Logo } from '@/components/brand/Logo'
import { Footer } from '@/components/layout/Footer'
import { UserMenu } from '@/components/layout/UserMenu'
import { NotificationBell } from '@/features/notifications/components'
import { useUnreadCount } from '@/features/notifications/api'
import { ThemeToggle } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/requests', label: 'My Requests', icon: FileStack },
]

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
    >
      Skip to main content
    </a>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function StudentLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <ScrollToTop />
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <Link to="/" className="min-w-0 rounded-lg sm:mr-2">
            <Logo compact />
            <span className="sr-only">, home</span>
          </Link>
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary-soft text-link' : 'text-muted hover:bg-surface-muted hover:text-fg',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button asChild variant="accent" size="sm" className="hidden md:inline-flex">
              <Link to="/requests/new">
                <Plus /> New Request
              </Link>
            </Button>
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 focus:outline-none sm:px-6 sm:pt-8 md:pb-16">
        <Outlet />
      </main>

      <div className="pb-20 md:pb-0">
        <Footer />
      </div>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  const { data: unread = 0 } = useUnreadCount()
  const items = [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/requests', label: 'Requests', icon: FileStack, end: true },
    { to: '/requests/new', label: 'New', icon: Plus, primary: true },
    { to: '/notifications', label: 'Alerts', icon: Bell, badge: unread },
    { to: '/profile', label: 'Profile', icon: UserRound },
  ]
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ to, label, icon: Icon, end, primary, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  isActive ? 'text-link' : 'text-muted',
                )
              }
            >
              {primary ? (
                <span className="-mt-1 flex size-9 items-center justify-center rounded-full bg-accent text-on-accent shadow-card">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
              ) : (
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white dark:text-background">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
              )}
              {label}
              {badge > 0 && <span className="sr-only">, {badge} unread</span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
