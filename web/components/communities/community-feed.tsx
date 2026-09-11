'use client'

import Link from 'next/link'
import { Pin } from 'lucide-react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { PostCard } from '@/components/posts/post-card'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { CommunityPostsResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityFeedProps {
  data: CommunityPostsResponseBody
  communitySlug: string
  canCreatePost?: boolean
  allowReviewPosts?: boolean
  allowDataPointPosts?: boolean
  nextPageParams?: PaginatedListParams
}

const EMPTY_PAGE_PARAMS: PaginatedListParams = {}

export function CommunityFeed({
  data,
  communitySlug,
  canCreatePost = false,
  allowReviewPosts = false,
  allowDataPointPosts = false,
  nextPageParams = EMPTY_PAGE_PARAMS,
}: CommunityFeedProps) {
  const t = useTranslations()
  const endpoint = `/api/v1/communities/${encodeURIComponent(communitySlug)}/posts`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, nextPageParams)
  const pinnedPostIds = data.pinned_post_ids ?? []
  const results = mergePageResultsById(pages).filter(r => !pinnedPostIds.includes(r.id))
  const posts = mergeRecords(pages, page => page.posts)
  const metrics = mergeRecords(pages, page => page.posts_metrics)
  const communities = mergeRecords(pages, page => page.communities ?? {})
  const linkEmbeds = mergeRecords(pages, page => page.post_link_embeds ?? {})

  const pinnedPosts = pinnedPostIds.flatMap(id => (data.posts[id] ? [data.posts[id]] : []))

  const contributeActions = canCreatePost ? (
    <CommunityContributeActions
      communitySlug={communitySlug}
      allowReviewPosts={allowReviewPosts}
      allowDataPointPosts={allowDataPointPosts}
      t={t}
    />
  ) : null

  if (pinnedPosts.length === 0 && results.length === 0) {
    return (
      <EmptyState
        icon='pen-line'
        title={t('extracted.communities.communityFeed.noPostsYet_f2bd6770')}
        description={t('extracted.communities.communityFeed.beTheFirstToPostIn_9d6339df')}
      >
        {contributeActions}
      </EmptyState>
    )
  }

  return (
    <>
      {contributeActions}
      {pinnedPosts.length > 0 && (
        <div className='space-y-3'>
          {pinnedPosts.map(post => (
            <div
              key={post.id}
              className='border-l-2 border-l-primary pl-3'
            >
              <div
                className='mb-2 flex items-center gap-1 text-xs font-medium text-primary'
                data-pw='community-feed-pinned-badge'
              >
                <Pin className='h-3 w-3' />
                <span>{t('extracted.communities.communityFeed.pinned_f20c8794')}</span>
              </div>
              <PostCard
                post={post}
                metrics={metrics[post.id]}
                community={post.community_id ? communities[post.community_id] : undefined}
                linkEmbed={linkEmbeds[post.id]}
              />
            </div>
          ))}
        </div>
      )}
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        <div className='space-y-3'>
          {results.map(result => {
            const post = posts[result.id]
            if (!post) return null

            return (
              <PostCard
                key={post.id}
                post={post}
                metrics={metrics[post.id]}
                community={post.community_id ? communities[post.community_id] : undefined}
                linkEmbed={linkEmbeds[post.id]}
              />
            )
          })}
        </div>
      </InfiniteScroll>
    </>
  )
}

function CommunityContributeActions({
  communitySlug,
  allowReviewPosts,
  allowDataPointPosts,
  t,
}: {
  communitySlug: string
  allowReviewPosts: boolean
  allowDataPointPosts: boolean
  t: ReturnType<typeof useTranslations>
}) {
  const communityParam = `community=${encodeURIComponent(communitySlug)}`
  /* c8 ignore start -- icon aliases are covered by Vitest; selected browser coverage does not visit community CTAs */
  const StartDiscussionIcon = EntityActionIcons.startDiscussion
  const WriteReviewIcon = EntityActionIcons.writeReview
  const ShareDataPointIcon = EntityActionIcons.shareDataPoint
  /* c8 ignore stop */

  return (
    <div className='flex flex-wrap gap-2'>
      <Button
        asChild
        size='sm'
      >
        <Link
          href={`/discussions/create?${communityParam}`}
          prefetch={false}
        >
          <StartDiscussionIcon data-icon='inline-start' />
          {t('extracted.communities.communityFeed.startDiscussion_84132a9c')}
        </Link>
      </Button>
      {allowReviewPosts && (
        <Button
          asChild
          size='sm'
          variant='outline'
        >
          <Link
            href={`/reviews/create?${communityParam}`}
            prefetch={false}
          >
            <WriteReviewIcon data-icon='inline-start' />
            {t('extracted.communities.communityFeed.writeReview_5c39f86e')}
          </Link>
        </Button>
      )}
      {allowDataPointPosts && (
        <Button
          asChild
          size='sm'
          variant='outline'
        >
          <Link
            href={`/data-points/create?${communityParam}`}
            prefetch={false}
          >
            <ShareDataPointIcon data-icon='inline-start' />
            {t('extracted.communities.communityFeed.shareDataPoint_3de8c756')}
          </Link>
        </Button>
      )}
    </div>
  )
}
