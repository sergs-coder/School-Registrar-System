import { Lock, Wallet } from 'lucide-react'

import { STATUS } from '@/lib/status'
import { cn, formatDateTime } from '@/lib/utils'

/** Full history, newest first: every transition with actor and remarks. Internal notes are staff-only. */
export function StatusTimeline({ history }) {
  const items = [...history].reverse()
  return (
    <ol className="relative space-y-6">
      {items.map((h, i) => {
        const isNote = h.is_internal && h.from_status === h.to_status
        // Same-status, student-visible entries are updates within a step (e.g., a payment proof sent or rejected).
        const isUpdate = !h.is_internal && h.from_status === h.to_status
        const meta = STATUS[h.to_status] ?? STATUS.draft
        const isPayment = isUpdate && h.to_status === 'awaiting_payment'
        const Icon = isNote ? Lock : isPayment ? Wallet : meta.icon
        return (
          <li key={h.id} className="relative flex gap-4">
            {i < items.length - 1 && (
              <span aria-hidden="true" className="absolute left-[15px] top-9 h-[calc(100%-12px)] w-px bg-border-strong" />
            )}
            <span
              data-status={isNote ? undefined : h.to_status}
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full',
                isNote ? 'bg-accent-soft text-accent-700 ring-1 ring-accent/40 dark:text-accent-300' : 'status-chip',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                {isNote ? (
                  <span className="font-semibold text-fg">Internal note</span>
                ) : (
                  <span data-status={h.to_status} className="status-text font-semibold">
                    {isPayment ? 'Payment update' : isUpdate ? `${meta.label} · update` : meta.label}
                  </span>
                )}
                <span className="text-muted">by {h.actor_name}</span>
                {h.is_internal && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-800 dark:text-accent-200">
                    Staff only
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-subtle">
                <time dateTime={h.created_at}>{formatDateTime(h.created_at)}</time>
              </p>
              {h.remarks && (
                <p
                  className={cn(
                    'mt-2 whitespace-pre-line rounded-lg border px-3 py-2 text-sm text-fg',
                    isNote ? 'border-accent/30 bg-accent-soft' : 'border-border bg-surface-muted',
                  )}
                >
                  {h.remarks}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
