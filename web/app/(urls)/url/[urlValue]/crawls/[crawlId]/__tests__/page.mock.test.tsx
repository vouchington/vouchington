import '@/test-helpers/i18n/mock-json-messages'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import CrawlDetailPage from '../page'

const { mockGetUrl, mockGetUrlCrawl, mockNotFound, mockPermanentRedirect } = vi.hoisted(() => ({
  mockGetUrl: vi.fn<VitestLooseMock>(),
  mockGetUrlCrawl: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  mockPermanentRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_PERMANENT_REDIRECT')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      ...navMockModule,
      notFound: mockNotFound,
      permanentRedirect: mockPermanentRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'user-1', administrator: true }),
}))

vi.mock(import('@/lib/api/server/urls'), () => ({
  getUrl: mockGetUrl,
  getUrlCrawl: mockGetUrlCrawl,
}))

const urlData = {
  url: { id: 'url-1', url: 'https://example.com/page', hostname: null },
  can_view_crawl_history: true,
  can_trigger_crawl: true,
}
const crawlData = {
  crawl: {
    id: 'crawl-1',
    url_id: 'url-1',
    response_status_code: 200,
    created_at: '2024-01-01T00:00:00Z',
    completed_at: '2024-01-01T00:01:00Z',
    title: 'Test Crawl',
    meta_tags: { 'og:title': 'Test' },
    language: 'en',
  },
  og_image_sideload: '/sideload/aHR0cHM6Ly9leGFtcGxlLmNvbS9pbWcucG5n?w=400',
}

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav aria-label='breadcrumb' />,
}))

vi.mock(
  import('@/components/urls/crawl-meta-tags'),
  () =>
    ({
      CrawlMetaTags: ({ ogImageSideload }: { ogImageSideload: string | null }) => (
        <div data-testid='crawl-meta-tags'>
          {ogImageSideload && <span data-testid='og-image-sideload'>{ogImageSideload}</span>}
        </div>
      ),
    }) as unknown as typeof import('@/components/urls/crawl-meta-tags'),
)

vi.mock(import('@/lib/links/entity-href'), () => ({
  urlCrawlHref: vi.fn<VitestLooseMock>(
    (url: { url: string }, id: string) => `/url/${encodeURIComponent(url.url)}/crawls/${id}`,
  ),
  domainHref: vi.fn<VitestLooseMock>(
    (h: unknown) => `/domain/${(h as { hostname: string }).hostname}`,
  ),
  urlHref: vi.fn<VitestLooseMock>((url: { url: string }) => `/url/${encodeURIComponent(url.url)}`),
}))

describe('CrawlDetailPage', () => {
  const nav = createNavMock()

  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    mockGetUrl.mockResolvedValue(urlData)
    mockGetUrlCrawl.mockResolvedValue(crawlData)
  })

  it('renders crawl detail and passes og_image_sideload to CrawlMetaTags', async () => {
    const jsx = await CrawlDetailPage({
      params: Promise.resolve({
        urlValue: encodeURIComponent('https://example.com/page'),
        crawlId: 'crawl-1',
      }),
    })
    render(jsx)

    expect(screen.getByText('Crawl Details')).toBeInTheDocument()
    expect(screen.getByTestId('crawl-meta-tags')).toBeInTheDocument()
    expect(screen.getByTestId('og-image-sideload').textContent).toContain('/sideload/')
  })

  it('returns not found for malformed URL escaping before lookup', async () => {
    await expect(
      CrawlDetailPage({
        params: Promise.resolve({ urlValue: 'bad%escape', crawlId: 'crawl-1' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetUrl).not.toHaveBeenCalled()
  })

  it('redirects a visible crawl under a URL UUID to its canonical URL path', async () => {
    const urlId = '019e0000-0000-7000-8000-000000000004'
    await expect(
      CrawlDetailPage({
        params: Promise.resolve({ urlValue: urlId, crawlId: 'crawl-1' }),
      }),
    ).rejects.toThrow('NEXT_PERMANENT_REDIRECT')
    expect(mockGetUrl).toHaveBeenCalledWith(urlId)
    expect(mockGetUrlCrawl).toHaveBeenCalledWith(urlId, 'crawl-1')
    expect(mockPermanentRedirect).toHaveBeenCalledWith(
      '/url/https%3A%2F%2Fexample.com%2Fpage/crawls/crawl-1',
    )
  })

  it('does not redirect a crawl under a URL without history access', async () => {
    mockGetUrl.mockResolvedValue({ ...urlData, can_view_crawl_history: false })
    await expect(
      CrawlDetailPage({
        params: Promise.resolve({
          urlValue: '019e0000-0000-7000-8000-000000000004',
          crawlId: 'crawl-1',
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetUrlCrawl).not.toHaveBeenCalled()
    expect(mockPermanentRedirect).not.toHaveBeenCalled()
  })
})
