import { BadgeCheck, Clock, Download, FileText, ShieldCheck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { FormField } from '@/components/shared/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { useSiteInfo } from '@/features/catalog/api'
import { openAttachment, openEDocument, useSubmitPayment } from '@/features/requests/api'
import { apiError, errorMessage } from '@/lib/errors'
import { PAYMENT_METHODS, PAYMENT_STATUS } from '@/lib/status'
import { cn, formatDate, formatDateTime, formatPeso } from '@/lib/utils'

const PROOF_SPEC = { label: 'Proof of payment', accept: ['pdf', 'jpg', 'png'], max_mb: 5 }
const STATUS_PILL = {
  pending: 'bg-info-soft text-info',
  verified: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
}

const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

/** Payment step on the student's request page: upload proof, then follow its review. */
export function PaymentCard({ request: r }) {
  const canPay = r.allowed_actions.includes('pay')
  const pending = r.payments.find((p) => p.status === 'pending')
  const lastRejected = !pending && r.payments.at(-1)?.status === 'rejected' ? r.payments.at(-1) : null

  if (!canPay && r.payments.length === 0) return null

  return (
    <Card id="payment">
      <CardHeader>
        <CardTitle>Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {pending && (
          <Alert tone="info" icon={Clock} title="We’re checking your payment">
            The Registrar’s Office will verify your {PAYMENT_METHODS[pending.method].label} payment, usually within one working
            day. You’ll get a notification once it’s done.
          </Alert>
        )}
        {lastRejected && (
          <Alert tone="warning" title="Your last proof of payment wasn’t accepted">
            {lastRejected.remarks && <>Reason: {lastRejected.remarks} </>}Please upload a new one below.
          </Alert>
        )}
        {canPay && <PaymentForm request={r} />}
        {r.payments.length > 0 && <PaymentHistory payments={r.payments} />}
      </CardContent>
    </Card>
  )
}

function PaymentForm({ request: r }) {
  const { data: site } = useSiteInfo()
  const submit = useSubmitPayment(r.reference_no)
  const [method, setMethod] = useState('gcash')
  const [payerReference, setPayerReference] = useState('')
  const [paidOn, setPaidOn] = useState(manilaToday)
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!payerReference.trim()) next.payer_reference = 'Enter the receipt or transaction number.'
    if (!paidOn) next.paid_on = 'Choose the date you paid.'
    if (!file) next.file = 'Upload a photo or PDF of your receipt.'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await submit.mutateAsync({ method, payerReference: payerReference.trim(), paidOn, file })
      toast.success('Proof of payment sent')
    } catch (err) {
      const { details = [], message } = apiError(err)
      const fieldErrors = Object.fromEntries(details.filter((d) => d.field).map((d) => [d.field, d.message]))
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors)
      else if (['FILE_TOO_LARGE', 'FILE_TYPE_NOT_ALLOWED', 'FILE_EMPTY'].includes(apiError(err).code)) setErrors({ file: message })
      else toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-surface-muted p-4 text-sm">
        <Wallet className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-fg">
            Amount due: <span className="tabular-nums">{formatPeso(r.fee_total)}</span>
          </p>
          <p className="text-muted">
            {site?.payment_instructions} Your reference number is{' '}
            <strong className="font-mono text-fg">{r.reference_no}</strong>.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="How did you pay?" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHODS).map(([value, m]) => (
              <option key={value} value={value}>
                {m.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Date paid" required error={errors.paid_on}>
          <Input type="date" max={manilaToday()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </FormField>
      </div>
      <FormField label={PAYMENT_METHODS[method].referenceLabel} required error={errors.payer_reference}>
        <Input
          value={payerReference}
          maxLength={100}
          autoComplete="off"
          onChange={(e) => setPayerReference(e.target.value)}
          className="font-mono"
        />
      </FormField>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-fg">
          Photo or PDF of your receipt <span className="text-danger" aria-hidden="true">*</span>
        </p>
        <FileDropzone
          spec={PROOF_SPEC}
          file={file && { original_filename: file.name, size_bytes: file.size }}
          onUpload={(f) => {
            setFile(f)
            setErrors((prev) => ({ ...prev, file: undefined }))
          }}
          onRemove={() => setFile(null)}
          onView={() => {
            const url = URL.createObjectURL(file)
            window.open(url, '_blank')
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
          }}
          error={errors.file}
          disabled={submit.isPending}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={submit.isPending}>
          Send proof of payment
        </Button>
      </div>
    </form>
  )
}

function PaymentHistory({ payments }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-fg">Payment history</h3>
      <ul className="divide-y divide-border">
        {[...payments].reverse().map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">
                {PAYMENT_METHODS[p.method].label} · <span className="tabular-nums">{formatPeso(p.amount)}</span>
              </p>
              <p className="text-xs text-muted">
                {p.payer_reference && <span className="font-mono">{p.payer_reference} · </span>}
                {p.paid_at ? `Paid ${formatDate(p.paid_at)}` : `Sent ${formatDateTime(p.created_at)}`}
                {p.status === 'rejected' && p.remarks && ` · ${p.remarks}`}
              </p>
            </div>
            {p.proof && (
              <Button variant="ghost" size="sm" onClick={() => openAttachment(p.proof.id).catch((e) => toast.error(errorMessage(e)))}>
                <FileText /> Receipt
              </Button>
            )}
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_PILL[p.status])}>
              {p.status === 'verified' && <BadgeCheck className="mr-1 inline size-3.5" aria-hidden="true" />}
              {PAYMENT_STATUS[p.status].label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The student's watermarked electronic copy, once the Registrar has released it. */
export function EDocumentCard({ request: r }) {
  const doc = r.e_documents.at(-1)
  const [busy, setBusy] = useState(false)
  if (!doc) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Electronic copy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary dark:text-primary-300">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{r.document_type.name} (PDF)</p>
            <p className="text-xs text-muted">Issued {formatDateTime(doc.issued_at)}</p>
          </div>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await openEDocument(doc.id)
              } catch (err) {
                toast.error(errorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {!busy && <Download />} Download
          </Button>
        </div>
        <p className="text-[13px] text-muted">
          Every page carries your name and a QR code. Anyone you send it to can check that it’s genuine at{' '}
          <a href={doc.verify_url} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">
            the verification page
          </a>{' '}
          using code <span className="font-mono text-fg">{doc.code}</span>.
        </p>
      </CardContent>
    </Card>
  )
}
