import type {
  EntityRelation,
  EntityRelationVote,
  EntityRelationsResponse,
} from '@/lib/api/entity-relations'
import { topicTagsHref } from '@/lib/links/entity-href'
import type { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'
import { TopicRelationAsideCard } from './topic-relation-aside-card'

interface TopicFaqPostsAsideContentProps {
  topic: Topic
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  showManageButton: boolean
  isAuthenticated?: boolean
  t: ReturnType<typeof useTranslations>
  response?: EntityRelationsResponse
}

export function TopicFaqPostsAsideContent({
  topic,
  relations,
  electionVotes,
  showManageButton,
  isAuthenticated = false,
  t,
  response,
}: TopicFaqPostsAsideContentProps) {
  return (
    <TopicRelationAsideCard
      topic={topic}
      relations={relations}
      electionVotes={electionVotes}
      showManageButton={showManageButton}
      showVoting={showManageButton}
      isAuthenticated={isAuthenticated}
      t={t}
      response={response}
      asidePw='topic-faq-posts-aside'
      headingPw='topic-faq-posts-heading'
      heading={t('extracted.tags.topicFaqPostsAsideContent.faqPosts_09edffc6')}
      predicate='faq'
      objectType='post'
      manageHref={topicTagsHref(topic, 'post')}
      manageLabel={t('extracted.tags.topicFaqPostsAsideContent.manage_5a234448')}
    />
  )
}
