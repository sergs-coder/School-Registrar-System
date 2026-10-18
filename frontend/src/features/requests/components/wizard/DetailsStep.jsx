import { zodResolver } from '@hookform/resolvers/zod'
import { Minus, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DynamicField } from '@/features/requests/components/DynamicField'
import { StepActions } from '@/features/requests/components/wizard/StepShell'
import { buildDetailsSchema } from '@/features/requests/schemas'
import { applyFieldErrors } from '@/lib/errors'
import { cn } from '@/lib/utils'

const OTHER = '__other__'

function defaults(docType, request) {
  const purpose = request?.purpose ?? ''
  const known = docType.purposes.includes(purpose)
  const form_data = {}
  for (const f of docType.required_fields) {
    const v = request?.form_data?.[f.key]
    form_data[f.key] = f.type === 'checkbox' ? Boolean(v) : v == null ? '' : String(v)
  }
  return {
    purposeChoice: known ? purpose : purpose ? OTHER : docType.purposes.length === 1 ? docType.purposes[0] : '',
    purposeOther: known ? '' : purpose,
    copies: request?.copies ?? 1,
    form_data,
  }
}

export function DetailsStep({ docType, request, onSave, saving }) {
  const schema = useMemo(() => buildDetailsSchema(docType), [docType])
  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: defaults(docType, request) })
  const choice = watch('purposeChoice')

  async function onSubmit(values) {
    const purpose = values.purposeChoice === OTHER ? values.purposeOther.trim() : values.purposeChoice
    const form_data = Object.fromEntries(
      Object.entries(values.form_data).filter(([, v]) => v !== undefined && v !== ''),
    )
    try {
      await onSave({ purpose, copies: values.copies, form_data })
    } catch (err) {
      applyFieldErrors(err, setError, { purpose: 'purposeOther' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-7">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-fg">
          Purpose <span className="text-danger">*</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {[...docType.purposes, OTHER].map((p) => (
            <label
              key={p}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors',
                choice === p ? 'border-primary bg-primary-soft text-fg' : 'border-border-strong hover:bg-surface-muted',
              )}
            >
              <input type="radio" value={p} className="size-4 accent-[var(--primary)]" {...register('purposeChoice')} />
              {p === OTHER ? 'Other' : p}
            </label>
          ))}
        </div>
        {errors.purposeChoice && <p className="text-[13px] font-medium text-danger">{errors.purposeChoice.message}</p>}
        {choice === OTHER && (
          <FormField label="Describe the purpose" required error={errors.purposeOther?.message}>
            <Input autoFocus placeholder="e.g., Requirement for a scholarship abroad" {...register('purposeOther')} />
          </FormField>
        )}
      </fieldset>

      {docType.max_copies > 1 && (
        <FormField
          label="Number of copies"
          required
          help={`Up to ${docType.max_copies} copies.`}
          error={errors.copies?.message}
        >
          {(controlProps) => (
            <Controller
              control={control}
              name="copies"
              render={({ field }) => (
                <div className="flex w-40 items-center rounded-lg border border-border-strong bg-surface">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Fewer copies"
                    disabled={field.value <= 1}
                    onClick={() => field.onChange(Math.max(1, Number(field.value) - 1))}
                  >
                    <Minus />
                  </Button>
                  <input
                    {...controlProps}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={docType.max_copies}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    className="h-10 w-full min-w-0 bg-transparent text-center text-[15px] font-semibold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="More copies"
                    disabled={field.value >= docType.max_copies}
                    onClick={() => field.onChange(Math.min(docType.max_copies, Number(field.value) + 1))}
                  >
                    <Plus />
                  </Button>
                </div>
              )}
            />
          )}
        </FormField>
      )}

      {docType.required_fields.length > 0 && (
        <div className="space-y-5">
          {docType.required_fields.map((f) => (
            <DynamicField
              key={f.key}
              field={f}
              control={control}
              register={register}
              error={errors.form_data?.[f.key]?.message}
            />
          ))}
        </div>
      )}

      <StepActions saving={saving} />
    </form>
  )
}
