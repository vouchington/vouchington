import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TopicSourcesAside } from '../topic-sources-aside'
import type { RssFeedsListResponseBody } from '@/types/api-responses'
import type { HostnameListResponse } from '@/types/hostnames'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

function makeEmptyHostnames(): HostnameListResponse {
  return {
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    hostnames: {},
  }
}

function makeRssFeedsWithHostname(hostname: string): RssFeedsListResponseBody {
  return {
    results: [
      {
        __entity_type: 'rss_feed',
        id: 'feed-1',
        title: 'Example Feed',
        is_enabled: true,
        is_discoverable: true,
        etag: null,
        last_modified_at: null,
        last_fetched_at: null,
        feed_type: 'article',
        rss_feed_url: { id: 'url-1', url: 'https://example.com/feed.xml' },
        home_page_url: null,
        hostname: {
          __entity_type: 'hostname',
          id: 'host-1',
          hostname,
          topic_id: null,
        },
        topic: {
          id: 'topic-1',
          name: 'Example',
          slug: 'example',
          topic_type: 'rss_feed',
        },
      },
    ],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topic_elections: {},
    hostname_elections: {},
  }
}

function makeRssFeedsWithoutHostname(): RssFeedsListResponseBody {
  return {
    results: [
      {
        __entity_type: 'rss_feed',
        id: 'feed-1',
        title: 'Example Feed',
        is_enabled: true,
        is_discoverable: true,
        etag: null,
        last_modified_at: null,
        last_fetched_at: null,
        feed_type: 'article',
        rss_feed_url: { id: 'url-1', url: 'https://example.com/feed.xml' },
        home_page_url: null,
        hostname: null,
        topic: {
          id: 'topic-1',
          name: 'Example',
          slug: 'example',
          topic_type: 'rss_feed',
        },
      },
    ],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topic_elections: {},
    hostname_elections: {},
  }
}

describe('TopicSourcesAside', () => {
  it('renders an in-app link to /domain/<hostname> when hostname is present', async () => {
    const { container } = render(
      await TopicSourcesAside({
        rssFeeds: makeRssFeedsWithHostname('example.com'),
        hostnames: makeEmptyHostnames(),
      }),
    )

    const link = container.querySelector('a[href="/domain/example.com"]')
    expect(link).not.toBeNull()
    expect(link!.textContent).toBe('Example Feed')
    expect(link!.getAttribute('target')).toBeNull()
    expect(link!.getAttribute('rel')).toBeNull()
  })

  it('renders title as plain text when hostname is null', async () => {
    const { container } = render(
      await TopicSourcesAside({
        rssFeeds: makeRssFeedsWithoutHostname(),
        hostnames: makeEmptyHostnames(),
      }),
    )

    expect(screen.getByText('Example Feed')).not.toBeNull()
    // No <a> element for the source title
    const links = [...container.querySelectorAll('a')] as HTMLElement[]
    const sourceLink = links.find(a => a.textContent === 'Example Feed')
    expect(sourceLink).toBeUndefined()
  })
})
