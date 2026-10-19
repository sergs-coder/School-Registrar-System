import { Check, Eye, GraduationCap, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DefinitionList, EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
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
const STANDING = { enrolled: 'Enrolled', graduated: 'Graduate', inactive: 'Former student (did not graduate)' }

/** Alumni and former students asking for portal access; staff check them against the records. */
export function AccountRequestsPage() {
  const [tab, setTab] = useState('pending')
  const { data, isLoading, error, refetch } = useAccountRequests(tab)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alumni access"
        description="Alumni and former students who asked for portal access. Check their details and ID against your records before approving."
      />
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

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={tab === 'pending' ? 'No requests to review' : `No ${tab} requests yet`}
          description={tab === 'pending' ? 'New requests from the “Alumni & former students” page will show up here.' : undefined}
        />
      ) : (
        <ul className="space-y-4">
          {data.map((r) => (
            <li key={r.id}>
              <RequestCard request={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RequestCard({ request: r }) {
  const approve = useApproveAccountRequest()
  const [rejecting, setRejecting] = useState(false)
  const [viewing, setViewing] = useState(false)
  const name = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
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
    <Card>
      <CardContent className="space-y-5 pt-5 sm:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fg">{name}</h2>
            <p className="text-sm text-muted">
              <span className="font-mono">{r.student_no}</span> · {STANDING[r.standing]} · sent {timeAgo(r.created_at)}
            </p>
          </div>
          <Button variant="secondary" size="sm" loading={viewing} onClick={viewId}>
            {!viewing && <Eye />} View ID
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <DefinitionList
            className="[&_dt]:sm:w-36"
            items={[
              { label: 'Date of birth', value: formatDate(r.birthdate) },
              { label: 'Program', value: r.program },
              { label: r.standing === 'graduated' ? 'Year graduated' : 'Last year attended', value: String(r.last_year_attended) },
              { label: 'Email', value: r.email },
              { label: 'Mobile', value: r.contact_no },
            ]}
          />
          <RecordCheck request={r} />
        </div>

        {r.email_in_use && pending && (
          <Alert tone="warning" icon={TriangleAlert} title="This email already belongs to another account">
            Ask the person to sign in with that account, or reject this request and ask them to use a different email.
          </Alert>
        )}

        {pending ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="danger-outline" onClick={() => setRejecting(true)}>
              <X /> Reject
            </Button>
            <Button
              loading={approve.isPending}
              disabled={r.email_in_use}
              onClick={async () => {
                try {
                  const out = await approve.mutateAsync(r.id)
                  toast.success(`Approved. A set-password link was emailed to ${out.email}.`)
                } catch (err) {
                  toast.error(errorMessage(err))
                }
              }}
            >
              {!approve.isPending && <Check />} Approve and send link
            </Button>
          </div>
        ) : (
          <p className="border-t border-border pt-4 text-sm text-muted">
            {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.reviewed_by_name ?? '—'} on {formatDateTime(r.reviewed_at)}
            {r.remarks && <> · “{r.remarks}”</>}
          </p>
        )}
      </CardContent>
      <RejectDialog request={r} open={rejecting} onOpenChange={setRejecting} />
    </Card>
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
          No portal record has this student number. Check your paper or archive records.
          {r.status === 'pending' && ' Approving creates a new student account.'}
        </p>
      )}
    </div>
  )
}

function RejectDialog({ request: r, open, onOpenChange }) {
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
