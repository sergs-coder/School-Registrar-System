import { cloneElement, isValidElement, useId } from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Label + control + help + error, wired up with ids and aria attributes. */
export function FormField({ label, required, help, error, children, className, id: idProp }) {
  const autoId = useId()
  const id = idProp ?? autoId
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined

  const controlProps = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
  }
  // Pass a function child when the input is wrapped (e.g. password + show button).
  const control =
    typeof children === 'function'
      ? children(controlProps)
      : isValidElement(children)
        ? cloneElement(children, controlProps)
        : children

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required ? (
            <span className="text-danger" aria-hidden="true">
              {' '}
              *
            </span>
          ) : (
            <span className="font-normal text-subtle"> (optional)</span>
          )}
        </Label>
      )}
      {control}
      {help && !error && (
        <p id={helpId} className="text-[13px] text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
