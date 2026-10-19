import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { FormField } from '@/components/shared/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/axios'
import { applyFieldErrors, errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

const ID_SPEC = { label: 'Valid ID', accept: ['jpg', 'png', 'pdf'], max_mb: 5 }
const THIS_YEAR = new Date().getFullYear()
const STANDINGS = [
  { value: 'graduated', title: 'I graduated', text: 'Alumni of Trinity University of Asia.' },
  { value: 'inactive', title: 'I studied here but didn’t graduate', text: 'Transferred, stopped or on leave.' },
]

const schema = z.object({
  standing: z.enum(['graduated', 'inactive'], { error: 'Choose one.' }),
  student_no: z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z-]{3,19}$/, 'Enter your student number, e.g. 2015-00123.'),
  first_name: z.string().trim().min(1, 'Enter your first name.').max(100),
  middle_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().min(1, 'Enter your last name.').max(100),
  birthdate: z.string().min(1, 'Enter your date of birth.'),
  program: z.string().trim().min(2, 'Enter your program or course.').max(200),
  last_year_attended: z.coerce
    .number({ error: 'Enter a year.' })
    .int('Enter a year.')
    .min(1950, 'Enter a year from 1950.')
    .max(THIS_YEAR, 'The year can’t be in the future.'),
  email: z.email('Enter a valid email address.'),
  contact_no: z
    .string()
    .trim()
    .regex(/^((\+63|0)9\d{9})?$/, 'Use a PH mobile number, e.g. 09171234567.')
    .optional(),
})

/** Public form for alumni and former students who have no portal account or lost their school email. */
export function AlumniAccessPage() {
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [done, setDone] = useState(null)
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { standing: 'graduated' } })
  const standing = watch('standing')

  async function onSubmit(values) {
    setFormError(null)
    if (!file) {
      setFileError('Upload a photo or scan of a valid ID.')
      return
    }
    const form = new FormData()
    for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') form.append(key, value)
    form.append('id_file', file)
    try {
      setDone((await api.post('/account-requests', form)).data.message)
    } catch (err) {
      if (!applyFieldErrors(err, setError)) setFormError(errorMessage(err))
    }
  }

  if (done) {
    return (
      <div className="space-y-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight">Request sent</h1>
          <p className="text-[15px] text-muted">{done}</p>
        </div>
        <BackToLogin />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <BackToLogin />
        <h1 className="pt-2 text-[28px] font-semibold leading-9 tracking-tight text-fg">Alumni &amp; former students</h1>
        <p className="text-[15px] text-muted">
          No portal account, or can’t use your TUA email anymore? Tell us who you are. The Registrar’s Office will check
          your details and email you a link to set your password.
        </p>
      </div>

      {formError && <Alert tone="danger">{formError}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-fg">Which describes you?</legend>
          {STANDINGS.map((s) => (
            <label
              key={s.value}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
                standing === s.value ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-surface-muted',
              )}
            >
              <input type="radio" value={s.value} className="mt-1 size-4 accent-[var(--primary)]" {...register('standing')} />
              <span>
                <span className="block text-sm font-semibold text-fg">{s.title}</span>
                <span className="block text-sm text-muted">{s.text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <FormField label="Student number" required error={errors.student_no?.message} help="As printed on your old school ID or records.">
          <Input autoComplete="off" placeholder="2015-00123" {...register('student_no')} />
        </FormField>
        <FormField label="First name" required error={errors.first_name?.message}>
          <Input autoComplete="given-name" {...register('first_name')} />
        </FormField>
        <FormField label="Middle name" error={errors.middle_name?.message}>
          <Input autoComplete="additional-name" {...register('middle_name')} />
        </FormField>
        <FormField label="Last name" required error={errors.last_name?.message} help="Your name while you were a student.">
          <Input autoComplete="family-name" {...register('last_name')} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Date of birth" required error={errors.birthdate?.message}>
            <Input type="date" autoComplete="bday" {...register('birthdate')} />
          </FormField>
          <FormField
            label={standing === 'graduated' ? 'Year graduated' : 'Last year attended'}
            required
            error={errors.last_year_attended?.message}
          >
            <Input inputMode="numeric" maxLength={4} placeholder="2019" {...register('last_year_attended')} />
          </FormField>
        </div>
        <FormField label="Program / course" required error={errors.program?.message} help="e.g. BS Information Technology">
          <Input {...register('program')} />
        </FormField>
        <FormField
          label="Email"
          required
          error={errors.email?.message}
          help="Use an address you check. We’ll send your sign-in link and request updates here."
        >
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField label="Mobile number" error={errors.contact_no?.message}>
          <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="09171234567" {...register('contact_no')} />
        </FormField>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-fg">
            Valid ID <span className="text-danger" aria-hidden="true">*</span>
          </p>
          <p className="text-[13px] text-muted">A government or old school ID with your photo and name. JPG, PNG or PDF, up to 5 MB.</p>
          <FileDropzone
            spec={ID_SPEC}
            file={file && { original_filename: file.name, size_bytes: file.size }}
            onUpload={(f) => {
              setFile(f)
              setFileError(null)
            }}
            onRemove={() => setFile(null)}
            onView={() => window.open(URL.createObjectURL(file), '_blank', 'noopener')}
            error={fileError ?? errors.id_file?.message}
          />
        </div>
        <p className="text-[13px] text-muted">
          We use these details only to confirm your identity against the Registrar’s records, as described in our{' '}
          <Link to="/privacy" className="font-medium text-link hover:underline">
            privacy notice
          </Link>
          .
        </p>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send request
        </Button>
      </form>
    </div>
  )
}

function BackToLogin() {
  return (
    <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to sign in
    </Link>
  )
}
