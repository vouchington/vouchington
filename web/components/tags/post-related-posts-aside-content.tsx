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

interface PostRelatedPostsAsideContentProps {
  post: Post
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  showManageButton: boolean
  showVoting?: boolean
  isAuthenticated?: boolean
  t?: ReturnType<typeof useTranslations>
  response?: EntityRelationsResponse
}

export function PostRelatedPostsAsideContent({
  post,
  relations,
  electionVotes,
  showManageButton,
  showVoting = true,
  isAuthenticated = false,
  t,
  response,
}: PostRelatedPostsAsideContentProps) {
  return (
    <Card className='p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <h3
          className='text-sm font-semibold'
          data-pw='post-related-posts-heading'
        >
          {t
            ? t('extracted.tags.postRelatedPostsAsideContent.relatedPosts_bddb629f')
            : 'Related Posts'}
        </h3>
        {showManageButton && (
          <ManageTagsDialog
            entityType='post'
            entityId={post.id}
            predicate='related'
            objectType='post'
            label={
              t
                ? t('extracted.tags.postRelatedPostsAsideContent.relatedPosts_bddb629f')
                : 'Related Posts'
            }
            heading={
              t
                ? t('extracted.tags.postRelatedPostsAsideContent.relatedPosts_bddb629f')
                : 'Related Posts'
            }
            dialogTitle={
              t ? t('extracted.tags.postRelatedPostsAsideContent.manage_5a234448') : 'Manage'
            }
            triggerLabel={
              t ? t('extracted.tags.postRelatedPostsAsideContent.manage_5a234448') : 'Manage'
            }
            manageHref={postTagsHref(post, 'post')}
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
          predicate='related'
          objectType='post'
          initialData={response}
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <TagList
          relations={relations}
          electionVotes={electionVotes}
          objectType='post'
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
          t={t}
        />
      )}
    </Card>
  )
}
