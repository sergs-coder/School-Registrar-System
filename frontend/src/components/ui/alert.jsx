import { cva } from 'class-variance-authority'
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

const alertVariants = cva('flex gap-3 rounded-xl border p-4 text-sm', {
  variants: {
    tone: {
      info: 'border-info/25 bg-info-soft text-fg [&>svg]:text-info',
      success: 'border-success/25 bg-success-soft text-fg [&>svg]:text-success',
      warning: 'border-warning/30 bg-warning-soft text-fg [&>svg]:text-warning',
      danger: 'border-danger/25 bg-danger-soft text-fg [&>svg]:text-danger',
      brand: 'border-accent/40 bg-accent-soft text-fg [&>svg]:text-accent-700 dark:[&>svg]:text-accent-300',
    },
  },
  defaultVariants: { tone: 'info' },
})

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: OctagonAlert, brand: Info }

export function Alert({ tone = 'info', title, icon, children, className, action, ...props }) {
  const Icon = icon ?? ICONS[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn(alertVariants({ tone }), className)} {...props}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted [&_strong]:text-fg">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}
