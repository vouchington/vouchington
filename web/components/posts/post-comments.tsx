'use client'

import { CommentTree } from '@/components/comments/comment-tree'
import type { PostsResponseBody } from '@/types/api-responses'
import { projectCommentTree } from '@/components/comments/comment-tree-view-model'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { fetchPostDescendants } from '@/lib/api/client/posts'
import { mergePostDescendantPages } from '@/lib/api/merge-post-descendant-pages'

interface PostCommentsProps {
  data: PostsResponseBody
  descendantsSourceId?: string
  rootPostId: string
  rootPostType: string
  rootLockedAt: string | null
  isAdmin: boolean
  hideDownCount: boolean
}

export function PostComments({
  data,
  rootPostId,
  descendantsSourceId = rootPostId,
  rootPostType,
  rootLockedAt,
  isAdmin,
  hideDownCount,
}: PostCommentsProps) {
  const endpoint = `/api/v1/posts/${encodeURIComponent(descendantsSourceId)}/descendants`
  const pagination = usePaginatedList(
    data,
    endpoint,
    {},
    {
      loadPage: after => fetchPostDescendants(descendantsSourceId, { after }),
    },
  )
  const mergedData = mergePostDescendantPages(pagination.pages)
  const handleLoadMore = pagination.loadMore
  return (
    <InfiniteScroll
      hasNextPage={pagination.hasNextPage}
      endCursor={pagination.endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={pagination.loadingMore}
      fetchError={pagination.fetchError}
      clearError={pagination.clearError}
      resetKey={pagination.resetKey}
    >
      <CommentTree
        data={projectCommentTree(mergedData)}
        rootPostId={rootPostId}
        rootPostType={rootPostType}
        rootLockedAt={rootLockedAt}
        isAdmin={isAdmin}
        hideDownCount={hideDownCount}
      />
    </InfiniteScroll>
  )
}
