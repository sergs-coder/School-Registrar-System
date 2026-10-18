import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { LogoMark } from '@/components/brand/Logo'
import { homePathFor, useAuth } from '@/lib/auth'

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <LogoMark className="size-14 animate-pulse" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/** Gate: signed in → consented → correct role. */
export function RequireAuth({ roles }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader />
  if (status === 'anonymous') {
    const next = location.pathname + location.search
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  }
  if (user.consent_required) return <Navigate to="/consent" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />
  return <Outlet />
}

/** For /login etc.: signed-in users go to their home. */
export function RedirectIfAuthed() {
  const { status, user } = useAuth()
  if (status === 'loading') return <FullPageLoader />
  if (status === 'authenticated') return <Navigate to={user.consent_required ? '/consent' : homePathFor(user)} replace />
  return <Outlet />
}
