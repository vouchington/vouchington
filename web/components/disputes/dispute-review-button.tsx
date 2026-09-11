'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DisputeReviewDialog } from './dispute-review-dialog'

interface DisputeReviewButtonProps {
  postId: string
  topicId: string
}

export function DisputeReviewButton({ postId, topicId }: DisputeReviewButtonProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size='sm'
        variant='outline'
        onClick={() => setOpen(true)}
        data-pw='dispute-review-button'
      >
        <Flag className='mr-2 size-4' />
        {t('extracted.disputes.disputeReviewButton.disputeThisReview_a42b99e3')}
      </Button>
      <DisputeReviewDialog
        open={open}
        onOpenChange={setOpen}
        postId={postId}
        topicId={topicId}
      />
    </>
  )
}
