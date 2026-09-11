import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { UrlAdminAside } from '../url-admin-aside'
import type { PublicUrl, UrlDetailResponseBody } from '@/types/api-responses'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
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

vi.mock(import('@/components/urls/trigger-url-crawl-button'), () => ({
  TriggerUrlCrawlButton: ({ id }: { id: string }) => (
    <button type='button'>{`Trigger Crawl ${id}`}</button>
  ),
}))

function makeUrl(hostname: string | null): PublicUrl {
  return {
    __entity_type: 'url',
    id: 'url-123',
    url: 'https://example.com/page1',
    pathname: '/page1',
    search_params: {},
    canonical_url_id: null,
    hostname: hostname
      ? { __entity_type: 'hostname', id: 'host-1', hostname, topic_id: null }
      : null,
  }
}

describe('UrlAdminAside', () => {
  it('renders hostname link when hostname is present', async () => {
    render(
      await UrlAdminAside({
        url: makeUrl('example.com'),
        canTriggerCrawl: false,
        urlType: 'url',
        rssFeedId: null,
      }),
    )

    const link = screen.getByRole('link', { name: 'example.com' })
    expect(link.getAttribute('href')).toBe('/domain/example.com')
  })

  it('omits hostname row when hostname is null', async () => {
    render(
      await UrlAdminAside({
        url: makeUrl(null),
        canTriggerCrawl: false,
        urlType: 'url',
        rssFeedId: null,
      }),
    )

    expect(screen.queryByText('Hostname')).toBeNull()
  })

  it('renders trigger crawl button when canTriggerCrawl is true', async () => {
    render(
      await UrlAdminAside({
        url: makeUrl('example.com'),
        canTriggerCrawl: true,
        urlType: 'url',
        rssFeedId: null,
      }),
    )

    expect(screen.getByRole('button', { name: /trigger crawl/i })).toBeDefined()
  })

  it('omits trigger crawl button when canTriggerCrawl is false', async () => {
    render(
      await UrlAdminAside({
        url: makeUrl('example.com'),
        canTriggerCrawl: false,
        urlType: 'url' as UrlDetailResponseBody['url_type'],
        rssFeedId: null,
      }),
    )

    expect(screen.queryByRole('button', { name: /trigger crawl/i })).toBeNull()
  })
})
