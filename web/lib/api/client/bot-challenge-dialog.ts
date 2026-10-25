'use client'

import { createElement } from 'react'
import {
  DialogBase as Dialog,
  DialogContentBase as DialogContent,
  DialogDescriptionBase as DialogDescription,
  DialogHeaderBase as DialogHeader,
  DialogTitleBase as DialogTitle,
} from '@/components/dialog-primitives'
import { useTurnstileAction } from '@/hooks/use-turnstile-action'
import { getTurnstileSiteKey } from '@/lib/turnstile-config'

export function BotChallengeDialog({
  actionTag,
  description,
  onCancel,
  onError,
  onSuccess,
  title,
}: {
  actionTag: string
  description: string
  onCancel: () => void
  onError: (error: Error) => void
  onSuccess: (token: string) => void
  title: string
}) {
  const { ref, reset } = useTurnstileAction({
    actionTag,
    appearance: 'interaction-only',
    onError: () => onError(new Error('Security verification failed')),
    onExpire: () => reset(),
    onSuccess,
    siteKey: getTurnstileSiteKey(),
  })

  return createElement(
    Dialog,
    { open: true, onOpenChange: open => !open && onCancel() },
    createElement(
      DialogContent,
      null,
      createElement(
        DialogHeader,
        null,
        createElement(DialogTitle, null, title),
        createElement(DialogDescription, null, description),
      ),
      createElement('div', { ref, className: 'min-h-[65px]' }),
    ),
  )
}
