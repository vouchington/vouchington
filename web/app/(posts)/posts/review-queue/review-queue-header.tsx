'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  reviewCount: number
  flaggedCount: number
  isPending: boolean
  onRefresh: () => void
}

export function ReviewQueueHeader({ reviewCount, flaggedCount, isPending, onRefresh }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='mb-8 flex items-center justify-between gap-4'>
      <div>
        <h1
          data-pw='review-queue-heading'
          className='text-2xl font-bold text-foreground'
        >
          {t('extracted.reviewQueue.reviewQueueHeader.reviewQueue_83c3c922')}
        </h1>
        <p className='mt-2 text-muted-foreground'>
          {t(
            'extracted.reviewQueue.reviewQueueHeader.reviewcountQueuedPostsFlaggedcountFlaggedBy_3e9f4758',
            {
              reviewCount: formatNumber(reviewCount, uiLocale),
              flaggedCount: formatNumber(flaggedCount, uiLocale),
            },
          )}
        </p>
      </div>
      <Button
        variant='outline'
        size='sm'
        onClick={onRefresh}
        aria-label={t('extracted.reviewQueue.reviewQueueHeader.refreshReviewQueue_47a5eda0')}
        disabled={isPending}
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  )
}
