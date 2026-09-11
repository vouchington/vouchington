'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
)

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
  VariantProps<typeof labelVariants> &
  React.LabelHTMLAttributes<HTMLLabelElement> & {
    ref?: React.Ref<React.ElementRef<typeof LabelPrimitive.Root>>
  }

function Label({ className, htmlFor, id, ref, ...props }: LabelProps) {
  const derivedId = id ?? (typeof htmlFor === 'string' ? `${htmlFor}-label` : undefined)

  return (
    <LabelPrimitive.Root
      ref={ref}
      id={derivedId}
      htmlFor={htmlFor}
      data-pw='label'
      className={cn(labelVariants(), className)}
      {...props}
    />
  )
}
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
