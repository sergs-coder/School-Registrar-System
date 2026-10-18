import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface-muted',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/50 after:to-transparent dark:after:via-white/5',
        className,
      )}
      {...props}
    />
  )
}
