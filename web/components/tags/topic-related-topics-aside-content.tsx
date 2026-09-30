import type {
  EntityRelation,
  EntityRelationVote,
  EntityRelationsResponse,
} from '@/lib/api/entity-relations'
import { topicTagsHref } from '@/lib/links/entity-href'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'
import { TopicRelationAsideCard } from './topic-relation-aside-card'

interface TopicRelatedTopicsAsideContentProps {
  topic: Topic
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  showManageButton: boolean
  showVoting?: boolean
  isAuthenticated?: boolean
  t: ReturnType<typeof useTranslations>
  response?: EntityRelationsResponse
}

export function TopicRelatedTopicsAsideContent({
  topic,
  relations,
  electionVotes,
  showManageButton,
  showVoting,
  isAuthenticated = false,
  t,
  response,
}: TopicRelatedTopicsAsideContentProps) {
  return (
    <TopicRelationAsideCard
      topic={topic}
      relations={relations}
      electionVotes={electionVotes}
      showManageButton={showManageButton}
      showVoting={showVoting ?? showManageButton}
      isAuthenticated={isAuthenticated}
      t={t}
      response={response}
      asidePw='topic-related-topics-aside'
      headingPw='topic-related-topics-heading'
      heading={t('extracted.tags.topicRelatedTopicsAsideContent.relatedTopics_aea370bc')}
      predicate='related'
      objectType='topic'
      manageHref={topicTagsHref(topic, 'topic')}
      manageLabel={t('extracted.tags.topicRelatedTopicsAsideContent.manage_5a234448')}
    />
  )
}
