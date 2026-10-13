import { Loader2Icon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- shadcn spinner is an svg status indicator; output names a form result.
      role='status'
      aria-label='Loading'
      data-pw='spinner'
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}
Spinner.displayName = 'Spinner'

export { Spinner }
