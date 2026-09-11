import React, { type HTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

type HoverableCardProps = HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean
  'data-pw'?: string
  ref?: React.Ref<HTMLDivElement>
}

export function HoverableCard({
  asChild = false,
  className,
  'data-pw': dataPw = 'hoverable-card',
  ref,
  ...props
}: HoverableCardProps) {
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp
      ref={ref}
      data-pw={dataPw}
      className={cn(
        'rounded-md border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-md dark:shadow-none dark:hover:border-accent-foreground/20 dark:hover:shadow-none',
        className,
      )}
      {...props}
    />
  )
}
