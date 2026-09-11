import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AdminTableShellProps {
  'aria-label': string
  children: ReactNode
  className?: string
  emptyMessage?: string
  isEmpty?: boolean
}

export function AdminTableShell({
  'aria-label': ariaLabel,
  children,
  className,
  emptyMessage,
  isEmpty = false,
}: AdminTableShellProps) {
  return (
    <div
      data-pw='admin-table-shell'
      className={cn('overflow-hidden rounded-lg bg-card shadow-sm dark:shadow-none', className)}
    >
      <section
        aria-label={ariaLabel}
        className='overflow-x-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring'
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1 requires keyboard access to the scrollable region itself.
        tabIndex={0}
      >
        {children}
      </section>
      {isEmpty && emptyMessage ? (
        <div
          data-pw='admin-table-shell-empty'
          className='p-12 text-center'
        >
          <p className='text-muted-foreground'>{emptyMessage}</p>
        </div>
      ) : null}
    </div>
  )
}
