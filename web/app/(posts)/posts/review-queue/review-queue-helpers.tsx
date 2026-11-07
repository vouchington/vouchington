'use client'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { AdminReviewQueuePost } from '@/types/admin-review-queue'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ClearanceBadge({ status }: { status: AdminReviewQueuePost['clearance_status'] }) {
  const t = useTranslations()
  if (status === 'rejected')
    return (
      <Badge variant='destructive'>
        {t('extracted.reviewQueue.reviewQueueHelpers.rejected_aea4a04a')}
      </Badge>
    )
  if (status === 'in_review')
    return (
      <Badge variant='secondary'>
        {t('extracted.reviewQueue.reviewQueueHelpers.inReview_c3905914')}
      </Badge>
    )
  if (status === 'approved')
    return (
      <Badge variant='default'>
        {t('extracted.reviewQueue.reviewQueueHelpers.approved_87b42e40')}
      </Badge>
    )
  return (
    <Badge variant='outline'>
      {t('extracted.reviewQueue.reviewQueueHelpers.pending_331551b0')}
    </Badge>
  )
}

export function ModerationSummary({
  summary,
}: {
  summary: AdminReviewQueuePost['moderation_summary']
}) {
  const t = useTranslations()
  const disposition = (() => {
    switch (summary.disposition) {
      case 'pass':
        return t('extracted.reviewQueue.reviewQueueHelpers.clear_913a4cb9')
      case 'review':
        return t('extracted.reviewQueue.reviewQueueHelpers.inReview_c3905914')
      case 'reject':
        return t('extracted.reviewQueue.reviewQueueHelpers.rejected_aea4a04a')
      case 'incomplete':
      case null:
        return t('extracted.reviewQueue.reviewQueueHelpers.pending_62a2fed3')
    }
  })()
  const reasonCodes = [...new Set(summary.reason_codes)]

  function reasonLabel(reasonCode: string): string {
    switch (reasonCode) {
      case 'provider_pass':
      case 'provider_passed':
        return t('extracted.reviewQueue.reviewQueueHelpers.clear_913a4cb9')
      case 'staff_approved':
        return t('extracted.reviewQueue.reviewQueueHelpers.approved_87b42e40')
      case 'staff_rejected':
        return t('extracted.reviewQueue.reviewQueueHelpers.rejected_aea4a04a')
      case 'staff_reviewed':
        return t('extracted.reviewQueue.reviewQueueHelpers.inReview_c3905914')
      case 'automation_unavailable':
      case 'no_content_to_moderate':
        return t('extracted.reviewQueue.reviewQueueHelpers.pending_62a2fed3')
      case 'provider_flagged':
      case 'spam_signal':
      case 'sexual_minors':
        return t('extracted.reviewQueue.reviewQueueHelpers.flagged_5588be88')
      default:
        return t('extracted.reviewQueue.reviewQueueHelpers.pending_62a2fed3')
    }
  }

  return (
    <div className='flex flex-col gap-1 text-sm'>
      <span className='capitalize text-foreground'>{disposition}</span>
      {reasonCodes.map(reasonCode => (
        <span
          key={reasonCode}
          className='text-muted-foreground'
        >
          {reasonLabel(reasonCode)}
        </span>
      ))}
    </div>
  )
}

const POST_TYPE_BADGE_VARIANTS = new Set([
  'discussion',
  'review',
  'data_point',
  'topic_recommendation',
  'comment',
  'story',
  'article',
  'blog_post',
])

export function PostTypeBadge({ postType }: { postType: string }) {
  const variant = (
    POST_TYPE_BADGE_VARIANTS.has(postType) ? postType : 'secondary'
  ) as BadgeProps['variant']
  return <Badge variant={variant}>{postType.replaceAll('_', ' ')}</Badge>
}
