/* oxlint-disable no-mistakes/playwright-literals -- Write dialog IDs come from static option data; ast-grep still bans inline calls in data-pw. */
'use client'

import Link from 'next/link'
import type { MessageKey } from '@ts-shared/ui-messages'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslations } from '@/lib/i18n/use-translations'

interface WriteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const writeOptions: Array<{
  href: string
  title: MessageKey
  description: MessageKey
  dataPw: string
}> = [
  {
    href: '/discussions/create',
    title: 'extracted.navbar.writeDialog.newDiscussion_639bd43d',
    description: 'extracted.navbar.writeDialog.startAConversationAboutAnyTopic_cca66cda',
    dataPw: 'write-dialog-link-discussions-create',
  },
  {
    href: '/reviews/create',
    title: 'extracted.navbar.writeDialog.newReview_629540a6',
    description: 'extracted.navbar.writeDialog.rateAndReviewAProductOr_7b943a01',
    dataPw: 'write-dialog-link-reviews-create',
  },
  {
    href: '/data-points/create',
    title: 'extracted.navbar.writeDialog.newDataPoint_e87814dd',
    description: 'extracted.navbar.writeDialog.shareAVerifiedExperience_6207007d',
    dataPw: 'write-dialog-link-data-points-create',
  },
  {
    href: '/topic-recommendations/create',
    title: 'extracted.navbar.writeDialog.suggestATopic_65a2fcd5',
    description: 'extracted.navbar.writeDialog.proposeAMissingTopicForReview_592a0bee',
    dataPw: 'write-dialog-link-topic-recommendations-create',
  },
]

export function WriteDialog({ open, onOpenChange }: WriteDialogProps) {
  const t = useTranslations()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className='sm:max-w-xs'>
        <DialogHeader>
          <DialogTitle data-pw='create-post-dialog-title'>
            {t('extracted.navbar.writeDialog.createAPost_2530702b')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('extracted.navbar.writeDialog.chooseAPostTypeToCreate_7fcddb09')}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-2'>
          {writeOptions.map(option => (
            <Button
              key={option.href}
              variant='ghost'
              className='h-auto justify-start'
              asChild
            >
              <Link
                href={option.href}
                prefetch={false}
                onClick={() => onOpenChange(false)}
                data-pw={option.dataPw}
              >
                <div className='flex flex-col items-start gap-0.5 py-1'>
                  <span>{t(option.title)}</span>
                  <span className='text-xs text-muted-foreground'>{t(option.description)}</span>
                </div>
              </Link>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
