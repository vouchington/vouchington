import type { ManifestEndpoint } from './endpoint-registry'

export const contentContractEndpointRegistry = {
  'native.rss-feeds.delete.accepted': {
    method: 'DELETE',
    path: '/api/v1/rss-feeds/70000000-0000-7000-8000-000000003680',
  },
  'native.topics.merge.accepted': {
    method: 'POST',
    path: '/api/v1/topics/70000000-0000-7000-8000-000000005170/merges',
    requestBody: { destination_id_or_slug: '70000000-0000-7000-8000-000000005171' },
  },
  'native.topics.merge.status.queued': {
    method: 'GET',
    path: '/api/v1/topics/70000000-0000-7000-8000-000000005170/merges/70000000-0000-7000-8000-000000005172',
  },
  'native.topics.merge.status.running': {
    method: 'GET',
    path: '/api/v1/topics/70000000-0000-7000-8000-000000005170/merges/70000000-0000-7000-8000-000000005172',
  },
  'native.topics.merge.status.completed': {
    method: 'GET',
    path: '/api/v1/topics/70000000-0000-7000-8000-000000005170/merges/70000000-0000-7000-8000-000000005172',
  },
  'native.topics.merge.status.failed': {
    method: 'GET',
    path: '/api/v1/topics/70000000-0000-7000-8000-000000005170/merges/70000000-0000-7000-8000-000000005172',
  },
  'native.rss-feeds.create.accepted': {
    method: 'POST',
    path: '/api/v1/rss-feeds',
    requestBody: { follow: true, rss_feed_url: 'https://example.test/feed.xml' },
  },
  'native.rss-feeds.create.status.pending': {
    method: 'GET',
    path: '/api/v1/my/import/rss-feeds/70000000-0000-7000-8000-000000003681',
  },
  'native.rss-feeds.create.status.completed': {
    method: 'GET',
    path: '/api/v1/my/import/rss-feeds/70000000-0000-7000-8000-000000003681',
  },
  'native.rss-feeds.create.status.failed': {
    method: 'GET',
    path: '/api/v1/my/import/rss-feeds/70000000-0000-7000-8000-000000003681',
  },
  'native.rss-feeds.delete.retained-import-conflict': {
    method: 'DELETE',
    path: '/api/v1/rss-feeds/70000000-0000-7000-8000-000000003680',
  },
  'native.rss-personal.seven-day.1m': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/all',
    query: { limit: '25', time_range: '1m' },
  },
  'native.rss-personal.seven-day.1y': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/all',
    query: { limit: '25', time_range: '1y' },
  },
  'native.rss-personal.seven-day.all': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/all',
    query: { limit: '25', time_range: 'all' },
  },
  'native.rss-personal.one-day': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/all',
    query: { limit: '25', time_range: '1d' },
  },
  'native.rss-personal.union.first-page': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/all',
    query: { limit: '2', time_range: 'all' },
  },
  'native.rss-personal.union.next-page': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/all',
    query: {
      after:
        'eyJ0aW1lc3RhbXAiOiIyMDI2LTExLTA1VDEyOjAwOjAwLjAwMDAwMFoiLCJpZCI6IjcwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwNTQ2MiIsInNjb3BlIjoiMGRkMDM0OTRjZWEwYWViOTI0MDFkMDBmYzMxZGY0MWMxODllYmZiMzlkZmY3NDM4ZDNiYjE3ZWNmZWM5MmJjNSJ9',
      limit: '2',
      time_range: 'all',
    },
  },
} satisfies Record<string, ManifestEndpoint>
