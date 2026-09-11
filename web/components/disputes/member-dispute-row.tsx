'use client'

import Link from 'next/link'
import { PostContentText } from '@/components/posts/post-content-text'
import { reviewHref } from '@/lib/links/entity-href'
import { TimeAgo } from '@/components/shared/time-ago'
import type { ReviewDispute } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'

interface MemberDisputeRowProps {
  dispute: ReviewDispute
}

export function MemberDisputeRow({ dispute }: MemberDisputeRowProps) {
  const t = useTranslations()
  return (
    <tr data-pw='member-dispute-row'>
      <td className='whitespace-nowrap px-4 py-3 text-sm tabular-nums'>
        <TimeAgo date={dispute.created_at} />
      </td>
      <td className='px-4 py-3 text-sm'>
        {dispute.post_content ? (
          <PostContentText
            as={Link}
            href={reviewHref(dispute.post_id)}
            className='font-medium underline'
            prefetch={false}
            content={dispute.post_content}
          />
        ) : (
          <span>{dispute.post_id}</span>
        )}
      </td>
      <td className='px-4 py-3 text-sm'>{dispute.reason.replace(/_/g, ' ')}</td>
      <td className='px-4 py-3 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {dispute.status}
        </span>
      </td>
      {dispute.sent_at && dispute.public_response ? (
        <td className='max-w-xs px-4 py-3 text-sm'>
          <p className='text-sm'>{dispute.public_response}</p>
        </td>
      ) : (
        <td className='px-4 py-3 text-xs text-muted-foreground'>
          {t('extracted.disputes.memberDisputeRow.pendingReview_f1c45f3f')}
        </td>
      )}
    </tr>
  )
}
