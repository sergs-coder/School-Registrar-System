import { STATUS } from '@/lib/status'
import { cn } from '@/lib/utils'

export function StatusBadge({ status, size = 'md', className }) {
  const meta = STATUS[status] ?? STATUS.draft
  const Icon = meta.icon
  return (
    <span
      data-status={status}
      className={cn(
        'status-chip inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]',
        status === 'cancelled' && 'line-through decoration-1',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden="true" />
      {meta.label}
    </span>
  )
}
