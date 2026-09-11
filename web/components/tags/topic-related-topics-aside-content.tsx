import { TagList } from './tag-list'
import { Card } from '@/components/ui/card'
import type { Topic } from '@/types/topics'
import { topicTagsHref } from '@/lib/links/entity-href'
import type {
  EntityRelation,
  EntityRelationVote,
  EntityRelationsResponse,
} from '@/lib/api/entity-relations'
import type { useTranslations } from '@/lib/i18n/use-translations'
import { ManageTagsDialog } from './manage-tags-dialog'
import { PaginatedEntityTagList } from './paginated-entity-tag-list'

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
    <Card
      className='p-4'
      data-pw='topic-related-topics-aside'
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3
          className='text-sm font-semibold'
          data-pw='topic-related-topics-heading'
        >
          {t('extracted.tags.topicRelatedTopicsAsideContent.relatedTopics_aea370bc')}
        </h3>
        {showManageButton && (
          <ManageTagsDialog
            entityType='topic'
            entityId={topic.id}
            predicate='related'
            objectType='topic'
            label={t('extracted.tags.topicRelatedTopicsAsideContent.relatedTopics_aea370bc')}
            heading={t('extracted.tags.topicRelatedTopicsAsideContent.relatedTopics_aea370bc')}
            dialogTitle={t('extracted.tags.topicRelatedTopicsAsideContent.manage_5a234448')}
            triggerLabel={t('extracted.tags.topicRelatedTopicsAsideContent.manage_5a234448')}
            manageHref={topicTagsHref(topic, 'topic')}
            loadingText={t('extracted.tags.manageTagsDialog.loading_47d2a515')}
            errorText={t('extracted.tags.manageTagsDialog.errorLoadingTags_8c1f5154')}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>
      {response ? (
        <PaginatedEntityTagList
          entityType='topic'
          entityId={topic.id}
          predicate='related'
          objectType='topic'
          initialData={response}
          showVoting={showVoting ?? showManageButton}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <TagList
          relations={relations}
          electionVotes={electionVotes}
          objectType='topic'
          showVoting={showVoting ?? showManageButton}
          isAuthenticated={isAuthenticated}
        />
      )}
    </Card>
  )
}
