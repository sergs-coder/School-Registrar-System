import { AlarmClock, Check, ChevronRight, Clock, Eye, GraduationCap, TriangleAlert, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DefinitionList, EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountRequests, useApproveAccountRequest, useRejectAccountRequest } from '@/features/registrar/api'
import { openFile } from '@/features/requests/api'
import { errorMessage } from '@/lib/errors'
import { cn, formatDate, formatDateTime, timeAgo } from '@/lib/utils'

const TABS = [
  { key: 'pending', label: 'To review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]
const STANDING = { enrolled: 'New / current student', graduated: 'Graduate', inactive: 'Former student (did not graduate)' }
const YEAR_LABEL = { enrolled: 'Year enrolled', graduated: 'Year graduated', inactive: 'Last year attended' }

/** People without a working account asking for portal access (new or current students, alumni, former
 * students); staff check them against the records. */
export function AccountRequestsPage() {
  const [tab, setTab] = useState('pending')
  const [openId, setOpenId] = useState(null)
  const { data, isLoading, error, refetch } = useAccountRequests(tab)
  const reviewing = data?.find((r) => r.id === openId) ?? null
  const urgent = data?.filter((r) => r.urgent).length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access requests"
        description="New or current students, alumni and former students who asked for portal access. Open a request to check the details and ID against your records before approving."
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="tablist" aria-label="Status" className="inline-flex rounded-lg border border-border bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                tab === t.key ? 'bg-primary-soft text-link' : 'text-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'pending' && data?.length > 0 && (
          <p className="text-sm text-muted">
            {data.length} to review
            {urgent > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-danger">
                <AlarmClock className="size-4" aria-hidden="true" /> {urgent} urgent
              </span>
            )}
            <span className="ml-2 text-subtle">· oldest first</span>
          </p>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={tab === 'pending' ? 'No requests to review' : `No ${tab} requests yet`}
          description={tab === 'pending' ? 'New requests from the “Request access” page will show up here.' : undefined}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.map((r) => (
            <li key={r.id}>
              <RequestBox request={r} onOpen={() => setOpenId(r.id)} />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={Boolean(reviewing)} onOpenChange={(open) => !open && setOpenId(null)}>
        {reviewing && <ReviewPanel request={reviewing} onDone={() => setOpenId(null)} />}
      </Sheet>
    </div>
  )
}

const fullName = (r) => [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
// Working days only, so a request sent on a Saturday has waited 0 days on Sunday: that isn't "today".
const waited = (r) => {
  const n = r.waiting_days
  if (n > 0) return `Waiting ${n} working ${n === 1 ? 'day' : 'days'}`
  return formatDate(r.created_at) === formatDate(new Date()) ? 'Sent today' : 'Under 1 working day'
}

/** One request as a box: who, when it was sent, how long it has waited, and a quick record check. */
function RequestBox({ request: r, onOpen }) {
  const pending = r.status === 'pending'
  const rec = r.record
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cn(
        'group flex h-full w-full flex-col rounded-2xl border bg-surface p-4 text-left shadow-card transition-shadow hover:shadow-pop focus-visible:outline-offset-4',
        r.urgent ? 'border-danger/50' : 'border-border',
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
          {r.standing === 'enrolled' ? <UserPlus className="size-3.5" aria-hidden="true" /> : <GraduationCap className="size-3.5" aria-hidden="true" />}
          {STANDING[r.standing]}
        </span>
        {r.urgent && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
            <AlarmClock className="size-3.5" aria-hidden="true" /> Urgent
          </span>
        )}
      </div>
      <p className="mt-3 text-base font-semibold text-fg">{fullName(r)}</p>
      <p className="font-mono text-xs text-muted">{r.student_no}</p>

      <dl className="mt-3 space-y-1 text-[13px]">
        <div className="flex gap-1.5">
          <dt className="text-muted">Submitted</dt>
          <dd className="font-medium text-fg">{formatDateTime(r.created_at)}</dd>
        </div>
        {pending ? (
          <div className={cn('flex items-center gap-1.5', r.urgent ? 'font-semibold text-danger' : 'text-muted')}>
            <Clock className="size-3.5" aria-hidden="true" />
            <dd>{waited(r)}</dd>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <dt className="text-muted">{r.status === 'approved' ? 'Approved' : 'Rejected'}</dt>
            <dd className="text-fg">{formatDateTime(r.reviewed_at)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto flex w-full items-center justify-between gap-2 border-t border-border pt-3 text-[13px]">
        <span className={cn('flex items-center gap-1.5', !rec ? 'text-muted' : rec.name_matches && rec.birthdate_matches ? 'text-success' : 'text-danger')}>
          {!rec ? (
            <>No record on file</>
          ) : rec.name_matches && rec.birthdate_matches ? (
            <>
              <Check className="size-3.5" aria-hidden="true" /> Matches record
            </>
          ) : (
            <>
              <TriangleAlert className="size-3.5" aria-hidden="true" /> Differs from record
            </>
          )}
        </span>
        <span className="flex items-center gap-1 font-semibold text-link">
          {pending ? 'Review' : 'View'} <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
      {r.email_in_use && pending && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
          <TriangleAlert className="size-3.5" aria-hidden="true" /> Email already used by another account
        </p>
      )}
    </button>
  )
}

/** The full review: everything on the request, the ID, the record check, then approve or reject. */
function ReviewPanel({ request: r, onDone }) {
  const approve = useApproveAccountRequest()
  const [rejecting, setRejecting] = useState(false)
  const [viewing, setViewing] = useState(false)
  const name = fullName(r)
  const pending = r.status === 'pending'

  async function viewId() {
    setViewing(true)
    try {
      await openFile(`/staff/account-requests/${r.id}/id-file`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setViewing(false)
    }
  }

  return (
    <SheetContent aria-describedby={undefined}>
      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <div className="space-y-1 pr-10">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
            {r.standing === 'enrolled' ? <UserPlus className="size-3.5" aria-hidden="true" /> : <GraduationCap className="size-3.5" aria-hidden="true" />}
            {STANDING[r.standing]}
          </p>
          <SheetTitle className="text-xl font-semibold text-fg">{name}</SheetTitle>
          <p className="font-mono text-sm text-muted">{r.student_no}</p>
        </div>

        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 text-sm', r.urgent ? 'bg-danger-soft' : 'bg-surface-muted')}>
          <span>
            <span className="text-muted">Submitted </span>
            <span className="font-medium text-fg">{formatDateTime(r.created_at)}</span>
            <span className="text-muted"> ({timeAgo(r.created_at)})</span>
          </span>
          {pending && (
            <span className={cn('inline-flex items-center gap-1.5', r.urgent ? 'font-semibold text-danger' : 'text-muted')}>
              {r.urgent ? <AlarmClock className="size-4" aria-hidden="true" /> : <Clock className="size-4" aria-hidden="true" />}
              {waited(r)}
              {r.urgent && ' · urgent'}
            </span>
          )}
        </div>

        <Button variant="secondary" loading={viewing} onClick={viewId} className="w-full sm:w-auto">
          {!viewing && <Eye />} View uploaded ID
        </Button>

        <DefinitionList
          className="[&_dt]:sm:w-36"
          items={[
            { label: 'Date of birth', value: formatDate(r.birthdate) },
            { label: 'Program', value: r.program },
            { label: YEAR_LABEL[r.standing], value: String(r.last_year_attended) },
            { label: 'Email', value: r.email },
            { label: 'Mobile', value: r.contact_no },
          ]}
        />
        <RecordCheck request={r} />

        {r.email_in_use && pending && (
          <Alert tone="warning" icon={TriangleAlert} title="This email already belongs to another account">
            Ask the person to sign in with that account, or reject this request and ask them to use a different email.
          </Alert>
        )}

        {!pending && (
          <p className="text-sm text-muted">
            {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.reviewed_by_name ?? '—'} on {formatDateTime(r.reviewed_at)}
            {r.remarks && <> · “{r.remarks}”</>}
          </p>
        )}
      </div>

      {pending && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface p-4 sm:px-6">
          <Button variant="danger-outline" onClick={() => setRejecting(true)} className="flex-1 sm:flex-none">
            <X /> Reject
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            loading={approve.isPending}
            disabled={r.email_in_use}
            onClick={async () => {
              try {
                const out = await approve.mutateAsync(r.id)
                toast.success(`Approved. A set-password link was emailed to ${out.email}.`)
                onDone()
              } catch (err) {
                toast.error(errorMessage(err))
              }
            }}
          >
            {!approve.isPending && <Check />} Approve and send link
          </Button>
        </div>
      )}
      <RejectDialog request={r} open={rejecting} onOpenChange={setRejecting} onRejected={onDone} />
    </SheetContent>
  )
}

function Match({ ok, label }) {
  return (
    <li className={cn('flex items-center gap-2 text-sm', ok ? 'text-success' : 'text-danger')}>
      {ok ? <Check className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
      <span className="text-fg">{label}</span>
      <span className="sr-only">{ok ? 'matches' : 'does not match'}</span>
    </li>
  )
}

/** How the request compares with the student record under the same student number. */
function RecordCheck({ request: r }) {
  const rec = r.record
  return (
    <div className="rounded-xl bg-surface-muted p-4">
      <p className="mb-2 text-sm font-semibold text-fg">Student record</p>
      {rec ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            On file: <span className="font-medium text-fg">{rec.full_name}</span>, born {formatDate(rec.birthdate)},{' '}
            {STANDING[rec.standing].toLowerCase()}. Signs in as {rec.login_email}.
          </p>
          <ul className="space-y-1">
            <Match ok={rec.name_matches} label="Name" />
            <Match ok={rec.birthdate_matches} label="Date of birth" />
          </ul>
          {r.status === 'pending' && (
            <p className="text-[13px] text-muted">Approving adds {r.email} to this student’s account as a confirmed personal email.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          No portal record has this student number.{' '}
          {r.standing === 'enrolled'
            ? 'Check it against this term’s enrollment list.'
            : 'Check your paper or archive records.'}
          {r.status === 'pending' && ' Approving creates a new student account.'}
        </p>
      )}
    </div>
  )
}

function RejectDialog({ request: r, open, onOpenChange, onRejected }) {
  const reject = useRejectAccountRequest()
  const [remarks, setRemarks] = useState('')
  const tooShort = remarks.trim().length < 5
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Reject this request?</DialogTitle>
        <DialogDescription>
          We’ll email {r.email} your reason, so they know what to fix before sending a new request.
        </DialogDescription>
        <div className="mt-4 space-y-1.5">
          <label htmlFor={`reject-${r.id}`} className="text-sm font-medium text-fg">
            Reason
          </label>
          <Textarea
            id={`reject-${r.id}`}
            rows={3}
            maxLength={1000}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g., We couldn’t find this student number. Please check your old school ID."
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={tooShort}
            loading={reject.isPending}
            onClick={async () => {
              try {
                await reject.mutateAsync({ id: r.id, remarks: remarks.trim() })
                onOpenChange(false)
                toast.success('Request rejected')
                onRejected?.()
              } catch (err) {
                toast.error(errorMessage(err))
              }
            }}
          >
            Reject request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
