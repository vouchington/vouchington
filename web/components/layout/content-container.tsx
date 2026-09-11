import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Single source of truth for the 1200px max-width content column.
 * Used by navbar, page-with-aside, aside-drawer, and footer to keep
 * horizontal alignment consistent across the shell.
 *
 * The outer element (nav, main, footer, sticky wrapper) owns the px-4 gutter;
 * this component only applies centering and the max-width cap.
 */
export function ContentContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-pw='content-container'
      className={cn('mx-auto w-full max-w-[1200px]', className)}
      {...props}
    />
  )
}
