import { Mail } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { STAFF_ACTIONS, STATUS, staffActionLabel } from '@/lib/status'

/**
 * Confirms a status change and collects remarks.
 * `action` = { toStatus, fromStatus, requiresRemarks, count? }
 */
export function TransitionDialog({ action, onClose, onConfirm, pending }) {
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState(null)
  const fieldId = useId()
  useEffect(() => {
    setRemarks('')
    setError(null)
  }, [action])

  if (!action) return null
  const meta = STAFF_ACTIONS[action.toStatus] ?? {}
  const label = staffActionLabel(action.toStatus, action.fromStatus)
  const required = action.requiresRemarks
  const target = STATUS[action.toStatus]?.label

  function confirm() {
    if (required && !remarks.trim()) {
      setError('Please write a message so the student knows what to do.')
      return
    }
    onConfirm(remarks.trim() || null)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>
          {label}
          {action.count > 1 ? ` · ${action.count} requests` : ''}
        </DialogTitle>
        <DialogDescription>
          {action.description ?? (
            <>
              {action.count > 1 ? 'Each request' : 'The request'} moves to <strong className="text-fg">{target}</strong>
              {meta.hint ? `. ${meta.hint}` : '.'}
            </>
          )}
          {action.count > 1 && ' Requests that can’t make this move are skipped and listed afterwards.'}
        </DialogDescription>

        <div className="mt-5 space-y-1.5">
          <label htmlFor={fieldId} className="text-sm font-medium text-fg">
            {meta.remarksLabel ?? 'Remarks for the student'}
            {required ? <span className="text-danger"> *</span> : <span className="font-normal text-subtle"> (optional)</span>}
          </label>
          <Textarea
            id={fieldId}
            rows={4}
            autoFocus
            maxLength={1000}
            value={remarks}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${fieldId}-help`}
            onChange={(e) => {
              setRemarks(e.target.value)
              setError(null)
            }}
          />
          <p id={`${fieldId}-help`} className={error ? 'text-[13px] font-medium text-danger' : 'text-[13px] text-muted'}>
            {error ?? meta.remarksHelp ?? 'Shown to the student in their request timeline.'}
          </p>
        </div>

        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
          <Mail className="size-4 shrink-0" aria-hidden="true" />
          The student is notified in the portal{['under_review', 'resubmitted', 'payment_verified'].includes(action.toStatus) ? '' : ' and by email'}.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={action.toStatus === 'rejected' ? 'danger' : 'primary'} loading={pending} onClick={confirm}>
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
