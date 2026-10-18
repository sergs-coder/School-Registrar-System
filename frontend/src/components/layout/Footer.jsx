import { Mail, MapPin, Phone, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

import { LogoMark } from '@/components/brand/Logo'
import { useSiteInfo } from '@/features/catalog/api'

const FALLBACK = {
  office: 'Office of the University Registrar',
  address: '275 E. Rodriguez Sr. Blvd., Quezon City, Metro Manila',
  email: 'registrar@tua.edu.ph',
  phone: '(02) 8702-2882',
  hours: 'Mon–Fri 8:00 AM – 5:00 PM',
}

export function Footer() {
  const { data } = useSiteInfo()
  const c = data?.registrar_contact ?? FALLBACK
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <LogoMark className="size-9" />
            <div>
              <p className="text-sm font-semibold text-fg">{c.office}</p>
              <p className="text-xs text-muted">Trinity University of Asia</p>
            </div>
          </div>
          <p className="flex gap-2 text-sm text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {c.address}
          </p>
        </div>
        <ul className="space-y-2.5 text-sm text-muted">
          <li className="flex items-center gap-2">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            <a href={`mailto:${c.email}`} className="text-link hover:underline">
              {c.email}
            </a>
          </li>
          <li className="flex items-center gap-2">
            <Phone className="size-4 shrink-0" aria-hidden="true" />
            <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="hover:text-fg">
              {c.phone}
            </a>
          </li>
          <li className="flex gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {c.hours}
          </li>
        </ul>
        <div className="space-y-2 text-sm text-muted">
          <p className="font-semibold text-fg">Data Privacy</p>
          <p>
            Your information is handled under the Data Privacy Act of 2012 (RA 10173).{' '}
            <Link to="/privacy" className="font-medium text-link hover:underline">
              Read the privacy notice
            </Link>
          </p>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-subtle sm:px-6">
          © {new Date().getFullYear()} Trinity University of Asia. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
