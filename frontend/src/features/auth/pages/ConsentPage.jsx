import { ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Logo } from '@/components/brand/Logo'
import { PrivacyNotice } from '@/components/shared/PrivacyNotice'
import { ThemeToggle } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/input'
import { FullPageLoader } from '@/features/auth/components/RequireAuth'
import { homePathFor, useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

/** First-login gate: nothing else in the portal works until the notice is accepted. */
export function ConsentPage() {
  const { status, user, acceptConsent, logout } = useAuth()
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const checkId = useId()

  if (status === 'loading') return <FullPageLoader />
  if (status === 'anonymous') return <Navigate to="/login" replace />
  if (!user.consent_required) return <Navigate to={homePathFor(user)} replace />

  async function accept() {
    setBusy(true)
    try {
      const me = await acceptConsent()
      toast.success('Thank you. Welcome to the Student Request Portal!')
      navigate(homePathFor(me), { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Card className="overflow-hidden">
          <div className="flex items-start gap-4 border-b border-border bg-primary-soft p-6">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-fg">Before you continue</h1>
              <p className="mt-1 text-sm text-muted">
                Hi {user.display_name.split(' ')[0]}! Please read how we use your personal information.
              </p>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-6" tabIndex={0} aria-label="Data privacy notice">
            <PrivacyNotice />
          </div>
          <div className="space-y-5 border-t border-border p-6">
            <label htmlFor={checkId} className="flex cursor-pointer items-start gap-3 text-sm text-fg">
              <Checkbox id={checkId} className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>
                I have read and understood this notice, and I consent to Trinity University of Asia processing my
                personal information for my document requests.
              </span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                onClick={async () => {
                  await logout()
                  navigate('/login', { replace: true })
                }}
              >
                Decline and sign out
              </Button>
              <Button onClick={accept} disabled={!checked} loading={busy}>
                Accept and continue
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
