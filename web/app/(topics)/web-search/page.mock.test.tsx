import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WebSearchPage from './page'

const mockGetWebSearch = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockIsListSearchErrorResult = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetListSearchErrorMessage = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/api/server/web-search'), () => ({
  getWebSearch: mockGetWebSearch,
}))

vi.mock(
  import('@/lib/api/list-search-error'),
  () =>
    ({
      isListSearchErrorResult: mockIsListSearchErrorResult,
      getListSearchErrorMessage: mockGetListSearchErrorMessage,
    }) as unknown as typeof import('@/lib/api/list-search-error'),
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
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock(import('@/components/shared/client-search-form'), () => ({
  ClientSearchForm: ({ defaultValue }: { defaultValue?: string }) => (
    <input
      aria-label='search'
      defaultValue={defaultValue}
    />
  ),
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('@/components/shared/list-search-error'), () => ({
  ListSearchError: ({ message }: { message: string }) => <div>{message}</div>,
}))

vi.mock(import('@/components/web-search/web-search-list-client'), () => ({
  WebSearchListClient: () => <div>web search results</div>,
}))

vi.mock(import('@/lib/seo/structured-data'), () => ({
  createBreadcrumbSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
  createCollectionPageSchema: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

const makePageInfo = () => ({
  has_next_page: false,
  end_cursor: null,
  start_cursor: null,
})

describe('WebSearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsListSearchErrorResult.mockReturnValue(false)
    mockGetListSearchErrorMessage.mockReturnValue(null)
    mockGetWebSearch.mockResolvedValue({ results: [], page_info: makePageInfo() })
  })

  it('renders the Web Search heading', async () => {
    const ui = await WebSearchPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Web Search' })).toBeVisible()
  })

  it('shows empty state when no query is given', async () => {
    const ui = await WebSearchPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText('Search the web')).toBeTruthy()
  })

  it('shows results list when a query of 3+ chars is provided', async () => {
    const ui = await WebSearchPage({ searchParams: Promise.resolve({ query: 'example' }) })
    render(ui)
    expect(screen.getByText('web search results')).toBeTruthy()
  })

  it('shows error message when search fails with a recognized error', async () => {
    mockGetWebSearch.mockRejectedValue(new Error('search failed'))
    mockGetListSearchErrorMessage.mockReturnValue('Search is temporarily unavailable')
    mockIsListSearchErrorResult.mockReturnValue(true)
    const ui = await WebSearchPage({ searchParams: Promise.resolve({ query: 'example' }) })
    render(ui)
    expect(screen.getByText('Search is temporarily unavailable')).toBeTruthy()
  })
})
