import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PostListPage } from './post-list-page'

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

vi.mock(import('@/lib/api/server'), () => ({
  getPosts: vi.fn<VitestLooseMock>().mockResolvedValue({ items: [], cursor: null }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => (
    <div data-testid='page-with-aside'>{children}</div>
  ),
}))

vi.mock(
  import('@/components/asides/posts-discovery-aside'),
  () =>
    ({
      PostsDiscoveryAside: () => null,
    }) as unknown as typeof import('@/components/asides/posts-discovery-aside'),
)

vi.mock(import('@/components/posts/post-list'), () => ({
  PostList: () => <div>post list</div>,
}))

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-testid='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => <div data-testid='follower-share-actions' />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <button type='button'>Save</button>,
}))

vi.mock(import('@/components/posts/post-filters'), () => ({
  PostFilters: () => <div>filters</div>,
}))

vi.mock(import('@/components/posts/post-view-toggle'), () => ({
  PostViewToggle: () => <div>view toggle</div>,
}))

vi.mock(import('@/components/posts/post-list-top-section'), () => ({
  PostListTopSection: () => <div>post list top section</div>,
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
  PageHeader: () => <div>page header</div>,
}))

vi.mock(import('@/components/shared/empty-state'), () => ({
  EmptyState: () => <div>empty state</div>,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children }: { children: ReactNode }) => <button type='button'>{children}</button>,
    }) as unknown as typeof import('@/components/ui/button'),
)

const mockConfig = {
  title: 'extracted.lib.routeConfigs.discussions_60157cfc' as const,
  description:
    'extracted.lib.routeConfigs.joinDiscussionsAboutProductsServicesAnd_5e82b04a' as const,
  postTypes: ['discussion' as const],
  pluralPath: 'discussions',
  singularPath: 'discussion',
}

describe('PostListPage', () => {
  it('renders without a max-w-4xl constraint inside PageWithAside', async () => {
    const ui = await PostListPage({ config: mockConfig, searchParams: Promise.resolve({}) })
    const { container } = render(ui)
    const innerDiv = container.querySelector('[data-testid="page-with-aside"] > div')
    expect(innerDiv).not.toBeNull()
    expect(innerDiv!.className).not.toContain('max-w-')
  })

  it('preserves legacy topics query params for bookmarked post list URLs', async () => {
    await PostListPage({
      config: mockConfig,
      searchParams: Promise.resolve({ topics: 'topic-1,topic-2' }),
    })

    const { getPosts } = await import('@/lib/api/server')
    expect(getPosts).toHaveBeenLastCalledWith({
      searchParams: {
        topics: 'topic-1,topic-2',
        post_types: 'discussion',
        sort: 'hot',
        limit: 25,
      },
    })
  })

  it('preserves repeated legacy topics query params for bookmarked post list URLs', async () => {
    await PostListPage({
      config: mockConfig,
      searchParams: Promise.resolve({ topics: ['topic-1', 'topic-2'] }),
    })

    const { getPosts } = await import('@/lib/api/server')
    expect(getPosts).toHaveBeenLastCalledWith({
      searchParams: {
        topics: 'topic-1,topic-2',
        post_types: 'discussion',
        sort: 'hot',
        limit: 25,
      },
    })
  })
})
