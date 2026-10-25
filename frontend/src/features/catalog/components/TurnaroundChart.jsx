import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'

const BLOCKS = 5
const DAYS_PER_BLOCK = 2 // 2 days fills 1 block, 10 or more fills all 5

// Each block keeps its own color, quick to longer: green, yellow-green, yellow, yellow-red, red (tokens.css).
const BLOCK_COLORS = Array.from({ length: BLOCKS }, (_, i) => `var(--meter-${i + 1})`)
// Words for screen readers, so the speed is never told by color alone.
const TIERS = [
  { label: 'quick', max: 3 },
  { label: 'moderate', max: 5 },
  { label: 'longer', max: Infinity },
]

const tierFor = (days) => TIERS.find((t) => days <= t.max)
const blocksFor = (days) => (days <= 0 ? 0 : Math.min(BLOCKS, Math.ceil(days / DAYS_PER_BLOCK)))
const dayCount = (n) => (n === 0 ? 'Same day' : `${n} working ${n === 1 ? 'day' : 'days'}`)
const readyBy = (date) => formatDate(date, { weekday: 'short', year: undefined })

/**
 * Working days from approval to release for each document, fastest first, as a 5-block meter (green to red
 * by block), with the date it would be ready if approved today. Plain HTML (no chart library) so the student
 * bundle stays small and each row re-flows on narrow screens: name and date on one line, meter underneath.
 */
export function TurnaroundChart({ docs }) {
  if (docs.length === 0) return null
  const rows = [...docs].sort((a, b) => a.processing_days - b.processing_days || a.name.localeCompare(b.name))

  return (
    <Card as="section" id="processing-times" aria-labelledby="processing-times-title" className="scroll-mt-24">
      <CardHeader>
        <CardTitle id="processing-times-title">How long each document takes</CardTitle>
        <CardDescription>
          Working days from approval to release. Example dates assume your request is approved today; weekends and the
          Registrar’s closed days don’t count. For documents with a fee, the count starts once your payment is verified.
        </CardDescription>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-fg">Quick</span>
            <span className="flex gap-0.5" aria-hidden="true">
              {BLOCK_COLORS.map((c) => (
                <span key={c} className="h-2.5 w-4 rounded-[3px]" style={{ background: c }} />
              ))}
            </span>
            <span className="font-medium text-fg">Longer</span>
          </span>
          <span className="text-subtle">Each block ≈ {DAYS_PER_BLOCK} working days</span>
        </p>
      </CardHeader>
      <CardContent>
        <ol className="-mx-2 divide-y divide-border">
          {rows.map((d) => {
            const tier = tierFor(d.processing_days)
            const filled = blocksFor(d.processing_days)
            return (
              <li key={d.id}>
                <Link
                  to={`/requests/new/${d.slug}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:gap-x-4"
                >
                  <span className="text-sm font-medium text-fg sm:col-start-1 sm:row-start-1">{d.name}</span>
                  <span className="self-start whitespace-nowrap text-right text-xs text-muted sm:col-start-3 sm:row-start-1 sm:self-center sm:text-sm">
                    <span className="sr-only">
                      {dayCount(d.processing_days)}, {tier.label}.{' '}
                    </span>
                    Ready {readyBy(d.ready_if_approved_today)}
                  </span>
                  <span className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:col-start-2 sm:row-start-1" aria-hidden="true">
                    <span className="flex w-40 shrink-0 gap-0.5 sm:w-48">
                      {Array.from({ length: BLOCKS }, (_, i) => (
                        <span
                          key={i}
                          className={cn('h-3 flex-1 rounded-[3px] transition-opacity group-hover:opacity-85 sm:h-3.5', i >= filled && 'bg-border')}
                          style={i < filled ? { background: BLOCK_COLORS[i] } : undefined}
                        />
                      ))}
                    </span>
                    <span className="whitespace-nowrap text-xs font-medium tabular-nums text-muted">{dayCount(d.processing_days)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
