import { Check } from 'lucide-react'

import { IN_PROGRESS, stageIndex, stagesFor } from '@/lib/status'
import { cn } from '@/lib/utils'

/** Student-facing progress through simplified stages. */
export function ProgressStepper({ status, requiresPayment = true, history, compact = false, className }) {
  const stages = stagesFor(requiresPayment)
  const current = stageIndex(status, stages, history)
  const halted = status === 'rejected' || status === 'cancelled'
  const done = status === 'completed'

  return (
    <ol className={cn('flex w-full items-start', className)} aria-label="Request progress">
      {stages.map((stage, i) => {
        const complete = done || i < current
        const active = !done && i === current
        const stateLabel = complete ? 'completed' : active ? (halted ? 'stopped here' : 'current step') : 'upcoming'
        return (
          <li
            key={stage.key}
            className="relative flex flex-1 flex-col items-center"
            aria-current={active ? 'step' : undefined}
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute right-1/2 top-[11px] h-0.5 w-full -translate-y-1/2',
                  complete || active ? 'bg-[var(--state-done)]' : 'bg-border-strong',
                  halted && active && 'bg-border-strong',
                )}
              />
            )}
            {/* Done steps are green; the current one wears its status color (yellow: your turn, light green: the
                Registrar is on it, red/gray: stopped). */}
            {/* Pulses behind the current step while the Registrar is on it; a step waiting on the student stays still. */}
            {active && IN_PROGRESS.includes(status) && (
              <span data-status={status} className="status-pulse left-[calc(50%-11px)] top-0 size-[22px]" aria-hidden="true" />
            )}
            <span
              data-status={active ? status : undefined}
              className={cn(
                'relative z-10 flex size-[22px] items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
                complete && 'border-[var(--state-done)] bg-[var(--state-done)] text-white',
                active && !halted && 'status-ring border-[var(--s)] bg-surface',
                active && halted && 'status-dot border-transparent text-white',
                !complete && !active && 'border-border-strong bg-surface text-subtle',
              )}
            >
              {complete ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : active && !halted ? (
                <span className="status-dot size-2 rounded-full" />
              ) : null}
            </span>
            <span
              className={cn(
                'mt-1.5 text-center font-medium leading-tight',
                compact ? 'text-[10.5px] sm:text-[11px]' : 'text-[11px] sm:text-xs',
                active ? 'text-fg' : complete ? 'text-muted' : 'text-subtle',
              )}
            >
              {stage.label}
              <span className="sr-only"> ({stateLabel})</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
