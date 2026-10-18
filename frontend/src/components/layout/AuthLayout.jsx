import { FileCheck2, ShieldCheck, Timer } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'

import { Logo } from '@/components/brand/Logo'
import { SkipLink } from '@/components/layout/StudentLayout'
import { ThemeToggle } from '@/components/shared/misc'

const POINTS = [
  { icon: FileCheck2, text: 'Request your TOR, certificates and registrar forms online.' },
  { icon: Timer, text: 'Track every step, from review to release, in real time.' },
  { icon: ShieldCheck, text: 'Your records are protected under the Data Privacy Act.' },
]

export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <SkipLink />
      <aside className="relative hidden overflow-hidden bg-primary-800 p-10 text-white lg:flex lg:flex-col dark:bg-primary-950">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary-600/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-accent-500/15 blur-3xl"
        />
        <Logo inverted className="relative" />
        <div className="relative mt-auto max-w-md space-y-8">
          <div className="space-y-3">
            <span className="inline-block h-1 w-12 rounded-full bg-accent" />
            <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
              The Registrar’s Office,
              <br /> now open online.
            </h1>
          </div>
          <ul className="space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-[15px] text-primary-100">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent-300">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-primary-200">Office of the University Registrar · Quezon City</p>
      </aside>

      <div className="flex flex-col bg-background">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Link to="/login" className="rounded-lg lg:invisible" aria-label="Student Request Portal">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className="w-full max-w-[420px]">
            <Outlet />
          </div>
        </main>
        <p className="px-6 pb-6 text-center text-xs text-subtle">
          <Link to="/privacy" className="hover:text-fg hover:underline">
            Data Privacy Notice
          </Link>
          <span aria-hidden="true"> · </span>
          registrar@tua.edu.ph
        </p>
      </div>
    </div>
  )
}
