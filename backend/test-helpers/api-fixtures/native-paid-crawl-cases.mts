import type { ApiFixtureCase } from './types.mts'

const paidSafeCrawl = {
  __entity_type: 'crawl',
  id: 'crawl-1',
  created_at: '2026-01-02T00:00:00Z',
  completed_at: '2026-01-02T00:01:00Z',
  response_status_code: 200,
  title: 'Native client guide',
  lang: 'en',
}

const paidSafeRssFeedCrawl = {
  id: 'crawl-1',
  response_code: 200,
  created_at: '2026-01-02T00:00:00Z',
}

export const nativePaidCrawlApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.paid.url-crawls.default',
    method: 'GET',
    path: '/api/v1/urls/url-1/crawls',
    query: { limit: '25' },
    route: { routeTemplate: '/api/v1/urls/:id/crawls', pathParams: { id: 'url-1' } },
    backendResponseContractKey: 'GET:/api/v1/urls/:id/crawls#paid',
    auth: 'fixture-user',
    status: 200,
    consumers: ['web', 'swift-core', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/urls/crawls.mts'],
    body: {
      results: [paidSafeCrawl],
      page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
    },
  },
  {
    id: 'native.paid.url-crawl.default',
    method: 'GET',
    path: '/api/v1/urls/url-1/crawls/crawl-1',
    route: {
      routeTemplate: '/api/v1/urls/:id/crawls/:crawlId',
      pathParams: { id: 'url-1', crawlId: 'crawl-1' },
    },
    backendResponseContractKey: 'GET:/api/v1/urls/:id/crawls/:crawlId#paid',
    auth: 'fixture-user',
    status: 200,
    consumers: ['web', 'swift-core', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/urls/crawl.mts'],
    body: { crawl: paidSafeCrawl },
  },
  {
    id: 'web.paid.rss-feed-crawls.default',
    method: 'GET',
    path: '/api/v1/rss-feeds/rss-feed-1/crawls',
    query: { limit: '25' },
    route: { routeTemplate: '/api/v1/rss-feeds/:id/crawls', pathParams: { id: 'rss-feed-1' } },
    auth: 'fixture-user',
    status: 200,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/rss-feeds.ts'],
    body: {
      results: [paidSafeRssFeedCrawl],
      page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
    },
  },
  {
    id: 'web.paid.rss-feed-crawl.default',
    method: 'GET',
    path: '/api/v1/rss-feeds/rss-feed-1/crawls/crawl-1',
    route: {
      routeTemplate: '/api/v1/rss-feeds/:id/crawls/:crawlId',
      pathParams: { id: 'rss-feed-1', crawlId: 'crawl-1' },
    },
    backendResponseContractKey: 'GET:/api/v1/rss-feeds/:id/crawls/:crawlId#paid',
    auth: 'fixture-user',
    status: 200,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['web/lib/api/server/rss-feeds.ts'],
    body: { crawl: paidSafeRssFeedCrawl },
  },
  {
    id: 'web.admin.rss-feed-crawl.default',
    method: 'GET',
    path: '/api/v1/rss-feeds/rss-feed-1/crawls/crawl-1',
    route: {
      routeTemplate: '/api/v1/rss-feeds/:id/crawls/:crawlId',
      pathParams: { id: 'rss-feed-1', crawlId: 'crawl-1' },
    },
    backendResponseContractKey: 'GET:/api/v1/rss-feeds/:id/crawls/:crawlId#privileged',
    auth: 'fixture-admin',
    status: 200,
    consumers: ['web', 'dotnet-core'],
    migratedFrom: ['web/lib/api/server/rss-feeds.ts'],
    body: {
      crawl: {
        ...paidSafeRssFeedCrawl,
        feed_data: { version: 'https://jsonfeed.org/version/1.1' },
        feed_data_sha256: null,
        redirect_url_id: null,
      },
    },
  },
]
