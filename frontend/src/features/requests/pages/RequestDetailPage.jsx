import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Clock,
  Copy,
  FileText,
  Package,
  Pencil,
  Printer,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ProgressStepper } from '@/components/shared/ProgressStepper'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StatusTimeline } from '@/components/shared/StatusTimeline'
import { DefinitionList, ErrorState } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useSiteInfo } from '@/features/catalog/api'
import { openAttachment, openPickupSlip, useCancelRequest, useDeleteDraft, useRequest } from '@/features/requests/api'
import { FeeSummary } from '@/features/requests/components/FeeSummary'
import { EDocumentCard, PaymentCard } from '@/features/requests/components/PaymentCard'
import { PickupCard } from '@/features/requests/components/PickupCard'
import { addressText, formatFieldValue } from '@/features/requests/components/wizard/ReviewStep'
import { errorMessage } from '@/lib/errors'
import { STATUS, TERMINAL } from '@/lib/status'
import { formatBytes, formatDate, formatDateTime } from '@/lib/utils'

export function RequestDetailPage() {
  const { ref } = useParams()
  const { data: r, isLoading, error, refetch } = useRequest(ref)

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    )
  }
  if (isLoading) return <DetailSkeleton />

  const doc = r.document_type_full
  const requiresPayment = doc.requires_payment && Number(r.fee_total) > 0
  const files = r.attachments.filter((a) => a.kind === 'requirement')

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px] sm:leading-9">{doc.name}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={r.status} />
            <ReferenceChip value={r.reference_no} />
          </div>
        </div>
        <Actions request={r} />
      </header>

      <StatusCallout request={r} requiresPayment={requiresPayment} />

      {r.status !== 'draft' && (
        <Card className="px-4 py-5 sm:px-8">
          <ProgressStepper status={r.status} requiresPayment={requiresPayment} history={r.history} />
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <PickupCard request={r} />
          <EDocumentCard request={r} />
          <PaymentCard request={r} />

          <Card>
            <CardHeader>
              <CardTitle>Request details</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: 'Purpose', value: r.purpose },
                  { label: 'Copies', value: String(r.copies) },
                  ...doc.required_fields.map((f) => ({ label: f.label, value: formatFieldValue(f, r.form_data[f.key]) })),
                  {
                    label: 'Delivery',
                    value: r.delivery_method === 'courier' ? (
                      <span className="whitespace-pre-line">{`Courier\n${addressText(r.delivery_address)}`}</span>
                    ) : (
                      'Pick-up at the Registrar’s Office'
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>

          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your files</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {files.map((a) => {
                    const spec = doc.required_attachments.find((s) => s.key === a.requirement_key)
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-3">
                        <FileText className="size-5 shrink-0 text-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-fg">{spec?.label ?? a.original_filename}</p>
                          <p className="truncate text-xs text-muted">
                            {a.original_filename} · {formatBytes(a.size_bytes)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAttachment(a.id).catch((e) => toast.error(errorMessage(e)))}
                        >
                          View<span className="sr-only"> {spec?.label}</span>
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {r.history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusTimeline history={r.history} />
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Fees and dates">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Fees</CardTitle>
            </CardHeader>
            <CardContent>
              <FeeSummary lines={r.fee_breakdown} total={r.fee_total} requiresPayment={requiresPayment} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 sm:pt-6">
              <DefinitionList
                className="[&_dt]:sm:w-32"
                items={[
                  { label: 'Created', value: formatDateTime(r.created_at) },
                  r.submitted_at && { label: 'Submitted', value: formatDateTime(r.submitted_at) },
                  !TERMINAL.includes(r.status) &&
                    r.estimated_release_date && {
                      label: 'Est. release',
                      value: (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock className="size-4 text-muted" aria-hidden="true" />
                          {formatDate(r.estimated_release_date)}
                        </span>
                      ),
                    },
                  r.completed_at && { label: STATUS[r.status].label, value: formatDateTime(r.completed_at) },
                ]}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/requests" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden="true" /> My requests
    </Link>
  )
}

function ReferenceChip({ value }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success('Reference number copied'))}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-sm text-muted hover:bg-surface-muted hover:text-fg"
      aria-label={`Copy reference number ${value}`}
    >
      {value}
      <Copy className="size-3.5" aria-hidden="true" />
    </button>
  )
}

function StatusCallout({ request: r, requiresPayment }) {
  const { data: site } = useSiteInfo()
  const contact = site?.registrar_contact
  switch (r.status) {
    case 'draft':
      return (
        <Alert tone="info" title="This request hasn’t been submitted yet" action={<EditButton r={r} label="Continue draft" />}>
          Finish the remaining steps and submit it to the Registrar.
        </Alert>
      )
    case 'needs_correction':
      return (
        <Alert tone="warning" title="Please correct your request" action={<EditButton r={r} label="Fix and resubmit" />}>
          {r.latest_remarks ? <>The Registrar said: “{r.latest_remarks}”</> : STATUS.needs_correction.hint}
        </Alert>
      )
    case 'awaiting_payment':
      return r.payments.some((p) => p.status === 'pending') ? (
        <Alert tone="info" icon={Clock} title="Payment sent. We’re checking it.">
          Your request moves to processing as soon as the Registrar’s Office verifies your payment.
        </Alert>
      ) : (
        <Alert tone="brand" icon={Wallet} title="Approved. Please pay the fee to continue.">
          Pay the fee, then upload a photo of your receipt in the Payment section below.
        </Alert>
      )
    case 'ready_for_pickup':
      return (
        <Alert
          tone="success"
          icon={Package}
          title="Your document is ready for pick-up"
          action={r.allowed_actions.includes('pickup_slip') && <PickupSlipButton reference={r.reference_no} />}
        >
          {r.pickup_appointment ? (
            <>Your pick-up time is <strong>{r.pickup_appointment.label}</strong>. </>
          ) : (
            <>Book a pick-up time below. </>
          )}
          Bring a valid ID and your pick-up slip (or reference number <strong className="font-mono">{r.reference_no}</strong>)
          to the {contact?.office ?? 'Registrar’s Office'}.
        </Alert>
      )
    case 'shipped':
      return (
        <Alert tone="success" icon={Truck} title="Your document is on its way">
          {r.latest_remarks ?? 'The courier will contact you before delivery.'}
        </Alert>
      )
    case 'rejected':
      return (
        <Alert tone="danger" title="This request was not approved">
          {r.latest_remarks ?? 'Please contact the Registrar’s Office for details.'}
        </Alert>
      )
    default:
      return STATUS[r.status] && !['completed', 'cancelled'].includes(r.status) ? (
        <p className="text-sm text-muted">
          {STATUS[r.status].hint}
          {requiresPayment === false && r.status === 'under_review' && ' No fee is due for this request.'}
        </p>
      ) : null
  }
}

function PickupSlipButton({ reference }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await openPickupSlip(reference)
        } catch (err) {
          toast.error(errorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      {!busy && <Printer />} Pick-up slip (PDF)
    </Button>
  )
}

function EditButton({ r, label }) {
  return (
    <Button asChild size="sm">
      <Link to={`/requests/${r.reference_no}/edit`}>
        <Pencil /> {label}
      </Link>
    </Button>
  )
}

function Actions({ request: r }) {
  const navigate = useNavigate()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useCancelRequest(r.reference_no)
  const del = useDeleteDraft()
  const can = (a) => r.allowed_actions.includes(a)

  if (!can('cancel') && !can('delete')) return null

  return (
    <div className="flex shrink-0 gap-2">
      {can('cancel') && (
        <Button variant="danger-outline" onClick={() => setCancelOpen(true)}>
          <Ban /> Cancel request
        </Button>
      )}
      {can('delete') && (
        <Button variant="danger-outline" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> Delete draft
        </Button>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            {r.reference_no} will be closed and can’t be reopened. You can always submit a new request.
          </DialogDescription>
          <div className="mt-4 space-y-1.5">
            <label htmlFor="cancel-reason" className="text-sm font-medium text-fg">
              Reason <span className="font-normal text-subtle">(optional)</span>
            </label>
            <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep request
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={async () => {
                try {
                  await cancel.mutateAsync(reason.trim() || null)
                  setCancelOpen(false)
                  toast.success('Request cancelled')
                } catch (err) {
                  toast.error(errorMessage(err))
                }
              }}
            >
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete this draft?</DialogTitle>
          <DialogDescription>The draft and any files you uploaded will be permanently removed.</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep draft
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={async () => {
                try {
                  await del.mutateAsync(r.reference_no)
                  toast.success('Draft deleted')
                  navigate('/requests', { replace: true })
                } catch (err) {
                  toast.error(errorMessage(err))
                }
              }}
            >
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-3">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-7 w-56" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  )
}
