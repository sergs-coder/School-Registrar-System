import { BellOff, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '@/features/notifications/api'
import { NotificationItem } from '@/features/notifications/components'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

export function NotificationsPage() {
  const navigate = useNavigate()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const { data: unread = 0 } = useUnreadCount()
  const { data, isLoading, error, refetch } = useNotifications({ unread_only: unreadOnly, page, page_size: PAGE_SIZE })
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Updates on your requests. We email you each one too, plus reminders when something needs your action."
        actions={
          unread > 0 && (
            <Button variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          )
        }
      />
      <div role="tablist" aria-label="Filter notifications" className="flex gap-1">
        {[
          { v: false, label: 'All' },
          { v: true, label: `Unread${unread ? ` (${unread})` : ''}` },
        ].map(({ v, label }) => (
          <button
            key={label}
            role="tab"
            aria-selected={unreadOnly === v}
            onClick={() => {
              setUnreadOnly(v)
              setPage(1)
            }}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium',
              unreadOnly === v ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-muted hover:bg-surface-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <Card className="space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </Card>
      ) : data.items.length === 0 ? (
        <EmptyState icon={BellOff} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} />
      ) : (
        <Card as="ul" className="divide-y divide-border overflow-hidden">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  if (!n.read_at) markRead.mutate(n.id)
                  if (n.reference_no) navigate(`/requests/${n.reference_no}`)
                }}
                className={cn('flex w-full px-4 py-4 text-left hover:bg-surface-muted sm:px-5', !n.read_at && 'bg-primary-soft/50')}
              >
                <NotificationItem n={n} />
              </button>
            </li>
          ))}
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft /> Newer
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Older <ChevronRight />
          </Button>
        </nav>
      )}
    </div>
  )
}
