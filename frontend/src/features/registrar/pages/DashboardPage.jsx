import {
  AlarmClock,
  ArrowRight,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Inbox,
  PackageCheck,
  UserCheck,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorState, PageHeader } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboard, usePickupsOn, useSubmissionTrend } from '@/features/registrar/api'
import { useAuth } from '@/lib/auth'
import { QUEUE_VIEWS, STATUS, TERMINAL } from '@/lib/status'
import { cn, formatDate, formatSlot } from '@/lib/utils'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, error, refetch } = useDashboard()

  if (error) return <ErrorState error={error} onRetry={refetch} />

  const count = (s) => data?.counts.find((c) => c.status === s)?.count ?? 0
  const tiles = [
    { label: 'To review', value: count('submitted') + count('resubmitted'), icon: Inbox, status: 'submitted', to: '/registrar/requests?tab=new' },
    { label: 'Overdue', value: data?.overdue_total, icon: AlarmClock, status: 'rejected', to: '/registrar/requests?overdue=1' },
    { label: 'Payments to verify', value: data?.payments_to_verify, icon: Wallet, status: 'awaiting_payment', to: '/registrar/requests?tab=payment&payment=pending' },
    { label: 'Ready for pick-up', value: count('ready_for_pickup'), icon: PackageCheck, status: 'ready_for_pickup', to: '/registrar/requests?tab=release' },
    { label: 'Assigned to me', value: data?.assigned_to_me, icon: UserCheck, status: 'under_review', to: '/registrar/requests?assigned=me' },
    { label: 'Released this week', value: data?.completed_this_week, icon: CalendarCheck, status: 'completed', to: '/registrar/requests?tab=closed' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${user.staff?.first_name ?? user.display_name}`}
        description={
          data ? `${data.active_total} open requests · ${data.submitted_today} submitted today` : 'Loading today’s numbers…'
        }
      />

      {data?.account_requests_pending > 0 && (
        <Alert
          tone="info"
          icon={GraduationCap}
          title={`${data.account_requests_pending} alumni / former student access ${data.account_requests_pending === 1 ? 'request' : 'requests'} to review`}
          action={
            <Button asChild size="sm" variant="secondary">
              <Link to="/registrar/account-requests">Review</Link>
            </Button>
          }
        >
          Check their details and ID against your records, then approve or reject.
        </Alert>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map(({ label, value, icon: Icon, status, to }) => (
          <Link key={label} to={to} className="group rounded-xl focus-visible:outline-offset-4">
            <Card className="flex h-full items-center gap-3 rounded-xl px-3.5 py-3 transition-shadow group-hover:shadow-pop">
              <span data-status={status} className="status-chip flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                {isLoading ? (
                  <Skeleton className="h-6 w-8" />
                ) : (
                  <p className="text-xl font-semibold leading-6 tabular-nums text-fg">{value}</p>
                )}
                <p className="text-xs leading-4 text-muted">{label}</p>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Open requests by status</CardTitle>
            <CardDescription>Everything not yet released, rejected or cancelled.</CardDescription>
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-64" /> : <StatusBars counts={data.counts} />}</CardContent>
        </Card>
        <SubmissionsCard />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MiniQueue
          title="Overdue"
          description="Past their estimated release date."
          items={data?.overdue}
          total={data?.overdue_total}
          loading={isLoading}
          link="/registrar/requests?overdue=1&sort=estimated_release_date"
          empty="Nothing overdue. Nice work!"
          dateLabel={(r) => (
            <span className="font-semibold text-danger">Due {formatDate(r.estimated_release_date)}</span>
          )}
        />
        <MiniQueue
          title="Waiting for pick-up"
          description="Ready at the counter."
          items={data?.pickups}
          total={count('ready_for_pickup')}
          loading={isLoading}
          link="/registrar/requests?tab=release"
          empty="No documents waiting to be claimed."
          dateLabel={(r) => <span className="text-muted">Ready since {formatDate(r.updated_at)}</span>}
        />
      </div>

      <PickupAppointmentsCard />
    </div>
  )
}

const manilaDay = (offset = 0) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
const shiftDay = (day, by) => {
  const d = new Date(`${day}T12:00:00+08:00`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

/** Who booked to collect documents on a given day, earliest first. */
function PickupAppointmentsCard() {
  const navigate = useNavigate()
  const [day, setDay] = useState(manilaDay)
  const { data: rows, isLoading, error, refetch } = usePickupsOn(day)
  const isToday = day === manilaDay()
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>
            Pick-up appointments{' '}
            {rows?.length > 0 && (
              <span className="ml-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted">{rows.length}</span>
            )}
          </CardTitle>
          <CardDescription>Students who booked a time to claim their documents.</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous day" onClick={() => setDay((d) => shiftDay(d, -1))}>
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium text-fg" aria-live="polite">
            {isToday ? 'Today, ' : ''}
            {formatDate(day, { weekday: 'short', year: undefined })}
          </span>
          <Button variant="ghost" size="sm" aria-label="Next day" onClick={() => setDay((d) => shiftDay(d, 1))}>
            <ChevronRight />
          </Button>
          {!isToday && (
            <Button variant="secondary" size="sm" onClick={() => setDay(manilaDay())}>
              Today
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <Skeleton className="h-24" />
        ) : rows.length === 0 ? (
          <p className="rounded-xl bg-surface-muted px-4 py-6 text-center text-sm text-muted">No pick-ups booked for this day.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <li key={a.reference_no}>
                <button
                  type="button"
                  onClick={() => navigate(`/registrar/requests?tab=all&view=${a.reference_no}`)}
                  className="flex w-full items-center gap-4 rounded-lg px-2 py-2.5 text-left hover:bg-surface-muted"
                >
                  <span className="w-20 shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-fg">{formatSlot(a.time)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {a.student_name} <span className="font-normal text-muted">· {a.document_name}</span>
                    </p>
                    <p className="text-xs text-muted">
                      <span className="font-mono">{a.reference_no}</span> · {a.student_no}
                      {a.copies > 1 && ` · ${a.copies} copies`}
                    </p>
                  </div>
                  <StatusBadge status={a.status} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const viewFor = (status) =>
  QUEUE_VIEWS.find((v) => !['open', 'all'].includes(v.key) && v.statuses.includes(status))?.key ?? 'all'

/** HTML bar list: label + count are text (also the table view); bar color is the shared status token. */
function StatusBars({ counts }) {
  const open = counts.filter((c) => !TERMINAL.includes(c.status))
  const max = Math.max(1, ...open.map((c) => c.count))
  return (
    <ul className="space-y-2.5">
      {open.map(({ status, count }) => {
        const meta = STATUS[status]
        const Icon = meta.icon
        return (
          <li key={status}>
            <Link
              to={`/registrar/requests?tab=${viewFor(status)}`}
              className="group grid grid-cols-[148px_1fr_32px] items-center gap-3 rounded-lg py-0.5 text-sm"
            >
              <span className="flex items-center gap-2 truncate text-muted group-hover:text-fg">
                <Icon className="size-4 shrink-0" aria-hidden="true" data-status={status} style={{ color: 'var(--s)' }} />
                {meta.label}
              </span>
              <span className="h-5 rounded-r bg-surface-muted/60" aria-hidden="true">
                <span
                  data-status={status}
                  className="status-dot block h-full rounded-r transition-[width] duration-300"
                  style={{ width: count ? `max(${(count / max) * 100}%, 4px)` : 0 }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums text-fg">{count}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

const PERIODS = {
  day: {
    label: 'Daily',
    description: 'Last 14 days',
    tick: (d) => formatDate(d, { year: undefined }),
    tip: (d) => formatDate(d, { weekday: 'short' }),
  },
  week: {
    label: 'Weekly',
    description: 'Last 12 weeks, Monday to Sunday',
    tick: (d) => formatDate(d, { year: undefined }),
    tip: (d) => `Week of ${formatDate(d)}`,
  },
  month: {
    label: 'Monthly',
    description: 'Last 12 months',
    tick: (d) => formatDate(d, { day: undefined, year: '2-digit' }),
    tip: (d) => formatDate(d, { month: 'long', day: undefined }),
  },
  year: {
    label: 'Yearly',
    description: 'Last 5 years',
    tick: (d) => d.slice(0, 4),
    tip: (d) => d.slice(0, 4),
  },
}
const PERIOD_KEY = 'srm.dashboard.period'

function readPeriod() {
  try {
    const saved = localStorage.getItem(PERIOD_KEY)
    return saved in PERIODS ? saved : 'day'
  } catch {
    return 'day'
  }
}

function SubmissionsCard() {
  const [period, setPeriod] = useState(readPeriod)
  const { data, error, isFetching, refetch } = useSubmissionTrend(period)
  const meta = PERIODS[period]

  function choose(next) {
    setPeriod(next)
    try {
      localStorage.setItem(PERIOD_KEY, next)
    } catch {
      // private mode: the choice just isn't remembered
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Submissions</CardTitle>
          <CardDescription>{meta.description} (Manila time).</CardDescription>
        </div>
        <div role="group" aria-label="Group submissions by" className="flex rounded-lg border border-border-strong bg-surface p-0.5">
          {Object.entries(PERIODS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              onClick={() => choose(key)}
              className={cn(
                'h-8 rounded-md px-2.5 text-[13px] font-medium',
                period === key ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className={cn('transition-opacity', isFetching && data && 'opacity-70')}>
        {/* A failed chart shouldn't take the rest of the dashboard down with it. */}
        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data ? (
          <SubmissionsChart periods={data} meta={meta} />
        ) : (
          <Skeleton className="h-64" />
        )}
      </CardContent>
    </Card>
  )
}

function SubmissionsChart({ periods, meta }) {
  const [active, setActive] = useState(null)
  const rows = periods.map((p) => ({ ...p, label: meta.tick(p.start) }))
  const total = rows.reduce((s, r) => s + r.count, 0)
  return (
    <>
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            accessibilityLayer={false}
            margin={{ top: 14, right: 4, left: 0, bottom: 0 }}
            onMouseLeave={() => setActive(null)}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--border-strong)' }}
              tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} width={36} />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active: isActive, payload }) =>
                isActive && payload?.length ? (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-pop">
                    <p className="text-muted">{meta.tip(payload[0].payload.start)}</p>
                    <p className="font-semibold text-fg">
                      {payload[0].value} {payload[0].value === 1 ? 'request' : 'requests'}
                    </p>
                  </div>
                ) : null
              }
            />
            <Bar
              dataKey="count"
              fill="var(--primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              onMouseEnter={(_, i) => setActive(i)}
              shape={(props) => (
                <rect
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  height={props.height}
                  rx={Math.min(4, props.width / 2)}
                  fill="var(--primary)"
                  opacity={active === null || active === props.index ? 1 : 0.55}
                />
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>
          Submissions, {meta.description.toLowerCase()} ({total} total)
        </caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Requests</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.start}>
              <td>{meta.tip(r.start)}</td>
              <td>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function MiniQueue({ title, description, items, total, loading, link, empty, dateLabel }) {
  const navigate = useNavigate()
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div className="space-y-1">
          <CardTitle>
            {title} {total > 0 && <span className="ml-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted">{total}</span>}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Link to={link} className="flex shrink-0 items-center gap-1 text-sm font-medium text-link hover:underline">
          View all <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl bg-surface-muted px-4 py-6 text-center text-sm text-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/registrar/requests?tab=all&view=${r.reference_no}`)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-muted')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {r.student.full_name} <span className="font-normal text-muted">· {r.document_type.name}</span>
                    </p>
                    <p className="text-xs">
                      <span className="font-mono text-muted">{r.reference_no}</span> · {dateLabel(r)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
