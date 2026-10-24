import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'

const dayCount = (n) => (n === 0 ? 'Same day' : `${n} working ${n === 1 ? 'day' : 'days'}`)
const readyBy = (date) => formatDate(date, { weekday: 'short', year: undefined })

/**
 * Working days from approval to release for each document, fastest first, with the date it would be ready
 * if approved today. Plain HTML bars (no chart library) so the student bundle stays small and each row can
 * re-flow on narrow screens: name and date on one line, bar underneath.
 */
export function TurnaroundChart({ docs, allDocs = docs }) {
  if (docs.length === 0) return null
  const rows = [...docs].sort((a, b) => a.processing_days - b.processing_days || a.name.localeCompare(b.name))
  // Scale against every document, not just the filtered ones, so a bar means the same length on every tab.
  const max = Math.max(1, ...allDocs.map((d) => d.processing_days))

  return (
    <Card as="section" id="processing-times" aria-labelledby="processing-times-title" className="scroll-mt-24">
      <CardHeader>
        <CardTitle id="processing-times-title">How long each document takes</CardTitle>
        <CardDescription>
          Working days from approval to release. Example dates assume your request is approved today; weekends and the
          Registrar’s closed days don’t count. For documents with a fee, the count starts once your payment is verified.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="-mx-2 divide-y divide-border">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                to={`/requests/new/${d.slug}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:gap-x-4"
              >
                <span className="text-sm font-medium text-fg sm:col-start-1 sm:row-start-1">{d.name}</span>
                <span className="self-start whitespace-nowrap text-right text-xs text-muted sm:col-start-3 sm:row-start-1 sm:self-center sm:text-sm">
                  <span className="sr-only">{dayCount(d.processing_days)}. </span>
                  Ready {readyBy(d.ready_if_approved_today)}
                </span>
                <span className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1" aria-hidden="true">
                  <span
                    className="h-3 shrink-0 rounded-r-[4px] bg-[var(--series-1)] transition-opacity group-hover:opacity-85 sm:h-4"
                    // Leave room after the bar for its label, so the longest bar's label still fits.
                    style={{ width: d.processing_days ? `max(4px, calc((100% - 6.5rem) * ${d.processing_days / max}))` : 0 }}
                  />
                  <span className="whitespace-nowrap text-xs font-medium tabular-nums text-muted">{dayCount(d.processing_days)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
