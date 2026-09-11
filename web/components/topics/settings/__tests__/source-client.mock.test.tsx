import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseManageSourcePage } = vi.hoisted(() => ({
  mockUseManageSourcePage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/topics/manage-source/use-manage-source-page'), () => ({
  useManageSourcePage: mockUseManageSourcePage,
}))
vi.mock(import('@/components/topics/manage-source/source-section'), () => ({
  SourceSection: () => <div data-testid='source-section' />,
}))
vi.mock(import('@/components/topics/manage-source/feed-actions-section'), () => ({
  FeedActionsSection: () => <div data-testid='feed-actions-section' />,
}))
vi.mock(import('@/components/topics/manage-source/feed-metadata-section'), () => ({
  FeedMetadataSection: () => <div data-testid='feed-metadata-section' />,
}))
vi.mock(import('@/components/topics/manage-source/crawl-history-section'), () => ({
  CrawlHistorySection: ({
    crawlsHref,
    crawlDetailHrefBase,
  }: {
    crawlsHref: string
    crawlDetailHrefBase: string
    newsHref: string
    crawls: unknown[]
  }) => (
    <div
      data-testid='crawl-history-section'
      data-crawls-href={crawlsHref}
      data-crawl-detail-base={crawlDetailHrefBase}
    />
  ),
}))

import { SourceClient } from '../source-client'

const mockFeed = {
  id: 'feed-1',
  title: 'Test Feed',
  rss_feed_url: { url: 'https://example.com/feed.xml' },
  home_page_url: null,
  is_enabled: true,
  is_discoverable: true,
  last_fetched_at: null,
  etag: null,
  last_modified_at: null,
}

const handlers = {
  handleSubmit: vi.fn<VitestLooseMock>(),
  handleDelete: vi.fn<VitestLooseMock>(),
  handleRefresh: vi.fn<VitestLooseMock>(),
  handleToggle: vi.fn<VitestLooseMock>(),
  handleToggleDiscoverability: vi.fn<VitestLooseMock>(),
  handleConfirmDeleteChange: vi.fn<VitestLooseMock>(),
}

describe('SourceClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders error banner when loadError is set', () => {
    mockUseManageSourcePage.mockReturnValue({
      handlers,
      state: {
        loadError: 'Failed to load',
        rssFeed: null,
        crawls: [],
        saving: false,
        refreshing: false,
        toggling: false,
        togglingDiscoverability: false,
        deleting: false,
        confirmDelete: false,
      },
    })
    render(
      <SourceClient
        id='topic-1'
        initialData={{}}
      />,
    )
    expect(screen.getByText('Failed to load')).toBeInTheDocument()
    expect(screen.queryByTestId('source-section')).not.toBeInTheDocument()
  })

  it('renders source section when no feed is loaded', () => {
    mockUseManageSourcePage.mockReturnValue({
      handlers,
      state: {
        loadError: null,
        rssFeed: null,
        crawls: [],
        saving: false,
        refreshing: false,
        toggling: false,
        togglingDiscoverability: false,
        deleting: false,
        confirmDelete: false,
      },
    })
    render(
      <SourceClient
        id='topic-1'
        initialData={{}}
      />,
    )
    expect(screen.getByTestId('source-section')).toBeInTheDocument()
    expect(screen.queryByTestId('crawl-history-section')).not.toBeInTheDocument()
  })

  it('renders feed sections and computes crawl hrefs from topic id', () => {
    mockUseManageSourcePage.mockReturnValue({
      handlers,
      state: {
        loadError: null,
        rssFeed: mockFeed,
        crawls: [],
        saving: false,
        refreshing: false,
        toggling: false,
        togglingDiscoverability: false,
        deleting: false,
        confirmDelete: false,
      },
    })
    render(
      <SourceClient
        id='topic-1'
        initialData={{}}
      />,
    )
    expect(screen.getByTestId('crawl-history-section')).toBeInTheDocument()
    const section = screen.getByTestId('crawl-history-section')
    expect(section.getAttribute('data-crawls-href')).toContain('/crawls')
    expect(section.getAttribute('data-crawl-detail-base')).toContain('/crawls/')
  })
})
