import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCommunitiesSearchResponse, makeCommunity } from '@/test-helpers/api-responses'
import CommunitiesPage from './page'

interface HeaderBag {
  get: (key: string) => string | null
}

const mockGetCurrentUser = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockHeaders = vi.hoisted(() => vi.fn<() => Promise<HeaderBag>>())
const mockGetCommunities = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockCreateItemListSchema = vi.hoisted(() => vi.fn<VitestLooseMock>().mockReturnValue({}))
const MockApiError = vi.hoisted(
  () =>
    class extends Error {
      status: number
      data: unknown
      constructor(status: number, data: unknown) {
        super(`ApiError ${status}`)
        this.name = 'ApiError'
        this.status = status
        this.data = data
      }
    },
)
const mockRedirect = vi.hoisted(() =>
  vi.fn<VitestLooseMock>((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
)

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

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: mockHeaders,
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getCommunities: mockGetCommunities,
}))

vi.mock(import('@/components/communities/community-filters'), () => ({
  CommunityFilters: () => <div data-testid='community-filters' />,
}))

vi.mock(import('@/components/communities/community-list'), () => ({
  CommunityList: () => <div data-testid='community-list' />,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        asChild: _asChild,
        ...props
      }: {
        children: ReactNode
        asChild?: boolean
        [key: string]: unknown
      }) => <span {...props}>{children}</span>,
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createCollectionPageSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createItemListSchema: mockCreateItemListSchema,
}))

vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

vi.mock(import('@/components/asides/about-voucha-aside'), () => ({
  AboutVouchaAside: () => <aside>about</aside>,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

vi.mock(
  import('@/lib/api/error'),
  () =>
    ({
      ApiError: MockApiError,
    }) as unknown as typeof import('@/lib/api/error'),
)

const emptyCommunities = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  communities: {},
}

describe('CommunitiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(null)
    mockHeaders.mockResolvedValue({ get: () => null })
    mockGetCommunities.mockResolvedValue(emptyCommunities)
  })

  it('renders without Create Community button for anonymous users', async () => {
    const ui = await CommunitiesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.queryByRole('link', { name: 'Create Community' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Communities', level: 1 })).toBeDefined()
  })

  it('renders Create Community link for authenticated users', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', username: 'testuser' })
    const ui = await CommunitiesPage({ searchParams: Promise.resolve({}) })
    render(ui)
    const link = screen.getByRole('link', { name: 'Create Community' })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/communities/create')
  })

  it('redirects invalid sort param to clean URL', async () => {
    await expect(
      CommunitiesPage({ searchParams: Promise.resolve({ sort: 'invalid' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/communities')
    expect(mockGetCommunities).not.toHaveBeenCalled()
  })

  it('redirects invalid sort with query preserved', async () => {
    await expect(
      CommunitiesPage({ searchParams: Promise.resolve({ sort: 'invalid', q: 'test' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/communities?q=test')
    expect(mockGetCommunities).not.toHaveBeenCalled()
  })

  it('renders inline error message when getCommunities returns 400', async () => {
    mockGetCommunities.mockRejectedValue(
      new MockApiError(400, { error: 'Topic not found: #unknown-slug' }),
    )
    const ui = await CommunitiesPage({ searchParams: Promise.resolve({ q: '#unknown-slug' }) })
    render(ui)
    expect(screen.getByText('Topic not found: #unknown-slug')).toBeDefined()
    expect(screen.queryByTestId('community-list')).toBeNull()
  })

  it('renders inline error message when getCommunities returns 422', async () => {
    mockGetCommunities.mockRejectedValue(
      new MockApiError(422, { message: 'Too many hashtag topic identifiers (max 10)' }),
    )
    const ui = await CommunitiesPage({
      searchParams: Promise.resolve({ q: '#a #b #c #d #e #f #g #h #i #j #k' }),
    })
    render(ui)
    expect(screen.getByText('Too many hashtag topic identifiers (max 10)')).toBeDefined()
    expect(screen.queryByTestId('community-list')).toBeNull()
  })

  it('re-throws non-400/422 ApiErrors', async () => {
    mockGetCommunities.mockRejectedValue(new MockApiError(500, { error: 'Server error' }))
    await expect(CommunitiesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'ApiError 500',
    )
  })

  it('passes first-page communities to createItemListSchema with name and slug URL', async () => {
    mockGetCommunities.mockResolvedValue(
      makeCommunitiesSearchResponse({
        communities: [
          makeCommunity({ id: 'c1', name: 'Finance Fans', slug: 'finance-fans' }),
          makeCommunity({ id: 'c2', name: 'Travel Points', slug: 'travel-points' }),
        ],
      }),
    )

    const ui = await CommunitiesPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(mockCreateItemListSchema).toHaveBeenCalledWith(
      [
        { name: 'Finance Fans', url: '/communities/finance-fans' },
        { name: 'Travel Points', url: '/communities/travel-points' },
      ],
      'Communities',
    )
  })
})
