'use client'

import { use } from 'react'
import { TopicCommunitiesAsideContent } from './topic-communities-aside-content'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'

interface TopicCommunitiesAsideStreamingProps {
  topic: Topic
  responsePromise: Promise<CommunitiesSearchResponseBody | null>
}

export function TopicCommunitiesAsideStreaming({
  topic,
  responsePromise,
}: TopicCommunitiesAsideStreamingProps) {
  const t = useTranslations()
  const response = use(responsePromise)
  if (!response) return null
  const communities = (response?.results ?? []).flatMap(r => {
    const c = response?.communities?.[r.id]
    return c !== undefined ? [c] : []
  })
  if (communities.length === 0) return null
  return (
    <TopicCommunitiesAsideContent
      topic={topic}
      communities={communities}
      communityMetrics={response.community_metrics}
      t={t}
    />
  )
}
