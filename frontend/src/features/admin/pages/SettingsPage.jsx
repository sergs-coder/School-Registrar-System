import { CalendarOff, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/shared/FormField'
import { ErrorState, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAddHoliday,
  useAdminAnnouncements,
  useAdminSettings,
  useDeleteAnnouncement,
  useDeleteHoliday,
  useHolidays,
  useRunReminders,
  useSaveAnnouncement,
  useSaveSettings,
} from '@/features/admin/api'
import { ConfirmDialog } from '@/features/admin/components'
import { apiError, errorMessage } from '@/lib/errors'
import { cn, formatDate, formatDateTime, formatSlot } from '@/lib/utils'

const fieldErrors = (err) =>
  Object.fromEntries((apiError(err).details ?? []).filter((d) => d.field).map((d) => [d.field, d.message.replace(/^Value error, /, '')]))

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Office details, fees, closed days and announcements shown in the portal." />
      <OfficeSettings />
      <PickupHours />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Holidays />
        <div className="space-y-6">
          <Announcements />
          <Reminders />
        </div>
      </div>
    </div>
  )
}

// ---------- office & fees ----------

function OfficeSettings() {
  const { data, isLoading, error, refetch } = useAdminSettings()
  const save = useSaveSettings()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isLoading || !form) return <Skeleton className="h-96 rounded-2xl" />

  // Pick-up hours have their own card; always send the saved schedule from here.
  const own = (v) => ({ ...v, pickup_schedule: undefined })
  const contact = form.registrar_contact
  const setContact = (patch) => setForm((f) => ({ ...f, registrar_contact: { ...f.registrar_contact, ...patch } }))
  const dirty = JSON.stringify(own(form)) !== JSON.stringify(own(data))

  async function onSubmit(e) {
    e.preventDefault()
    setErrors({})
    try {
      await save.mutateAsync({ ...form, pickup_schedule: data.pickup_schedule })
      toast.success('Settings saved')
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    }
  }

  return (
    <Card as="form" onSubmit={onSubmit} noValidate>
      <CardHeader>
        <CardTitle>Office and fees</CardTitle>
        <CardDescription>Shown in the footer, on pick-up slips and in payment instructions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Office name" required error={errors['registrar_contact.office']}>
            <Input value={contact.office} maxLength={150} onChange={(e) => setContact({ office: e.target.value })} />
          </FormField>
          <FormField label="Email" required error={errors['registrar_contact.email']}>
            <Input type="email" value={contact.email} onChange={(e) => setContact({ email: e.target.value })} />
          </FormField>
          <FormField label="Address" required error={errors['registrar_contact.address']} className="md:col-span-2">
            <Input value={contact.address} maxLength={300} onChange={(e) => setContact({ address: e.target.value })} />
          </FormField>
          <FormField label="Phone" required error={errors['registrar_contact.phone']}>
            <Input value={contact.phone} maxLength={60} onChange={(e) => setContact({ phone: e.target.value })} />
          </FormField>
          <FormField label="Office hours" required error={errors['registrar_contact.hours']}>
            <Input value={contact.hours} maxLength={200} onChange={(e) => setContact({ hours: e.target.value })} />
          </FormField>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Courier fee, Metro Manila (₱)" required error={errors.courier_fee_metro}>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.courier_fee_metro} onChange={(e) => setForm({ ...form, courier_fee_metro: e.target.value })} />
          </FormField>
          <FormField label="Courier fee, provincial (₱)" required error={errors.courier_fee_provincial}>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.courier_fee_provincial} onChange={(e) => setForm({ ...form, courier_fee_provincial: e.target.value })} />
          </FormField>
        </div>
        <FormField
          label="Payment instructions"
          required
          error={errors.payment_instructions}
          help="Shown to students when a request is approved and waiting for payment."
        >
          <Textarea rows={3} maxLength={1000} value={form.payment_instructions} onChange={(e) => setForm({ ...form, payment_instructions: e.target.value })} />
        </FormField>
        <p className="text-[13px] text-muted">Fee changes apply to new and draft requests. Submitted requests keep their original fees.</p>
        <div className="flex justify-end gap-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => { setForm(data); setErrors({}) }}>
              Discard changes
            </Button>
          )}
          <Button type="submit" loading={save.isPending} disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- pick-up hours ----------

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HOURS = Array.from({ length: 12 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`)

function PickupHours() {
  const { data } = useAdminSettings()
  const save = useSaveSettings()
  const [sched, setSched] = useState(null)
  const [errors, setErrors] = useState({})
  useEffect(() => {
    if (data) setSched(data.pickup_schedule)
  }, [data])

  if (!sched) return <Skeleton className="h-80 rounded-2xl" />

  const dirty = JSON.stringify(sched) !== JSON.stringify(data.pickup_schedule)
  const open = (day, hour) => sched.slots[day]?.includes(hour)
  const toggle = (day, hour) =>
    setSched((s) => {
      const times = s.slots[day] ?? []
      const next = times.includes(hour) ? times.filter((t) => t !== hour) : [...times, hour].sort()
      return { ...s, slots: { ...s.slots, [day]: next } }
    })
  const dailyLimit = Number(sched.daily_limit) || 0
  const perWeek = Object.values(sched.slots).reduce(
    (n, times) => n + Math.min(times.length * (Number(sched.capacity) || 0), dailyLimit),
    0,
  )

  async function onSubmit(e) {
    e.preventDefault()
    setErrors({})
    try {
      await save.mutateAsync({
        ...data,
        pickup_schedule: {
          ...sched,
          capacity: Number(sched.capacity),
          daily_limit: Number(sched.daily_limit),
          days_ahead: Number(sched.days_ahead),
        },
      })
      toast.success('Pick-up hours saved')
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    }
  }

  return (
    <Card as="form" onSubmit={onSubmit} noValidate>
      <CardHeader>
        <CardTitle>Pick-up appointments</CardTitle>
        <CardDescription>
          The hours students can book to collect their documents. Each slot is one hour. Once a day reaches its
          limit, students have to choose another day. Closed days have no slots.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
            <caption className="sr-only">Open pick-up hours by weekday</caption>
            <thead>
              <tr>
                <th scope="col" className="w-28 text-left font-medium text-muted">
                  <span className="sr-only">Day</span>
                </th>
                {HOURS.map((h) => (
                  <th key={h} scope="col" className="text-center text-xs font-medium text-muted">
                    {formatSlot(h).replace(':00', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((name, d) => (
                <tr key={name}>
                  <th scope="row" className="pr-2 text-left font-medium text-fg">
                    {name}
                  </th>
                  {HOURS.map((h) => {
                    const on = open(String(d), h)
                    return (
                      <td key={h}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`${name} ${formatSlot(h)}`}
                          onClick={() => toggle(String(d), h)}
                          className={cn(
                            'h-8 w-full rounded-md border transition-colors',
                            on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong bg-surface hover:bg-surface-muted',
                          )}
                        >
                          {on && <span aria-hidden="true">✓</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Students per slot"
            required
            error={errors['pickup_schedule.capacity']}
            help="How many students the window can serve in one hour."
          >
            <Input type="number" min="1" max="100" inputMode="numeric" value={sched.capacity} onChange={(e) => setSched({ ...sched, capacity: e.target.value })} />
          </FormField>
          <FormField
            label="Students per day"
            required
            error={errors['pickup_schedule.daily_limit']}
            help="The most pick-ups in one day, across all its hours."
          >
            <Input type="number" min="1" max="500" inputMode="numeric" value={sched.daily_limit} onChange={(e) => setSched({ ...sched, daily_limit: e.target.value })} />
          </FormField>
          <FormField
            label="Book up to (days ahead)"
            required
            error={errors['pickup_schedule.days_ahead']}
            help="Students can choose a day from today up to this many days later."
          >
            <Input type="number" min="1" max="60" inputMode="numeric" value={sched.days_ahead} onChange={(e) => setSched({ ...sched, days_ahead: e.target.value })} />
          </FormField>
        </div>
        <p className="text-[13px] text-muted">
          Up to {perWeek} pick-ups a week. Changes apply to new bookings; existing bookings keep their time.
        </p>
        <div className="flex justify-end gap-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => { setSched(data.pickup_schedule); setErrors({}) }}>
              Discard changes
            </Button>
          )}
          <Button type="submit" loading={save.isPending} disabled={!dirty}>
            Save pick-up hours
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- holidays ----------

function Holidays() {
  const { data, isLoading, error, refetch } = useHolidays()
  const add = useAddHoliday()
  const del = useDeleteHoliday()
  const [form, setForm] = useState({ date: '', name: '' })
  const [errors, setErrors] = useState({})
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const upcoming = data?.filter((h) => h.date >= today) ?? []
  const past = data?.filter((h) => h.date < today) ?? []

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!form.date) next.date = 'Choose a date.'
    if (form.name.trim().length < 2) next.name = 'Give it a name.'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await add.mutateAsync({ date: form.date, name: form.name.trim() })
      setForm({ date: '', name: '' })
      toast.success('Closed day added')
    } catch (err) {
      setErrors(fieldErrors(err))
      if (!Object.keys(fieldErrors(err)).length) toast.error(errorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closed days</CardTitle>
        <CardDescription>Holidays and office closures. Estimated release dates skip these days.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} noValidate className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-start">
          <FormField label="Date" required error={errors.date}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </FormField>
          <FormField label="Name" required error={errors.name}>
            <Input value={form.name} maxLength={150} placeholder="e.g. Foundation Day" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <Button type="submit" variant="secondary" className="h-11 sm:mt-[26px]" loading={add.isPending}>
            {!add.isPending && <Plus />} Add
          </Button>
        </form>
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <Skeleton className="h-40" />
        ) : upcoming.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-muted px-4 py-6 text-sm text-muted">
            <CalendarOff className="size-4" aria-hidden="true" /> No upcoming closed days.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <span className="w-36 shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-fg">{formatDate(h.date, { weekday: 'short' })}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{h.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${h.name}`}
                  disabled={del.isPending}
                  onClick={() => del.mutateAsync(h.id).then(() => toast.success('Closed day removed')).catch((err) => toast.error(errorMessage(err)))}
                >
                  <Trash2 className="text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && <p className="text-xs text-subtle">{past.length} past closed days kept for history.</p>}
      </CardContent>
    </Card>
  )
}

// ---------- reminders ----------

function Reminders() {
  const run = useRunReminders()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders</CardTitle>
        <CardDescription>
          Checked automatically every hour. Students get an “Action needed” reminder when a request has waited on them
          for more than 2 days (correction, payment or pick-up; at most 3 per step, every 2 days), and a one-time notice
          when the Registrar is more than 2 days past the estimated release date. Emails go to their university and
          confirmed personal address unless they turned reminder emails off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="secondary"
          loading={run.isPending}
          onClick={async () => {
            try {
              const r = await run.mutateAsync()
              const total = r.action_reminders + r.late_notices
              toast.success(
                total
                  ? `Sent ${r.action_reminders} action-needed reminder${r.action_reminders === 1 ? '' : 's'} and ${r.late_notices} running-late notice${r.late_notices === 1 ? '' : 's'}.`
                  : 'Nothing is due right now.',
              )
            } catch (err) {
              toast.error(errorMessage(err))
            }
          }}
        >
          Send due reminders now
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------- announcements ----------

const STATE = {
  live: { label: 'Live', className: 'bg-success-soft text-success' },
  scheduled: { label: 'Scheduled', className: 'bg-info-soft text-info' },
  expired: { label: 'Ended', className: 'bg-surface-muted text-muted' },
  hidden: { label: 'Hidden', className: 'bg-surface-muted text-muted' },
}

/** <input type="datetime-local"> works in the browser's local time; the API stores UTC. */
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

function Announcements() {
  const { data, isLoading, error, refetch } = useAdminAnnouncements()
  const del = useDeleteAnnouncement()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Announcements</CardTitle>
          <CardDescription>Banners on the student home page.</CardDescription>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing({})}>
          <Plus /> New
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <Skeleton className="h-40" />
        ) : data.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-muted px-4 py-6 text-sm text-muted">
            <Megaphone className="size-4" aria-hidden="true" /> No announcements yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                    {a.title}
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATE[a.state].className)}>
                      {STATE[a.state].label}
                    </span>
                    {a.level === 'warning' && <span className="text-[11px] font-semibold text-warning">Important</span>}
                  </p>
                  <p className="line-clamp-2 text-[13px] text-muted">{a.body}</p>
                  {(a.starts_at || a.ends_at) && (
                    <p className="mt-0.5 text-xs text-subtle">
                      {a.starts_at ? formatDateTime(a.starts_at) : 'Now'} – {a.ends_at ? formatDateTime(a.ends_at) : 'until hidden'}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}>
                  <Trash2 className="text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AnnouncementDialog item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this announcement?"
        description={`“${deleting?.title ?? ''}” will be removed for everyone. To take it down temporarily, edit it and untick “Show”.`}
        confirmLabel="Delete"
        danger
        pending={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await del.mutateAsync(deleting.id)
            toast.success('Announcement deleted')
          } catch (err) {
            toast.error(errorMessage(err))
          }
          setDeleting(null)
        }}
      />
    </Card>
  )
}

function AnnouncementDialog({ item, onClose }) {
  const save = useSaveAnnouncement()
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (!item) return
    setErrors({})
    setFormError(null)
    setForm({
      title: item.title ?? '',
      body: item.body ?? '',
      level: item.level ?? 'info',
      starts_at: toLocalInput(item.starts_at),
      ends_at: toLocalInput(item.ends_at),
      is_active: item.is_active ?? true,
    })
  }, [item])

  async function onSubmit(e) {
    e.preventDefault()
    setErrors({})
    setFormError(null)
    try {
      await save.mutateAsync({
        id: item.id,
        body: { ...form, starts_at: fromLocalInput(form.starts_at), ends_at: fromLocalInput(form.ends_at) },
      })
      toast.success(item.id ? 'Announcement updated' : 'Announcement posted')
      onClose()
    } catch (err) {
      const byField = fieldErrors(err)
      setErrors(byField)
      const general = (apiError(err).details ?? []).find((d) => !d.field)
      setFormError(general ? general.message.replace(/^Value error, /, '') : Object.keys(byField).length ? null : errorMessage(err))
    }
  }

  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{item?.id ? 'Edit announcement' : 'New announcement'}</DialogTitle>
        <DialogDescription>Students see it at the top of their home page while it’s live.</DialogDescription>
        <form id="announcement-form" onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          {formError && <p className="text-[13px] font-medium text-danger">{formError}</p>}
          <FormField label="Title" required error={errors.title}>
            <Input value={form.title ?? ''} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          <FormField label="Message" required error={errors.body}>
            <Textarea rows={3} maxLength={2000} value={form.body ?? ''} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </FormField>
          <FormField label="Style" required>
            <Select value={form.level ?? 'info'} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option value="info">Information</option>
              <option value="warning">Important</option>
            </Select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts" help="Leave empty to start now." error={errors.starts_at}>
              <Input type="datetime-local" value={form.starts_at ?? ''} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </FormField>
            <FormField label="Ends" help="Leave empty to keep it up." error={errors.ends_at}>
              <Input type="datetime-local" value={form.ends_at ?? ''} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </FormField>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium text-fg">
            <Checkbox checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Show
          </label>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="announcement-form" loading={save.isPending}>
            {item?.id ? 'Save' : 'Post'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
