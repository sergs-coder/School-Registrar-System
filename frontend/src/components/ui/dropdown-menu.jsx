import * as Menu from '@radix-ui/react-dropdown-menu'

import { cn } from '@/lib/utils'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger

export function DropdownMenuContent({ className, align = 'end', sideOffset = 8, ...props }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-pop', className)}
        {...props}
      />
    </Menu.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({ className, ...props }) {
  return <Menu.Label className={cn('px-2.5 py-2 text-sm', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }) {
  return <Menu.Separator className={cn('my-1 h-px bg-border', className)} {...props} />
}
