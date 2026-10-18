import { Check } from 'lucide-react'

import { stageIndex, stagesFor } from '@/lib/status'
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
                  complete || active ? 'bg-primary' : 'bg-border-strong',
                  halted && active && 'bg-border-strong',
                )}
              />
            )}
            <span
              data-status={active ? status : undefined}
              className={cn(
                'relative z-10 flex size-[22px] items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
                complete && 'border-primary bg-primary text-on-primary',
                active && !halted && 'status-ring border-primary bg-surface text-primary',
                active && halted && 'status-dot border-transparent text-white',
                !complete && !active && 'border-border-strong bg-surface text-subtle',
              )}
            >
              {complete ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : active && !halted ? (
                <span className="size-2 rounded-full bg-primary" />
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
