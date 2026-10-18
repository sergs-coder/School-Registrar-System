import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

export const fieldBase =
  'w-full rounded-lg border border-border-strong bg-surface px-3 text-[15px] text-fg placeholder:text-subtle transition-colors duration-150 hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 focus-visible:border-transparent disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:hover:border-danger'

export const Input = forwardRef(function Input({ className, type = 'text', ...props }, ref) {
  return <input ref={ref} type={type} className={cn(fieldBase, 'h-11', className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(fieldBase, 'py-2.5 leading-relaxed', className)} {...props} />
})

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        'h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-10',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})

export const Checkbox = forwardRef(function Checkbox({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn('size-[18px] shrink-0 cursor-pointer rounded accent-[var(--primary)]', className)}
      {...props}
    />
  )
})
