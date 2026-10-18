import { Controller } from 'react-hook-form'

import { FormField } from '@/components/shared/FormField'
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input'

/** Renders one admin-defined form field (see document_types.required_fields). */
export function DynamicField({ field, control, register, error }) {
  const name = `form_data.${field.key}`

  if (field.type === 'checkbox') {
    return (
      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-fg">
          <Controller
            control={control}
            name={name}
            render={({ field: f }) => (
              <Checkbox
                className="mt-0.5"
                checked={Boolean(f.value)}
                onChange={(e) => f.onChange(e.target.checked)}
                onBlur={f.onBlur}
                aria-invalid={error ? true : undefined}
              />
            )}
          />
          <span>
            {field.label}
            {field.required && <span className="text-danger"> *</span>}
          </span>
        </label>
        {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
      </div>
    )
  }

  let control_
  switch (field.type) {
    case 'textarea':
      control_ = <Textarea placeholder={field.placeholder ?? ''} {...register(name)} />
      break
    case 'select':
      control_ = (
        <Select {...register(name)}>
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      )
      break
    case 'number':
      control_ = <Input type="number" inputMode="numeric" placeholder={field.placeholder ?? ''} {...register(name)} />
      break
    case 'date':
      control_ = <Input type="date" {...register(name)} />
      break
    default:
      control_ = <Input placeholder={field.placeholder ?? ''} {...register(name)} />
  }

  return (
    <FormField label={field.label} required={field.required} help={field.help} error={error}>
      {control_}
    </FormField>
  )
}
