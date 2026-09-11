import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetTopic,
  mockGetTopicRssFeeds,
  mockGetServerRssFeedCrawls,
  mockGetMembership,
  mockNotFound,
  mockGetCurrentUser,
  mockGetTranslations,
  mockTranslate,
} = vi.hoisted(() => ({
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockGetTopicRssFeeds: vi.fn<VitestLooseMock>(),
  mockGetServerRssFeedCrawls: vi.fn<VitestLooseMock>(),
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
  getServerRssFeedCrawls: mockGetServerRssFeedCrawls,
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

import { createTopicSourceCrawlsPage } from '@/lib/routes/topic-source-crawl-factories'

const { default: CrawlsPage, generateMetadata: generateCrawlsMetadata } =
  createTopicSourceCrawlsPage()

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

const baseCrawl = {
  id: 'crawl-1',
  response_code: 200,
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('createTopicSourceCrawlsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTranslations.mockResolvedValue(mockTranslate)
    mockGetCurrentUser.mockResolvedValue(adminUser)
    mockGetMembership.mockResolvedValue({ membership: null })
    mockGetTopic.mockResolvedValue({ topic: baseTopic })
    mockGetTopicRssFeeds.mockResolvedValue({ results: [baseFeed] })
    mockGetServerRssFeedCrawls.mockResolvedValue({ results: [baseCrawl] })
  })

  it('calls notFound when topic is not found', async () => {
    mockGetTopic.mockResolvedValue(null)
    await expect(CrawlsPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'not-found',
    )
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('uses localized crawl-history metadata', async () => {
    await expect(generateCrawlsMetadata()).resolves.toMatchObject({
      title: 'extracted.manageSource.crawlHistorySection.crawlHistory_a878daa5',
    })
  })

  it('calls notFound when the topic is not an RSS source', async () => {
    mockGetTopic.mockResolvedValue({ topic: { ...baseTopic, topic_type: 'card' } })

    await expect(CrawlsPage({ params: Promise.resolve({ id: 'not-a-source' }) })).rejects.toThrow(
      'not-found',
    )
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('does not request paid crawl history for a free user', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'free-1', roles: [], membership_plan: null })

    await expect(CrawlsPage({ params: Promise.resolve({ id: 'source-topic' }) })).rejects.toThrow(
      'not-found',
    )

    expect(mockGetServerRssFeedCrawls).not.toHaveBeenCalled()
    expect(mockGetMembership).toHaveBeenCalledOnce()
  })

  it('does not request paid crawl history for an expired Plus membership', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'expired-1', roles: [], membership_plan: 'plus' })
    mockGetMembership.mockResolvedValue({
      membership: { plan: 'plus', status: 'active', expires_at: '2020-01-01T00:00:00.000Z' },
    })

    await expect(CrawlsPage({ params: Promise.resolve({ id: 'source-topic' }) })).rejects.toThrow(
      'not-found',
    )

    expect(mockGetServerRssFeedCrawls).not.toHaveBeenCalled()
  })

  it('renders crawl history heading when topic and feed exist', async () => {
    const result = await CrawlsPage({ params: Promise.resolve({ id: 'source-topic' }) })
    expect(result).toBeTruthy()
    expect(mockGetServerRssFeedCrawls).toHaveBeenCalledWith('feed-1', {
      searchParams: { limit: 20 },
    })
  })

  it('renders empty state when no rss feed exists', async () => {
    mockGetTopicRssFeeds.mockResolvedValue({ results: [] })
    const result = await CrawlsPage({ params: Promise.resolve({ id: 'source-topic' }) })
    render(result)
    expect(
      screen.getByText('extracted.manageSource.crawlHistorySection.noCrawlsYet_12d0f59a'),
    ).toBeDefined()
    expect(mockGetServerRssFeedCrawls).not.toHaveBeenCalled()
  })

  it('propagates error when getServerRssFeedCrawls throws', async () => {
    mockGetServerRssFeedCrawls.mockRejectedValue(new Error('fetch error'))
    await expect(CrawlsPage({ params: Promise.resolve({ id: 'source-topic' }) })).rejects.toThrow(
      'fetch error',
    )
  })
})
