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
    <Card
      className='p-4'
      data-pw='topic-faq-posts-aside'
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3
          className='text-sm font-semibold'
          data-pw='topic-faq-posts-heading'
        >
          {t('extracted.tags.topicFaqPostsAsideContent.faqPosts_09edffc6')}
        </h3>
        {showManageButton && (
          <ManageTagsDialog
            entityType='topic'
            entityId={topic.id}
            predicate='faq'
            objectType='post'
            label={t('extracted.tags.topicFaqPostsAsideContent.faqPosts_09edffc6')}
            heading={t('extracted.tags.topicFaqPostsAsideContent.faqPosts_09edffc6')}
            dialogTitle={t('extracted.tags.topicFaqPostsAsideContent.manage_5a234448')}
            triggerLabel={t('extracted.tags.topicFaqPostsAsideContent.manage_5a234448')}
            manageHref={topicTagsHref(topic, 'post')}
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
          predicate='faq'
          objectType='post'
          initialData={response}
          showVoting={showManageButton}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <TagList
          relations={relations}
          electionVotes={electionVotes}
          objectType='post'
          showVoting={showManageButton}
          isAuthenticated={isAuthenticated}
        />
      )}
    </Card>
  )
}
