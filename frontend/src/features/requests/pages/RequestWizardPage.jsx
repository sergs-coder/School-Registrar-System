import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ErrorState } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CATEGORY_LABELS, useDocumentType } from '@/features/catalog/api'
import {
  useCreateDraft,
  useQuote,
  useRequest,
  useResubmitRequest,
  useSubmitRequest,
  useUpdateRequest,
} from '@/features/requests/api'
import { FeeSummary, TimingSummary } from '@/features/requests/components/FeeSummary'
import { AttachmentsStep } from '@/features/requests/components/wizard/AttachmentsStep'
import { DeliveryStep } from '@/features/requests/components/wizard/DeliveryStep'
import { DetailsStep } from '@/features/requests/components/wizard/DetailsStep'
import { ReviewStep } from '@/features/requests/components/wizard/ReviewStep'
import { WizardProgress } from '@/features/requests/components/wizard/StepShell'
import { errorMessage } from '@/lib/errors'

/** /requests/new/:slug — start a new request. */
export function NewRequestPage() {
  const { slug } = useParams()
  const { data: docType, isLoading, error, refetch } = useDocumentType(slug)
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isLoading) return <WizardSkeleton />
  return <RequestWizard docType={docType} initialRequest={null} />
}

/** /requests/:ref/edit — continue a draft or fix a returned request. */
export function EditRequestPage() {
  const { ref } = useParams()
  const { data: request, isLoading, error, refetch } = useRequest(ref)
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isLoading) return <WizardSkeleton />
  if (!request.allowed_actions.includes('edit')) return <Navigate to={`/requests/${ref}`} replace />
  return <RequestWizard docType={request.document_type_full} initialRequest={request} />
}

function RequestWizard({ docType, initialRequest }) {
  const navigate = useNavigate()
  const [ref, setRef] = useState(initialRequest?.reference_no ?? null)
  const { data: liveRequest } = useRequest(ref)
  const request = liveRequest ?? initialRequest

  const steps = useMemo(
    () =>
      [
        { key: 'details', label: 'Details' },
        docType.required_attachments.length > 0 && { key: 'attachments', label: 'Requirements' },
        { key: 'delivery', label: 'Delivery' },
        { key: 'review', label: 'Review' },
      ].filter(Boolean),
    [docType],
  )
  const startAt = initialRequest ? steps.length - 1 : 0
  const [step, setStep] = useState(initialRequest?.status === 'needs_correction' ? 0 : startAt)
  const [maxReached, setMaxReached] = useState(initialRequest ? steps.length - 1 : 0)
  const [delivery, setDelivery] = useState(null)

  const create = useCreateDraft()
  const update = useUpdateRequest(ref)
  const submit = useSubmitRequest(ref)
  const resubmit = useResubmitRequest(ref)

  const go = useCallback(
    (i) => {
      setStep(i)
      setMaxReached((m) => Math.max(m, i))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [],
  )

  const quoteBody = {
    document_type_id: docType.id,
    copies: request?.copies ?? 1,
    delivery_method: delivery?.delivery_method ?? request?.delivery_method ?? 'pickup',
    region: delivery?.region ?? request?.delivery_address?.region ?? null,
  }
  const { data: quote, isLoading: quoteLoading } = useQuote(quoteBody)

  async function saveDetails(values) {
    if (!ref) {
      const created = await create.mutateAsync({ document_type_id: docType.id, ...values })
      setRef(created.reference_no)
      // Make a page refresh resume this draft, without remounting the wizard.
      window.history.replaceState(window.history.state, '', `/requests/${created.reference_no}/edit`)
      toast.success(`Draft saved · ${created.reference_no}`)
    } else {
      await update.mutateAsync(values)
    }
    go(step + 1)
  }

  async function saveDelivery(values) {
    await update.mutateAsync(values)
    go(step + 1)
  }

  async function doSubmit(note) {
    try {
      const result = request.status === 'needs_correction' ? await resubmit.mutateAsync(note) : await submit.mutateAsync()
      toast.success(
        result.status === 'resubmitted' ? 'Corrections sent to the Registrar.' : `Request ${result.reference_no} submitted!`,
      )
      navigate(`/requests/${result.reference_no}`, { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const current = steps[step]
  const isResubmit = request?.status === 'needs_correction'
  const submitError = submit.error ?? resubmit.error

  return (
    <div className="space-y-6">
      <Link
        to={ref ? `/requests/${ref}` : '/requests/new'}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {ref && request?.status !== 'draft' ? 'Back to request' : 'All documents'}
      </Link>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
          {CATEGORY_LABELS[docType.category]}
          {ref && <span className="font-mono normal-case tracking-normal"> · {ref}</span>}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px] sm:leading-9">
          {isResubmit ? 'Correct your request' : docType.name}
        </h1>
        {!isResubmit && <p className="max-w-2xl text-[15px] text-muted">{docType.description}</p>}
      </div>

      {isResubmit && request.latest_remarks && (
        <Alert tone="warning" icon={TriangleAlert} title="The Registrar asked for a correction">
          “{request.latest_remarks}”
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="border-b border-border p-5 sm:px-6">
            <WizardProgress steps={steps} current={step} maxReached={ref ? maxReached : 0} onJump={go} />
          </div>
          <div className="p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold text-fg">{current.label}</h2>
            {current.key === 'details' && (
              <DetailsStep
                key={ref ?? 'new'}
                docType={docType}
                request={request}
                onSave={saveDetails}
                saving={create.isPending || update.isPending}
              />
            )}
            {current.key === 'attachments' && request && (
              <AttachmentsStep docType={docType} request={request} onBack={() => go(step - 1)} onNext={() => go(step + 1)} />
            )}
            {current.key === 'delivery' && request && (
              <DeliveryStep
                docType={docType}
                request={request}
                onBack={() => go(step - 1)}
                onSave={saveDelivery}
                saving={update.isPending}
                onChange={setDelivery}
              />
            )}
            {current.key === 'review' && request && (
              <ReviewStep
                docType={docType}
                request={request}
                steps={steps}
                onJump={go}
                onBack={() => go(step - 1)}
                onSubmit={doSubmit}
                submitting={submit.isPending || resubmit.isPending}
                submitError={submitError}
              />
            )}
          </div>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Request summary">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <FeeSummary
                lines={quote?.fee_breakdown ?? []}
                total={quote?.fee_total ?? 0}
                loading={quoteLoading && !quote}
                requiresPayment={quote?.requires_payment ?? docType.requires_payment}
              />
              <TimingSummary processingDays={docType.processing_days} estimatedDate={quote?.estimated_release_date} />
            </CardContent>
          </Card>
          {docType.instructions && (
            <Alert tone="info" title="Good to know">
              {docType.instructions}
            </Alert>
          )}
          {quote?.requires_payment && (
            <p className="px-1 text-[13px] text-muted">
              You’ll pay after the Registrar approves your request. Payment instructions will appear on the request page.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}

function WizardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  )
}
