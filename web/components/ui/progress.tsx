'use client'

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  max,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // Radix treats null and omitted values as indeterminate and defaults max to 100.
  // Forward those props unchanged. The indicator still needs a numeric width.
  const maximum = typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : 100
  const determinate =
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
  const percent = determinate ? (value / maximum) * 100 : 0
  return (
    <ProgressPrimitive.Root
      data-slot='progress'
      data-pw='progress'
      value={value}
      max={max}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot='progress-indicator'
        className='h-full w-full flex-1 bg-primary transition-all'
        style={{ transform: `translateX(${percent - 100}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
