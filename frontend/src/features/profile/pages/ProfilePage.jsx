import { zodResolver } from '@hookform/resolvers/zod'
import { Moon, Sun } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/shared/FormField'
import { DefinitionList, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { passwordRule } from '@/features/auth/pages/PasswordPages'
import { PersonalEmailCard } from '@/features/profile/components/PersonalEmailCard'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/axios'
import { applyFieldErrors, errorMessage } from '@/lib/errors'
import { useTheme } from '@/lib/theme'
import { cn, formatDateTime } from '@/lib/utils'

const STANDING = { enrolled: 'Currently enrolled', graduated: 'Graduate', inactive: 'Not currently enrolled' }

const contactSchema = z.object({
  contact_no: z
    .string()
    .trim()
    .regex(/^((\+63|0)9\d{9})?$/, 'Use a PH mobile number, e.g. 09171234567.'),
  mailing_address: z.string().trim().max(500, 'Keep this under 500 characters.'),
})

const passwordSchema = z
  .object({ current_password: z.string().min(1, 'Enter your current password.'), new_password: passwordRule, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match.' })

export function ProfilePage() {
  const { user, setUser } = useAuth()
  const s = user.student

  return (
    <div className="space-y-6">
      <PageHeader title="Profile & settings" description="Your registrar record, contact details and preferences." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Student record</CardTitle>
            <CardDescription>From the Registrar’s official records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DefinitionList
              items={[
                { label: 'Full name', value: [s.first_name, s.middle_name, s.last_name, s.suffix].filter(Boolean).join(' ') },
                { label: 'Student number', value: <span className="font-mono">{s.student_no}</span> },
                { label: 'University email', value: user.email },
                { label: 'Program', value: s.program?.name },
                { label: 'College', value: s.program?.college },
                { label: 'Year level', value: s.year_level ? `Year ${s.year_level}` : null },
                { label: 'Standing', value: STANDING[s.standing] },
              ]}
            />
            <p className="text-[13px] text-muted">
              Something wrong?{' '}
              <Link to="/requests/new/change-of-information" className="font-medium text-link hover:underline">
                File a Change of Student Information request
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <PersonalEmailCard student={s} universityEmail={user.email} onSaved={(student) => setUser({ ...user, student })} />
          <ContactCard student={s} onSaved={(student) => setUser({ ...user, student })} />
          <AppearanceCard />
        </div>

        <PasswordCard />

        <Card>
          <CardHeader>
            <CardTitle>Data privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>
              You accepted the Data Privacy notice on{' '}
              <strong className="text-fg">{formatDateTime(user.privacy_consent_at)}</strong>.
            </p>
            <p>
              To access, correct or request deletion of your data, email the Data Protection Officer at{' '}
              <a href="mailto:dpo@tua.edu.ph" className="font-medium text-link hover:underline">
                dpo@tua.edu.ph
              </a>
              .
            </p>
            <Link to="/privacy" className="inline-block font-medium text-link hover:underline">
              Read the full notice
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ContactCard({ student, onSaved }) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(contactSchema),
    defaultValues: { contact_no: student.contact_no ?? '', mailing_address: student.mailing_address ?? '' },
  })

  async function onSubmit(values) {
    try {
      const { data } = await api.patch('/me/profile', {
        contact_no: values.contact_no || null,
        mailing_address: values.mailing_address || null,
      })
      onSaved(data)
      reset({ contact_no: data.contact_no ?? '', mailing_address: data.mailing_address ?? '' })
      toast.success('Contact details saved')
    } catch (err) {
      if (!applyFieldErrors(err, setError)) toast.error(errorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact details</CardTitle>
        <CardDescription>So the Registrar and couriers can reach you.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <FormField label="Mobile number" error={errors.contact_no?.message}>
            <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="09171234567" {...register('contact_no')} />
          </FormField>
          <FormField label="Mailing address" error={errors.mailing_address?.message}>
            <Textarea rows={3} autoComplete="street-address" {...register('mailing_address')} />
          </FormField>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { current_password: '', new_password: '', confirm: '' } })

  async function onSubmit({ current_password, new_password }) {
    try {
      await api.post('/auth/change-password', { current_password, new_password })
      reset()
      toast.success('Password updated')
    } catch (err) {
      if (!applyFieldErrors(err, setError)) toast.error(errorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <FormField label="Current password" required error={errors.current_password?.message}>
            <Input type="password" autoComplete="current-password" {...register('current_password')} />
          </FormField>
          <FormField label="New password" required help="At least 8 characters, with a letter and a number." error={errors.new_password?.message}>
            <Input type="password" autoComplete="new-password" {...register('new_password')} />
          </FormField>
          <FormField label="Confirm new password" required error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" {...register('confirm')} />
          </FormField>
          <Button type="submit" variant="secondary" loading={isSubmitting}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
                theme === value ? 'border-primary bg-primary-soft text-fg' : 'border-border-strong text-muted hover:bg-surface-muted',
              )}
            >
              <Icon className="size-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

