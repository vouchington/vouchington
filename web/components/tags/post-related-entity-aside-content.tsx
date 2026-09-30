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

export type PostRelatedAsideKind = 'posts' | 'topics' | 'urls'

export interface PostRelatedEntityAsideContentProps {
  post: Post
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  showManageButton: boolean
  showVoting?: boolean
  isAuthenticated?: boolean
  t?: ReturnType<typeof useTranslations>
  response?: EntityRelationsResponse
  kind: PostRelatedAsideKind
}

type AsideTranslator = NonNullable<PostRelatedEntityAsideContentProps['t']>
type PostRelationObjectType = 'post' | 'topic' | 'url'

interface AsideCopy {
  title: string
  manage: string
  predicate: 'related' | 'category'
  objectType: PostRelationObjectType
}

function translated(
  t: PostRelatedEntityAsideContentProps['t'],
  key: Parameters<AsideTranslator>[0],
  fallback: string,
) {
  return t ? t(key) : fallback
}

function asideCopy(
  kind: PostRelatedAsideKind,
  t: PostRelatedEntityAsideContentProps['t'],
): AsideCopy {
  if (kind === 'posts') {
    return {
      title: translated(
        t,
        'extracted.tags.postRelatedPostsAsideContent.relatedPosts_bddb629f',
        'Related Posts',
      ),
      manage: translated(
        t,
        'extracted.tags.postRelatedPostsAsideContent.manage_5a234448',
        'Manage',
      ),
      predicate: 'related',
      objectType: 'post',
    }
  }
  if (kind === 'topics') {
    return {
      title: translated(
        t,
        'extracted.tags.postRelatedTopicsAsideContent.categories_b8b1d894',
        'Categories',
      ),
      manage: translated(
        t,
        'extracted.tags.postRelatedTopicsAsideContent.manage_5a234448',
        'Manage',
      ),
      predicate: 'category',
      objectType: 'topic',
    }
  }
  return {
    title: translated(
      t,
      'extracted.tags.postRelatedUrlsAsideContent.relatedLinks_e9bb3cb1',
      'Related Links',
    ),
    manage: translated(t, 'extracted.tags.postRelatedUrlsAsideContent.manage_5a234448', 'Manage'),
    predicate: 'related',
    objectType: 'url',
  }
}

function AsideHeading({ kind, title }: { kind: PostRelatedAsideKind; title: string }) {
  const className = 'text-sm font-semibold'
  if (kind === 'posts') {
    return (
      <h3
        className={className}
        data-pw='post-related-posts-heading'
      >
        {title}
      </h3>
    )
  }
  if (kind === 'topics') {
    return (
      <h3
        className={className}
        data-pw='post-related-topics-heading'
      >
        {title}
      </h3>
    )
  }
  return <h3 className={className}>{title}</h3>
}

export function PostRelatedEntityAsideContent({
  post,
  relations,
  electionVotes,
  showManageButton,
  showVoting = true,
  isAuthenticated = false,
  t,
  response,
  kind,
}: PostRelatedEntityAsideContentProps) {
  const copy = asideCopy(kind, t)
  const loadingText = translated(
    t,
    'extracted.tags.manageTagsDialog.loading_47d2a515',
    'Loading...',
  )
  const errorText = translated(
    t,
    'extracted.tags.manageTagsDialog.errorLoadingTags_8c1f5154',
    'Error loading tags',
  )
  const body = (
    <>
      <div className='mb-3 flex items-center justify-between'>
        <AsideHeading
          kind={kind}
          title={copy.title}
        />
        {showManageButton && (
          <ManageTagsDialog
            entityType='post'
            entityId={post.id}
            predicate={copy.predicate}
            objectType={copy.objectType}
            label={copy.title}
            heading={copy.title}
            dialogTitle={copy.manage}
            triggerLabel={copy.manage}
            manageHref={postTagsHref(post, copy.objectType)}
            loadingText={loadingText}
            errorText={errorText}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>
      {response ? (
        <PaginatedEntityTagList
          entityType='post'
          entityId={post.id}
          predicate={copy.predicate}
          objectType={copy.objectType}
          initialData={response}
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <TagList
          relations={relations}
          electionVotes={electionVotes}
          objectType={copy.objectType}
          showVoting={showVoting}
          isAuthenticated={isAuthenticated}
          t={t}
        />
      )}
    </>
  )
  return kind === 'topics' ? (
    <Card
      className='p-4'
      data-pw='post-related-topics-aside'
    >
      {body}
    </Card>
  ) : (
    <Card className='p-4'>{body}</Card>
  )
}
