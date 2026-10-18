import { CircleAlert, Moon, Sun } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions, eyebrow, className }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow}
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px] sm:leading-9">{title}</h1>
        {description && <p className="max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary dark:text-primary-300">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      )}
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <Alert
      tone="danger"
      icon={CircleAlert}
      title="We couldn’t load this"
      action={
        onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {errorMessage(error)}
    </Alert>
  )
}

export function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={className}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}

export function DefinitionList({ items, className }) {
  return (
    <dl className={cn('divide-y divide-border', className)}>
      {items
        .filter((i) => i && i.value !== undefined)
        .map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
            <dt className="shrink-0 text-sm text-muted sm:w-44">{item.label}</dt>
            <dd className="min-w-0 break-words text-sm font-medium text-fg">{item.value || '—'}</dd>
          </div>
        ))}
    </dl>
  )
}
