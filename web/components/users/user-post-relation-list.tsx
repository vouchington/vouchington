import { EmptyState } from '@/components/shared/empty-state'
import { PostCard } from '@/components/posts/post-card'
import type { Post } from '@/types/posts'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from './relation-management-action'

export function UserPostRelationList({
  posts,
  emptyTitle,
  emptyDescription,
  relationAction,
  onRemoved,
}: {
  posts: Post[]
  emptyTitle: string
  emptyDescription: string
  relationAction?: RelationManagementActionConfig
  onRemoved?: (entityId: string) => void
}) {
  if (posts.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {posts.map(post => (
        <div
          key={post.id}
          className='space-y-2'
          data-pw='post-relation-row'
          data-post-id={post.id}
        >
          <PostCard
            post={post}
            hideBookmarkActions={!!relationAction}
          />
          {relationAction ? (
            <RelationManagementAction
              entityId={post.id}
              config={relationAction}
              onRemoved={onRemoved}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
