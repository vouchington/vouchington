import { TagList } from './tag-list'
import { Card } from '@/components/ui/card'
import type { Post } from '@/types/posts'
import type {
  EntityRelation,
  EntityRelationVote,
  EntityRelationsResponse,
} from '@/lib/api/entity-relations'
import { postTagsHref } from '@/lib/links/entity-href'
import type { useTranslations } from '@/lib/i18n/use-translations'
import { ManageTagsDialog } from './manage-tags-dialog'
import { PaginatedEntityTagList } from './paginated-entity-tag-list'

interface PostRelatedTopicsAsideContentProps {
  post: Post
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  showManageButton: boolean
  showVoting?: boolean
  isAuthenticated?: boolean
  t?: ReturnType<typeof useTranslations>
  response?: EntityRelationsResponse
}

export function PostRelatedTopicsAsideContent({
  post,
  relations,
  electionVotes,
  showManageButton,
  showVoting = true,
  isAuthenticated = false,
  t,
  response,
}: PostRelatedTopicsAsideContentProps) {
  return (
    <Card
      className='p-4'
      data-pw='post-related-topics-aside'
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3
          className='text-sm font-semibold'
          data-pw='post-related-topics-heading'
        >
          {t ? t('extracted.tags.postRelatedTopicsAsideContent.categories_b8b1d894') : 'Categories'}
        </h3>
        {showManageButton && (
          <ManageTagsDialog
            entityType='post'
            entityId={post.id}
            predicate='category'
            objectType='topic'
            label={
              t
                ? t('extracted.tags.postRelatedTopicsAsideContent.categories_b8b1d894')
                : 'Categories'
            }
            heading={
              t
                ? t('extracted.tags.postRelatedTopicsAsideContent.categories_b8b1d894')
                : 'Categories'
            }
            dialogTitle={
              t ? t('extracted.tags.postRelatedTopicsAsideContent.manage_5a234448') : 'Manage'
            }
            triggerLabel={
              t ? t('extracted.tags.postRelatedTopicsAsideContent.manage_5a234448') : 'Manage'
            }
            manageHref={postTagsHref(post, 'topic')}
            loadingText={t ? t('extracted.tags.manageTagsDialog.loading_47d2a515') : 'Loading...'}
            errorText={
              t
                ? t('extracted.tags.manageTagsDialog.errorLoadingTags_8c1f5154')
                : 'Error loading tags'
            }
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>
      {response ? (
        <PaginatedEntityTagList
          entityType='post'
          entityId={post.id}
          predicate='category'
          objectType='topic'
          initialData={response}
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <TagList
          relations={relations}
          electionVotes={electionVotes}
          objectType='topic'
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
          t={t}
        />
      )}
    </Card>
  )
}
