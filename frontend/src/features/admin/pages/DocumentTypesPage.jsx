import { EyeOff, FileCog, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/shared/FormField'
import { EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminDocumentTypes, useSaveDocumentType } from '@/features/admin/api'
import { CATEGORY_LABELS } from '@/features/catalog/api'
import { apiError } from '@/lib/errors'
import { cn, formatPeso } from '@/lib/utils'

const FIELD_TYPES = { text: 'Short text', textarea: 'Long text', number: 'Number', date: 'Date', select: 'Dropdown', checkbox: 'Checkbox' }
const FILE_TYPES = ['pdf', 'jpg', 'png']

const toKey = (label) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40)
const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

const BLANK = {
  code: '', slug: '', name: '', description: '', category: 'certificate', base_fee: '0.00', fee_per_copy: true,
  max_copies: 3, processing_days: 3, requires_payment: true, allow_courier: true, allow_edocument: false,
  purposes: [], required_fields: [], required_attachments: [], instructions: '', is_active: true, sort_order: 0,
}

/** Pydantic prefixes model-level messages with "Value error, ". */
const cleanMessage = (m) => m?.replace(/^Value error, /, '')

export function DocumentTypesPage() {
  const { data, isLoading, error, refetch } = useAdminDocumentTypes()
  const [editing, setEditing] = useState(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document types"
        description="What students can request, what it costs and what they must provide. Changes apply to new and draft requests; submitted requests keep the terms they were submitted under."
        actions={
          <Button onClick={() => setEditing({ ...BLANK })}>
            <Plus /> New document type
          </Button>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Document types</caption>
              <thead className="border-b border-border bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Document</th>
                  <th scope="col" className="px-3 py-3">Category</th>
                  <th scope="col" className="px-3 py-3 text-right">Fee</th>
                  <th scope="col" className="px-3 py-3 text-right">Days</th>
                  <th scope="col" className="px-3 py-3">Options</th>
                  <th scope="col" className="px-3 py-3 text-right">Requests</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={7} className="px-4 py-3">
                          <Skeleton className="h-9" />
                        </td>
                      </tr>
                    ))
                  : data.map((d) => (
                      <tr key={d.id} className={cn(!d.is_active && 'bg-surface-muted/40')}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-fg">
                            {d.name}
                            {!d.is_active && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted">
                                <EyeOff className="size-3" aria-hidden="true" /> Hidden
                              </span>
                            )}
                          </p>
                          <p className="font-mono text-xs text-muted">{d.code}</p>
                        </td>
                        <td className="px-3 py-3 text-muted">{CATEGORY_LABELS[d.category]}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {Number(d.base_fee) > 0 && d.requires_payment ? formatPeso(d.base_fee) : 'Free'}
                          {d.fee_per_copy && Number(d.base_fee) > 0 && <span className="block text-xs text-muted">per copy</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{d.processing_days}</td>
                        <td className="px-3 py-3 text-xs text-muted">
                          {[d.allow_courier && 'Courier', d.allow_edocument && 'E-document'].filter(Boolean).join(' · ') || 'Pick-up only'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{d.request_count}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>
                            Edit<span className="sr-only"> {d.name}</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!isLoading && data.length === 0 && (
            <EmptyState icon={FileCog} className="m-4 border-none" title="No document types yet" />
          )}
        </Card>
      )}
      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent aria-describedby={undefined}>
          {editing && <Editor key={editing.id ?? 'new'} initial={editing} onDone={() => setEditing(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Toggle({ label, help, checked, onChange }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-fg">{label}</span>
        {help && <span className="block text-[13px] text-muted">{help}</span>}
      </label>
    </div>
  )
}

function Group({ title, children, action }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-semibold text-fg">{title}</legend>
        {action}
      </div>
      {children}
    </fieldset>
  )
}

function Editor({ initial, onDone }) {
  const isNew = !initial.id
  const save = useSaveDocumentType()
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...initial,
    required_fields: (initial.required_fields ?? []).map((f) => ({ ...f, optionsText: (f.options ?? []).join('\n') })),
  }))
  const [purposesText, setPurposesText] = useState((initial.purposes ?? []).join('\n'))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const err = (k) => errors[k]

  function setField(i, patch) {
    set({ required_fields: form.required_fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  }
  function setAttachment(i, patch) {
    set({ required_attachments: form.required_attachments.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setErrors({})
    setFormError(null)
    const { id, request_count, created_at, updated_at, ...rest } = form // eslint-disable-line no-unused-vars
    const body = {
      ...rest,
      code: form.code.trim().toUpperCase(),
      slug: form.slug.trim(),
      base_fee: String(form.base_fee || 0),
      max_copies: Number(form.max_copies),
      processing_days: Number(form.processing_days),
      sort_order: Number(form.sort_order) || 0,
      purposes: purposesText.split('\n').map((p) => p.trim()).filter(Boolean),
      required_fields: form.required_fields.map(({ optionsText, ...f }) => ({
        ...f,
        options: f.type === 'select' ? optionsText.split('\n').map((o) => o.trim()).filter(Boolean) : [],
      })),
    }
    try {
      await save.mutateAsync({ id, body })
      toast.success(isNew ? 'Document type added' : 'Changes saved')
      onDone()
    } catch (error) {
      const { message, details = [] } = apiError(error)
      const byField = {}
      for (const d of details) {
        // A question-level check (dropdown without choices) is reported on the question itself.
        if (d.field) byField[/^required_fields\.\d+$/.test(d.field) ? `${d.field}.options` : d.field] = cleanMessage(d.message)
        else setFormError(cleanMessage(d.message))
      }
      setErrors(byField)
      if (!details.length) setFormError(message)
      else if (Object.keys(byField).length) setFormError('Please fix the highlighted fields.')
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-5 pb-4 pt-5 pr-14 sm:px-6">
        <SheetTitle className="text-xl font-semibold text-fg">{isNew ? 'New document type' : initial.name}</SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted">
          {isNew ? 'Students see it in the catalog once it’s visible.' : `${initial.request_count} requests so far.`}
        </SheetDescription>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {formError && <Alert tone="danger" title={formError} />}

        <Group title="Basics">
          <FormField label="Name" required error={err('name')}>
            <Input
              value={form.name}
              maxLength={150}
              onChange={(e) => set({ name: e.target.value, ...(isNew ? { slug: toSlug(e.target.value) } : {}) })}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Code" required error={err('code')} help="e.g. TOR">
              <Input value={form.code} maxLength={20} className="font-mono uppercase" onChange={(e) => set({ code: e.target.value })} />
            </FormField>
            <FormField label="Web address" required error={err('slug')} className="sm:col-span-2" help="Used in links.">
              <Input value={form.slug} maxLength={80} className="font-mono" onChange={(e) => set({ slug: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Category" required>
            <Select value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Description" error={err('description')} help="Shown in the catalog.">
            <Textarea rows={2} maxLength={2000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </FormField>
          <FormField label="Instructions" error={err('instructions')} help="Shown while the student fills in the request.">
            <Textarea rows={2} maxLength={2000} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} />
          </FormField>
        </Group>

        <Group title="Fees and processing">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Fee (₱)" required error={err('base_fee')}>
              <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.base_fee} onChange={(e) => set({ base_fee: e.target.value })} />
            </FormField>
            <FormField label="Max copies" required error={err('max_copies')}>
              <Input type="number" min="1" max="20" value={form.max_copies} onChange={(e) => set({ max_copies: e.target.value })} />
            </FormField>
            <FormField label="Processing days" required error={err('processing_days')} help="Working days">
              <Input type="number" min="0" max="60" value={form.processing_days} onChange={(e) => set({ processing_days: e.target.value })} />
            </FormField>
          </div>
          <Toggle label="Charge per copy" checked={form.fee_per_copy} onChange={(v) => set({ fee_per_copy: v })} />
          <Toggle
            label="Requires payment"
            help="Turn off for free forms; approval then goes straight to processing."
            checked={form.requires_payment}
            onChange={(v) => set({ requires_payment: v })}
          />
        </Group>

        <Group title="Delivery">
          <Toggle label="Allow courier delivery" checked={form.allow_courier} onChange={(v) => set({ allow_courier: v })} />
          <Toggle
            label="Issue an e-document"
            help="Staff can upload a signed PDF that students download with a QR code for verification."
            checked={form.allow_edocument}
            onChange={(v) => set({ allow_edocument: v })}
          />
        </Group>

        <Group title="Purposes">
          <FormField label="Common purposes" error={err('purposes')} help="One per line. Students can always choose “Other”.">
            <Textarea rows={3} value={purposesText} onChange={(e) => setPurposesText(e.target.value)} />
          </FormField>
        </Group>

        <Group
          title="Extra questions"
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={form.required_fields.length >= 20}
              onClick={() => set({ required_fields: [...form.required_fields, { key: '', label: '', type: 'text', required: true, optionsText: '', help: '' }] })}
            >
              <Plus /> Add question
            </Button>
          }
        >
          {form.required_fields.length === 0 && <p className="text-sm text-muted">No extra questions.</p>}
          {form.required_fields.map((f, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <FormField label="Question" required error={err(`required_fields.${i}.label`) || err(`required_fields.${i}.key`)}>
                  <Input
                    value={f.label}
                    maxLength={120}
                    onChange={(e) => setField(i, { label: e.target.value, ...(f.key === toKey(f.label) || !f.key ? { key: toKey(e.target.value) } : {}) })}
                  />
                </FormField>
                <FormField label="Answer type" required>
                  <Select value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                    {Object.entries(FIELD_TYPES).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </FormField>
              </div>
              {f.type === 'select' && (
                <FormField label="Choices" required help="One per line." error={err(`required_fields.${i}.options`)}>
                  <Textarea rows={3} value={f.optionsText} onChange={(e) => setField(i, { optionsText: e.target.value })} />
                </FormField>
              )}
              <FormField label="Help text">
                <Input value={f.help ?? ''} maxLength={300} onChange={(e) => setField(i, { help: e.target.value })} />
              </FormField>
              <div className="flex items-center justify-between">
                <Toggle label="Required" checked={f.required} onChange={(v) => setField(i, { required: v })} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => set({ required_fields: form.required_fields.filter((_, j) => j !== i) })}
                >
                  <Trash2 /> Remove<span className="sr-only"> question {f.label}</span>
                </Button>
              </div>
            </div>
          ))}
        </Group>

        <Group
          title="Files to upload"
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={form.required_attachments.length >= 10}
              onClick={() => set({ required_attachments: [...form.required_attachments, { key: '', label: '', required: true, accept: [...FILE_TYPES], max_mb: 5, help: '' }] })}
            >
              <Plus /> Add file
            </Button>
          }
        >
          {form.required_attachments.length === 0 && <p className="text-sm text-muted">No files required.</p>}
          {form.required_attachments.map((a, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border p-3">
              <FormField label="File" required error={err(`required_attachments.${i}.label`) || err(`required_attachments.${i}.key`)}>
                <Input
                  value={a.label}
                  maxLength={150}
                  placeholder="e.g. Valid ID"
                  onChange={(e) => setAttachment(i, { label: e.target.value, ...(a.key === toKey(a.label) || !a.key ? { key: toKey(e.target.value) } : {}) })}
                />
              </FormField>
              <FormField label="Help text">
                <Input value={a.help ?? ''} maxLength={300} onChange={(e) => setAttachment(i, { help: e.target.value })} />
              </FormField>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Accepted file types">
                  {FILE_TYPES.map((t) => (
                    <Toggle
                      key={t}
                      label={t.toUpperCase()}
                      checked={a.accept.includes(t)}
                      onChange={(v) => setAttachment(i, { accept: v ? [...a.accept, t] : a.accept.filter((x) => x !== t) })}
                    />
                  ))}
                  <Toggle label="Required" checked={a.required} onChange={(v) => setAttachment(i, { required: v })} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => set({ required_attachments: form.required_attachments.filter((_, j) => j !== i) })}
                >
                  <Trash2 /> Remove<span className="sr-only"> file {a.label}</span>
                </Button>
              </div>
              {err(`required_attachments.${i}.accept`) && (
                <p className="text-[13px] font-medium text-danger">Choose at least one file type.</p>
              )}
            </div>
          ))}
        </Group>

        <Group title="Visibility">
          <Toggle
            label="Visible to students"
            help="Hidden types stay on existing requests but can’t be requested."
            checked={form.is_active}
            onChange={(v) => set({ is_active: v })}
          />
          <FormField label="Order in catalog" help="Lower numbers appear first." className="max-w-40">
            <Input type="number" min="0" max="999" value={form.sort_order} onChange={(e) => set({ sort_order: e.target.value })} />
          </FormField>
        </Group>
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 sm:px-6">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {isNew ? 'Add document type' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
