import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  makeClusterItem,
  makeClusterResult,
  makeClusterStoryPage,
  setClusterMockViewerId,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import { clientApi } from '@/lib/api/client/instance'
import { useNewsItemClusters } from '@/components/news/use-news-item-clusters'
import type { RssFeedItemsFeedResponseBody, StoryPageResponse } from '@/types/rss-feed-items'

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: { get: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

describe('NewsItemClusterList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setClusterMockViewerId(null)
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps appended peers on a same-key refresh and discards an old query response after reset', async () => {
    const first = makeClusterItem('item-1', 'First Primary')
    const preview = makeClusterItem('item-2', 'First Preview')
    const appended = makeClusterItem('item-3', 'Appended Peer')
    const firstPage: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(first.id, 'story-1')],
      rss_feed_items: { [first.id]: first, [preview.id]: preview },
      rss_feed_item_elections: {},
      story_member_pages: {
        'story-1': {
          item_ids: [preview.id],
          page_info: {
            has_next_page: true,
            start_cursor: 'first',
            end_cursor: 'first-cursor',
          },
        },
      },
      page_info: { has_next_page: false, start_cursor: 'feed-first', end_cursor: null },
    }
    const continuation: StoryPageResponse = {
      story: {
        id: 'story-1',
        title: null,
        cluster_reason: null,
        published_at: null,
        official_rss_feed_item_id: null,
      },
      item_ids: [appended.id],
      page_info: { has_next_page: true, start_cursor: 'appended', end_cursor: 'next-cursor' },
      rss_feed_items: { [appended.id]: appended },
      rss_feed_item_elections: {},
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
    let resolveSecond!: (page: StoryPageResponse) => void
    const second = new Promise<StoryPageResponse>(resolve => {
      resolveSecond = resolve
    })
    vi.spyOn(clientApi, 'get').mockResolvedValueOnce(continuation).mockReturnValueOnce(second)
    const { result, rerender } = renderHook(
      ({ data }) => useNewsItemClusters(data, '/api/v1/feeds/test', {}),
      { initialProps: { data: firstPage } },
    )
    await act(async () => {
      await result.current.handleLoadStoryMore('story-1')
    })
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([
      'item-2',
      'item-3',
    ])
    rerender({ data: { ...firstPage } })
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual([
      'item-2',
      'item-3',
    ])
    let inFlight!: Promise<void>
    act(() => {
      inFlight = result.current.handleLoadStoryMore('story-1')
    })

    const other = makeClusterItem('item-4', 'New Query Primary')
    const resetPage: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(other.id, 'story-2')],
      rss_feed_items: { [other.id]: other },
      rss_feed_item_elections: {},
      story_member_pages: { 'story-2': makeClusterStoryPage([]) },
      page_info: { has_next_page: false, start_cursor: 'new-query', end_cursor: null },
    }
    rerender({ data: resetPage })
    await act(async () => {
      resolveSecond(continuation)
      await inFlight
    })
    expect(result.current.visibleClusters.map(cluster => cluster.primary.id)).toEqual(['item-4'])
    expect(result.current.visibleClusters[0]?.storyItems).toEqual([])
  })

  it('discards a pending story page when the viewer changes', async () => {
    const first = makeClusterItem('item-1', 'Primary')
    const peer = makeClusterItem('item-2', 'Related')
    const page: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(first.id, 'story-1')],
      rss_feed_items: { [first.id]: first },
      rss_feed_item_elections: {},
      story_member_pages: {
        'story-1': {
          item_ids: [],
          page_info: {
            has_next_page: true,
            start_cursor: null,
            end_cursor: 'viewer-cursor',
          },
        },
      },
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    const response: StoryPageResponse = {
      story: {
        id: 'story-1',
        title: null,
        cluster_reason: null,
        published_at: null,
        official_rss_feed_item_id: null,
      },
      item_ids: [peer.id],
      page_info: {
        has_next_page: false,
        start_cursor: 'peer-cursor',
        end_cursor: null,
      },
      rss_feed_items: { [peer.id]: peer },
      rss_feed_item_elections: {},
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
    let resolvePending!: (value: StoryPageResponse) => void
    const pending = new Promise<StoryPageResponse>(resolve => {
      resolvePending = resolve
    })
    vi.spyOn(clientApi, 'get').mockReturnValue(pending)
    setClusterMockViewerId('viewer-one')
    const { result, rerender } = renderHook(() => useNewsItemClusters(page, '/feed', {}))
    let inFlight!: Promise<void>
    act(() => {
      inFlight = result.current.handleLoadStoryMore('story-1')
    })
    setClusterMockViewerId('viewer-two')
    rerender()
    await act(async () => {
      resolvePending(response)
      await inFlight
    })
    expect(result.current.visibleClusters[0]?.storyItems).toEqual([])
    expect(result.current.visibleClusters[0]?.loadingStoryItems).toBe(false)
  })
})
