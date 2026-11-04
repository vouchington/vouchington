'use client'

import Link from 'next/link'
import { PostContentText } from '@/components/posts/post-content-text'
import { reviewHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ReviewDisputeSummary } from '@/types/review-disputes'
import { getUserLabel } from '@/lib/users/user-helpers'

/** The disputed review and who disputed it: everything a list row can say without the detail read. */
export function DisputeContext({ dispute }: { dispute: ReviewDisputeSummary }) {
  const t = useTranslations()
  const target = dispute.post_content ? (
    dispute.post_slug ? (
      <PostContentText
        as={Link}
        href={reviewHref(dispute.post_slug)}
        className='font-medium underline'
        prefetch={false}
        content={dispute.post_content}
      />
    ) : (
      <PostContentText
        as='p'
        className='font-medium'
        content={dispute.post_content}
      />
    )
  ) : (
    <p className='font-medium'>
      {dispute.post_label === 'review'
        ? t('extracted.disputes.disputesTable.review_aff0766a')
        : dispute.post_label}
    </p>
  )

  return (
    <div
      className='space-y-1 text-xs'
      data-pw='dispute-context'
    >
      {target}
      {dispute.disputant ? (
        <p>
          {getUserLabel(
            {
              username: dispute.disputant.username,
              display_account: { name: dispute.disputant.verified_display_name },
            },
            t('shared.user.deletedUser'),
          )}
        </p>
      ) : null}
    </div>
  )
}
