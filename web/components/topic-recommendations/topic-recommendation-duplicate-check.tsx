'use client'

import Link from 'next/link'
import { SimilarityPanel } from '@/components/admin/similarity/similarity-panel'
import { topicHref } from '@/lib/links/entity-href'
import type { TopicRecommendationDuplicatesResult } from '@/lib/api/client/topic-recommendations'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  data: TopicRecommendationDuplicatesResult | null
  isLoading: boolean
  /** True when the topic_title is too short to trigger a check. */
  isBelowMinLength: boolean
}

/**
 * Displays duplicate-detection results for a topic recommendation form.
 * All state management lives in the parent via useTopicRecommendationDuplicates.
 */
export function TopicRecommendationDuplicateCheck({ data, isLoading, isBelowMinLength }: Props) {
  const t = useTranslations()
  if (isBelowMinLength) return null

  if (isLoading) {
    return (
      <div
        className='text-sm text-muted-foreground'
        data-pw='duplicate-check-loading'
      >
        {t(
          'extracted.topicRecommendations.topicRecommendationDuplicateCheck.checkingForDuplicates_fd236754',
        )}
      </div>
    )
  }

  if (!data) return null

  return (
    <div
      className='space-y-3'
      data-pw='duplicate-check-results'
    >
      {data.exact_topic && (
        <div
          className='rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm'
          data-pw='duplicate-check-exact-topic'
        >
          <p className='font-medium text-destructive'>
            {t(
              'extracted.topicRecommendations.topicRecommendationDuplicateCheck.thisTopicAlreadyExists_d0f43d68',
            )}
          </p>
          <p className='mt-1 text-muted-foreground'>
            <Link
              href={topicHref({
                topic_type: data.exact_topic.topic_type,
                id: data.exact_topic.id,
                slug: data.exact_topic.slug,
              })}
              className='underline hover:no-underline'
              data-pw='duplicate-check-exact-topic-link'
            >
              {t(
                'extracted.topicRecommendations.topicRecommendationDuplicateCheck.viewTheExistingTopicName_4699470c',
                { name: data.exact_topic.name },
              )}
            </Link>
          </p>
        </div>
      )}

      {!data.exact_topic && data.pending_recommendations.length > 0 && (
        <div
          className='rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30'
          data-pw='duplicate-check-pending-rec'
        >
          <p className='font-medium text-amber-900 dark:text-amber-200'>
            {t(
              'extracted.topicRecommendations.topicRecommendationDuplicateCheck.thisTopicHasAlreadyBeenRecommended_c5022977',
            )}
          </p>
          <p className='mt-1 text-muted-foreground'>
            <Link
              href='/topic-recommendations'
              className='underline hover:no-underline'
              data-pw='duplicate-check-pending-rec-link'
            >
              {t(
                'extracted.topicRecommendations.topicRecommendationDuplicateCheck.viewExistingRecommendationsAndSupportThe_c48e0d94',
                { topicTitle: data.pending_recommendations[0]!.topic_title },
              )}
            </Link>
          </p>
        </div>
      )}

      {data.similar_topics.length > 0 && (
        <SimilarityPanel
          title={t(
            'extracted.topicRecommendations.topicRecommendationDuplicateCheck.similarExistingTopics_bb3d47ac',
          )}
          isLoading={false}
          items={data.similar_topics.map(t => ({
            id: t.id,
            href: topicHref({ topic_type: t.topic_type, id: t.id, slug: t.slug }),
            label: { kind: 'ui-text', text: t.name },
          }))}
          emptyHint=''
        />
      )}
    </div>
  )
}
