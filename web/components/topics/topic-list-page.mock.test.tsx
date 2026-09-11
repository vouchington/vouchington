import type { ElementType, ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { TopicListPage, type TopicListLoader } from './topic-list-page'
import { getActiveIntent } from '@/lib/navigation/intents'
import { getTopics } from '@/lib/api/server'
import { RecommendedTopicsAside } from '@/components/asides/recommended-topics-aside'
import type { TopicListProps } from './topic-list'

const capturedTopicListProps: Record<string, unknown>[] = []

vi.mock(import('@/lib/api/server'), () => ({
  getTopics: vi.fn<VitestLooseMock>().mockResolvedValue({ items: [], cursor: null }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({
    children,
    aside,
  }: {
    children: ReactNode
    aside?: ElementType | ReactNode
  }) => (
    <div data-testid='page-with-aside'>
      {children}
      {aside as ReactNode}
    </div>
  ),
}))

vi.mock(
  import('@/components/asides/about-voucha-aside'),
  () =>
    ({
      AboutVouchaAside: () => null,
    }) as unknown as typeof import('@/components/asides/about-voucha-aside'),
)

vi.mock(
  import('@/components/asides/follow-topics-aside'),
  () =>
    ({
      FollowTopicsAside: () => null,
    }) as unknown as typeof import('@/components/asides/follow-topics-aside'),
)

vi.mock(
  import('@/components/asides/trending-topics-aside'),
  () =>
    ({
      TrendingTopicsAside: () => null,
    }) as unknown as typeof import('@/components/asides/trending-topics-aside'),
)

vi.mock(
  import('@/components/asides/recommended-topics-aside'),
  () =>
    ({
      RecommendedTopicsAside: vi.fn<VitestLooseMock>(() => null),
    }) as unknown as typeof import('@/components/asides/recommended-topics-aside'),
)

vi.mock(import('@/lib/navigation/intents'), () => ({
  getActiveIntent: vi.fn<VitestLooseMock>().mockReturnValue('topics'),
}))

vi.mock(import('@/lib/navigation/breadcrumbs'), () => ({
  buildBreadcrumbsForPath: vi.fn<VitestLooseMock>().mockReturnValue([
    { name: 'Home', path: '/' },
    { name: 'Topics', path: '/topics' },
  ]),
}))

vi.mock(import('@/components/asides/sequential-aside-suspense'), () => ({
  SequentialAsideSuspense: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/topics/topic-filters'), () => ({
  TopicFilters: () => <div>topic filters</div>,
}))

vi.mock(import('@/components/topics/topic-list'), () => ({
  TopicList: (props: TopicListProps) => {
    capturedTopicListProps.push(props as unknown as Record<string, unknown>)
    return <div>topic list</div>
  },
}))

vi.mock(import('@/components/shared/follow-button'), () => ({
  FollowButton: () => <div data-testid='follow-button' />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <div data-testid='entity-bookmark-button' />,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createCollectionPageSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  ),
}))

const mockConfig = {
  title: 'extracted.lib.routeConfigs.topics_e22820fc' as const,
  description: 'extracted.lib.routeConfigs.browseProductsProgramsNewsSourcesAnd_dceb1c5c' as const,
  pluralPath: 'topics',
  singularPath: 'topic',
}

const mockGetActiveIntent = vi.mocked(getActiveIntent)
const mockGetTopics = vi.mocked(getTopics)
const mockRecommendedTopicsAside = vi.mocked(RecommendedTopicsAside)

describe('TopicListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedTopicListProps.length = 0
    mockGetActiveIntent.mockReturnValue('topics')
    mockGetTopics.mockResolvedValue({
      results: [],
      topics: {},
      topics_metrics: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  it('renders without a max-w-4xl constraint inside PageWithAside', async () => {
    const ui = await TopicListPage({ config: mockConfig, searchParams: Promise.resolve({}) })
    const { container } = render(ui)
    const innerDiv = container.querySelector('[data-testid="page-with-aside"] > div')
    expect(innerDiv).not.toBeNull()
    expect(innerDiv!.className).not.toContain('max-w-')
  })

  it('renders RecommendedTopicsAside when intent is topics', async () => {
    mockGetActiveIntent.mockReturnValue('topics')
    const ui = await TopicListPage({ config: mockConfig, searchParams: Promise.resolve({}) })
    render(ui)
    expect(mockRecommendedTopicsAside).toHaveBeenCalled()
  })

  it('does not render RecommendedTopicsAside when intent is not topics', async () => {
    mockGetActiveIntent.mockReturnValue('referral-links')
    const ui = await TopicListPage({
      config: { ...mockConfig, pluralPath: 'referral-programs' },
      searchParams: Promise.resolve({}),
    })
    render(ui)
    expect(mockRecommendedTopicsAside).not.toHaveBeenCalled()
    expect(mockGetActiveIntent).toHaveBeenCalledWith('/referral-programs')
  })

  it('resolves the config title/description to translated text, not the raw message key', async () => {
    const ui = await TopicListPage({ config: mockConfig, searchParams: Promise.resolve({}) })
    const { container } = render(ui)
    expect(container.textContent).not.toContain('extracted.lib.routeConfigs')
    expect(container.querySelector('h1')?.textContent).toBe('Topics')
    expect(container.querySelector('p')?.textContent).toBe(
      'Browse products, programs, news sources, and community topics.',
    )
  })

  it('uses the supplied loader and continuation endpoint without generic topic filters', async () => {
    const loadPage = vi.fn<TopicListLoader>().mockResolvedValue({
      results: [],
      topics: {},
      topics_metrics: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    const ui = await TopicListPage({
      config: { ...mockConfig, topicTypes: ['fediverse_instance'] },
      searchParams: Promise.resolve({ q: 'social', sort: 'relevance' }),
      loadPage,
      nextPageEndpoint: '/api/v1/fediverse/instances',
      includeTopicTypeFilter: false,
    })
    render(ui)

    expect(loadPage).toHaveBeenCalledWith({
      searchParams: { q: 'social', sort: 'relevance', limit: 25 },
    })
    expect(mockGetTopics).not.toHaveBeenCalled()
    expect(capturedTopicListProps.at(-1)?.nextPageEndpoint).toBe('/api/v1/fediverse/instances')
    expect(capturedTopicListProps.at(-1)?.nextPageParams).toEqual({
      q: 'social',
      sort: 'relevance',
      limit: 25,
    })
  })

  it('honors loader-selected fallback continuation settings', async () => {
    const loadPage = vi.fn<TopicListLoader>().mockResolvedValue({
      data: {
        results: [],
        topics: {},
        topics_metrics: {},
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      },
      nextPageEndpoint: '/api/v1/topics',
      nextPageParams: { q: 'social', sort: 'new', topic_types: 'fediverse_instance' },
    })

    render(
      await TopicListPage({
        config: { ...mockConfig, topicTypes: ['fediverse_instance'] },
        searchParams: Promise.resolve({ q: 'social' }),
        loadPage,
        nextPageEndpoint: '/api/v1/fediverse/instances',
        includeTopicTypeFilter: false,
        normalizeFediversePages: true,
      }),
    )

    expect(capturedTopicListProps.at(-1)).toMatchObject({
      nextPageEndpoint: '/api/v1/topics',
      nextPageParams: { q: 'social', sort: 'new', topic_types: 'fediverse_instance' },
      normalizeFediversePages: true,
    })
  })
})
