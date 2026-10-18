import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Logo } from '@/components/brand/Logo'
import { PrivacyNotice } from '@/components/shared/PrivacyNotice'
import { EmptyState, ThemeToggle } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { homePathFor, useAuth } from '@/lib/auth'

export function PublicShell({ children }) {
  const { user } = useAuth()
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Link to={homePathFor(user)} className="rounded-lg">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {children}
      </main>
    </div>
  )
}

export function PrivacyPage() {
  const { user } = useAuth()
  return (
    <PublicShell>
      <Link
        to={homePathFor(user)}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </Link>
      <Card className="p-6 sm:p-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-fg">Data Privacy Notice</h1>
        <PrivacyNotice />
      </Card>
    </PublicShell>
  )
}

export function NotFoundPage() {
  const { user } = useAuth()
  return (
    <PublicShell>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you’re looking for doesn’t exist or was moved."
        action={
          <Button asChild>
            <Link to={homePathFor(user)}>Go home</Link>
          </Button>
        }
      />
    </PublicShell>
  )
}
