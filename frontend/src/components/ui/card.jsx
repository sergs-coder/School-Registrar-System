import { cn } from '@/lib/utils'

export function Card({ className, as: Comp = 'div', ...props }) {
  return <Comp className={cn('rounded-2xl border border-border bg-surface shadow-card', className)} {...props} />
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3 sm:p-6 sm:pb-3', className)} {...props} />
}

export function CardTitle({ className, as: Comp = 'h2', ...props }) {
  return <Comp className={cn('text-base font-semibold leading-6 text-fg', className)} {...props} />
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted', className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />
}
