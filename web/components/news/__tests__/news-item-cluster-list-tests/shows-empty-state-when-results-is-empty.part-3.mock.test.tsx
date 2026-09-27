import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, renderHook, screen } from '@testing-library/react'
import {
  makeClusterItem,
  makeClusterElection,
  makeClusterResult,
  renderClusterList,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import { clientApi } from '@/lib/api/client/instance'
import { getPaginatedPage } from '@/lib/api/client'
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
  })

  afterEach(() => vi.restoreAllMocks())

  it('reveals prefetched peers immediately and appends continuation without changing modal order', async () => {
    const first = makeClusterItem('item-1', 'Primary Article')
    const preview = makeClusterItem('item-2', 'Prefetched Article')
    const later = makeClusterItem('item-3', 'Later Article')
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(first.id, 'story-1')],
      rss_feed_items: { [first.id]: first, [preview.id]: preview },
      rss_feed_item_elections: {},
      story_member_pages: {
        'story-1': {
          item_ids: [preview.id],
          page_info: { has_next_page: true, start_cursor: 'start', end_cursor: 'opaque-first' },
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
      item_ids: [later.id],
      page_info: { has_next_page: false, start_cursor: 'later', end_cursor: null },
      rss_feed_items: { [later.id]: later },
      rss_feed_item_elections: { [later.id]: makeClusterElection(later.id) },
      rss_feed_item_embeds: {},
      rss_feed_item_thumbnail_url: { [later.id]: '/sideload/later.jpg' },
      rss_feed_item_content_html: { [later.id]: '<p>Later article</p>' },
      related_posts_by_url_id: {},
      story_post_ids: {},
      posts: {},
      posts_metrics: {},
      bookmarks: { [later.id]: { save: true } },
      election_votes: {
        [later.id]: {
          __entity_type: 'election_vote',
          entity_id: later.id,
          user_id: 'viewer-1',
          choice: 'like',
          created_at: '2025-01-15T10:00:00Z',
        },
      },
      rss_feed_bookmarks: {},
    }
    const request = vi.spyOn(clientApi, 'get').mockResolvedValue(continuation)
    renderClusterList(data, { nav: true })

    expect(screen.getByTestId('nav-ids')).toHaveTextContent('item-1')
    fireEvent.click(screen.getByRole('button', { name: /1\+ related articles/i }))
    expect(screen.getByRole('button', { name: /1\+ related articles/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByTestId('nav-ids')).toHaveTextContent('item-1,item-2')
    expect(screen.getByText('Prefetched Article')).toBeVisible()
    expect(request).not.toHaveBeenCalled()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /load more/i })))
    expect(request).toHaveBeenCalledWith('/api/v1/stories/story-1', {
      searchParams: { limit: 25, after: 'opaque-first', exclude_item_id: 'item-1' },
    })
    expect(screen.getByTestId('nav-ids')).toHaveTextContent('item-1,item-2,item-3')
    expect(screen.getByText('Prefetched Article')).toBeVisible()
    expect(screen.getByText('Later Article')).toBeVisible()
    expect(screen.getByTestId('existing-vote-choice-item-3')).toHaveTextContent('like')
    expect(screen.getByRole('button', { name: /2 related articles/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /2 related articles/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('retains rows and the cursor through a failed request, then retries once', async () => {
    const first = makeClusterItem('item-1', 'Primary Article')
    const preview = makeClusterItem('item-2', 'Prefetched Article')
    const later = makeClusterItem('item-3', 'Later Article')
    const data: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(first.id, 'story-1')],
      rss_feed_items: { [first.id]: first, [preview.id]: preview },
      rss_feed_item_elections: {},
      story_member_pages: {
        'story-1': {
          item_ids: [preview.id],
          page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'retry-cursor' },
        },
      },
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }
    let rejectFirst!: (error: Error) => void
    const pending = new Promise<StoryPageResponse>((_, reject) => {
      rejectFirst = reject
    })
    const response: StoryPageResponse = {
      story: {
        id: 'story-1',
        title: null,
        cluster_reason: null,
        published_at: null,
        official_rss_feed_item_id: null,
      },
      item_ids: [later.id],
      page_info: { has_next_page: false, start_cursor: 'last', end_cursor: null },
      rss_feed_items: { [later.id]: later },
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
    const request = vi
      .spyOn(clientApi, 'get')
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(response)
    renderClusterList(data, { nav: true })
    fireEvent.click(screen.getByRole('button', { name: /1\+ related articles/i }))
    fireEvent.click(screen.getByRole('button', { name: /load more/i }))
    expect(screen.getByText('Prefetched Article')).toBeVisible()
    expect(screen.getByTestId('nav-ids')).toHaveTextContent('item-1,item-2')
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled()
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => rejectFirst(new Error('Network unavailable')))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load more articles.')
    expect(screen.getByText('Prefetched Article')).toBeVisible()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /try again/i })))
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/stories/story-1', {
      searchParams: { limit: 25, after: 'retry-cursor', exclude_item_id: 'item-1' },
    })
    expect(screen.getByTestId('nav-ids')).toHaveTextContent('item-1,item-2,item-3')
  })

  it('keeps the first direct primary and preview when the story repeats on a later feed page', async () => {
    const first = makeClusterItem('item-1', 'First Primary')
    const second = makeClusterItem('item-2', 'Later Feed Winner')
    const preview = makeClusterItem('item-3', 'First Preview')
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
            end_cursor: 'first-preview-cursor',
          },
        },
      },
      page_info: { has_next_page: true, start_cursor: 'feed-start', end_cursor: 'feed-next' },
    }
    const laterPage: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(second.id, 'story-1')],
      rss_feed_items: { [second.id]: second },
      rss_feed_item_elections: {},
      story_member_pages: {
        'story-1': {
          item_ids: [first.id],
          page_info: {
            has_next_page: true,
            start_cursor: 'later',
            end_cursor: 'different-cursor',
          },
        },
      },
      page_info: { has_next_page: false, start_cursor: 'feed-second', end_cursor: null },
    }
    vi.mocked(getPaginatedPage).mockResolvedValue(laterPage)
    const { result } = renderHook(() => useNewsItemClusters(firstPage, '/api/v1/feeds/test', {}))
    await act(async () => {
      await result.current.handleLoadMore()
    })
    expect(result.current.visibleClusters.map(cluster => cluster.primary.id)).toEqual(['item-1'])
    expect(result.current.visibleClusters[0]?.storyItems.map(item => item.id)).toEqual(['item-3'])
    const request = vi.spyOn(clientApi, 'get').mockResolvedValue({
      story: {
        id: 'story-1',
        title: null,
        cluster_reason: null,
        published_at: null,
        official_rss_feed_item_id: null,
      },
      item_ids: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      rss_feed_items: {},
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
    })
    await act(async () => {
      await result.current.handleLoadStoryMore('story-1')
    })
    expect(request).toHaveBeenCalledWith('/api/v1/stories/story-1', {
      searchParams: { limit: 25, after: 'first-preview-cursor', exclude_item_id: 'item-1' },
    })
  })
})
