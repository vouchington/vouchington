import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { DomainOverview } from './domain-overview'
import type { ViewRssFeed } from '@/types/rss-feeds'

// DomainOverview calls getTranslations(); mock the boundary with a real-catalog translator so the
// render stays synchronous in tests while still resolving keys against the real en catalog.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

const FEED: ViewRssFeed = {
  __entity_type: 'rss_feed',
  id: 'feed-1',
  title: 'Test Feed',
  is_enabled: true,
  is_discoverable: true,
  etag: null,
  last_modified_at: null,
  last_fetched_at: null,
  feed_type: 'article',
  rss_feed_url: { id: 'url-1', url: 'https://example.com/feed.xml' },
  home_page_url: null,
  topic: { id: 'topic-1', name: 'Tech', slug: 'tech', topic_type: 'news' },
}

const TOP_URL = { id: 'url-1', url: 'https://example.com/page', pathname: '/page' }

describe('DomainOverview', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  it('renders Sources section when rss_feeds are provided', async () => {
    render(
      await DomainOverview({
        rss_feeds: [FEED],
        top_urls: [],
      }),
    )
    expect(screen.getByText('Sources')).toBeVisible()
    expect(screen.getByText('Test Feed')).toBeVisible()
    expect(screen.getByText('Open feed')).toBeVisible()
  })

  it('renders top URLs list when top_urls are provided', async () => {
    render(
      await DomainOverview({
        rss_feeds: [],
        top_urls: [TOP_URL],
      }),
    )
    expect(screen.getByText('/page')).toBeVisible()
  })

  it('renders empty state when no top_urls', async () => {
    render(
      await DomainOverview({
        rss_feeds: [],
        top_urls: [],
      }),
    )
    expect(screen.getByText('No URLs available for this domain yet.')).toBeVisible()
  })
})
