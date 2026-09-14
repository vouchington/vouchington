import { beforeAll, describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
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
  let t: ReturnType<typeof createTranslator>

  beforeAll(() => {
    t = createTranslator('en', enMessages)
  })

  function renderAside(props: {
    url: ReturnType<typeof makeUrl>
    canTriggerCrawl: boolean
    urlType: UrlDetailResponseBody['url_type'] | 'url'
    rssFeedId: string | null
  }) {
    return render(
      <UrlAdminAside
        t={t}
        url={props.url}
        canTriggerCrawl={props.canTriggerCrawl}
        urlType={props.urlType as UrlDetailResponseBody['url_type']}
        rssFeedId={props.rssFeedId}
      />,
    )
  }

  it('renders hostname link when hostname is present', async () => {
    renderAside({
      url: makeUrl('example.com'),
      canTriggerCrawl: false,
      urlType: 'url',
      rssFeedId: null,
    })

    const link = screen.getByRole('link', { name: 'example.com' })
    expect(link.getAttribute('href')).toBe('/domain/example.com')
  })

  it('omits hostname row when hostname is null', async () => {
    renderAside({
      url: makeUrl(null),
      canTriggerCrawl: false,
      urlType: 'url',
      rssFeedId: null,
    })

    expect(screen.queryByText('Hostname')).toBeNull()
  })

  it('renders trigger crawl button when canTriggerCrawl is true', async () => {
    renderAside({
      url: makeUrl('example.com'),
      canTriggerCrawl: true,
      urlType: 'url',
      rssFeedId: null,
    })

    expect(screen.getByRole('button', { name: /trigger crawl/i })).toBeDefined()
  })

  it('omits trigger crawl button when canTriggerCrawl is false', async () => {
    renderAside({
      url: makeUrl('example.com'),
      canTriggerCrawl: false,
      urlType: 'url' as UrlDetailResponseBody['url_type'],
      rssFeedId: null,
    })

    expect(screen.queryByRole('button', { name: /trigger crawl/i })).toBeNull()
  })
})
