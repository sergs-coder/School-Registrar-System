import { LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth'

export function initials(name = '') {
  return name
    .split(' ')
    .filter((p) => p && /[A-Za-z]/.test(p[0]))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const subtitle = user.student?.student_no ?? user.staff?.position ?? user.role

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full p-1 pr-1 hover:bg-surface-muted sm:pr-3"
        aria-label={`Account menu for ${user.display_name}`}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
          {initials(user.display_name)}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium text-fg sm:block">{user.display_name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <p className="font-semibold text-fg">{user.display_name}</p>
          <p className="text-xs text-muted">{user.email}</p>
          <p className="text-xs text-muted">{subtitle}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === 'student' && (
          <DropdownMenuItem onSelect={() => navigate('/profile')}>
            <UserRound /> Profile & settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate('/privacy')}>
          <ShieldCheck /> Data privacy notice
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
