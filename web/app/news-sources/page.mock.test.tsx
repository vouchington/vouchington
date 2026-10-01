import {
  mockGetListSearchErrorMessage,
  mockGetRssFeeds,
} from '@/test-helpers/app/source-listing-page.mock-support'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: { title?: string | null } }) => (
    <div
      data-testid='rss-feed-list-item'
      data-pw='rss-feed-list-item'
    >
      {feed.title}
    </div>
  ),
}))

import NewsSourcesPage from './page'

function makeFeedResponse(feeds: { title?: string | null }[]) {
  const results = feeds.map((f, i) => ({
    id: `feed-${i}`,
    title: f.title ?? `Source ${i}`,
    topic: { id: `topic-${i}` },
    hostname: null,
    rss_feed_url: { id: `url-${i}`, url: 'https://example.com/feed.xml' },
    home_page_url: null,
  }))
  return {
    results,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
    bookmarks: {},
    election_votes: {},
  }
}

function makeEmptyResponse() {
  return {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
    bookmarks: {},
    election_votes: {},
  }
}

describe('NewsSourcesPage', () => {
  beforeEach(() => {
    mockGetRssFeeds.mockReset()
    mockGetRssFeeds.mockResolvedValue(makeEmptyResponse())
    mockGetCurrentUser.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
  })

  it('renders the page header', async () => {
    const ui = await NewsSourcesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('News Sources')).toBeDefined()
  })

  it('calls getRssFeeds with feed_type=article', async () => {
    await NewsSourcesPage({ searchParams: Promise.resolve({}) })
    expect(mockGetRssFeeds).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ feed_type: 'article' }),
    })
  })

  it('shows empty state when no news sources found', async () => {
    const ui = await NewsSourcesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('No news sources found')).toBeDefined()
  })

  it('shows search error when getRssFeeds rejects with a recognisable error', async () => {
    mockGetRssFeeds.mockRejectedValue(new Error('bad request'))
    mockGetListSearchErrorMessage.mockReturnValue('Invalid search parameters')
    const ui = await NewsSourcesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Invalid search parameters')).toBeDefined()
  })

  it('renders RssFeedListItem for each result when results are non-empty', async () => {
    mockGetRssFeeds.mockResolvedValue(
      makeFeedResponse([{ title: 'Source A' }, { title: 'Source B' }]),
    )
    const ui = await NewsSourcesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    const items = screen.getAllByTestId('rss-feed-list-item')
    expect(items).toHaveLength(2)
  })
})
