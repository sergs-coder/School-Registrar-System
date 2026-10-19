import { zodResolver } from '@hookform/resolvers/zod'
import { Package, Truck } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { FormField } from '@/components/shared/FormField'
import { Alert } from '@/components/ui/alert'
import { Input, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useMetroManila, useSiteInfo } from '@/features/catalog/api'
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
    setValue,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      delivery_method: request.delivery_method ?? 'pickup',
      delivery_address: {
        recipient: addr.recipient ?? user.student?.full_name ?? '',
        contact_no: addr.contact_no ?? user.student?.contact_no ?? '',
        region: addr.region ?? 'metro',
        city: addr.city ?? '',
        barangay: addr.barangay ?? '',
        province: addr.province ?? '',
        line1: addr.line1 ?? '',
        zip: addr.zip ?? '',
        landmark: addr.landmark ?? '',
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
          <FormField label="Delivery area" required error={ae.region?.message} className="sm:col-span-2">
            <Select {...register('delivery_address.region')}>
              <option value="metro">Metro Manila</option>
              <option value="provincial">Outside Metro Manila</option>
            </Select>
          </FormField>
          {region === 'metro' ? (
            <MetroLocation register={register} watch={watch} setValue={setValue} errors={ae} />
          ) : (
            <>
              <FormField label="City / municipality" required error={ae.city?.message}>
                <Input autoComplete="address-level2" {...register('delivery_address.city')} />
              </FormField>
              <FormField label="Province" required error={ae.province?.message}>
                <Input autoComplete="address-level1" {...register('delivery_address.province')} />
              </FormField>
            </>
          )}
          <FormField
            label={region === 'metro' ? 'House no., building, street' : 'House no., street, barangay'}
            required
            error={ae.line1?.message}
            className="sm:col-span-2"
          >
            <Input autoComplete="street-address" {...register('delivery_address.line1')} />
          </FormField>
          <FormField label="ZIP code" required error={ae.zip?.message}>
            <Input inputMode="numeric" autoComplete="postal-code" maxLength={4} {...register('delivery_address.zip')} />
          </FormField>
          <FormField
            label="Landmark"
            error={ae.landmark?.message}
            help="Helps the courier find the place, e.g. “Across 7-Eleven, blue gate”."
            className="sm:col-span-2"
          >
            <Input maxLength={200} {...register('delivery_address.landmark')} />
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

/** City, then the barangays in that city. Values that aren't on the lists (a provincial city typed before
 * switching areas, or a barangay from another city) are cleared so the student picks again. */
function MetroLocation({ register, watch, setValue, errors }) {
  const { data: cities, isError } = useMetroManila()
  const city = watch('delivery_address.city')
  const barangay = watch('delivery_address.barangay')
  const barangays = cities?.find((c) => c.name === city)?.barangays ?? []
  useEffect(() => {
    if (!cities) return
    if (city && !cities.some((c) => c.name === city)) setValue('delivery_address.city', '')
    else if (barangay && !barangays.includes(barangay)) setValue('delivery_address.barangay', '')
  }, [cities, city, barangay, barangays, setValue])

  if (isError) {
    return (
      <Alert tone="danger" className="sm:col-span-2">
        We couldn’t load the list of cities. Please refresh the page.
      </Alert>
    )
  }
  if (!cities) {
    return (
      <>
        <Skeleton className="h-[72px] rounded-lg" />
        <Skeleton className="h-[72px] rounded-lg" />
      </>
    )
  }
  return (
    <>
      <FormField label="City / municipality" required error={errors.city?.message}>
        <Select autoComplete="address-level2" {...register('delivery_address.city')}>
          <option value="">Choose a city</option>
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        label="Barangay"
        required
        error={errors.barangay?.message}
        help={city ? `${barangays.length} barangays in ${city}` : 'Choose the city first.'}
      >
        <Select disabled={!city} {...register('delivery_address.barangay')}>
          <option value="">Choose a barangay</option>
          {barangays.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </FormField>
    </>
  )
}
