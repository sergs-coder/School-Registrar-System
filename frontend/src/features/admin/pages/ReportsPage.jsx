import { CalendarCheck, CircleCheck, Clock, Download, Inbox, Layers, Wallet } from 'lucide-react'
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'

import { ErrorState, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadCsv, useReport } from '@/features/admin/api'
import { errorMessage } from '@/lib/errors'
import { PAYMENT_METHODS } from '@/lib/status'
import { cn, formatDate, formatPeso } from '@/lib/utils'

const manilaDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}
const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]
const SERIES = [
  { key: 'submitted', label: 'Submitted', color: 'var(--series-1)' },
  { key: 'completed', label: 'Released', color: 'var(--series-2)' },
]

export function ReportsPage() {
  const [range, setRange] = useState({ date_from: manilaDay(-29), date_to: manilaDay() })
  const [exporting, setExporting] = useState(null)
  const { data, isLoading, isFetching, error, refetch } = useReport(range)
  const valid = range.date_from && range.date_to && range.date_from <= range.date_to

  async function exportCsv(kind) {
    setExporting(kind)
    try {
      await downloadCsv(`/admin/reports/${kind}.csv`, range, `${kind}.csv`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(null)
    }
  }

  const t = data?.totals
  const tiles = [
    { label: 'Submitted', value: t?.submitted, icon: Inbox },
    { label: 'Released', value: t?.completed, icon: CircleCheck },
    { label: 'Fees collected', value: t && formatPeso(t.revenue), icon: Wallet },
    { label: 'Avg. turnaround', value: t && (t.avg_turnaround_days == null ? '—' : `${t.avg_turnaround_days} days`), icon: Clock },
    { label: 'Released on time', value: t && (t.on_time_rate == null ? '—' : `${Math.round(t.on_time_rate * 100)}%`), icon: CalendarCheck },
    { label: 'Open right now', value: t?.open, icon: Layers },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Volume, turnaround and fees for the dates you choose (Manila time). Exports include student details, so each one is logged."
      />

      {/* Filters and exports: one row above everything they control. */}
      <div className="flex flex-wrap items-end gap-2">
        <div role="group" aria-label="Quick ranges" className="flex rounded-lg border border-border-strong bg-surface p-0.5">
          {PRESETS.map((p) => {
            const active = range.date_to === manilaDay() && range.date_from === manilaDay(-(p.days - 1))
            return (
              <button
                key={p.days}
                type="button"
                aria-pressed={active}
                onClick={() => setRange({ date_from: manilaDay(-(p.days - 1)), date_to: manilaDay() })}
                className={cn('h-9 rounded-md px-3 text-sm font-medium', active ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg')}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="From" className="h-10 w-[150px]" value={range.date_from} max={range.date_to}
            onChange={(e) => setRange((r) => ({ ...r, date_from: e.target.value }))} />
          <span className="text-muted" aria-hidden="true">–</span>
          <Input type="date" aria-label="To" className="h-10 w-[150px]" value={range.date_to} min={range.date_from}
            onChange={(e) => setRange((r) => ({ ...r, date_to: e.target.value }))} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" className="h-10" disabled={!valid} loading={exporting === 'requests'} onClick={() => exportCsv('requests')}>
            {exporting !== 'requests' && <Download />} Requests CSV
          </Button>
          <Button variant="secondary" className="h-10" disabled={!valid} loading={exporting === 'payments'} onClick={() => exportCsv('payments')}>
            {exporting !== 'payments' && <Download />} Payments CSV
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && !isLoading && 'opacity-70')}>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {tiles.map(({ label, value, icon: Icon }) => (
              <Card key={label} className="flex flex-col gap-3 p-4">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary dark:text-primary-300">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <div>
                  {isLoading ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-semibold leading-8 tabular-nums text-fg">{value}</p>}
                  <p className="mt-1 text-[13px] text-muted">{label}</p>
                </div>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Requests per day</CardTitle>
              <CardDescription>Submitted and released each day in the selected range.</CardDescription>
            </CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-72" /> : <TrendChart days={data.daily} />}</CardContent>
          </Card>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>By document</CardTitle>
                <CardDescription>Fees are payments verified in the range; turnaround is from submission to release.</CardDescription>
              </CardHeader>
              <CardContent>{isLoading ? <Skeleton className="h-64" /> : <DocumentTable rows={data.by_document} />}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Fees by payment method</CardTitle>
                <CardDescription>Verified payments only.</CardDescription>
              </CardHeader>
              <CardContent>{isLoading ? <Skeleton className="h-48" /> : <MethodBars rows={data.by_method} />}</CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function TrendChart({ days }) {
  const rows = days.map((d) => ({ ...d, label: formatDate(d.date, { year: undefined }) }))
  const totals = Object.fromEntries(SERIES.map((s) => [s.key, rows.reduce((n, r) => n + r[s.key], 0)]))
  const last = rows.length - 1

  // Direct label at each line's end so identity never relies on color alone.
  const endLabel = (series) =>
    function EndLabel({ x, y, index }) {
      if (index !== last) return null
      return (
        <text x={x + 6} y={y} dy={4} fontSize={12} fontWeight={600} fill="var(--text-muted)">
          {series.label}
        </text>
      )
    }

  return (
    <>
      <ul className="mb-3 flex flex-wrap gap-4 text-sm" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-muted">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {s.label} <span className="font-semibold tabular-nums text-fg">{totals[s.key]}</span>
          </li>
        ))}
      </ul>
      <div className="h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {/* Hidden from assistive tech (the table below has the same numbers), so no keyboard stop either. */}
          <LineChart data={rows} accessibilityLayer={false} margin={{ top: 8, right: 72, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--border-strong)' }}
              tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} width={40} />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-pop">
                    <p className="mb-1 text-muted">{formatDate(payload[0].payload.date, { weekday: 'short' })}</p>
                    {SERIES.map((s) => (
                      <p key={s.key} className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                        <span className="text-muted">{s.label}</span>
                        <span className="ml-auto pl-4 font-semibold tabular-nums text-fg">{payload[0].payload[s.key]}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                label={endLabel(s)}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Requests submitted and released per day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <td>{formatDate(r.date)}</td>
              {SERIES.map((s) => (
                <td key={s.key}>{r[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function DocumentTable({ rows }) {
  if (rows.length === 0) return <p className="rounded-xl bg-surface-muted px-4 py-6 text-center text-sm text-muted">No requests in this range.</p>
  const max = Math.max(1, ...rows.map((r) => r.submitted))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3">Document</th>
            <th scope="col" className="w-44 px-3 py-2">Submitted</th>
            <th scope="col" className="px-3 py-2 text-right">Released</th>
            <th scope="col" className="px-3 py-2 text-right">Fees</th>
            <th scope="col" className="py-2 pl-3 text-right">Avg. days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.code}>
              <th scope="row" className="py-2.5 pr-3 text-left font-medium text-fg">
                {r.name}
                <span className="ml-1.5 font-mono text-xs font-normal text-muted">{r.code}</span>
              </th>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="h-3 flex-1 rounded-r bg-surface-muted/70" aria-hidden="true">
                    <span className="block h-full rounded-r" style={{ width: `max(${(r.submitted / max) * 100}%, 3px)`, background: 'var(--series-1)' }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-fg">{r.submitted}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.completed}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatPeso(r.revenue)}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{r.avg_turnaround_days ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MethodBars({ rows }) {
  if (rows.length === 0) return <p className="rounded-xl bg-surface-muted px-4 py-6 text-center text-sm text-muted">No verified payments in this range.</p>
  const max = Math.max(1, ...rows.map((r) => Number(r.amount)))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.method}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted">
              {PAYMENT_METHODS[r.method]?.label ?? r.method} <span className="text-xs">· {r.count}</span>
            </span>
            <span className="font-semibold tabular-nums text-fg">{formatPeso(r.amount)}</span>
          </div>
          <span className="block h-3 rounded-r bg-surface-muted/70" aria-hidden="true">
            <span className="block h-full rounded-r" style={{ width: `max(${(Number(r.amount) / max) * 100}%, 3px)`, background: 'var(--series-1)' }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
