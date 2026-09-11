'use client'

import { useSimilarEntities } from '@/hooks/use-similar-entities'
import {
  fetchTopicRecommendationDuplicates,
  type TopicRecommendationDuplicatesResult,
} from '@/lib/api/client/topic-recommendations'

const MIN_LENGTH = 3

interface UseDuplicatesOptions {
  topicTitle: string
  topicSlug: string
}

export interface UseDuplicatesResult {
  data: TopicRecommendationDuplicatesResult | null
  isLoading: boolean
  isBlocked: boolean
}

/**
 * Debounced duplicate-detection hook for topic recommendation forms.
 * Calls the /duplicates endpoint when the topic title reaches the minimum length.
 * `isBlocked` is true when an exact topic or pending recommendation is found.
 */
export function useTopicRecommendationDuplicates({
  topicTitle,
  topicSlug,
}: UseDuplicatesOptions): UseDuplicatesResult {
  const title = topicTitle.trim()
  const slug = topicSlug.trim()

  const { data, isLoading } = useSimilarEntities<TopicRecommendationDuplicatesResult>({
    // The query key is internal change-detection only (never sent to the backend);
    // JSON-encode both fields so a `|` (or any character) in the title can't be
    // misparsed, and so slug-only edits still re-trigger a fetch. Guard with the
    // title length so we don't fire when only a few slug chars have been typed.
    query: title.length >= MIN_LENGTH ? JSON.stringify({ title, slug }) : '',
    minLength: 1,
    fetcher: (_q, signal) =>
      fetchTopicRecommendationDuplicates({ topic_title: title, topic_slug: slug, signal }),
  })

  const isBlocked =
    title.length >= MIN_LENGTH &&
    !!(data?.exact_topic || (data?.pending_recommendations?.length ?? 0) > 0)

  return { data, isLoading, isBlocked }
}
