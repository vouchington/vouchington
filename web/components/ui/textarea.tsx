'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { submitOnCmdEnter } from '@/lib/form-submit'

function Textarea({
  className,
  onKeyDown,
  ref,
  ...props
}: React.ComponentProps<'textarea'> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    submitOnCmdEnter(event)
  }
  return (
    <textarea
      data-pw='textarea'
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      ref={ref}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
}
Textarea.displayName = 'Textarea'

export { Textarea }
