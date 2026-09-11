import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import SourcesPage from './page'

const mockGetCurrentUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetRssFeeds = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockCreateItemListSchema = vi.hoisted(() => vi.fn<VitestLooseMock>().mockReturnValue({}))
const mockSourcesFilterForm = vi.hoisted(() => vi.fn<VitestLooseMock>())

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
        [key: string]: unknown
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

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/api/server/rss-feeds'), () => ({
  getRssFeeds: mockGetRssFeeds,
}))

vi.mock(import('@/components/sources/sources-list-client'), () => ({
  SourcesListClient: () => <ul data-testid='sources-list-client' />,
}))

vi.mock(import('@/components/topics/sources-filter-form'), () => ({
  SourcesFilterForm: (props: { defaultPublisherType?: string }) => {
    mockSourcesFilterForm(props)
    return <div data-testid='sources-filter-form' />
  },
}))

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
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('@/components/shared/list-search-error'), () => ({
  ListSearchError: ({ message }: { message: string }) => (
    <div data-testid='list-search-error'>{message}</div>
  ),
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children }: { children: ReactNode }) => <button type='button'>{children}</button>,
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createCollectionPageSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createItemListSchema: mockCreateItemListSchema,
}))

describe('SourcesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetRssFeeds.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topic_elections: {},
      hostname_elections: {},
    })
  })

  it('calls getRssFeeds with q and publisher_type from search params', async () => {
    const ui = await SourcesPage({
      searchParams: Promise.resolve({
        q: 'fintech',
        publisher_type: 'blog',
      }),
    })
    render(ui)

    expect(mockGetRssFeeds).toHaveBeenCalledWith({
      searchParams: expect.objectContaining({
        q: 'fintech',
        publisher_type: 'blog',
        include_descendants: true,
        enabled: true,
        apply_mutes: true,
      }),
    })
    expect(mockSourcesFilterForm).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPublisherType: 'blog' }),
    )
    expect(screen.getByTestId('sources-filter-form')).toBeDefined()
  })

  it('calls getRssFeeds without topics or topic_match params', async () => {
    const ui = await SourcesPage({
      searchParams: Promise.resolve({ q: 'doctor' }),
    })
    render(ui)

    const call = mockGetRssFeeds.mock.calls[0]![0] as { searchParams: Record<string, unknown> }
    expect(call.searchParams).not.toHaveProperty('topics')
    expect(call.searchParams).not.toHaveProperty('topic_match')
  })

  it('passes undefined defaultPublisherType when publisher_type is absent', async () => {
    const ui = await SourcesPage({
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(mockSourcesFilterForm).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPublisherType: undefined }),
    )
  })

  it('renders inline error when getRssFeeds rejects with a 400 ApiError', async () => {
    mockGetRssFeeds.mockRejectedValue(
      new ApiError('Bad Request', 400, { error: 'Topic not found: #unknown' }),
    )

    const ui = await SourcesPage({
      searchParams: Promise.resolve({ q: '#unknown' }),
    })
    render(ui)

    expect(screen.getByTestId('list-search-error')).toBeDefined()
    expect(screen.getByTestId('list-search-error').textContent).toContain('Topic not found')
  })

  it('passes first-page feeds to createItemListSchema with name and URL', async () => {
    mockGetRssFeeds.mockResolvedValue({
      results: [
        {
          id: 'feed-1',
          title: 'Feed One',
          home_page_url: { url: 'https://feedone.com' },
          rss_feed_url: { url: 'https://feedone.com/feed.xml' },
          topic: { id: 't1', name: 'Topic 1', slug: 'topic-1' },
          hostname: null,
        },
        {
          id: 'feed-2',
          title: 'Feed Two',
          home_page_url: null,
          rss_feed_url: { url: 'https://feedtwo.com/feed.xml' },
          topic: { id: 't2', name: 'Topic 2', slug: 'topic-2' },
          hostname: null,
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topic_elections: {},
      hostname_elections: {},
    })

    const ui = await SourcesPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(mockCreateItemListSchema).toHaveBeenCalledWith(
      [
        { name: 'Feed One', url: 'https://feedone.com' },
        { name: 'Feed Two', url: 'https://feedtwo.com/feed.xml' },
      ],
      'Sources',
    )
  })
})
