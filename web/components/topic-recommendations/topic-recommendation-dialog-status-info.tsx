'use client'

import Link from 'next/link'
import { createUserPathname, topicHref } from '@/lib/links/entity-href'
import type { Post } from '@/types/posts'
import type { PublicUser } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  selected: Pick<Post, 'topic_recommendation'>
  users?: Record<string, PublicUser>
}

export function TopicRecommendationDialogStatusInfo({ selected, users }: Props) {
  const t = useTranslations()
  const rec = selected.topic_recommendation
  if (!rec || rec.status === 'pending') return null

  const reviewer = rec.reviewed_by_id ? users?.[rec.reviewed_by_id] : null
  const reviewerDisplay = reviewer?.username ? (
    <Link
      href={createUserPathname(reviewer.username)}
      className='font-medium hover:underline'
    >
      @{reviewer.username}
    </Link>
  ) : (
    t('extracted.topicRecommendations.topicRecommendationDialogStatusInfo.anAdmin_dfd7b796')
  )
  const reviewedDate = rec.reviewed_at
    ? new Date(rec.reviewed_at).toLocaleDateString()
    : t('extracted.topicRecommendations.topicRecommendationDialogStatusInfo.unknownDate_bced143d')

  if (rec.status === 'approved') {
    return (
      <div
        className='rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950'
        data-pw='topic-recommendation-approved-info'
      >
        <p className='font-medium text-green-800 dark:text-green-200'>
          {t(
            'extracted.topicRecommendations.topicRecommendationDialogStatusInfo.approved_87b42e40',
          )}
        </p>
        <p className='mt-1 text-green-700 dark:text-green-300'>
          {t(
            'extracted.topicRecommendations.topicRecommendationDialogStatusInfo.approvedBy_8e838c46',
          )}{' '}
          {reviewerDisplay}{' '}
          {t('extracted.topicRecommendations.topicRecommendationDialogStatusInfo.onDate_908b9021', {
            date: reviewedDate,
          })}
        </p>
        {rec.created_topic_id ? (
          <Link
            href={topicHref({
              topic_type: 'topic',
              id: rec.created_topic_id,
              slug: rec.created_topic_slug,
            })}
            className='mt-2 inline-block text-green-600 hover:underline dark:text-green-400'
            data-pw='topic-recommendation-view-topic-link'
          >
            {t(
              'extracted.topicRecommendations.topicRecommendationDialogStatusInfo.viewCreatedTopic_76e75c6f',
            )}
          </Link>
        ) : null}
      </div>
    )
  }

  // rejected
  return (
    <div
      className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'
      data-pw='topic-recommendation-rejected-info'
    >
      <p className='font-medium text-destructive'>
        {t('extracted.topicRecommendations.topicRecommendationDialogStatusInfo.rejected_aea4a04a')}
      </p>
      <p className='mt-1 text-muted-foreground'>
        {t(
          'extracted.topicRecommendations.topicRecommendationDialogStatusInfo.rejectedBy_2ad44c3f',
        )}{' '}
        {reviewerDisplay}{' '}
        {t('extracted.topicRecommendations.topicRecommendationDialogStatusInfo.onDate_908b9021', {
          date: reviewedDate,
        })}
      </p>
      {rec.rejection_reason ? (
        <p className='mt-2 text-muted-foreground'>
          {t(
            'extracted.topicRecommendations.topicRecommendationDialogStatusInfo.reasonReason_ae08e67f',
            { reason: rec.rejection_reason },
          )}
        </p>
      ) : null}
    </div>
  )
}
