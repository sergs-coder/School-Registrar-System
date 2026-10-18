import { ChevronLeft, ChevronRight, FileStack, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMyRequests } from '@/features/requests/api'
import { RequestCard, RequestCardSkeleton } from '@/features/requests/components/RequestCard'
import { IN_PROGRESS, NEEDS_STUDENT_ACTION } from '@/lib/status'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'action', label: 'Needs action', statuses: NEEDS_STUDENT_ACTION },
  { key: 'active', label: 'In progress', statuses: IN_PROGRESS },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'closed', label: 'Rejected / cancelled', statuses: ['rejected', 'cancelled'] },
]
const PAGE_SIZE = 12

export function MyRequestsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0]
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = params.get('q') ?? ''

  // Debounce search into the URL so results are shareable and survive back/forward.
  useEffect(() => {
    const id = setTimeout(() => {
      if (search === q) return
      const next = new URLSearchParams(params)
      if (search) next.set('q', search)
      else next.delete('q')
      next.delete('page')
      setParams(next, { replace: true })
    }, 300)
    return () => clearTimeout(id)
  }, [search, q, params, setParams])

  const { data, isLoading, isFetching, error, refetch } = useMyRequests({
    status: tab.statuses,
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
  })
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  function setTab(key) {
    const next = new URLSearchParams(params)
    if (key === 'all') next.delete('tab')
    else next.set('tab', key)
    next.delete('page')
    setParams(next)
  }

  function setPage(p) {
    const next = new URLSearchParams(params)
    next.set('page', String(p))
    setParams(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My requests"
        description="Track every request from submission to release."
        actions={
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/requests/new">
              <Plus /> New request
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Filter requests" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab.key === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                tab.key === t.key
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border-strong text-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reference no. or document"
            aria-label="Search requests"
            className="pl-9"
          />
        </div>
      </div>

      <div aria-live="polite" aria-busy={isFetching}>
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <RequestCardSkeleton key={i} />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={FileStack}
            title={q || tab.key !== 'all' ? 'No requests match' : 'No requests yet'}
            description={q || tab.key !== 'all' ? 'Try another filter or search term.' : 'Your requests will appear here.'}
            action={
              tab.key === 'all' && !q ? (
                <Button asChild>
                  <Link to="/requests/new">Start a request</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {data.total} {data.total === 1 ? 'request' : 'requests'}
            </p>
            <div className={cn('grid gap-4 md:grid-cols-2', isFetching && 'opacity-70 transition-opacity')}>
              {data.items.map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
            </div>
            {pages > 1 && (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft /> Previous
                </Button>
                <span className="text-sm text-muted">
                  Page {page} of {pages}
                </span>
                <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next <ChevronRight />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  )
}
