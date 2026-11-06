import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import {
  makeClusterItem,
  makeClusterResult,
  renderClusterList,
} from '@/test-helpers/components/news/news-item-cluster-list.mock-support'
import { getStoryMemberPage } from '@/lib/api/client/stories'
import { NewsItemClusterList } from '@/components/news/news-item-cluster-list'
import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'
import type { RssFeedItemsFeedResponseBody, StoryPageResponse } from '@/types/rss-feed-items'

vi.mock(import('@/lib/api/client/stories'), async importOriginal => ({
  ...(await importOriginal()),
  getStoryMemberPage: vi.fn<VitestLooseMock>(),
}))

describe('NewsItemClusterList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStoryMemberPage).mockReset()
    localStorage.clear()
  })

  it('retains the first preview, sidecars, and continuation cursor when the preview config shrinks on refresh', async () => {
    const primary = makeClusterItem('item-1', 'First Primary')
    const a = makeClusterItem('item-2', 'Preview A')
    const b = makeClusterItem('item-3', 'Preview B')
    const c = makeClusterItem('item-4', 'Preview C')
    const d = makeClusterItem('item-5', 'Appended D')
    const firstPage: RssFeedItemsFeedResponseBody = {
      results: [makeClusterResult(primary.id, 'story-1')],
      rss_feed_items: {
        [primary.id]: primary,
        [a.id]: a,
        [b.id]: b,
        [c.id]: c,
      },
      rss_feed_item_elections: {},
      rss_feed_item_thumbnail_url: {
        [b.id]: '/sideload/preview-b.jpg',
        [c.id]: '/sideload/preview-c.jpg',
      },
      story_member_pages: {
        'story-1': {
          item_ids: [a.id, b.id, c.id],
          page_info: { has_next_page: true, start_cursor: 'start', end_cursor: 'preview-3' },
        },
      },
      page_info: { has_next_page: false, start_cursor: 'feed-start', end_cursor: null },
    }
    const appendedPage: StoryPageResponse = {
      story: {
        id: 'story-1',
        title: null,
        cluster_reason: null,
        published_at: null,
        official_rss_feed_item_id: null,
      },
      item_ids: [d.id],
      page_info: { has_next_page: true, start_cursor: 'appended', end_cursor: 'after-d' },
      rss_feed_items: { [d.id]: d },
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
      .mocked(getStoryMemberPage)
      .mockResolvedValueOnce(appendedPage)
      .mockResolvedValueOnce({
        ...appendedPage,
        item_ids: [],
        rss_feed_items: {},
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      })
    const { rerender } = renderClusterList(firstPage)
    const toggle = screen.getByRole('button', { name: /3\+ related articles/i })
    expect(toggle).toHaveTextContent('3+ related articles')
    fireEvent.click(toggle)
    expect(toggle).toHaveTextContent('3+ related articles')
    const previewBCard = screen.getByText('Preview B').closest('[data-pw="news-item-card"]')
    expect(previewBCard).not.toBeNull()
    expect(previewBCard?.querySelector('img')).toHaveAttribute('src', '/sideload/preview-b.jpg')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /load more/i })))
    expect(toggle).toHaveTextContent('4+ related articles')
    const refreshedPage: RssFeedItemsFeedResponseBody = {
      ...firstPage,
      rss_feed_items: { [primary.id]: primary, [a.id]: a },
      rss_feed_item_thumbnail_url: {},
      story_member_pages: {
        'story-1': {
          item_ids: [a.id],
          page_info: { has_next_page: true, start_cursor: 'changed', end_cursor: 'preview-1' },
        },
      },
    }
    rerender(
      <FeedStyleProvider>
        <NewsItemClusterList data={refreshedPage} />
      </FeedStyleProvider>,
    )
    const cards = document.querySelectorAll(
      '[data-pw="news-item-cluster-related-panel"] [data-pw="news-item-card"]',
    )
    expect([...cards].map(card => card.getAttribute('data-rss-item-id'))).toEqual([
      a.id,
      b.id,
      c.id,
      d.id,
    ])
    expect(toggle).toHaveTextContent('4+ related articles')
    expect(screen.getByText('Preview B').closest('[data-pw="news-item-card"]')).toBe(previewBCard)
    expect(previewBCard?.querySelector('img')).toHaveAttribute('src', '/sideload/preview-b.jpg')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /load more/i })))
    expect(request).toHaveBeenNthCalledWith(2, 'story-1', {
      after: 'after-d',
      excludeItemId: primary.id,
    })
    expect(toggle).toHaveTextContent('4 related articles')
  })
})
