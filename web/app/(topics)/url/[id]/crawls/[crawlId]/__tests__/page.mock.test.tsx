import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CrawlDetailPage from '../page'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: vi.fn<VitestLooseMock>(),
      notFound: vi.fn<VitestLooseMock>(() => {
        throw new Error('NEXT_NOT_FOUND')
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'user-1', administrator: true }),
}))

vi.mock(import('@/lib/api/server/urls'), () => ({
  getUrl: vi.fn<VitestLooseMock>().mockResolvedValue({
    url: { id: 'url-1', url: 'https://example.com/page', hostname: null },
    can_view_crawl_history: true,
    can_trigger_crawl: true,
  }),
  getUrlCrawl: vi.fn<VitestLooseMock>().mockResolvedValue({
    crawl: {
      id: 'crawl-1',
      url_id: 'url-1',
      response_status_code: 200,
      created_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:01:00Z',
      title: 'Test Crawl',
      meta_tags: { 'og:title': 'Test' },
      lang: 'en',
    },
    og_image_sideload: '/sideload/aHR0cHM6Ly9leGFtcGxlLmNvbS9pbWcucG5n?w=400',
  }),
}))

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
  createUrlPathname: vi.fn<VitestLooseMock>((_id: string, path: string) => `/url/${_id}${path}`),
  domainHref: vi.fn<VitestLooseMock>(
    (h: unknown) => `/domain/${(h as { hostname: string }).hostname}`,
  ),
  urlHref: vi.fn<VitestLooseMock>((id: string) => `/url/${id}`),
}))

describe('CrawlDetailPage', () => {
  it('renders crawl detail and passes og_image_sideload to CrawlMetaTags', async () => {
    const jsx = await CrawlDetailPage({
      params: Promise.resolve({ id: 'url-1', crawlId: 'crawl-1' }),
    })
    render(jsx)

    expect(screen.getByText('Crawl Details')).toBeInTheDocument()
    expect(screen.getByTestId('crawl-meta-tags')).toBeInTheDocument()
    expect(screen.getByTestId('og-image-sideload').textContent).toContain('/sideload/')
  })
})
