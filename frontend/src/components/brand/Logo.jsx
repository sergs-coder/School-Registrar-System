import { cn } from '@/lib/utils'

/**
 * PLACEHOLDER crest. When the official TUA logo arrives, put it at /public/tua-logo.png and
 * replace the <svg> below with:
 *   <img src="/tua-logo.png" alt="" className={cn('size-10', className)} />
 */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-10 shrink-0', className)} aria-hidden="true">
      <path d="M32 3 8 11v19c0 15 10.5 26.5 24 31 13.5-4.5 24-16 24-31V11L32 3z" fill="var(--brand-primary-700)" />
      <path
        d="M32 8.5 13 15v15c0 12 8.3 21.4 19 25.3 10.7-3.9 19-13.3 19-25.3V15L32 8.5z"
        fill="none"
        stroke="var(--brand-accent-500)"
        strokeWidth="2.5"
      />
      <text
        x="32"
        y="38"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="15"
        fontWeight="700"
        fill="var(--brand-accent-200)"
      >
        TUA
      </text>
    </svg>
  )
}

/** `compact`: on phones, the name wraps onto two lines and the subtitle is dropped, so a crowded top bar never
 * cuts the university's name short. From `sm` up it looks the same as the default. */
export function Logo({ className, subtitle = 'Student Request Portal', inverted = false, compact = false }) {
  return (
    <span className={cn('flex items-center', compact ? 'gap-2 sm:gap-3' : 'gap-3', className)}>
      <LogoMark />
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            'font-bold tracking-tight',
            compact ? 'text-sm sm:truncate sm:text-[15px]' : 'truncate text-[15px]',
            inverted ? 'text-white' : 'text-fg',
          )}
        >
          Trinity University of Asia
        </span>
        <span
          className={cn(
            'truncate text-xs font-medium',
            compact && 'hidden sm:block',
            inverted ? 'text-accent-200' : 'text-muted',
          )}
        >
          {subtitle}
        </span>
      </span>
    </span>
  )
}
