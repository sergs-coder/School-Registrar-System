import { zodResolver } from '@hookform/resolvers/zod'
import { Package, Truck } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { FormField } from '@/components/shared/FormField'
import { Alert } from '@/components/ui/alert'
import { Input, Select } from '@/components/ui/input'
import { useSiteInfo } from '@/features/catalog/api'
import { StepActions } from '@/features/requests/components/wizard/StepShell'
import { deliverySchema } from '@/features/requests/schemas'
import { useAuth } from '@/lib/auth'
import { applyFieldErrors } from '@/lib/errors'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'pickup', icon: Package, title: 'Pick up at the Registrar', text: 'Bring a valid ID and your reference number.' },
  { value: 'courier', icon: Truck, title: 'Deliver by courier', text: 'Delivery fee added. Metro Manila or provincial rates.' },
]

export function DeliveryStep({ docType, request, onBack, onSave, saving, onChange }) {
  const { user } = useAuth()
  const { data: site } = useSiteInfo()
  const addr = request.delivery_address ?? {}
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      delivery_method: request.delivery_method ?? 'pickup',
      delivery_address: {
        recipient: addr.recipient ?? user.student?.full_name ?? '',
        contact_no: addr.contact_no ?? user.student?.contact_no ?? '',
        line1: addr.line1 ?? '',
        city: addr.city ?? '',
        province: addr.province ?? '',
        zip: addr.zip ?? '',
        region: addr.region ?? 'metro',
      },
    },
    shouldUnregister: true,
  })
  const method = watch('delivery_method')
  const region = watch('delivery_address.region')
  // Let the summary panel show the live courier fee.
  useEffect(() => {
    onChange?.({ delivery_method: method, region: method === 'courier' ? region : null })
  }, [method, region, onChange])

  async function onSubmit(values) {
    try {
      await onSave({
        delivery_method: values.delivery_method,
        delivery_address: values.delivery_method === 'courier' ? values.delivery_address : null,
      })
    } catch (err) {
      applyFieldErrors(err, setError)
    }
  }

  const ae = errors.delivery_address ?? {}
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-7">
      {docType.allow_courier ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-fg">How would you like to receive it?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {OPTIONS.map(({ value, icon: Icon, title, text }) => (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                  method === value ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-surface-muted',
                )}
              >
                <input type="radio" value={value} className="mt-1 size-4 accent-[var(--primary)]" {...register('delivery_method')} />
                <span>
                  <span className="flex items-center gap-2 font-semibold text-fg">
                    <Icon className="size-4 text-muted" aria-hidden="true" /> {title}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <input type="hidden" value="pickup" {...register('delivery_method')} />
          <Alert tone="info" icon={Package} title="Pick-up only">
            This document must be claimed in person at the Registrar’s Office.
          </Alert>
        </>
      )}

      {method === 'courier' ? (
        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-medium text-fg">Delivery address</legend>
          <FormField label="Recipient’s full name" required error={ae.recipient?.message}>
            <Input autoComplete="name" {...register('delivery_address.recipient')} />
          </FormField>
          <FormField label="Mobile number" required error={ae.contact_no?.message} help="For the courier to reach you.">
            <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="09171234567" {...register('delivery_address.contact_no')} />
          </FormField>
          <FormField label="House no., street, barangay" required error={ae.line1?.message} className="sm:col-span-2">
            <Input autoComplete="street-address" {...register('delivery_address.line1')} />
          </FormField>
          <FormField label="City / municipality" required error={ae.city?.message}>
            <Input autoComplete="address-level2" {...register('delivery_address.city')} />
          </FormField>
          <FormField label="Province" required error={ae.province?.message}>
            <Input autoComplete="address-level1" {...register('delivery_address.province')} />
          </FormField>
          <FormField label="ZIP code" required error={ae.zip?.message}>
            <Input inputMode="numeric" autoComplete="postal-code" maxLength={4} {...register('delivery_address.zip')} />
          </FormField>
          <FormField label="Delivery area" required error={ae.region?.message}>
            <Select {...register('delivery_address.region')}>
              <option value="metro">Metro Manila</option>
              <option value="provincial">Outside Metro Manila</option>
            </Select>
          </FormField>
        </fieldset>
      ) : (
        site?.registrar_contact && (
          <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
            <p className="font-semibold text-fg">{site.registrar_contact.office}</p>
            <p className="mt-1 text-muted">{site.registrar_contact.address}</p>
            <p className="text-muted">{site.registrar_contact.hours}</p>
          </div>
        )
      )}

      <StepActions onBack={onBack} saving={saving} />
    </form>
  )
}
