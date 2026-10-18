import { ArrowLeft, ArrowRight, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function WizardProgress({ steps, current, onJump, maxReached }) {
  return (
    <nav aria-label="Request steps">
      <ol className="flex items-center gap-2">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          const reachable = i <= maxReached && !active
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onJump(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full text-sm font-medium',
                  reachable && 'cursor-pointer hover:text-fg',
                  !reachable && !active && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                    done && 'border-primary bg-primary text-on-primary',
                    active && 'border-primary text-link',
                    !done && !active && 'border-border-strong text-subtle',
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className={cn('hidden sm:inline', active ? 'text-fg' : 'text-muted')}>{s.label}</span>
                <span className="sr-only">{done ? ' (done)' : active ? ' (current)' : ''}</span>
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-primary' : 'bg-border-strong')} />
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-sm text-muted sm:hidden">
        Step {current + 1} of {steps.length}: <span className="font-medium text-fg">{steps[current].label}</span>
      </p>
    </nav>
  )
}

export function StepActions({ onBack, saving, nextLabel = 'Save and continue', nextType = 'submit', onNext, disabled }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-between">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      ) : (
        <span />
      )}
      <Button type={nextType} onClick={onNext} loading={saving} disabled={disabled} size="lg" className="sm:min-w-48">
        {nextLabel} {nextLabel.startsWith('Save') && <ArrowRight />}
      </Button>
    </div>
  )
}
