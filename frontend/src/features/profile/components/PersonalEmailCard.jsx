import { BadgeCheck, Clock, Mail } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SetupLinkNotice } from '@/features/admin/components'
import { api } from '@/lib/axios'
import { apiError, errorMessage } from '@/lib/errors'

/**
 * Optional personal email for request updates. A new address only receives updates after the
 * student confirms it through the emailed link.
 */
export function PersonalEmailCard({ student, universityEmail, onSaved }) {
  const [editing, setEditing] = useState(!student.personal_email)
  const [value, setValue] = useState(student.personal_email ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [devLink, setDevLink] = useState(null)
  const pending = student.personal_email && !student.personal_email_verified

  async function run(key, request, success) {
    setBusy(key)
    setError(null)
    try {
      const { data } = await request()
      onSaved(data.profile)
      setDevLink(data.verify_link ?? null)
      toast.success(success(data.profile))
      return data.profile
    } catch (err) {
      const { details = [] } = apiError(err)
      const field = details.find((d) => d.field === 'email')
      if (field) setError(field.message)
      else toast.error(errorMessage(err))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function save(e) {
    e.preventDefault()
    const email = value.trim()
    if (!email) {
      setError('Enter an email address.')
      return
    }
    const profile = await run('save', () => api.put('/me/personal-email', { email }), (p) =>
      p.personal_email_verified ? 'Personal email saved' : `We sent a confirmation link to ${p.personal_email}`,
    )
    if (profile) setEditing(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal email</CardTitle>
        <CardDescription>
          Get request updates here as well as at {universityEmail}. Useful if you’ve graduated or may lose access to your
          university email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SetupLinkNotice link={devLink} />

        {!editing && student.personal_email ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Mail className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 break-all text-sm font-medium text-fg">{student.personal_email}</span>
              {pending ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">
                  <Clock className="size-3.5" aria-hidden="true" /> Waiting for confirmation
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
                  <BadgeCheck className="size-3.5" aria-hidden="true" /> Confirmed
                </span>
              )}
            </div>
            {pending && (
              <p className="text-[13px] text-muted">
                Open the link we emailed to this address to start receiving updates there. The link works for 24 hours.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {pending && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === 'resend'}
                  onClick={() => run('resend', () => api.post('/me/personal-email/resend'), (p) => `New link sent to ${p.personal_email}`)}
                >
                  Resend link
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setValue(student.personal_email); setEditing(true) }}>
                Change
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                loading={busy === 'remove'}
                onClick={async () => {
                  const profile = await run('remove', () => api.put('/me/personal-email', { email: null }), () => 'Personal email removed')
                  if (profile) {
                    setValue('')
                    setEditing(true)
                  }
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} noValidate className="space-y-4">
            <FormField
              label="Personal email"
              error={error}
              help="We’ll email a link to confirm it’s yours before sending anything else there."
            >
              <Input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@gmail.com"
                value={value}
                maxLength={255}
                onChange={(e) => {
                  setValue(e.target.value)
                  setError(null)
                }}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" loading={busy === 'save'}>
                {student.personal_email ? 'Save and send link' : 'Add personal email'}
              </Button>
              {student.personal_email && (
                <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError(null) }}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
