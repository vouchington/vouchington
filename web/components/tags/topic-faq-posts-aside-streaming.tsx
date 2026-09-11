'use client'

import { use } from 'react'
import { TopicFaqPostsAsideContent } from './topic-faq-posts-aside-content'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

interface TopicFaqPostsAsideStreamingProps {
  topic: Topic
  responsePromise: Promise<EntityRelationsResponse>
}

export function TopicFaqPostsAsideStreaming({
  topic,
  responsePromise,
}: TopicFaqPostsAsideStreamingProps) {
  const t = useTranslations()
  const response = use(responsePromise)
  const { results, entity_relations, election_votes } = response
  const relations = results.flatMap(r => {
    const rel = entity_relations[r.id]
    return rel ? [rel] : []
  })
  if (relations.length === 0) return null
  return (
    <TopicFaqPostsAsideContent
      topic={topic}
      relations={relations}
      electionVotes={election_votes}
      response={response}
      showManageButton
      isAuthenticated
      t={t}
    />
  )
}
