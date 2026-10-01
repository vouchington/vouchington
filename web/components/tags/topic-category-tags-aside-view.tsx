'use client'

import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'
import { TopicPredicateTagsAsideView } from './topic-predicate-tags-aside-view'

export function TopicCategoryTagsAsideView({
  topic,
  isAuthenticated,
  relations,
  electionVotes,
}: {
  topic: Topic
  isAuthenticated: boolean
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
}) {
  const t = useTranslations()
  if (relations.length === 0 && !isAuthenticated) return null

  return (
    <TopicPredicateTagsAsideView
      electionVotes={electionVotes}
      emptyLabel={t('extracted.tags.topicCategoryTagsAside.noCategoriesYet_7465b456')}
      isAuthenticated={isAuthenticated}
      manageLabel={t('extracted.tags.topicCategoryTagsAside.manage_5a234448')}
      predicate='category'
      relations={relations}
      title={t('extracted.tags.topicCategoryTagsAside.categories_b8b1d894')}
      topic={topic}
    />
  )
}
