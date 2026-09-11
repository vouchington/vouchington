'use client'

/**
 * Post list component with infinite scroll
 * Displays a list of post cards, accumulating pages client-side
 */

import { PostCard } from './post-card'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { EmptyState } from '@/components/shared/empty-state'
import { useListStyle } from '@/lib/preferences/use-list-style'
import { usePaginatedList, type PaginatedListParams } from '@/hooks/use-paginated-list'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import { useState } from 'react'
// ast-grep-ignore: web-no-raw-api-response-client-boundary -- PostList owns browser pagination and merges every response sidecar across server and client-fetched pages.
import type { PostsResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

const AGENT_EXCLUDED_POST_TYPES = new Set(['article', 'blog_post'])

interface PostListProps {
  data: PostsResponseBody
  /** API endpoint for fetching subsequent pages, e.g. '/api/v1/posts' */
  nextPageEndpoint?: string
  /** Query params shared across all pages (excluding the `after` cursor) */
  nextPageParams?: PaginatedListParams
  /** Review topic IDs currently active as filter, for prioritizing display order */
  filterReviewTopicIds?: string[]
  /** Custom empty state to render when there are no posts */
  emptyState?: React.ReactNode
  hideDownCount?: boolean
}

const EMPTY_PAGE_PARAMS: PaginatedListParams = {}

export function PostList({
  data,
  nextPageEndpoint = '',
  nextPageParams = EMPTY_PAGE_PARAMS,
  filterReviewTopicIds,
  emptyState,
  hideDownCount = false,
}: PostListProps) {
  const t = useTranslations()
  const { listStyle } = useListStyle()
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(() => new Set())
  const handlePostHidden = (id: string) => {
    setHiddenPostIds(previous => new Set(previous).add(id))
  }
  // nextPageEndpoint defaults to '' when absent; the !!nextPageEndpoint guard below and
  // the hook's own !endpoint guard together ensure pagination is a no-op in that case.
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, nextPageEndpoint, nextPageParams)

  const allResults = mergePageResultsById(pages)
  const allPosts = mergeRecords(pages, page => page.posts)
  const allMetrics = mergeRecords(pages, page => page.posts_metrics)
  const allElections = mergeRecords(pages, page => page.post_elections ?? {})
  const allHtml = mergeRecords(pages, page => page.markdown_to_html ?? {})
  const allModerations = mergeRecords(pages, page => page.post_moderations ?? {})
  const allModerationElections = mergeRecords(pages, page => page.agent_moderation_elections ?? {})
  const allElectionVotes = mergeRecords(pages, page => page.election_votes ?? {})
  const allUsers = mergeRecords(pages, page => page.users ?? {})
  const allCommunities = mergeRecords(pages, page => page.communities ?? {})
  const allBookmarks = mergeRecords(pages, page => page.bookmarks ?? {})
  const allLinkEmbeds = mergeRecords(pages, page => page.post_link_embeds ?? {})
  if (allResults.length === 0) {
    return emptyState !== undefined ? (
      emptyState
    ) : (
      <EmptyState
        title={t('extracted.posts.postList.noPostsFound_3d0c20ef')}
        description={t('extracted.posts.postList.tryAdjustingYourSearchOrFilters_54f7b4c2')}
      />
    )
  }

  const canLoadMore = hasNextPage && !!nextPageEndpoint

  return (
    <InfiniteScroll
      hasNextPage={canLoadMore}
      endCursor={endCursor}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      fetchError={fetchError}
      clearError={clearError}
      resetKey={resetKey}
    >
      <div className='space-y-4'>
        {allResults.map((result, i) => {
          const post = allPosts[result.entity_id ?? result.id]
          if (!post) return null
          if (allBookmarks[post.id]?.hide || hiddenPostIds.has(post.id)) return null

          const postModerations = AGENT_EXCLUDED_POST_TYPES.has(post.post_type)
            ? undefined
            : allModerations?.[post.id]
          const moderationElectionVotes = postModerations
            ? Object.fromEntries(
                postModerations.flatMap(m =>
                  allElectionVotes[m.id] ? [[m.id, allElectionVotes[m.id]!]] : [],
                ),
              )
            : undefined

          return (
            <PostCard
              key={result.id}
              post={post}
              priority={i === 0}
              metrics={allMetrics[post.id]}
              election={allElections?.[post.id]}
              html={allHtml?.[post.id]}
              moderations={postModerations}
              moderationElections={allModerationElections}
              moderationElectionVotes={moderationElectionVotes}
              electionVote={allElectionVotes[post.id]}
              view={listStyle}
              filterReviewTopicIds={filterReviewTopicIds}
              sharedByUser={
                result.shared_by_user_id ? allUsers[result.shared_by_user_id] : undefined
              }
              community={post.community_id ? allCommunities[post.community_id] : undefined}
              sharedAt={result.shared_at}
              linkEmbed={allLinkEmbeds[post.id]}
              hideDownCount={hideDownCount}
              initialSaved={allBookmarks[post.id]?.save ?? false}
              initialHidden={allBookmarks[post.id]?.hide ?? false}
              onHide={handlePostHidden}
            />
          )
        })}
      </div>
    </InfiniteScroll>
  )
}
