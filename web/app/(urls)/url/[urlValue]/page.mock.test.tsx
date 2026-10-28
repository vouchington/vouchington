import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import type { CrawlListResponseBody, UrlDetailResponseBody } from '@/types/api-responses'

const { getCurrentUserMock, getUrlMock, getUrlCrawlsMock, redirectMock, notFoundMock } = vi.hoisted(
  () => ({
    getCurrentUserMock: vi.fn<VitestLooseMock>(),
    getUrlMock: vi.fn<VitestLooseMock>(),
    getUrlCrawlsMock: vi.fn<VitestLooseMock>(),
    redirectMock: vi.fn<VitestLooseMock>(() => {
      throw new Error('NEXT_REDIRECT')
    }),
    notFoundMock: vi.fn<VitestLooseMock>(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
  }),
)

vi.mock(
  import('next/navigation'),
  () =>
    ({
      ...navMockModule,
      redirect: redirectMock,
      notFound: notFoundMock,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: getCurrentUserMock }))
vi.mock(import('@/lib/api/server/urls'), () => ({
  getUrl: getUrlMock,
  getUrlCrawls: getUrlCrawlsMock,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock(import('@/components/ui/breadcrumb'), () => ({ Breadcrumbs: () => <nav /> }))
vi.mock(import('@/components/urls/url-admin-aside'), () => ({ UrlAdminAside: () => <aside /> }))
vi.mock(import('@/components/asides/about-voucha-aside'), () => ({
  AboutVouchaAside: () => <aside />,
}))
vi.mock(import('@/components/asides/follow-topics-aside'), () => ({
  FollowTopicsAside: () => Promise.resolve(<aside />),
}))
vi.mock(import('@/components/asides/trending-topics-aside'), () => ({
  TrendingTopicsAside: () => Promise.resolve(<aside />),
}))
vi.mock(import('@/components/asides/sequential-aside-suspense'), () => ({
  SequentialAsideSuspense: () => <aside />,
}))
vi.mock(import('@/components/urls/url-crawls-page'), () => ({
  UrlCrawlsPage: ({ urlId, url }: { urlId: string; url: string }) => (
    <div data-testid='url-crawls-result'>{`${urlId}: ${url}`}</div>
  ),
}))

import UrlDetailPage from './page'

const rawUrl = 'https://example.com/a%2Fb?q=one%26two'
const params = Promise.resolve({ urlValue: encodeURIComponent(rawUrl) })
const urlData: UrlDetailResponseBody = {
  url: {
    __entity_type: 'url',
    id: 'url-1',
    url: rawUrl,
    pathname: '/a%2Fb',
    search_params: { q: 'one&two' },
    canonical_url_id: null,
    hostname: null,
  },
  latest_crawl: null,
  can_view_latest_crawl: false,
  can_view_crawl_history: true,
  can_trigger_crawl: false,
  url_type: 'url',
  rss_feed_id: null,
}
const crawls: CrawlListResponseBody = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}
const nav = createNavMock()

describe('UrlDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    getCurrentUserMock.mockResolvedValue({ id: 'user-1', roles: [] })
    getUrlMock.mockResolvedValue(urlData)
    getUrlCrawlsMock.mockResolvedValue(crawls)
  })

  it('looks up the decoded URL once and renders its crawl history', async () => {
    render(await UrlDetailPage({ params }))

    expect(getUrlMock).toHaveBeenCalledWith(rawUrl)
    expect(getUrlCrawlsMock).toHaveBeenCalledWith(rawUrl, { searchParams: { limit: '20' } })
    expect(screen.getByRole('link', { name: rawUrl })).toHaveAttribute('href', rawUrl)
    expect(screen.getByTestId('url-crawls-result')).toHaveTextContent(rawUrl)
  })

  it('hides a URL when crawl history access is denied', async () => {
    getUrlMock.mockResolvedValue({ ...urlData, can_view_crawl_history: false })

    await expect(UrlDetailPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getUrlCrawlsMock).not.toHaveBeenCalled()
  })

  it('returns not found for an unknown URL', async () => {
    getUrlMock.mockResolvedValue(null)

    await expect(UrlDetailPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getUrlCrawlsMock).not.toHaveBeenCalled()
  })

  it('redirects signed-out visitors before looking up the URL', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(UrlDetailPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(getUrlMock).not.toHaveBeenCalled()
  })
})
