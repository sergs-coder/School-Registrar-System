import { CalendarCheck, CalendarX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ErrorState } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookPickup, useCancelPickup, usePickupSlots } from '@/features/requests/api'
import { errorMessage } from '@/lib/errors'
import { cn, formatDate, formatSlot } from '@/lib/utils'

const dayLabel = (date) => formatDate(date, { weekday: 'short', year: undefined })

/** Lets the student choose when to collect a document that is ready for pick-up. */
export function PickupCard({ request: r }) {
  const canBook = r.allowed_actions.includes('book_pickup')
  const appointment = r.pickup_appointment
  const [editing, setEditing] = useState(false)
  const cancel = useCancelPickup(r.reference_no)

  if (!canBook) return null
  const picking = editing || !appointment

  return (
    <Card id="pickup">
      <CardHeader>
        <CardTitle>Pick-up time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {appointment && !editing && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CalendarCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div>
                <p className="font-semibold text-fg">{appointment.label}</p>
                <p className="text-sm text-muted">Bring a valid ID and your pick-up slip. Please arrive on time.</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Change time
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={cancel.isPending}
                onClick={async () => {
                  try {
                    await cancel.mutateAsync()
                    toast.success('Pick-up time cancelled')
                  } catch (err) {
                    toast.error(errorMessage(err))
                  }
                }}
              >
                {!cancel.isPending && <CalendarX />} Cancel booking
              </Button>
            </div>
          </div>
        )}
        {picking && (
          <SlotPicker
            reference={r.reference_no}
            current={appointment}
            onDone={() => setEditing(false)}
            onCancel={appointment ? () => setEditing(false) : null}
          />
        )}
      </CardContent>
    </Card>
  )
}

function SlotPicker({ reference, current, onDone, onCancel }) {
  const { data, isLoading, error, refetch } = usePickupSlots(reference)
  const book = useBookPickup(reference)
  const [day, setDay] = useState(current?.date ?? null)
  const [time, setTime] = useState(null)

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isLoading) return <Skeleton className="h-40 rounded-xl" />
  if (data.days.length === 0) {
    return (
      <Alert tone="info" title="No pick-up times are open right now">
        Please check again later, or contact the Registrar’s Office.
      </Alert>
    )
  }

  // Start on the student's current day, else the first day that still has room.
  const selectedDay = data.days.find((d) => d.date === day) ?? data.days.find((d) => d.left > 0) ?? data.days[0]
  const dayFull = selectedDay.left === 0
  const chosen = time && selectedDay.slots.find((s) => s.time === time && s.left > 0)

  async function confirm() {
    try {
      await book.mutateAsync({ date: selectedDay.date, time: chosen.time })
      toast.success(current ? 'Pick-up time changed' : 'Pick-up time booked')
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
      setTime(null)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {current ? 'Choose a new time.' : 'Choose when you’ll come, so you won’t have to wait long at the window.'}
      </p>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-fg">Day</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {data.days.map((d) => {
            const open = d.left > 0 && d.slots.some((s) => s.left > 0)
            const selected = d.date === selectedDay.date
            return (
              <button
                key={d.date}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setDay(d.date)
                  setTime(null)
                }}
                className={cn(
                  'shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  selected ? 'border-primary bg-primary-soft text-fg' : 'border-border-strong hover:bg-surface-muted',
                  !open && 'text-subtle',
                )}
              >
                <span className="block font-medium">{dayLabel(d.date)}</span>
                <span className="block text-xs text-muted">{open ? `${d.left} ${d.left === 1 ? 'spot' : 'spots'} left` : 'Full'}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
      {dayFull && (
        <Alert tone="warning" title={`${dayLabel(selectedDay.date)} is fully booked`}>
          Please choose another day.
        </Alert>
      )}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-fg">Time</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {selectedDay.slots.map((s) => {
            const full = s.left === 0
            const selected = chosen?.time === s.time
            return (
              <button
                key={s.time}
                type="button"
                disabled={full}
                aria-pressed={selected}
                onClick={() => setTime(s.time)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle',
                  selected ? 'border-primary bg-primary-soft text-fg' : 'border-border-strong hover:bg-surface-muted',
                )}
              >
                <span className="block font-medium">{formatSlot(s.time)}</span>
                <span className="block text-xs text-muted">{full ? 'Full' : `${s.left} left`}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!chosen} loading={book.isPending} onClick={confirm}>
          {chosen ? `Book ${dayLabel(selectedDay.date)}, ${formatSlot(chosen.time)}` : 'Choose a time'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Keep {current.label}
          </Button>
        )}
      </div>
    </div>
  )
}
