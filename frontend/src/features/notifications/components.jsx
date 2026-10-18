import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from '@/features/notifications/api'
import { cn, timeAgo } from '@/lib/utils'

export function NotificationItem({ n, compact }) {
  const unread = !n.read_at
  return (
    <div className="flex w-full gap-3">
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary dark:bg-primary-300' : 'bg-transparent')}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>
          {n.title}
          {unread && <span className="sr-only"> (unread)</span>}
        </p>
        <p className={cn('text-[13px] text-muted', compact && 'line-clamp-2')}>{n.body}</p>
        <p className="mt-0.5 text-xs text-subtle">
          <time dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
        </p>
      </div>
    </div>
  )
}

export function NotificationBell() {
  const navigate = useNavigate()
  const { data: unread = 0 } = useUnreadCount()
  const { data, isLoading } = useNotifications({ page_size: 6 })
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  function open(n) {
    if (!n.read_at) markRead.mutate(n.id)
    if (n.reference_no) navigate(`/requests/${n.reference_no}`)
  }

  // The label repeats the badge text exactly, so voice-control users can say what they see (WCAG 2.5.3).
  const badge = unread > 9 ? '9+' : String(unread)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-10 items-center justify-center rounded-lg text-fg hover:bg-surface-muted"
        aria-label={unread ? `Notifications, ${badge} unread` : 'Notifications'}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface dark:text-background">
            {badge}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[min(380px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-semibold text-fg">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-link hover:bg-primary-soft"
            >
              <CheckCheck className="size-4" aria-hidden="true" /> Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : data?.items.length ? (
            data.items.map((n) => (
              <DropdownMenuItem key={n.id} onSelect={() => open(n)} className="items-start py-2.5">
                <NotificationItem n={n} compact />
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.</p>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem onSelect={() => navigate('/notifications')} className="justify-center rounded-none rounded-b-xl py-3 font-medium text-link">
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
