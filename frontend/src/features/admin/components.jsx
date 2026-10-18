import { ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <p className="text-muted tabular-nums">
        {first}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tabular-nums text-muted">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, description, confirmLabel, danger, pending, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** In development the API returns the emailed link too, since no real email is sent. */
export function SetupLinkNotice({ link }) {
  if (!link) return null
  return (
    <Alert
      tone="info"
      title="Development mode: email not sent"
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success('Link copied'))}
        >
          <Copy /> Copy link
        </Button>
      }
    >
      <span className="break-all font-mono text-xs">{link}</span>
    </Alert>
  )
}
