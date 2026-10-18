import { CalendarClock, ChevronRight, Package, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ProgressStepper } from '@/components/shared/ProgressStepper'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TERMINAL } from '@/lib/status'
import { cn, formatDate, formatPeso } from '@/lib/utils'

const CTA = {
  draft: 'Continue draft',
  needs_correction: 'Fix and resubmit',
  awaiting_payment: 'See payment details',
  ready_for_pickup: 'See pick-up details',
}

export function requestHref(r) {
  return r.status === 'draft' ? `/requests/${r.reference_no}/edit` : `/requests/${r.reference_no}`
}

export function RequestCard({ request: r, className }) {
  const requiresPayment = Number(r.fee_total) > 0
  const showStepper = r.status !== 'draft' && !TERMINAL.includes(r.status)
  const DeliveryIcon = r.delivery_method === 'courier' ? Truck : Package

  return (
    <Card className={cn('group relative transition-shadow duration-150 hover:shadow-pop', className)}>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-fg">
              <Link to={requestHref(r)} className="after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
                {r.document_type.name}
              </Link>
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
              <span className="font-mono tabular-nums">{r.reference_no}</span>
              <span aria-hidden="true">·</span>
              <span>
                {r.copies} {r.copies === 1 ? 'copy' : 'copies'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <DeliveryIcon className="size-3.5" aria-hidden="true" />
                {r.delivery_method === 'courier' ? 'Courier' : 'Pick-up'}
              </span>
            </p>
          </div>
          <StatusBadge status={r.status} size="sm" />
        </div>

        {showStepper && <ProgressStepper status={r.status} requiresPayment={requiresPayment} compact />}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-[13px]">
          <span className="flex items-center gap-1.5 text-muted">
            {r.status === 'draft' ? (
              <>Last saved {formatDate(r.updated_at)}</>
            ) : TERMINAL.includes(r.status) ? (
              <>Closed {formatDate(r.updated_at)}</>
            ) : (
              <>
                <CalendarClock className="size-3.5" aria-hidden="true" />
                Est. release <strong className="font-semibold text-fg">{formatDate(r.estimated_release_date)}</strong>
              </>
            )}
          </span>
          <span className="flex items-center gap-0.5 font-semibold text-link">
            {CTA[r.status] ?? (requiresPayment ? formatPeso(r.fee_total) : 'View')}
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Card>
  )
}

export function RequestCardSkeleton() {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-1/3" />
    </Card>
  )
}
