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

export function Signal({ label, value }: { label: string; value: boolean | null }) {
  const t = useTranslations()
  const text =
    value === true
      ? t('extracted.reviewQueue.reviewQueueHelpers.flagged_5588be88')
      : value === false
        ? t('extracted.reviewQueue.reviewQueueHelpers.clear_913a4cb9')
        : t('extracted.reviewQueue.reviewQueueHelpers.pending_62a2fed3')
  return (
    <span className='text-muted-foreground'>
      {label}: <span className='text-foreground'>{text}</span>
    </span>
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
