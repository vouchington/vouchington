import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, render, screen, within } from '@testing-library/react'

// Configure RTL to use data-pw as the test id (matching the Playwright convention in this codebase)
configure({ testIdAttribute: 'data-pw' })

const {
  mockGetTopic,
  mockGetTopicRssFeeds,
  mockGetServerRssFeedCrawl,
  mockGetMembership,
  mockNotFound,
  mockGetCurrentUser,
  mockGetTranslations,
  mockTranslate,
} = vi.hoisted(() => ({
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockGetTopicRssFeeds: vi.fn<VitestLooseMock>(),
  mockGetServerRssFeedCrawl: vi.fn<VitestLooseMock>(),
  mockGetMembership: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('not-found')
  }),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetTranslations: vi.fn<VitestLooseMock>(),
  mockTranslate: vi.fn<VitestLooseMock>((key: string) => key),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/i18n/get-translations'), () => ({ getTranslations: mockGetTranslations }))
vi.mock(import('@/lib/api/server'), () => ({
  getTopic: mockGetTopic,
  getTopicRssFeeds: mockGetTopicRssFeeds,
  getServerRssFeedCrawl: mockGetServerRssFeedCrawl,
  getMembership: mockGetMembership,
}))
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => <a href={href}>{children}</a>,
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('@/components/topics/manage-source/crawl-outcome'), () => ({
  computeCrawlOutcome: vi.fn<VitestLooseMock>(() => ({
    kind: 'success',
    tone: 'success',
  })),
  extractFeedItemUrl: vi.fn<VitestLooseMock>((item: Record<string, unknown>) => {
    const url = item['url']
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
      ? url
      : null
  }),
  responseCodeClass: vi.fn<VitestLooseMock>(() => 'text-emerald-600 dark:text-emerald-400'),
}))

import { createTopicSourceCrawlDetailPage } from '@/lib/routes/topic-source-crawl-factories'

const { default: CrawlDetailPage, generateMetadata: generateCrawlDetailMetadata } =
  createTopicSourceCrawlDetailPage()

const adminUser = { id: 'admin-1', roles: ['administrator'] }

const baseTopic = {
  __entity_type: 'topic' as const,
  id: 'topic-1',
  name: 'Source Topic',
  slug: 'source-topic',
  topic_type: 'rss_feed' as const,
  markdown: '',
  aliases: [],
  created_at: '2026-01-01T00:00:00.000Z',
  hostname_id: null,
  hostname: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { id: 'u1', display_name: null, display_name_url_id: null },
  updated_by: { id: 'u1', display_name: null, display_name_url_id: null },
}

const baseFeed = {
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

describe('createTopicSourceCrawlDetailPage', () => {
  const baseCrawlDetail = {
    id: 'crawl-1',
    response_code: 200,
    created_at: '2026-01-01T00:00:00.000Z',
    feed_data: null,
    feed_data_sha256: null,
    redirect_url_id: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTranslations.mockResolvedValue(mockTranslate)
    mockGetCurrentUser.mockResolvedValue(adminUser)
    mockGetMembership.mockResolvedValue({ membership: null })
    mockGetTopic.mockResolvedValue({ topic: baseTopic })
    mockGetTopicRssFeeds.mockResolvedValue({ results: [baseFeed] })
    mockGetServerRssFeedCrawl.mockResolvedValue({ crawl: baseCrawlDetail })
  })

  it('calls notFound when topic is not found', async () => {
    mockGetTopic.mockResolvedValue(null)
    await expect(
      CrawlDetailPage({ params: Promise.resolve({ id: 'missing', crawlId: 'crawl-1' }) }),
    ).rejects.toThrow('not-found')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('uses localized crawl-detail metadata', async () => {
    await expect(generateCrawlDetailMetadata()).resolves.toMatchObject({
      title: 'extracted.crawlid.page.crawlDetails_aa7bec3e',
    })
  })

  it('calls notFound when the topic is not an RSS source', async () => {
    mockGetTopic.mockResolvedValue({ topic: { ...baseTopic, topic_type: 'card' } })

    await expect(
      CrawlDetailPage({ params: Promise.resolve({ id: 'not-a-source', crawlId: 'crawl-1' }) }),
    ).rejects.toThrow('not-found')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('does not request a paid crawl detail for a free user', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'free-1', roles: [], membership_plan: null })

    await expect(
      CrawlDetailPage({ params: Promise.resolve({ id: 'source-topic', crawlId: 'crawl-1' }) }),
    ).rejects.toThrow('not-found')

    expect(mockGetServerRssFeedCrawl).not.toHaveBeenCalled()
    expect(mockGetMembership).toHaveBeenCalledOnce()
  })

  it('calls notFound when no rss feed exists', async () => {
    mockGetTopicRssFeeds.mockResolvedValue({ results: [] })
    await expect(
      CrawlDetailPage({ params: Promise.resolve({ id: 'source-topic', crawlId: 'crawl-1' }) }),
    ).rejects.toThrow('not-found')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('calls notFound when crawl is not found', async () => {
    mockGetServerRssFeedCrawl.mockResolvedValue(null)
    await expect(
      CrawlDetailPage({ params: Promise.resolve({ id: 'source-topic', crawlId: 'missing' }) }),
    ).rejects.toThrow('not-found')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders crawl detail when data is present', async () => {
    const result = await CrawlDetailPage({
      params: Promise.resolve({ id: 'source-topic', crawlId: 'crawl-1' }),
    })
    render(result)
    expect(screen.getByTestId('source-crawl-detail-heading')).toHaveTextContent(
      'extracted.crawlid.page.crawlDetails_aa7bec3e',
    )
    expect(screen.getByTestId('source-crawl-outcome-banner')).toHaveTextContent(
      'extracted.manageSource.crawlHistorySection.success_6f488f09',
    )
    expect(screen.getByText('200')).toBeDefined()
    expect(screen.queryByTestId('source-crawl-feed-items')).toBeNull()
  })

  it('renders feed items when feed_data has items array', async () => {
    mockGetServerRssFeedCrawl.mockResolvedValue({
      crawl: {
        ...baseCrawlDetail,
        feed_data: {
          items: [
            { id: 'item-1', title: 'Item One', url: 'https://example.com/item-1' },
            { title: 'Item Two', url: 'https://example.com/item-2' },
            { id: 'item-3', url: 'https://example.com/item-3' },
          ],
        },
      },
    })
    const result = await CrawlDetailPage({
      params: Promise.resolve({ id: 'source-topic', crawlId: 'crawl-1' }),
    })
    render(result)
    const list = screen.getByTestId('source-crawl-feed-items')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Item One' })).toHaveAttribute(
      'href',
      'https://example.com/item-1',
    )
    expect(
      screen.getByText('extracted.manageSource.crawlHistorySection.itemNumber_49d8f8b4'),
    ).toBeDefined()
  })
})
