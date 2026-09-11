import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
        discussion:
          'border-transparent bg-blue-500/15 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300',
        review:
          'border-transparent bg-amber-100 text-amber-950 dark:bg-amber-300 dark:text-amber-950',
        data_point:
          'border-transparent bg-purple-500/15 text-purple-700 dark:bg-purple-500/25 dark:text-purple-300',
        topic_recommendation:
          'border-transparent bg-emerald-100 text-emerald-950 dark:bg-emerald-300 dark:text-emerald-950',
        comment:
          'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
        story:
          'border-transparent bg-rose-500/15 text-rose-700 dark:bg-rose-500/25 dark:text-rose-300',
        article:
          'border-transparent bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-300',
        blog_post:
          'border-transparent bg-teal-500/15 text-teal-700 dark:bg-teal-500/25 dark:text-teal-300',
        link: 'border-transparent bg-orange-500/15 text-orange-700 dark:bg-orange-500/25 dark:text-orange-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'div'
  return (
    <Comp
      data-pw='badge'
      data-slot='badge'
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
