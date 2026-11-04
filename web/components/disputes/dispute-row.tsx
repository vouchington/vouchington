'use client'

import { Button } from '@/components/ui/button'
import { TimeAgo } from '@/components/shared/time-ago'
import type { ReviewDisputeSummary } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DisputeContext } from './dispute-context'

interface DisputeRowProps {
  dispute: ReviewDisputeSummary
  disabled: boolean
  onOpen: (id: string) => void
}

/** A summary row; drafts, notes and the claim load from the detail read when staff open it. */
export function DisputeRow({ dispute, disabled, onOpen }: DisputeRowProps) {
  const t = useTranslations()
  return (
    <tr data-pw='dispute-row'>
      <td className='whitespace-nowrap px-4 py-3 text-sm tabular-nums'>
        <TimeAgo date={dispute.created_at} />
      </td>
      <td className='px-4 py-3 text-sm'>
        <DisputeContext dispute={dispute} />
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='text-xs'>{dispute.reason.replace(/_/g, ' ')}</span>
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {dispute.status}
        </span>
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        {dispute.has_ai_draft ? (
          <p className='text-xs font-medium text-muted-foreground'>
            {t('extracted.disputes.disputeRow.aiRecommendedaction_a89b7966', {
              recommendedAction: dispute.recommended_action,
            })}
          </p>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.disputes.disputeRow.noDraftYet_711e568f')}
          </span>
        )}
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        <span className='text-xs'>{dispute.public_response ?? '—'}</span>
      </td>
      <td className='px-4 py-3'>
        <Button
          size='touchSm'
          variant='outline'
          disabled={disabled}
          onClick={() => onOpen(dispute.id)}
          data-pw='dispute-open'
        >
          {t('extracted.disputes.disputesTable.review_aff0766a')}
        </Button>
      </td>
    </tr>
  )
}
