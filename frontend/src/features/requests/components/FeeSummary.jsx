import { CalendarClock, Clock } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatPeso } from '@/lib/utils'

export function FeeSummary({ lines, total, loading, requiresPayment = true }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    )
  }
  if (!requiresPayment || Number(total) === 0) {
    return <p className="text-sm font-semibold text-success">No fee for this request</p>
  }
  return (
    <div className="space-y-2 text-sm">
      <ul className="space-y-1.5">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3 text-muted">
            <span>{l.label}</span>
            <span className="tabular-nums text-fg">{formatPeso(l.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <span className="font-semibold text-fg">Total</span>
        <span className="text-lg font-semibold tabular-nums text-fg">{formatPeso(total)}</span>
      </div>
    </div>
  )
}

export function TimingSummary({ processingDays, estimatedDate }) {
  return (
    <ul className="space-y-2 text-sm text-muted">
      <li className="flex items-center gap-2">
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        Processing: about {processingDays} working {processingDays === 1 ? 'day' : 'days'}
      </li>
      {estimatedDate && (
        <li className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Est. release if submitted today: <strong className="font-semibold text-fg">{formatDate(estimatedDate)}</strong>
          </span>
        </li>
      )}
    </ul>
  )
}
