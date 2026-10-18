import { ArrowRight, FilePlus2, Megaphone, PackageCheck, TriangleAlert, Hourglass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState, ErrorState } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnnouncements } from '@/features/catalog/api'
import { useMyRequests } from '@/features/requests/api'
import { RequestCard, RequestCardSkeleton } from '@/features/requests/components/RequestCard'
import { useAuth } from '@/lib/auth'
import { IN_PROGRESS, NEEDS_STUDENT_ACTION } from '@/lib/status'

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }))
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Stat({ icon: Icon, label, value, status, loading, to }) {
  return (
    <Link to={to} className="group rounded-2xl focus-visible:outline-offset-4">
      <Card className="flex h-full flex-col gap-2 p-3 transition-shadow group-hover:shadow-pop sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <span data-status={status} className="status-chip flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          {loading ? <Skeleton className="h-7 w-8" /> : <p className="text-2xl font-semibold tabular-nums text-fg">{value}</p>}
          <p className="text-xs leading-tight text-muted sm:text-[13px]">{label}</p>
        </div>
      </Card>
    </Link>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const { data: announcements } = useAnnouncements()
  const { data, isLoading, error, refetch } = useMyRequests({ page_size: 100 })
  const items = data?.items ?? []

  const needsAction = items.filter((r) => NEEDS_STUDENT_ACTION.includes(r.status))
  const inProgress = items.filter((r) => IN_PROGRESS.includes(r.status))
  const ready = items.filter((r) => ['ready_for_pickup', 'shipped'].includes(r.status))
  const firstName = user.student?.first_name ?? user.display_name.split(' ')[0]

  return (
    <div className="space-y-8">
      {announcements?.map((a) => (
        <Alert key={a.id} tone={a.level === 'warning' ? 'warning' : 'brand'} icon={Megaphone} title={a.title}>
          {a.body}
        </Alert>
      ))}

      <section className="relative overflow-hidden rounded-3xl bg-primary-800 p-6 text-white shadow-card sm:p-8 dark:bg-primary-900">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary-500/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 size-64 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-accent-200">
              {greeting()}, {firstName}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-9">
              What do you need from the Registrar today?
            </h1>
            <p className="max-w-lg text-[15px] text-primary-100">
              Request your TOR, certificates and forms online. We’ll keep you posted at every step.
            </p>
          </div>
          <Button asChild variant="accent" size="lg" className="shrink-0">
            <Link to="/requests/new">
              <FilePlus2 /> New Request
            </Link>
          </Button>
        </div>
      </section>

      <section aria-label="Summary" className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={TriangleAlert} status="needs_correction" label="Need your action" value={needsAction.length} loading={isLoading} to="/requests?tab=action" />
        <Stat icon={Hourglass} status="processing" label="In progress" value={inProgress.length} loading={isLoading} to="/requests?tab=active" />
        <Stat icon={PackageCheck} status="ready_for_pickup" label="Ready to claim" value={ready.length} loading={isLoading} to="/requests?tab=action" />
      </section>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <RequestCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FilePlus2}
          title="No requests yet"
          description="When you request a document, you’ll be able to track it here."
          action={
            <Button asChild>
              <Link to="/requests/new">Browse documents</Link>
            </Button>
          }
        />
      ) : (
        <>
          {needsAction.length > 0 && (
            <RequestSection title="Needs your attention" items={needsAction.slice(0, 4)} />
          )}
          {inProgress.length > 0 && <RequestSection title="In progress" items={inProgress.slice(0, 4)} />}
        </>
      )}
    </div>
  )
}

function RequestSection({ title, items }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <Link to="/requests" className="flex items-center gap-1 text-sm font-medium text-link hover:underline">
          View all <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((r) => (
          <RequestCard key={r.id} request={r} />
        ))}
      </div>
    </section>
  )
}
