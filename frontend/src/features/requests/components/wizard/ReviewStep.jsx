import { Pencil } from 'lucide-react'
import { useId, useState } from 'react'

import { FormField } from '@/components/shared/FormField'
import { DefinitionList } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Checkbox, Textarea } from '@/components/ui/input'
import { StepActions } from '@/features/requests/components/wizard/StepShell'
import { apiError } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'

export function formatFieldValue(field, value) {
  if (value === undefined || value === null || value === '') return null
  if (field.type === 'checkbox') return value ? 'Yes' : 'No'
  return String(value)
}

export function addressText(a) {
  if (!a) return null
  const street = [a.line1, a.barangay && `Brgy. ${a.barangay.replace(/^Barangay /, '')}`].filter(Boolean).join(', ')
  const landmark = a.landmark ? `\nLandmark: ${a.landmark}` : ''
  return `${a.recipient} · ${a.contact_no}\n${street}, ${a.city}, ${a.province} ${a.zip}${landmark}`
}

function Section({ title, onEdit, children }) {
  return (
    <section className="rounded-xl border border-border p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-link hover:bg-primary-soft"
          >
            <Pencil className="size-3.5" aria-hidden="true" /> Edit<span className="sr-only"> {title.toLowerCase()}</span>
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

export function ReviewStep({ docType, request, steps, onJump, onBack, onSubmit, submitting, submitError }) {
  const [certified, setCertified] = useState(false)
  const [note, setNote] = useState('')
  const [showCertError, setShowCertError] = useState(false)
  const certId = useId()
  const isResubmit = request.status === 'needs_correction'
  const stepIndex = (key) => steps.findIndex((s) => s.key === key)
  const files = request.attachments.filter((a) => a.kind === 'requirement')

  const serverErr = submitError ? apiError(submitError) : null

  function submit() {
    if (!certified) {
      setShowCertError(true)
      return
    }
    onSubmit(isResubmit ? note.trim() || null : undefined)
  }

  return (
    <div className="space-y-5">
      {serverErr && (
        <Alert tone="danger" title={serverErr.message}>
          {serverErr.details?.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {serverErr.details.map((d) => (
                <li key={d.field + d.message}>{d.message}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <Section title="Request details" onEdit={() => onJump(stepIndex('details'))}>
        <DefinitionList
          items={[
            { label: 'Document', value: docType.name },
            { label: 'Purpose', value: request.purpose },
            { label: 'Copies', value: String(request.copies) },
            ...docType.required_fields.map((f) => ({ label: f.label, value: formatFieldValue(f, request.form_data[f.key]) })),
          ]}
        />
      </Section>

      {docType.required_attachments.length > 0 && (
        <Section title="Requirements" onEdit={() => onJump(stepIndex('attachments'))}>
          {files.length === 0 ? (
            <p className="py-2 text-sm text-muted">No files uploaded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {docType.required_attachments.map((spec) => {
                const f = files.find((a) => a.requirement_key === spec.key)
                return (
                  <li key={spec.key} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:gap-4">
                    <span className="text-muted sm:w-44 sm:shrink-0">{spec.label}</span>
                    <span className="min-w-0 truncate font-medium text-fg">
                      {f ? `${f.original_filename} (${formatBytes(f.size_bytes)})` : spec.required ? '—' : 'Not provided'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      )}

      <Section title="Delivery" onEdit={() => onJump(stepIndex('delivery'))}>
        <DefinitionList
          items={[
            { label: 'Method', value: request.delivery_method === 'courier' ? 'Courier delivery' : 'Pick-up at the Registrar' },
            request.delivery_method === 'courier' && {
              label: 'Address',
              value: <span className="whitespace-pre-line">{addressText(request.delivery_address)}</span>,
            },
          ]}
        />
      </Section>

      {isResubmit && (
        <FormField label="Note to the Registrar" help="Briefly say what you corrected.">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="e.g., Uploaded a clearer copy of my ID." />
        </FormField>
      )}

      <div className="space-y-1.5 rounded-xl bg-surface-muted p-4">
        <label htmlFor={certId} className="flex cursor-pointer items-start gap-3 text-sm text-fg">
          <Checkbox
            id={certId}
            className="mt-0.5"
            checked={certified}
            aria-invalid={showCertError && !certified ? true : undefined}
            onChange={(e) => {
              setCertified(e.target.checked)
              setShowCertError(false)
            }}
          />
          <span>
            I certify that the information and files I submitted are true and correct, and I authorize the Registrar’s
            Office to process them for this request.
          </span>
        </label>
        {showCertError && !certified && (
          <p className="pl-8 text-[13px] font-medium text-danger">Please confirm before submitting.</p>
        )}
      </div>

      <StepActions
        onBack={onBack}
        nextType="button"
        onNext={submit}
        saving={submitting}
        nextLabel={isResubmit ? 'Resubmit request' : 'Submit request'}
      />
    </div>
  )
}
