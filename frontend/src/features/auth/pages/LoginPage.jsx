import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'

import { FormField } from '@/components/shared/FormField'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { homePathFor, useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

const schema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or student number.'),
  password: z.string().min(1, 'Enter your password.'),
})

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { identifier: '', password: '' } })

  async function onSubmit(values) {
    setFormError(null)
    try {
      const user = await login(values.identifier, values.password)
      const next = params.get('next')
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null
      navigate(user.consent_required ? '/consent' : safeNext || homePathFor(user), { replace: true })
    } catch (err) {
      setFormError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-fg">Sign in</h1>
        <p className="text-[15px] text-muted">Use your TUA email, student number or confirmed personal email.</p>
      </div>

      {formError && <Alert tone="danger">{formError}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <FormField label="Email or student number" required error={errors.identifier?.message}>
          <Input
            autoComplete="username"
            autoFocus
            placeholder="juan.delacruz@tua.edu.ph or 2022-10001"
            {...register('identifier')}
          />
        </FormField>
        <div className="space-y-1.5">
          <FormField label="Password" required error={errors.password?.message}>
            {(controlProps) => (
            <div className="relative">
              <Input
                {...controlProps}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-11"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-fg"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            )}
          </FormField>
          <div className="text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-link hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="space-y-2 text-center text-sm text-muted">
        <p>
          Alumni or former student without an account?{' '}
          <Link to="/alumni-access" className="font-medium text-link hover:underline">
            Request access
          </Link>
        </p>
        <p>
          Other questions? Email{' '}
          <a className="font-medium text-link hover:underline" href="mailto:registrar@tua.edu.ph">
            registrar@tua.edu.ph
          </a>
          .
        </p>
      </div>
    </div>
  )
}
