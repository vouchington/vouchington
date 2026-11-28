import { makeEmptyResponse, makeFeedResponse } from '@/test-helpers/app/podcast-feed-fixtures'
import '@/test-helpers/i18n/mock-json-messages'
import {
  mockGetListSearchErrorMessage,
  mockGetRssFeeds,
} from '@/test-helpers/app/source-listing-page.mock-support'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastsPage from './page'
import type { ViewRssFeed } from '@/types/rss-feeds'

vi.mock(import('@/components/sources/rss-feed-list-item'), () => ({
  RssFeedListItem: ({ feed }: { feed: ViewRssFeed }) => (
    <div
      data-testid='rss-feed-list-item'
      data-pw='rss-feed-list-item'
    >
      {feed.title}
    </div>
  ),
}))

describe('PodcastsPage', () => {
  beforeEach(() => {
    mockGetRssFeeds.mockReset()
    mockGetRssFeeds.mockResolvedValue(makeEmptyResponse())
  })

  it('renders the page header', async () => {
    const ui = await PodcastsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Podcasts')).toBeInTheDocument()
  })

  it('calls getRssFeeds with feed_type=podcast', async () => {
    await PodcastsPage({ searchParams: Promise.resolve({}) })
    expect(mockGetRssFeeds).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ feed_type: 'podcast' }),
    })
  })

  it('renders podcast show cards for each result', async () => {
    mockGetRssFeeds.mockResolvedValue(makeFeedResponse([{ title: 'Show A' }, { title: 'Show B' }]))
    const ui = await PodcastsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    const cards = screen.getAllByText(/Show [AB]/)
    expect(cards).toHaveLength(2)
  })

  it('shows an empty state when no podcasts found', async () => {
    const ui = await PodcastsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('No podcasts found')).toBeInTheDocument()
  })

  it('passes q search param to getRssFeeds', async () => {
    await PodcastsPage({ searchParams: Promise.resolve({ q: 'tech' }) })
    expect(mockGetRssFeeds).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({ q: 'tech' }),
    })
  })

  it('shows a search error when getRssFeeds rejects with a recognisable error', async () => {
    const err = new Error('bad request')
    mockGetRssFeeds.mockRejectedValue(err)
    mockGetListSearchErrorMessage.mockReturnValue('Invalid search parameters')
    const ui = await PodcastsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Invalid search parameters')).toBeInTheDocument()
  })

  it('renders RssFeedListItem for each result when results are non-empty', async () => {
    mockGetRssFeeds.mockResolvedValue(
      makeFeedResponse([{ title: 'Podcast Alpha' }, { title: 'Podcast Beta' }]),
    )
    const ui = await PodcastsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    const items = screen.getAllByTestId('rss-feed-list-item')
    expect(items).toHaveLength(2)
  })
})
