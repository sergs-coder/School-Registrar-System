import { BadgeCheck, Eye, FileText, Printer, ShieldCheck, ShieldOff, TriangleAlert, Upload, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { useRejectPayment, useRevokeEDocument, useUploadEDocument } from '@/features/registrar/api'
import { openAttachment, openEDocument, openPickupSlip } from '@/features/requests/api'
import { apiError, errorMessage } from '@/lib/errors'
import { PAYMENT_METHODS, PAYMENT_STATUS } from '@/lib/status'
import { cn, formatBytes, formatDate, formatDateTime, formatPeso } from '@/lib/utils'

const PILL = {
  pending: 'bg-info-soft text-info',
  verified: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
}

export function Section({ title, children, action }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Runs an async file open with a busy flag and a toast on failure. */
function useOpener() {
  const [busy, setBusy] = useState(null)
  async function open(key, fn) {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  return [busy, open]
}

/** Dialog that collects a required reason (reject a payment, revoke an e-document). */
function ReasonDialog({ open, title, description, label, confirmLabel, maxLength, pending, onClose, onConfirm }) {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const id = useId()
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setText('')
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-5 space-y-1.5">
          <label htmlFor={id} className="text-sm font-medium text-fg">
            {label} <span className="text-danger">*</span>
          </label>
          <Textarea
            id={id}
            rows={3}
            autoFocus
            maxLength={maxLength}
            value={text}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
          />
          {error && (
            <p id={`${id}-error`} className="text-[13px] font-medium text-danger">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={async () => {
              if (!text.trim()) {
                setError('Please give a reason.')
                return
              }
              if (await onConfirm(text.trim())) setText('')
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PaymentSection({ request: r, onVerify, onStale }) {
  const reject = useRejectPayment(r.reference_no)
  const [rejecting, setRejecting] = useState(null)
  const [busy, open] = useOpener()
  const awaiting = r.status === 'awaiting_payment'
  if (!awaiting && r.payments.length === 0) return null

  const canVerify = r.transitions.some((t) => t.to_status === 'payment_verified')
  const pending = r.payments.find((p) => p.status === 'pending')

  return (
    <Section title="Payment">
      {awaiting && !pending && (
        <p className="mb-2 text-sm text-muted">
          {r.payments.length ? 'Waiting for the student to upload a new proof.' : 'No proof uploaded yet.'} If the student
          paid at the cashier window, use “Mark payment verified” to record it.
        </p>
      )}
      {r.payments.length > 0 && (
        <ul className="divide-y divide-border">
          {[...r.payments].reverse().map((p) => {
            const mismatch = Number(p.amount) !== Number(r.fee_total)
            return (
              <li key={p.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {PAYMENT_METHODS[p.method].label} · <span className="tabular-nums">{formatPeso(p.amount)}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {p.payer_reference && <span className="font-mono text-fg">{p.payer_reference}</span>}
                      {p.payer_reference && ' · '}
                      {p.paid_at ? `Paid ${formatDate(p.paid_at)}` : `Sent ${formatDateTime(p.created_at)}`}
                      {p.verified_by_name && ` · ${p.status === 'verified' ? 'Verified' : 'Checked'} by ${p.verified_by_name}`}
                    </p>
                    {p.status === 'rejected' && p.remarks && <p className="mt-1 text-xs text-danger">Reason: {p.remarks}</p>}
                    {p.status !== 'rejected' && !p.proof && p.remarks && <p className="mt-1 text-xs text-muted">{p.remarks}</p>}
                  </div>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', PILL[p.status])}>
                    {PAYMENT_STATUS[p.status].label}
                  </span>
                </div>
                {mismatch && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                    <TriangleAlert className="size-3.5" aria-hidden="true" /> Fee is {formatPeso(r.fee_total)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {p.proof && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === `proof-${p.id}`}
                      onClick={() => open(`proof-${p.id}`, () => openAttachment(p.proof.id))}
                    >
                      <FileText /> View receipt
                      <span className="text-subtle">· {formatBytes(p.proof.size_bytes)}</span>
                    </Button>
                  )}
                  {p.status === 'pending' && awaiting && (
                    <>
                      <Button variant="danger-outline" size="sm" onClick={() => setRejecting(p)}>
                        <X /> Reject proof
                      </Button>
                      {canVerify && (
                        <Button size="sm" onClick={onVerify}>
                          <BadgeCheck /> Verify payment
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ReasonDialog
        open={Boolean(rejecting)}
        title="Reject this proof of payment?"
        description="The request stays in Awaiting Payment. The student sees your reason, gets an email, and can upload a new proof."
        label="What’s wrong with it?"
        confirmLabel="Reject proof"
        maxLength={500}
        pending={reject.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={async (remarks) => {
          try {
            await reject.mutateAsync({ paymentId: rejecting.id, remarks, version: r.version })
            toast.success('Proof rejected. The student was notified.')
            setRejecting(null)
            return true
          } catch (err) {
            const e = apiError(err)
            toast.error(e.message)
            if (e.code === 'STALE_REQUEST') {
              setRejecting(null)
              onStale()
            }
            return false
          }
        }}
      />
    </Section>
  )
}

export function EDocumentSection({ request: r }) {
  const upload = useUploadEDocument(r.reference_no)
  const revoke = useRevokeEDocument(r.reference_no)
  const inputRef = useRef(null)
  const [revoking, setRevoking] = useState(null)
  const [busy, open] = useOpener()
  if (!r.can_upload_edocument && r.e_documents.length === 0) return null

  const current = r.e_documents.find((d) => !d.revoked_at)

  async function onFile(file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Upload the document as a PDF.')
      return
    }
    try {
      await upload.mutateAsync(file)
      toast.success(current ? 'E-document replaced. The old copy no longer verifies.' : 'E-document attached')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Section
      title="E-document"
      action={
        r.can_upload_edocument && (
          <>
            <Button variant="secondary" size="sm" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
              {!upload.isPending && <Upload />} {current ? 'Replace PDF' : 'Upload PDF'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label="Upload e-document PDF"
              onChange={(e) => {
                onFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </>
        )
      }
    >
      <p className="text-[13px] text-muted">
        Upload the signed document as a PDF. The student can download it once the request is ready or shipped. Each download
        is stamped with their name and a QR code that verifies it.
      </p>
      {r.e_documents.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {[...r.e_documents].reverse().map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
              {d.revoked_at ? (
                <ShieldOff className="size-5 shrink-0 text-subtle" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium', d.revoked_at ? 'text-muted line-through' : 'text-fg')}>
                  {d.filename ?? 'Document.pdf'}
                </p>
                <p className="text-xs text-muted">
                  <span className="font-mono">{d.code}</span> · Issued {formatDateTime(d.issued_at)}
                  {d.revoked_at && ` · Revoked: ${d.revoke_reason}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={busy === d.id}
                onClick={() => open(d.id, () => openEDocument(d.id))}
              >
                {busy !== d.id && <Eye />} Preview<span className="sr-only"> {d.code}</span>
              </Button>
              {!d.revoked_at && (
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRevoking(d)}>
                  Revoke<span className="sr-only"> {d.code}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ReasonDialog
        open={Boolean(revoking)}
        title="Revoke this e-document?"
        description="Its QR code will show as withdrawn, and the student can no longer download it. This can’t be undone; upload a new PDF to issue a fresh copy."
        label="Reason"
        confirmLabel="Revoke"
        maxLength={300}
        pending={revoke.isPending}
        onClose={() => setRevoking(null)}
        onConfirm={async (reason) => {
          try {
            await revoke.mutateAsync({ id: revoking.id, reason })
            toast.success('E-document revoked')
            setRevoking(null)
            return true
          } catch (err) {
            toast.error(errorMessage(err))
            return false
          }
        }}
      />
    </Section>
  )
}

export function PickupSlipButton({ reference }) {
  const [busy, open] = useOpener()
  return (
    <Button variant="secondary" size="sm" loading={busy === 'slip'} onClick={() => open('slip', () => openPickupSlip(reference))}>
      {busy !== 'slip' && <Printer />} Pick-up slip
    </Button>
  )
}
