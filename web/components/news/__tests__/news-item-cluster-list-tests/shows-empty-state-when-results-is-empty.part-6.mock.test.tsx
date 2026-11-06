import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  makeClusterItem,
  makeClusterResult,
  setClusterMockViewerId,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import { getStoryMemberPage } from '@/lib/api/client/stories'
import { useNewsItemClusters } from '@/components/news/use-news-item-clusters'
import type { RssFeedItemsFeedResponseBody, StoryPageResponse } from '@/types/rss-feed-items'
import { HackerNewsReferenceRefreshGenerationContext } from '@/components/hacker-news/hacker-news-config-context'

vi.mock(import('@/lib/api/client/stories'), async importOriginal => ({
  ...(await importOriginal()),
  getStoryMemberPage: vi.fn<VitestLooseMock>(),
}))

describe('NewsItemClusterList reference refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStoryMemberPage).mockReset()
    localStorage.clear()
    setClusterMockViewerId(null)
  })
  afterEach(() => vi.restoreAllMocks())

  it('refreshes retained continuation pages and Hacker News counts after server acknowledgement', async () => {
    const first = makeClusterItem('item-1', 'Primary')
    const peer = makeClusterItem('item-2', 'Peer')
    const page: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(first.id, 'story-1')],
      rss_feed_items: { [first.id]: first },
      rss_feed_item_elections: {},
      story_member_pages: {
        'story-1': {
          item_ids: [],
          page_info: { has_next_page: true, start_cursor: null, end_cursor: 'preview-cursor' },
        },
      },
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    const continuation: StoryPageResponse = {
      story: {
        id: 'story-1',
        title: null,
        cluster_reason: null,
        published_at: null,
        official_rss_feed_item_id: null,
      },
      item_ids: [peer.id],
      page_info: { has_next_page: false, start_cursor: 'preview-cursor', end_cursor: null },
      rss_feed_items: { [peer.id]: peer },
      rss_feed_item_elections: {},
      rss_feed_item_hacker_news_references: {
        [peer.id]: { story_count: 1, comment_count: 0 },
      },
      rss_feed_item_embeds: {},
      rss_feed_item_thumbnail_url: {},
      rss_feed_item_content_html: {},
      related_posts_by_url_id: {},
      story_post_ids: {},
      posts: {},
      posts_metrics: {},
      bookmarks: {},
      election_votes: {},
      rss_feed_bookmarks: {},
    }
    const refreshedContinuation: StoryPageResponse = {
      ...continuation,
      rss_feed_item_hacker_news_references: {
        [peer.id]: { story_count: 7, comment_count: 2 },
      },
    }
    vi.mocked(getStoryMemberPage)
      .mockResolvedValueOnce(continuation)
      .mockResolvedValueOnce(refreshedContinuation)
    let generation = 0
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    const { result, rerender } = renderHook(() => useNewsItemClusters(page, '', {}), { wrapper })
    await act(async () => result.current.handleLoadStoryMore('story-1'))
    act(() => result.current.handleExpandedStoryIdsChange(new Set(['story-1'])))
    generation = 1
    await act(async () => rerender())

    expect(getStoryMemberPage).toHaveBeenLastCalledWith('story-1', {
      after: 'preview-cursor',
      excludeItemId: first.id,
    })
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([peer.id])
    expect(result.current.expandedStoryIds).toEqual(new Set(['story-1']))
    expect(result.current.allHackerNewsReferences[peer.id]).toEqual({
      story_count: 7,
      comment_count: 2,
    })
  })

  it('replays a pending first story page and discards its stale response', async () => {
    const first = makeClusterItem('item-1', 'Primary')
    const stalePeer = makeClusterItem('item-2', 'Stale peer')
    const freshPeer = makeClusterItem('item-3', 'Fresh peer')
    const laterPeer = makeClusterItem('item-4', 'Later peer')
    const page: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(first.id, 'story-1')],
      rss_feed_items: { [first.id]: first },
      rss_feed_item_elections: {},
      story_member_pages: {
        'story-1': {
          item_ids: [],
          page_info: { has_next_page: true, start_cursor: null, end_cursor: 'preview-cursor' },
        },
      },
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    const makeContinuation = (
      item: typeof stalePeer,
      storyCount: number,
      endCursor: string | null,
      hasNextPage: boolean,
    ): StoryPageResponse => ({
      story: {
        id: 'story-1',
        title: null,
        cluster_reason: null,
        published_at: null,
        official_rss_feed_item_id: null,
      },
      item_ids: [item.id],
      page_info: { has_next_page: hasNextPage, start_cursor: null, end_cursor: endCursor },
      rss_feed_items: { [item.id]: item },
      rss_feed_item_elections: {},
      rss_feed_item_hacker_news_references: {
        [item.id]: { story_count: storyCount, comment_count: 0 },
      },
      rss_feed_item_embeds: {},
      rss_feed_item_thumbnail_url: {},
      rss_feed_item_content_html: {},
      related_posts_by_url_id: {},
      story_post_ids: {},
      posts: {},
      posts_metrics: {},
      bookmarks: {},
      election_votes: {},
      rss_feed_bookmarks: {},
    })
    const staleResponse = makeContinuation(stalePeer, 1, 'stale-cursor', true)
    const freshResponse = makeContinuation(freshPeer, 8, 'fresh-cursor', true)
    const laterResponse = makeContinuation(laterPeer, 9, null, false)
    let resolveStale!: (response: StoryPageResponse) => void
    const pendingStale = new Promise<StoryPageResponse>(resolve => {
      resolveStale = resolve
    })
    vi.mocked(getStoryMemberPage)
      .mockReturnValueOnce(pendingStale)
      .mockResolvedValueOnce(freshResponse)
      .mockResolvedValueOnce(laterResponse)
    let generation = 0
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HackerNewsReferenceRefreshGenerationContext.Provider value={generation}>
        {children}
      </HackerNewsReferenceRefreshGenerationContext.Provider>
    )
    const { result, rerender } = renderHook(() => useNewsItemClusters(page, '', {}), { wrapper })
    let staleRequest!: Promise<void>
    act(() => {
      staleRequest = result.current.handleLoadStoryMore('story-1')
    })

    generation = 1
    await act(async () => rerender())
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([
      freshPeer.id,
    ])
    expect(result.current.allHackerNewsReferences[freshPeer.id]).toEqual({
      story_count: 8,
      comment_count: 0,
    })

    await act(async () => {
      resolveStale(staleResponse)
      await staleRequest
    })
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([
      freshPeer.id,
    ])
    await act(async () => result.current.handleLoadStoryMore('story-1'))
    expect(getStoryMemberPage).toHaveBeenLastCalledWith('story-1', {
      after: 'fresh-cursor',
      excludeItemId: first.id,
    })
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([
      freshPeer.id,
      laterPeer.id,
    ])
  })
})
