import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/shared/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/axios'
import { errorMessage } from '@/lib/errors'

export const passwordRule = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.')

function BackToLogin() {
  return (
    <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to sign in
    </Link>
  )
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const form = useForm({
    resolver: zodResolver(z.object({ email: z.email('Enter a valid email address.') })),
    defaultValues: { email: '' },
  })

  async function onSubmit({ email }) {
    setError(null)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight">Check your email</h1>
          <p className="text-[15px] text-muted">
            If <strong className="text-fg">{form.getValues('email')}</strong> is registered, we sent a link to reset
            your password. It expires in 30 minutes.
          </p>
        </div>
        <BackToLogin />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight">Reset your password</h1>
        <p className="text-[15px] text-muted">Enter your university email and we’ll send you a reset link.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
        <FormField label="University email" required error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
      <BackToLogin />
    </div>
  )
}

const resetSchema = z
  .object({ new_password: passwordRule, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match.' })

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')
  const [error, setError] = useState(null)
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { new_password: '', confirm: '' } })

  async function onSubmit({ new_password }) {
    setError(null)
    try {
      await api.post('/auth/reset-password', { token, new_password })
      toast.success('Password updated. You can now sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!token) {
    return (
      <div className="space-y-6">
        <Alert tone="danger" title="This reset link is incomplete">
          Please open the link from your email again, or request a new one.
        </Alert>
        <Button asChild variant="secondary">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    )
  }

  const { errors, isSubmitting } = form.formState
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight">Choose a new password</h1>
        <p className="text-[15px] text-muted">At least 8 characters, with a letter and a number.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
        <FormField label="New password" required error={errors.new_password?.message}>
          <Input type="password" autoComplete="new-password" autoFocus {...form.register('new_password')} />
        </FormField>
        <FormField label="Confirm new password" required error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
      <BackToLogin />
    </div>
  )
}
