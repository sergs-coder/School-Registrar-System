import { useMutation } from '@tanstack/react-query'
import { MailCheck, MailX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { homePathFor, useAuth } from '@/lib/auth'
import { api } from '@/lib/axios'
import { errorMessage } from '@/lib/errors'
import { PublicShell } from '@/pages/PublicPages'

/** Target of the "confirm your personal email" link. Works signed in or not (often opened on a phone). */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { user, setUser } = useAuth()
  const started = useRef(false)

  const verify = useMutation({
    mutationFn: async () => (await api.post('/auth/verify-personal-email', { token })).data,
    onSuccess: async () => {
      // Refresh the signed-in student's profile so the Profile page shows "Confirmed" right away.
      if (user?.student) {
        try {
          const { data } = await api.get('/me/profile')
          setUser({ ...user, student: data })
        } catch {
          // not critical; the profile reloads on the next sign-in
        }
      }
    },
  })

  useEffect(() => {
    // Run once, even under StrictMode's double effects: the token is single-use.
    if (token && !started.current) {
      started.current = true
      verify.mutate()
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = user ? (user.role === 'student' ? '/profile' : homePathFor(user)) : '/login'

  return (
    <PublicShell>
      <Card className="mx-auto max-w-lg p-6 sm:p-8">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-fg">Confirm personal email</h1>
        {!token ? (
          <Alert tone="danger" icon={MailX} title="This link is incomplete">
            Copy the whole link from the email, or request a new one from your profile.
          </Alert>
        ) : verify.isPending || verify.isIdle ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : verify.isSuccess ? (
          <Alert tone="success" icon={MailCheck} title="Email confirmed">
            {verify.data.message}
          </Alert>
        ) : (
          <Alert tone="danger" icon={MailX} title="We couldn’t confirm this email">
            {errorMessage(verify.error)}
          </Alert>
        )}
        <Button asChild variant="secondary" className="mt-6">
          <Link to={next}>{!user ? 'Sign in' : user.role === 'student' ? 'Go to your profile' : 'Continue'}</Link>
        </Button>
      </Card>
    </PublicShell>
  )
}
