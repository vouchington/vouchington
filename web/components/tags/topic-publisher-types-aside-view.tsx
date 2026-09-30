'use client'

import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'
import { TopicPredicateTagsAsideView } from './topic-predicate-tags-aside-view'
import type { EnumOption } from './types'

export function TopicPublisherTypesAsideView({
  topic,
  isAuthenticated,
  relations,
  electionVotes,
  enumOptions,
}: {
  topic: Topic
  isAuthenticated: boolean
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  enumOptions?: EnumOption[]
}) {
  const t = useTranslations()
  if (topic.topic_type !== 'rss_feed') return null
  if (relations.length === 0 && !isAuthenticated) return null

  return (
    <TopicPredicateTagsAsideView
      dataPw='publisher-type-aside'
      electionVotes={electionVotes}
      emptyLabel={t('extracted.tags.topicPublisherTypesAside.noPublisherTypeSet_e7af1583')}
      enumOptions={enumOptions}
      isAuthenticated={isAuthenticated}
      manageLabel={t('extracted.tags.topicPublisherTypesAside.manage_5a234448')}
      predicate='publisher_type'
      relations={relations}
      title={t('extracted.tags.topicPublisherTypesAside.publisherType_9b943044')}
      topic={topic}
    />
  )
}
