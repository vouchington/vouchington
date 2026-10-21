'use client'

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // new-york-v4 sizes the indicator from `value` but does not forward it, so the
  // progressbar would stay indeterminate. Forward the same number the indicator uses.
  const percent = value || 0
  return (
    <ProgressPrimitive.Root
      data-slot='progress'
      data-pw='progress'
      value={percent}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot='progress-indicator'
        className='h-full w-full flex-1 bg-primary transition-all'
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
