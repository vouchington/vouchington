'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AppealForm } from './appeal-form'
import { useTranslations } from '@/lib/i18n/use-translations'

type AppealDialogProps =
  | {
      warningId: string
      communityBanId?: never
      postId?: never
      postRemovalKind?: never
      suspension?: never
    }
  | {
      warningId?: never
      communityBanId: string
      postId?: never
      postRemovalKind?: never
      suspension?: never
    }
  | {
      warningId?: never
      communityBanId?: never
      postId: string
      postRemovalKind?: 'platform' | 'community'
      suspension?: never
    }
  | {
      warningId?: never
      communityBanId?: never
      postId?: never
      postRemovalKind?: never
      suspension: true
    }

export function AppealDialog({
  warningId,
  communityBanId,
  postId,
  postRemovalKind,
  suspension,
}: AppealDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  let targetType: 'warning' | 'ban' | 'removal' | 'suspension'
  let targetId: string | undefined
  if (warningId) {
    targetType = 'warning'
    targetId = warningId
  } else if (communityBanId) {
    targetType = 'ban'
    targetId = communityBanId
  } else if (postId) {
    targetType = 'removal'
    targetId = postId
  } else if (suspension) {
    targetType = 'suspension'
    targetId = undefined
  } else {
    throw new Error('AppealDialog requires warningId, communityBanId, postId, or suspension')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='touchSm'
          data-pw='appeal-dialog-trigger'
        >
          {t('extracted.appeals.appealDialog.fileAnAppeal_0251bf47')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className='sm:max-w-lg'
        onInteractOutside={e => {
          // Prevent click-outside from closing the dialog while the form is being
          // filled out. Radix Select (and other Radix popovers) render in a portal
          // that is outside the dialog DOM tree; without this, clicking a Select
          // option triggers the Dialog's onInteractOutside and closes the dialog
          // before the option's onValueChange fires.
          /* c8 ignore next -- browser-interaction handler; covered by Playwright, not Vitest */
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('extracted.appeals.appealDialog.fileAnAppeal_0251bf47')}</DialogTitle>
          <DialogDescription>
            {t('extracted.appeals.appealDialog.explainWhyYouBelieveThisModeration_db9f6d10')}
          </DialogDescription>
        </DialogHeader>
        <AppealForm
          targetType={targetType}
          targetId={targetId}
          postRemovalKind={postRemovalKind}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
