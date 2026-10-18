import { AlarmClock, Check, Copy, FileText, Mail, Phone, Send, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { StatusTimeline } from '@/components/shared/StatusTimeline'
import { DefinitionList, ErrorState } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAddNote,
  useAssign,
  useReviewAttachment,
  useStaffMembers,
  useStaffRequest,
  useTransition,
} from '@/features/registrar/api'
import { TransitionDialog } from '@/features/registrar/components/TransitionDialog'
import { openAttachment } from '@/features/requests/api'
import { FeeSummary } from '@/features/requests/components/FeeSummary'
import { addressText, formatFieldValue } from '@/features/requests/components/wizard/ReviewStep'
import { apiError, errorMessage } from '@/lib/errors'
import { STAFF_ACTIONS, STATUS, staffActionLabel } from '@/lib/status'
import { cn, formatBytes, formatDate, formatDateTime } from '@/lib/utils'

const STANDING = { enrolled: 'Enrolled', graduated: 'Graduate', inactive: 'Inactive' }

export function RequestPanel({ reference, onClose }) {
  return (
    <Sheet open={Boolean(reference)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {reference && <PanelBody reference={reference} />}
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, children, action }) {
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

function PanelBody({ reference }) {
  const { data: r, isLoading, error, refetch } = useStaffRequest(reference)
  const [action, setAction] = useState(null)
  const transition = useTransition(reference)

  if (error) {
    return (
      <div className="p-6 pt-14">
        <SheetTitle className="sr-only">{reference}</SheetTitle>
        <ErrorState error={error} onRetry={refetch} />
      </div>
    )
  }
  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <SheetTitle className="sr-only">Loading {reference}</SheetTitle>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  const doc = r.document_type_full

  async function confirm(remarks) {
    try {
      const updated = await transition.mutateAsync({ to_status: action.toStatus, remarks, version: r.version })
      toast.success(`${updated.reference_no} is now ${STATUS[updated.status].label}`)
      setAction(null)
    } catch (err) {
      const e = apiError(err)
      toast.error(e.message)
      if (e.code === 'STALE_REQUEST') {
        setAction(null)
        refetch()
      }
    }
  }

  return (
    <>
      {/* Header */}
      <div className="border-b border-border bg-surface px-5 pb-4 pt-5 pr-14 sm:px-6">
        <p className="flex items-center gap-2 font-mono text-[13px] text-muted">
          {r.reference_no}
          <button
            type="button"
            className="rounded p-1 hover:bg-surface-muted hover:text-fg"
            onClick={() => navigator.clipboard?.writeText(r.reference_no).then(() => toast.success('Copied'))}
            aria-label="Copy reference number"
          >
            <Copy className="size-3.5" />
          </button>
        </p>
        <SheetTitle className="mt-0.5 text-xl font-semibold text-fg">{doc.name}</SheetTitle>
        <SheetDescription className="sr-only">Request details and actions</SheetDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} />
          {r.is_overdue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 text-[13px] font-semibold text-danger">
              <AlarmClock className="size-4" aria-hidden="true" /> Overdue
            </span>
          )}
          <span className="text-[13px] text-muted">
            Submitted {formatDateTime(r.submitted_at)}
            {r.estimated_release_date && ` · Est. release ${formatDate(r.estimated_release_date)}`}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {r.status === 'resubmitted' && r.history.at(-1)?.remarks && (
          <Alert tone="info" title="Student’s note on resubmission">
            “{r.history.at(-1).remarks}”
          </Alert>
        )}

        <Section title="Student">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-fg">{r.student.full_name}</p>
              <p className="text-sm text-muted">
                <span className="font-mono">{r.student.student_no}</span> · {r.student.program?.code ?? '—'}
                {r.student.year_level ? ` · Year ${r.student.year_level}` : ''} · {STANDING[r.student.standing]}
              </p>
            </div>
            <div className="space-y-1 text-sm">
              <a href={`mailto:${r.student.email}`} className="flex items-center gap-1.5 text-link hover:underline">
                <Mail className="size-3.5" aria-hidden="true" /> {r.student.email}
              </a>
              {r.student.contact_no && (
                <a href={`tel:${r.student.contact_no}`} className="flex items-center gap-1.5 text-muted hover:text-fg">
                  <Phone className="size-3.5" aria-hidden="true" /> {r.student.contact_no}
                </a>
              )}
            </div>
          </div>
        </Section>

        <Section title="Request">
          <DefinitionList
            items={[
              { label: 'Purpose', value: r.purpose },
              { label: 'Copies', value: String(r.copies) },
              ...doc.required_fields.map((f) => ({ label: f.label, value: formatFieldValue(f, r.form_data[f.key]) })),
              {
                label: 'Delivery',
                value:
                  r.delivery_method === 'courier' ? (
                    <span className="whitespace-pre-line">{`Courier\n${addressText(r.delivery_address)}`}</span>
                  ) : (
                    'Pick-up'
                  ),
              },
            ]}
          />
        </Section>

        <AttachmentsSection request={r} />

        <Section title="Fees">
          <FeeSummary lines={r.fee_breakdown} total={r.fee_total} requiresPayment={Number(r.fee_total) > 0} />
        </Section>

        <AssignSection request={r} />

        <Section title="Activity">
          <NoteForm reference={r.reference_no} />
          <div className="mt-5">
            <StatusTimeline history={r.history} />
          </div>
        </Section>
      </div>

      {/* Sticky actions */}
      {r.transitions.length > 0 && (
        <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">
          <div className="flex flex-wrap justify-end gap-2">
            {/* Destructive actions sit left of the forward actions. */}
            {[...r.transitions]
              .sort((a, b) => Number(b.to_status === 'rejected') - Number(a.to_status === 'rejected'))
              .map((t) => (
                <Button
                  key={t.to_status}
                  variant={STAFF_ACTIONS[t.to_status]?.variant ?? 'secondary'}
                  onClick={() => setAction({ toStatus: t.to_status, fromStatus: r.status, requiresRemarks: t.requires_remarks })}
                >
                  {staffActionLabel(t.to_status, r.status)}
                </Button>
              ))}
          </div>
        </div>
      )}

      <TransitionDialog action={action} onClose={() => setAction(null)} onConfirm={confirm} pending={transition.isPending} />
    </>
  )
}

function AttachmentsSection({ request: r }) {
  const review = useReviewAttachment()
  const doc = r.document_type_full
  const files = r.attachments.filter((a) => a.kind === 'requirement')
  const missing = doc.required_attachments.filter((s) => s.required && !files.some((f) => f.requirement_key === s.key))

  async function setReview(id, review_status) {
    try {
      await review.mutateAsync({ id, review_status })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Section title="Requirements">
      {files.length === 0 && missing.length === 0 ? (
        <p className="text-sm text-muted">No attachments required.</p>
      ) : (
        <ul className="divide-y divide-border">
          {files.map((a) => {
            const spec = doc.required_attachments.find((s) => s.key === a.requirement_key)
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <FileText className="size-5 shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-link hover:underline"
                    onClick={() => openAttachment(a.id).catch((e) => toast.error(errorMessage(e)))}
                  >
                    {spec?.label ?? a.original_filename}
                  </button>
                  <p className="truncate text-xs text-muted">
                    {a.original_filename} · {formatBytes(a.size_bytes)}
                  </p>
                </div>
                <div role="group" aria-label={`Review ${spec?.label ?? 'file'}`} className="flex gap-1">
                  {[
                    { value: 'accepted', label: 'Accept', done: 'Accepted', icon: Check, on: 'bg-success-soft text-success border-success/40' },
                    { value: 'rejected', label: 'Flag', done: 'Flagged', icon: X, on: 'bg-danger-soft text-danger border-danger/40' },
                  ].map(({ value, label, done, icon: Icon, on }) => {
                    const active = a.review_status === value
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        disabled={review.isPending}
                        onClick={() => setReview(a.id, active ? 'pending' : value)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                          active ? on : 'border-border-strong text-muted hover:bg-surface-muted',
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden="true" /> {active ? done : label}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
          {missing.map((s) => (
            <li key={s.key} className="py-3 text-sm text-danger">
              Missing: {s.label}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function AssignSection({ request: r }) {
  const { data: members } = useStaffMembers()
  const assign = useAssign(r.reference_no)
  return (
    <Section title="Assigned to">
      <Select
        aria-label="Assigned staff member"
        value={r.assigned_to?.id ?? ''}
        disabled={assign.isPending}
        onChange={async (e) => {
          try {
            await assign.mutateAsync(e.target.value ? Number(e.target.value) : null)
            toast.success('Assignment updated')
          } catch (err) {
            toast.error(errorMessage(err))
          }
        }}
      >
        <option value="">Unassigned</option>
        {members?.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
            {m.position ? ` · ${m.position}` : ''}
          </option>
        ))}
      </Select>
    </Section>
  )
}

function NoteForm({ reference }) {
  const [text, setText] = useState('')
  const add = useAddNote(reference)
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        try {
          await add.mutateAsync(text.trim())
          setText('')
          toast.success('Note added')
        } catch (err) {
          toast.error(errorMessage(err))
        }
      }}
    >
      <label htmlFor={`note-${reference}`} className="text-[13px] font-medium text-muted">
        Internal note (staff only, never shown to the student)
      </label>
      <div className="flex gap-2">
        <Textarea
          id={`note-${reference}`}
          rows={2}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g., Called Accounting to confirm clearance"
          className="min-h-11"
        />
        <Button type="submit" variant="secondary" size="icon" className="mt-auto shrink-0" loading={add.isPending} aria-label="Add note">
          {!add.isPending && <Send />}
        </Button>
      </div>
    </form>
  )
}
