'use client'

import { ShieldCheck } from 'lucide-react'
import type { PostDisputeAnnotation } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DisputeAnnotationProps {
  annotation: PostDisputeAnnotation
}

export function DisputeAnnotation({ annotation }: DisputeAnnotationProps) {
  const t = useTranslations()

  return (
    <div
      className='rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950'
      data-pw='dispute-annotation'
    >
      <div className='flex items-start gap-2'>
        <ShieldCheck className='mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400' />
        <div className='space-y-1'>
          <p className='text-xs font-medium text-amber-800 dark:text-amber-200'>
            {t('extracted.disputes.disputeAnnotation.statementFromTheReviewedParty_5349fe20')}
          </p>
          <p className='text-amber-900 dark:text-amber-100'>{annotation.body_text}</p>
          <p className='text-xs text-amber-700 dark:text-amber-300'>
            {t(
              'extracted.disputes.disputeAnnotation.reviewedAndApprovedByVouchaModerators_763f0a58',
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
