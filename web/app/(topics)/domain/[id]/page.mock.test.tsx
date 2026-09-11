import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import type { MessageKey } from '@ts-shared/ui-messages'
import DomainDetailPage from './page'

const mockGetCurrentUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetHostname = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockNotFound = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)

// Invoke the factory fn so the arrow-function body on L25-27 is covered by V8
vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (fn: () => Promise<{ default: unknown }>) => {
        void fn()
        return function DynamicStub() {
          return null
        }
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/api/server/hostnames'), () => ({
  getHostname: mockGetHostname,
}))

vi.mock(
  import('@/components/domains/domain-actions-aside'),
  () =>
    ({
      DomainActionsAside: () => null,
    }) as unknown as typeof import('@/components/domains/domain-actions-aside'),
)

vi.mock(import('@/components/domains/domain-detail-tabs'), () => ({
  DomainDetailTabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('@/components/domains/domain-moderation-panel'),
  () =>
    ({
      default: () => null,
    }) as unknown as typeof import('@/components/domains/domain-moderation-panel'),
)

vi.mock(
  import('@/components/domains/domain-crawlers-panel'),
  () =>
    ({
      default: () => null,
    }) as unknown as typeof import('@/components/domains/domain-crawlers-panel'),
)

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: ({
    items,
  }: {
    items: Array<{ name?: string; nameKey?: MessageKey; path: string }>
  }) => (
    <nav aria-label='breadcrumb'>
      {items.map(i => i.name ?? (i.nameKey ? defaultTranslator(i.nameKey) : '')).join(' > ')}
    </nav>
  ),
}))

vi.mock(
  import('@/components/hostnames/hostname-vouch-disavow-vote'),
  () =>
    ({
      HostnameVouchDisavowVote: () => null,
    }) as unknown as typeof import('@/components/hostnames/hostname-vouch-disavow-vote'),
)

vi.mock(
  import('@/components/domains/domain-trust-badge'),
  () =>
    ({
      DomainTrustBadge: () => null,
    }) as unknown as typeof import('@/components/domains/domain-trust-badge'),
)

vi.mock(import('@/components/topics/topic-label'), () => ({
  TopicLabel: ({ topic }: { topic: { name: string } }) => <span>{topic.name}</span>,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({ robots: 'noindex' }),
  createPageMetadata: vi.fn<VitestLooseMock>().mockReturnValue({ title: 'test' }),
}))

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(
  import('./domain-overview'),
  () =>
    ({
      DomainOverview: () => <div data-testid='domain-overview' />,
    }) as unknown as typeof import('./domain-overview'),
)

const BASE_DATA = {
  hostname: {
    __entity_type: 'hostname' as const,
    id: 'hn-1',
    hostname: 'example.com',
    topic_id: null,
  },
  topic: null,
  hostname_election: null,
  election_vote: null,
  top_urls: [],
  rss_feeds: [],
  crawlers: [],
}

describe('DomainDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetHostname.mockResolvedValue(BASE_DATA)
  })

  it('renders the domain heading', async () => {
    const ui = await DomainDetailPage({ params: Promise.resolve({ id: 'example.com' }) })
    render(ui)
    expect(document.querySelector('[data-pw="domain-detail-heading"]')?.textContent).toBe(
      'example.com',
    )
  })

  it('builds topic-aware breadcrumbs when a topic is linked', async () => {
    mockGetHostname.mockResolvedValue({
      ...BASE_DATA,
      hostname: { ...BASE_DATA.hostname, topic_id: 'topic-1' },
      topic: { id: 'topic-1', name: 'Tech News', slug: 'tech-news', topic_type: 'news' },
    })
    const ui = await DomainDetailPage({ params: Promise.resolve({ id: 'example.com' }) })
    render(ui)
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(breadcrumb.textContent).toContain('Tech News')
    expect(breadcrumb.textContent).toContain('example.com')
  })

  it('resolves the topic-type crumb via nameKey when a route config exists', async () => {
    mockGetHostname.mockResolvedValue({
      ...BASE_DATA,
      hostname: { ...BASE_DATA.hostname, topic_id: 'topic-1' },
      topic: { id: 'topic-1', name: 'Example Feed', slug: 'example-feed', topic_type: 'rss_feed' },
    })
    const ui = await DomainDetailPage({ params: Promise.resolve({ id: 'example.com' }) })
    render(ui)
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(breadcrumb.textContent).toContain('News Sources')
    expect(breadcrumb.textContent).toContain('Example Feed')
    expect(breadcrumb.textContent).toContain('example.com')
  })

  it('calls notFound when hostname is not found', async () => {
    mockGetHostname.mockResolvedValue(null)
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
    await expect(
      DomainDetailPage({ params: Promise.resolve({ id: 'missing.com' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
