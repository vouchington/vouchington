'use client'

import Link from 'next/link'
import { PostContentText } from '@/components/posts/post-content-text'
import { reviewHref } from '@/lib/links/entity-href'
import { TimeAgo } from '@/components/shared/time-ago'
import type { ReviewDispute } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DisputeStatusCardProps {
  dispute: ReviewDispute
}

export function DisputeStatusCard({ dispute }: DisputeStatusCardProps) {
  const t = useTranslations()

  return (
    <div
      className='space-y-2 rounded-md border p-4'
      data-pw='dispute-status-card'
    >
      <div className='flex items-center justify-between'>
        <div>
          {dispute.post_content ? (
            <PostContentText
              as={Link}
              href={reviewHref(dispute.post_id)}
              className='font-medium underline'
              prefetch={false}
              content={dispute.post_content}
            />
          ) : (
            <span className='font-medium'>{dispute.post_id}</span>
          )}
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {dispute.reason.replace(/_/g, ' ')}{' '}
            {t('extracted.disputes.disputeStatusCard.text_a137f17a')}{' '}
            <TimeAgo date={dispute.created_at} />
          </p>
        </div>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {dispute.status}
        </span>
      </div>
      {dispute.sent_at && dispute.public_response ? (
        <div className='rounded bg-muted p-3 text-sm'>
          <p className='mb-1 text-xs font-medium text-muted-foreground'>
            {t('extracted.disputes.disputeStatusCard.moderatorResponse_a42aa5a1')}
          </p>
          <p>{dispute.public_response}</p>
        </div>
      ) : null}
    </div>
  )
}
