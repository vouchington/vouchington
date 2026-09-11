'use client'

import { TimeAgo } from '@/components/shared/time-ago'
import { AppealDialog } from '@/components/appeals/appeal-dialog'
import { PostContentText } from '@/components/posts/post-content-text'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { communityHref } from '@/lib/links/entity-href'
import { listMyRemovedPosts } from '@/lib/api/client/removed-posts'
import type { MyRemovedPost, MyRemovedPostsResponse } from '@/types/my'
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/use-translations'

interface MyRemovedPostsClientProps {
  initialData: MyRemovedPostsResponse
}

export function MyRemovedPostsClient({ initialData }: MyRemovedPostsClientProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(
      initialData,
      '/api/v1/my/removed-posts',
      {},
      {
        loadPage: listMyRemovedPosts,
      },
    )
  const removedPosts = uniqueRemovedPosts(pages.flatMap(page => page.removed_posts))

  if (removedPosts.length === 0) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-pw='my-removed-posts-empty'
      >
        {t('extracted.removedPosts.myRemovedPostsClient.youHaveNoRemovedPosts_9c2a82e4')}
      </p>
    )
  }

  return (
    <InfiniteScroll
      hasNextPage={hasNextPage}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      <ul
        className='space-y-4'
        data-pw='my-removed-posts-list'
      >
        {removedPosts.map(post => (
          <li
            key={`${post.post_removal_kind}:${post.post_id}`}
            className='rounded-md border bg-card p-4'
            data-pw='my-removed-post-item'
          >
            <div className='flex flex-wrap items-start justify-between gap-2'>
              <div className='flex flex-col gap-1'>
                {post.community_slug ? (
                  <p className='text-xs text-muted-foreground'>
                    {t('extracted.removedPosts.myRemovedPostsClient.community_a497fe96')}{' '}
                    <Link
                      href={communityHref({ slug: post.community_slug })}
                      className='underline'
                      prefetch={false}
                    >
                      {post.community_slug}
                    </Link>
                  </p>
                ) : post.post_removal_kind === 'community' ? (
                  <p className='text-xs text-muted-foreground'>
                    {t('extracted.removedPosts.myRemovedPostsClient.communityPost_ed1705c8')}
                  </p>
                ) : (
                  <p className='text-xs text-muted-foreground'>
                    {t('extracted.appeals.appealRow.platformPostRemoval_a55ee32d')}
                  </p>
                )}
                <PostContentText
                  as='p'
                  content={{
                    text: post.post_title,
                    declared_language: post.post_declared_language,
                    lingua_rs_detected_language: post.post_lingua_rs_detected_language,
                  }}
                  fallback={null}
                  className='text-sm font-medium'
                  data-pw='my-removed-post-title'
                />
              </div>
              <div className='flex items-center gap-3'>
                <time
                  className='text-xs tabular-nums text-muted-foreground'
                  data-pw='my-removed-post-date'
                >
                  <TimeAgo date={post.unpublished_at} />
                </time>
                <AppealDialog
                  postId={post.post_id}
                  postRemovalKind={post.post_removal_kind}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </InfiniteScroll>
  )
}

function uniqueRemovedPosts(posts: MyRemovedPost[]): MyRemovedPost[] {
  return [
    ...new Map(posts.map(post => [`${post.post_removal_kind}:${post.post_id}`, post])).values(),
  ]
}
