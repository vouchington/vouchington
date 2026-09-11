import { TagList } from './tag-list'
import { Card } from '@/components/ui/card'
import type { Post } from '@/types/posts'
import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
import { postTagsHref } from '@/lib/links/entity-href'
import type { useTranslations } from '@/lib/i18n/use-translations'
import { ManageTagsDialog } from './manage-tags-dialog'

interface PostRelatedUrlsAsideContentProps {
  post: Post
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  showManageButton: boolean
  showVoting?: boolean
  isAuthenticated?: boolean
  t?: ReturnType<typeof useTranslations>
}

export function PostRelatedUrlsAsideContent({
  post,
  relations,
  electionVotes,
  showManageButton,
  showVoting = true,
  isAuthenticated = false,
  t,
}: PostRelatedUrlsAsideContentProps) {
  return (
    <Card className='p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>
          {t
            ? t('extracted.tags.postRelatedUrlsAsideContent.relatedLinks_e9bb3cb1')
            : 'Related Links'}
        </h3>
        {showManageButton && (
          <ManageTagsDialog
            entityType='post'
            entityId={post.id}
            predicate='related'
            objectType='url'
            label={
              t
                ? t('extracted.tags.postRelatedUrlsAsideContent.relatedLinks_e9bb3cb1')
                : 'Related Links'
            }
            heading={
              t
                ? t('extracted.tags.postRelatedUrlsAsideContent.relatedLinks_e9bb3cb1')
                : 'Related Links'
            }
            dialogTitle={
              t ? t('extracted.tags.postRelatedUrlsAsideContent.manage_5a234448') : 'Manage'
            }
            triggerLabel={
              t ? t('extracted.tags.postRelatedUrlsAsideContent.manage_5a234448') : 'Manage'
            }
            manageHref={postTagsHref(post, 'url')}
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
      <TagList
        relations={relations}
        electionVotes={electionVotes}
        objectType='url'
        showVoting={showVoting}
        isAuthenticated={isAuthenticated}
        t={t}
      />
    </Card>
  )
}
