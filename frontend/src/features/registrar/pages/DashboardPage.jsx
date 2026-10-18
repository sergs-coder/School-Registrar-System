import { AlarmClock, ArrowRight, CalendarCheck, Inbox, PackageCheck, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorState, PageHeader } from '@/components/shared/misc'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboard } from '@/features/registrar/api'
import { useAuth } from '@/lib/auth'
import { QUEUE_VIEWS, STATUS, TERMINAL } from '@/lib/status'
import { cn, formatDate } from '@/lib/utils'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, error, refetch } = useDashboard()

  if (error) return <ErrorState error={error} onRetry={refetch} />

  const count = (s) => data?.counts.find((c) => c.status === s)?.count ?? 0
  const tiles = [
    { label: 'To review', value: count('submitted') + count('resubmitted'), icon: Inbox, status: 'submitted', to: '/registrar/requests?tab=new' },
    { label: 'Overdue', value: data?.overdue_total, icon: AlarmClock, status: 'rejected', to: '/registrar/requests?overdue=1' },
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

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map(({ label, value, icon: Icon, status, to }) => (
          <Link key={label} to={to} className="group rounded-2xl focus-visible:outline-offset-4">
            <Card className="flex h-full flex-col gap-3 p-4 transition-shadow group-hover:shadow-pop">
              <span data-status={status} className="status-chip flex size-9 items-center justify-center rounded-xl">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <div>
                {isLoading ? <Skeleton className="h-8 w-10" /> : <p className="text-[28px] font-semibold leading-8 text-fg">{value}</p>}
                <p className="mt-1 text-[13px] text-muted">{label}</p>
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
        <Card>
          <CardHeader>
            <CardTitle>Submissions, last 14 days</CardTitle>
            <CardDescription>New requests per day (Manila time).</CardDescription>
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-64" /> : <DailyChart days={data.daily_submissions} />}</CardContent>
        </Card>
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
    </div>
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
              aria-label={`${meta.label}: ${count}`}
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

function DailyChart({ days }) {
  const [active, setActive] = useState(null)
  const rows = days.map((d) => ({ ...d, label: formatDate(d.date, { year: undefined }) }))
  const total = rows.reduce((s, r) => s + r.count, 0)
  return (
    <>
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 14, right: 4, left: -24, bottom: 0 }} onMouseLeave={() => setActive(null)}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--border-strong)' }}
              tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} width={40} />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={({ active: isActive, payload }) =>
                isActive && payload?.length ? (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-pop">
                    <p className="text-muted">{formatDate(payload[0].payload.date, { weekday: 'short' })}</p>
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
              maxBarSize={24}
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
        <caption>Submissions per day, last 14 days ({total} total)</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Requests</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <td>{formatDate(r.date)}</td>
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
